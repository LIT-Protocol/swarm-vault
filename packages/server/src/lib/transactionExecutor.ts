import { prisma } from "./prisma.js";
import { getWalletContext } from "./alchemy.js";
import {
  extractPlaceholders,
  getRequiredTokenAddresses,
  resolveTemplate,
  type TransactionTemplateInput,
  type WalletContext,
} from "@swarm-vault/shared";
import { type Address, type Hex, createPublicClient, http } from "viem";
import { baseSepolia, base } from "viem/chains";
import { env } from "./env.js";
import {
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import type { Swarm, SwarmMembership, User } from "@prisma/client";
import { createPkpViemAccount } from "./pkpSigner.js";

// Types
type MembershipWithUser = SwarmMembership & { user: User };

interface ResolvedMemberTx {
  membership: MembershipWithUser;
  resolved: {
    to: Address;
    data: Hex;
    value: bigint;
  };
  context: WalletContext;
}

// Get chain config
function getChain() {
  return env.CHAIN_ID === 8453 ? base : baseSepolia;
}

function getZeroDevRpcUrl(): string {
  if (!env.ZERODEV_PROJECT_ID) {
    throw new Error("ZERODEV_PROJECT_ID is required");
  }
  return `https://rpc.zerodev.app/api/v3/${env.ZERODEV_PROJECT_ID}/chain/${env.CHAIN_ID}`;
}

// Entry point and kernel version
const ENTRY_POINT = getEntryPoint("0.7");
const KERNEL_VERSION = KERNEL_V3_1;

/**
 * Execute a swarm transaction for all members
 */
export async function executeSwarmTransaction(
  transactionId: string,
  swarm: Swarm,
  memberships: MembershipWithUser[],
  template: TransactionTemplateInput
): Promise<void> {
  console.log(
    `[TransactionExecutor] Starting execution for transaction ${transactionId}`
  );
  console.log(
    `[TransactionExecutor] Using PKP: ${swarm.litPkpEthAddress}`
  );

  try {
    // Update transaction status to PROCESSING
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "PROCESSING" },
    });

    // Extract required token addresses from template
    const placeholders = extractPlaceholders(template);
    const tokenAddresses = getRequiredTokenAddresses(placeholders);

    console.log(
      `[TransactionExecutor] Resolving template for ${memberships.length} members`
    );

    // Resolve template for each member
    const resolvedTxs: ResolvedMemberTx[] = [];

    for (const membership of memberships) {
      try {
        const walletAddress = membership.agentWalletAddress as Address;

        // Fetch wallet context (balances, timestamp)
        const context = await getWalletContext(walletAddress, tokenAddresses);

        // Resolve the template with this wallet's context
        const resolved = resolveTemplate(template, context);

        resolvedTxs.push({
          membership,
          resolved,
          context,
        });
      } catch (error) {
        console.error(
          `[TransactionExecutor] Failed to resolve template for member ${membership.id}:`,
          error
        );

        // Create failed target record
        await prisma.transactionTarget.create({
          data: {
            transactionId,
            membershipId: membership.id,
            resolvedTxData: {},
            status: "FAILED",
            error: error instanceof Error ? error.message : "Failed to resolve template",
          },
        });
      }
    }

    if (resolvedTxs.length === 0) {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: "FAILED" },
      });
      console.log(
        `[TransactionExecutor] All members failed template resolution for ${transactionId}`
      );
      return;
    }

    // Create TransactionTarget records for successful resolutions
    const targets = await Promise.all(
      resolvedTxs.map(async ({ membership, resolved }) => {
        return await prisma.transactionTarget.create({
          data: {
            transactionId,
            membershipId: membership.id,
            resolvedTxData: {
              to: resolved.to,
              data: resolved.data,
              value: resolved.value.toString(),
            },
            status: "PENDING",
          },
        });
      })
    );

    console.log(
      `[TransactionExecutor] Created ${targets.length} transaction targets`
    );

    // Now execute transactions using ZeroDev
    // We need to use the permission accounts to sign with the PKP
    const chain = getChain();
    const rpcUrl = getZeroDevRpcUrl();

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const paymaster = createZeroDevPaymasterClient({
      chain,
      transport: http(rpcUrl),
    });

    // Create the PKP viem account for signing
    const pkpViemAccount = createPkpViemAccount(
      swarm.litPkpPublicKey,
      swarm.litPkpEthAddress as Address
    );

    // Create an ECDSA signer from the PKP viem account
    const pkpSigner = await toECDSASigner({ signer: pkpViemAccount });

    // Process each member's transaction
    for (let i = 0; i < resolvedTxs.length; i++) {
      const { membership, resolved } = resolvedTxs[i];
      const target = targets[i];

      try {
        console.log(
          `[TransactionExecutor] Processing transaction for member ${membership.id}`
        );

        // Deserialize the permission account with the PKP signer
        // This reconstructs the kernel account and uses our PKP to sign operations
        const permissionAccount = await deserializePermissionAccount(
          publicClient,
          ENTRY_POINT,
          KERNEL_VERSION,
          membership.sessionKeyApproval!,
          pkpSigner
        );

        // Create a kernel account client
        const kernelClient = createKernelAccountClient({
          account: permissionAccount,
          chain,
          bundlerTransport: http(rpcUrl),
          client: publicClient,
          paymaster: {
            getPaymasterData(userOperation) {
              return paymaster.sponsorUserOperation({ userOperation });
            },
          },
        });

        // Prepare the call data
        const callData = await kernelClient.account.encodeCalls([
          {
            to: resolved.to,
            value: resolved.value,
            data: resolved.data,
          },
        ]);

        // Send the user operation
        // The permission account should handle the signing with the PKP
        const userOpHash = await kernelClient.sendUserOperation({
          callData,
        });

        console.log(
          `[TransactionExecutor] Submitted UserOp ${userOpHash} for member ${membership.id}`
        );

        // Update target with UserOp hash
        await prisma.transactionTarget.update({
          where: { id: target.id },
          data: {
            userOpHash,
            status: "SUBMITTED",
          },
        });

        // Wait for confirmation (with timeout)
        try {
          const receipt = await kernelClient.waitForUserOperationReceipt({
            hash: userOpHash,
            timeout: 60000, // 60 second timeout
          });

          await prisma.transactionTarget.update({
            where: { id: target.id },
            data: {
              txHash: receipt.receipt.transactionHash,
              status: "CONFIRMED",
            },
          });

          console.log(
            `[TransactionExecutor] Confirmed tx ${receipt.receipt.transactionHash} for member ${membership.id}`
          );
        } catch (waitError) {
          console.error(
            `[TransactionExecutor] Timeout waiting for confirmation:`,
            waitError
          );
          // Keep as SUBMITTED - it might still confirm later
        }
      } catch (error) {
        console.error(
          `[TransactionExecutor] Failed to execute for member ${membership.id}:`,
          error
        );

        await prisma.transactionTarget.update({
          where: { id: target.id },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : "Execution failed",
          },
        });
      }
    }

    // Update overall transaction status based on target statuses
    const updatedTargets = await prisma.transactionTarget.findMany({
      where: { transactionId },
    });

    const allConfirmed = updatedTargets.every((t) => t.status === "CONFIRMED");
    const anyFailed = updatedTargets.some((t) => t.status === "FAILED");
    const anyPending = updatedTargets.some(
      (t) => t.status === "PENDING" || t.status === "SUBMITTED"
    );

    let finalStatus: "COMPLETED" | "FAILED" | "PROCESSING" = "COMPLETED";
    if (anyPending) {
      finalStatus = "PROCESSING";
    } else if (anyFailed && !allConfirmed) {
      finalStatus = "FAILED";
    }

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: finalStatus },
    });

    console.log(
      `[TransactionExecutor] Transaction ${transactionId} completed with status: ${finalStatus}`
    );
  } catch (error) {
    console.error(
      `[TransactionExecutor] Critical error for transaction ${transactionId}:`,
      error
    );

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "FAILED" },
    });
  }
}

/**
 * Poll for pending transaction targets and update their status
 * This can be run as a background job to catch any missed confirmations
 */
export async function pollPendingTransactions(): Promise<void> {
  const pendingTargets = await prisma.transactionTarget.findMany({
    where: {
      status: "SUBMITTED",
      userOpHash: { not: null },
    },
    include: {
      membership: true,
      transaction: {
        include: {
          swarm: true,
        },
      },
    },
  });

  if (pendingTargets.length === 0) {
    return;
  }

  console.log(
    `[TransactionExecutor] Polling ${pendingTargets.length} pending transactions`
  );

  const chain = getChain();
  const rpcUrl = getZeroDevRpcUrl();

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  for (const target of pendingTargets) {
    try {
      const swarm = target.transaction.swarm;

      // Create the PKP viem account for signing
      const pkpViemAccount = createPkpViemAccount(
        swarm.litPkpPublicKey,
        swarm.litPkpEthAddress as Address
      );

      // Create an ECDSA signer from the PKP viem account
      const pkpSigner = await toECDSASigner({ signer: pkpViemAccount });

      // Try to get the receipt
      const paymaster = createZeroDevPaymasterClient({
        chain,
        transport: http(rpcUrl),
      });

      const permissionAccount = await deserializePermissionAccount(
        publicClient,
        ENTRY_POINT,
        KERNEL_VERSION,
        target.membership.sessionKeyApproval!,
        pkpSigner
      );

      const kernelClient = createKernelAccountClient({
        account: permissionAccount,
        chain,
        bundlerTransport: http(rpcUrl),
        client: publicClient,
        paymaster: {
          getPaymasterData(userOperation) {
            return paymaster.sponsorUserOperation({ userOperation });
          },
        },
      });

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: target.userOpHash as Hex,
        timeout: 5000,
      });

      await prisma.transactionTarget.update({
        where: { id: target.id },
        data: {
          txHash: receipt.receipt.transactionHash,
          status: "CONFIRMED",
        },
      });

      console.log(
        `[TransactionExecutor] Confirmed pending tx ${receipt.receipt.transactionHash}`
      );

      // Update parent transaction status if all targets are now complete
      await updateTransactionStatus(target.transactionId);
    } catch {
      // Still pending, continue
    }
  }
}

/**
 * Update the parent transaction status based on target statuses
 */
async function updateTransactionStatus(transactionId: string): Promise<void> {
  const targets = await prisma.transactionTarget.findMany({
    where: { transactionId },
  });

  const allConfirmed = targets.every((t) => t.status === "CONFIRMED");
  const anyFailed = targets.some((t) => t.status === "FAILED");
  const anyPending = targets.some(
    (t) => t.status === "PENDING" || t.status === "SUBMITTED"
  );

  let status: "COMPLETED" | "FAILED" | "PROCESSING" = "COMPLETED";
  if (anyPending) {
    status = "PROCESSING";
  } else if (anyFailed && !allConfirmed) {
    status = "FAILED";
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { status },
  });
}

import { prisma } from "./prisma.js";
import { type Address, type Hex, createPublicClient, http, encodeFunctionData, parseAbi } from "viem";
import { baseSepolia, base } from "viem/chains";
import { env } from "./env.js";
import {
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import type { Swarm, SwarmMembership, User, TransactionTarget } from "@prisma/client";
import { createPkpViemAccount } from "./pkpSigner.js";
import { type SwapExecuteData, isNativeToken } from "./zeroEx.js";

// Types
type MembershipWithUser = SwarmMembership & { user: User };

// ERC20 ABI for approvals
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

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
 * Execute a swap transaction for all swarm members
 */
export async function executeSwapTransaction(
  transactionId: string,
  swarm: Swarm,
  memberships: MembershipWithUser[],
  executeData: SwapExecuteData[]
): Promise<void> {
  console.log(
    `[SwapExecutor] Starting execution for transaction ${transactionId}`
  );
  console.log(`[SwapExecutor] Using PKP: ${swarm.litPkpEthAddress}`);

  try {
    // Update transaction status to PROCESSING
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "PROCESSING" },
    });

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

    // Process each member's swap
    for (let i = 0; i < executeData.length; i++) {
      const data = executeData[i];
      const membership = memberships.find(
        (m) => m.agentWalletAddress.toLowerCase() === data.walletAddress.toLowerCase()
      );

      if (!membership) {
        console.error(`[SwapExecutor] Membership not found for wallet ${data.walletAddress}`);
        continue;
      }

      // Create target record
      const target = await prisma.transactionTarget.create({
        data: {
          transactionId,
          membershipId: membership.id,
          resolvedTxData: {
            type: "swap",
            sellToken: data.sellToken,
            buyToken: data.buyToken,
            sellAmount: data.sellAmount,
            buyAmount: data.buyAmount,
            transaction: data.transaction,
          },
          status: data.error ? "FAILED" : "PENDING",
          error: data.error,
        },
      });

      // Skip if there's an error from quote
      if (data.error) {
        console.log(`[SwapExecutor] Skipping ${membership.id}: ${data.error}`);
        continue;
      }

      try {
        console.log(
          `[SwapExecutor] Processing swap for member ${membership.id}`
        );

        // Deserialize the permission account with the PKP signer
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

        // Build the calls array
        const calls: Array<{ to: Hex; value: bigint; data: Hex }> = [];

        // Check if we need approval for ERC20 tokens (not native ETH)
        if (!isNativeToken(data.sellToken)) {
          // Check current allowance
          const currentAllowance = await publicClient.readContract({
            address: data.sellToken,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [data.walletAddress, data.allowanceTarget],
          });

          const sellAmount = BigInt(data.sellAmount);

          if (currentAllowance < sellAmount) {
            console.log(
              `[SwapExecutor] Adding approval for ${data.sellToken} to ${data.allowanceTarget}`
            );

            // Add approval transaction (approve max uint256)
            const approvalData = encodeFunctionData({
              abi: ERC20_ABI,
              functionName: "approve",
              args: [
                data.allowanceTarget,
                BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
              ],
            });

            calls.push({
              to: data.sellToken as Hex,
              value: 0n,
              data: approvalData,
            });
          }
        }

        // Add the swap transaction
        console.log(`[SwapExecutor] Swap transaction to: ${data.transaction.to}`);
        console.log(`[SwapExecutor] Swap transaction value: ${data.transaction.value || "0"}`);

        calls.push({
          to: data.transaction.to as Hex,
          value: BigInt(data.transaction.value || "0"),
          data: data.transaction.data as Hex,
        });

        console.log(`[SwapExecutor] Total calls to execute: ${calls.length}`);

        // Encode all calls
        const callData = await kernelClient.account.encodeCalls(calls);

        // Send the user operation
        const userOpHash = await kernelClient.sendUserOperation({
          callData,
        });

        console.log(
          `[SwapExecutor] Submitted UserOp ${userOpHash} for member ${membership.id}`
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
            `[SwapExecutor] Confirmed tx ${receipt.receipt.transactionHash} for member ${membership.id}`
          );
        } catch (waitError) {
          console.error(
            `[SwapExecutor] Timeout waiting for confirmation:`,
            waitError
          );
          // Keep as SUBMITTED - it might still confirm later
        }
      } catch (error) {
        console.error(
          `[SwapExecutor] Failed to execute for member ${membership.id}:`,
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

    const allConfirmed = updatedTargets.every((t: TransactionTarget) => t.status === "CONFIRMED");
    const anyFailed = updatedTargets.some((t: TransactionTarget) => t.status === "FAILED");
    const anyPending = updatedTargets.some(
      (t: TransactionTarget) => t.status === "PENDING" || t.status === "SUBMITTED"
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
      `[SwapExecutor] Transaction ${transactionId} completed with status: ${finalStatus}`
    );
  } catch (error) {
    console.error(
      `[SwapExecutor] Critical error for transaction ${transactionId}:`,
      error
    );

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: "FAILED" },
    });
  }
}

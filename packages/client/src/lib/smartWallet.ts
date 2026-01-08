import {
  createPublicClient,
  http,
  getAddress,
  encodeFunctionData,
  type Address,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
  type Hex,
} from "viem";
import { baseSepolia, base } from "viem/chains";
import {
  createKernelAccount,
  addressToEmptyAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import {
  toPermissionValidator,
  serializePermissionAccount,
} from "@zerodev/permissions";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";

// ERC20 ABI for transfer
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Get chain based on env
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 84532);
const chain = CHAIN_ID === 8453 ? base : baseSepolia;

// Public client for reading blockchain state
const publicClient = createPublicClient({
  chain,
  transport: http(),
});

// Entry point and kernel version
const ENTRY_POINT = getEntryPoint("0.7");
const KERNEL_VERSION = KERNEL_V3_1;

export interface CreateAgentWalletParams {
  /** The user's wallet client (from wagmi's useWalletClient) */
  walletClient: WalletClient<Transport, Chain, Account>;
  /** The swarm's PKP ETH address (from swarm.litPkpEthAddress) */
  pkpEthAddress: string;
  /** Unique index for this swarm (use swarm ID hash or counter) */
  index?: bigint;
}

export interface CreateAgentWalletResult {
  /** The counterfactual address of the agent wallet */
  agentWalletAddress: Address;
  /** Serialized permission account for PKP to sign transactions */
  sessionKeyApproval: string;
}

/**
 * Creates an agent wallet (ZeroDev Kernel account) for a user joining a swarm.
 *
 * The wallet is:
 * - Owned by the user's EOA (sudo validator)
 * - Allows the swarm's PKP to sign transactions (regular validator with sudo policy)
 *
 * @param params - Parameters for creating the wallet
 * @returns The wallet address and serialized session key approval
 */
export async function createAgentWallet(
  params: CreateAgentWalletParams
): Promise<CreateAgentWalletResult> {
  const { walletClient, pkpEthAddress, index = 0n } = params;

  console.log("=== Creating Agent Wallet ===");
  console.log("PKP ETH Address:", pkpEthAddress);
  console.log("Index:", index.toString());

  // Create ECDSA validator using the user's wallet client (owner)
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: walletClient,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // Create an "empty account" for the PKP - we only need its address
  // The PKP will use its private key on the backend to sign
  const pkpAddress = getAddress(pkpEthAddress);
  const emptyAccount = addressToEmptyAccount(pkpAddress);
  const pkpSigner = await toECDSASigner({ signer: emptyAccount });

  // Create permission validator with sudo policy (full permissions for PKP)
  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint: ENTRY_POINT,
    signer: pkpSigner,
    policies: [
      // Sudo policy allows the PKP to do anything
      toSudoPolicy({}),
    ],
    kernelVersion: KERNEL_VERSION,
  });

  // Create kernel account with both validators
  const kernelAccount = await createKernelAccount(publicClient, {
    entryPoint: ENTRY_POINT,
    plugins: {
      sudo: ecdsaValidator, // User's wallet is the owner
      regular: permissionPlugin, // PKP can sign with full permissions
    },
    kernelVersion: KERNEL_VERSION,
    index,
  });

  const agentWalletAddress = kernelAccount.address;
  console.log("Agent Wallet Address:", agentWalletAddress);

  // Serialize the permission account to get the approval
  // This allows the backend to reconstruct the account for PKP signing
  const sessionKeyApproval = await serializePermissionAccount(kernelAccount);
  console.log("Session Key Approval Created");

  return {
    agentWalletAddress,
    sessionKeyApproval,
  };
}

/**
 * Generates a deterministic index from a swarm ID.
 * This ensures the same user+swarm combination always gets the same wallet.
 *
 * @param swarmId - The swarm UUID
 * @returns A bigint index derived from the swarm ID
 */
export function swarmIdToIndex(swarmId: string): bigint {
  // Simple hash: sum of char codes
  let hash = 0n;
  for (let i = 0; i < swarmId.length; i++) {
    hash = (hash * 31n + BigInt(swarmId.charCodeAt(i))) % (2n ** 64n);
  }
  return hash;
}

// ============================================================================
// Withdrawal Functions
// ============================================================================

/**
 * Get the ZeroDev RPC URL for bundler/paymaster
 */
function getZeroDevRpcUrl(): string {
  const projectId = import.meta.env.VITE_ZERODEV_PROJECT_ID;
  if (!projectId) {
    throw new Error("VITE_ZERODEV_PROJECT_ID is required for withdrawals");
  }
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${CHAIN_ID}`;
}

export interface WithdrawTokenParams {
  /** The user's wallet client (from wagmi's useWalletClient) */
  walletClient: WalletClient<Transport, Chain, Account>;
  /** The agent wallet address (smart account address) */
  agentWalletAddress: Address;
  /** The token contract address */
  tokenAddress: Address;
  /** The amount to withdraw (in token's smallest unit) */
  amount: bigint;
  /** The destination address (user's EOA) */
  destinationAddress: Address;
  /** Unique index for this wallet (same as used when creating) */
  index?: bigint;
}

export interface WithdrawResult {
  /** Whether the withdrawal was successful */
  success: boolean;
  /** The transaction hash */
  txHash?: string;
  /** UserOperation hash */
  userOpHash?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Withdraw ERC20 tokens from the agent wallet to the user's EOA.
 * The user signs as the owner (sudo validator) of the smart account.
 *
 * @param params - Parameters for the withdrawal
 * @returns The transaction result
 */
export async function withdrawToken(
  params: WithdrawTokenParams
): Promise<WithdrawResult> {
  const {
    walletClient,
    agentWalletAddress,
    tokenAddress,
    amount,
    destinationAddress,
    index = 0n,
  } = params;

  console.log("=== Withdrawing ERC20 Token ===");
  console.log("Token:", tokenAddress);
  console.log("Amount:", amount.toString());
  console.log("To:", destinationAddress);
  console.log("From Agent Wallet:", agentWalletAddress);

  try {
    // Create ECDSA validator using the user's wallet client (owner)
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: walletClient,
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    });

    // Create kernel account with user as sudo (owner)
    const kernelAccount = await createKernelAccount(publicClient, {
      entryPoint: ENTRY_POINT,
      plugins: {
        sudo: ecdsaValidator,
      },
      kernelVersion: KERNEL_VERSION,
      index,
    });

    // Verify the address matches
    if (kernelAccount.address.toLowerCase() !== agentWalletAddress.toLowerCase()) {
      throw new Error(
        `Wallet address mismatch. Expected ${agentWalletAddress}, got ${kernelAccount.address}`
      );
    }

    // Get ZeroDev RPC URL and create clients
    const rpcUrl = getZeroDevRpcUrl();

    // Create paymaster client for sponsored transactions
    const paymasterClient = createZeroDevPaymasterClient({
      chain,
      transport: http(rpcUrl),
    });

    // Create kernel account client
    const kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain,
      bundlerTransport: http(rpcUrl),
      client: publicClient,
      paymaster: {
        getPaymasterData(userOperation) {
          return paymasterClient.sponsorUserOperation({ userOperation });
        },
      },
    });

    // Encode ERC20 transfer call
    const transferData = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [destinationAddress, amount],
    });

    // Encode the call and send
    const callData = await kernelClient.account.encodeCalls([
      {
        to: tokenAddress,
        value: 0n,
        data: transferData,
      },
    ]);

    console.log("Submitting UserOperation...");
    const userOpHash = await kernelClient.sendUserOperation({
      callData,
    });
    console.log("UserOperation submitted:", userOpHash);

    // Wait for confirmation
    console.log("Waiting for confirmation...");
    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 60000, // 60 second timeout
    });

    console.log("Transaction confirmed:", receipt.receipt.transactionHash);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash: userOpHash,
    };
  } catch (error) {
    console.error("Withdrawal failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface WithdrawETHParams {
  /** The user's wallet client (from wagmi's useWalletClient) */
  walletClient: WalletClient<Transport, Chain, Account>;
  /** The agent wallet address (smart account address) */
  agentWalletAddress: Address;
  /** The amount of ETH to withdraw (in wei) */
  amount: bigint;
  /** The destination address (user's EOA) */
  destinationAddress: Address;
  /** Unique index for this wallet (same as used when creating) */
  index?: bigint;
}

/**
 * Withdraw native ETH from the agent wallet to the user's EOA.
 * The user signs as the owner (sudo validator) of the smart account.
 *
 * @param params - Parameters for the withdrawal
 * @returns The transaction result
 */
export async function withdrawETH(
  params: WithdrawETHParams
): Promise<WithdrawResult> {
  const {
    walletClient,
    agentWalletAddress,
    amount,
    destinationAddress,
    index = 0n,
  } = params;

  console.log("=== Withdrawing ETH ===");
  console.log("Amount:", amount.toString(), "wei");
  console.log("To:", destinationAddress);
  console.log("From Agent Wallet:", agentWalletAddress);

  try {
    // Create ECDSA validator using the user's wallet client (owner)
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: walletClient,
      entryPoint: ENTRY_POINT,
      kernelVersion: KERNEL_VERSION,
    });

    // Create kernel account with user as sudo (owner)
    const kernelAccount = await createKernelAccount(publicClient, {
      entryPoint: ENTRY_POINT,
      plugins: {
        sudo: ecdsaValidator,
      },
      kernelVersion: KERNEL_VERSION,
      index,
    });

    // Verify the address matches
    if (kernelAccount.address.toLowerCase() !== agentWalletAddress.toLowerCase()) {
      throw new Error(
        `Wallet address mismatch. Expected ${agentWalletAddress}, got ${kernelAccount.address}`
      );
    }

    // Get ZeroDev RPC URL and create clients
    const rpcUrl = getZeroDevRpcUrl();

    // Create paymaster client for sponsored transactions
    const paymasterClient = createZeroDevPaymasterClient({
      chain,
      transport: http(rpcUrl),
    });

    // Create kernel account client
    const kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain,
      bundlerTransport: http(rpcUrl),
      client: publicClient,
      paymaster: {
        getPaymasterData(userOperation) {
          return paymasterClient.sponsorUserOperation({ userOperation });
        },
      },
    });

    // Encode native ETH transfer
    const callData = await kernelClient.account.encodeCalls([
      {
        to: destinationAddress,
        value: amount,
        data: "0x" as Hex,
      },
    ]);

    console.log("Submitting UserOperation...");
    const userOpHash = await kernelClient.sendUserOperation({
      callData,
    });
    console.log("UserOperation submitted:", userOpHash);

    // Wait for confirmation
    console.log("Waiting for confirmation...");
    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 60000, // 60 second timeout
    });

    console.log("Transaction confirmed:", receipt.receipt.transactionHash);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash: userOpHash,
    };
  } catch (error) {
    console.error("ETH Withdrawal failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

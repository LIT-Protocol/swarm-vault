import {
  createKernelAccount,
  createZeroDevPaymasterClient,
  createKernelAccountClient,
  type KernelSmartAccountImplementation,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import {
  http,
  createPublicClient,
  keccak256,
  toHex,
  type Address,
  type Hex,
  encodeFunctionData,
  type PublicClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { env } from "./env.js";
import { signUserOperation as signWithLitPKP } from "./litActions.js";
import type { SmartAccount } from "viem/account-abstraction";

// Constants
const KERNEL_VERSION = KERNEL_V3_1;
const ENTRY_POINT = getEntryPoint("0.7");

/**
 * Generates a deterministic index from a swarm ID using keccak256.
 * This ensures:
 * 1. The same user+swarm combination always gets the same wallet
 * 2. Agent wallets are unique to Swarm Vault (won't collide with other ZeroDev apps)
 *
 * @param swarmId - The swarm UUID
 * @returns A bigint index derived from keccak256("swarm_vault_<swarmId>")
 */
export function swarmIdToIndex(swarmId: string): bigint {
  // Use keccak256 hash of "swarm_vault_<swarmId>" for a unique, deterministic index
  const hash = keccak256(toHex(`swarm_vault_${swarmId}`));
  // Convert hex hash to bigint (uint256)
  return BigInt(hash);
}

/**
 * Get the chain configuration based on chain ID
 */
function getChain(chainId: number): Chain {
  switch (chainId) {
    case 84532:
      return baseSepolia;
    case 8453:
      return base;
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

/**
 * Get the ZeroDev RPC URL (unified bundler/paymaster endpoint)
 * Format: https://rpc.zerodev.app/api/v3/{projectId}/chain/{chainId}
 */
export function getZeroDevRpcUrl(): string {
  if (!env.ZERODEV_PROJECT_ID) {
    throw new Error("ZERODEV_PROJECT_ID is required for ZeroDev operations");
  }
  return `https://rpc.zerodev.app/api/v3/${env.ZERODEV_PROJECT_ID}/chain/${env.CHAIN_ID}`;
}

// Cached public client
let publicClient: PublicClient | null = null;

/**
 * Get or create the public client for blockchain interactions
 */
export function getPublicClient(): PublicClient {
  if (publicClient) {
    return publicClient;
  }

  const chain = getChain(env.CHAIN_ID);
  const rpcUrl = getZeroDevRpcUrl();

  publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  return publicClient;
}

/**
 * Get the entry point for the current configuration
 */
export function getEntryPointConfig() {
  return ENTRY_POINT;
}

/**
 * Compute the counterfactual smart wallet address for a user
 * The wallet is owned by the user's EOA but has the swarm's PKP as a session signer
 *
 * @param userEoaAddress - The user's MetaMask EOA address
 * @param index - Optional index for creating multiple wallets per user (default: 0)
 * @returns The counterfactual smart wallet address
 */
export async function computeSmartWalletAddress(
  userEoaAddress: Address,
  index: bigint = 0n
): Promise<Address> {
  const client = getPublicClient();

  // Create a temporary signer from the user's address
  // We use a deterministic private key derived from the address for address computation
  // Note: This is only used for computing the counterfactual address, not for signing
  const tempAccount = privateKeyToAccount(
    `0x${"0".repeat(63)}1` as Hex // Placeholder key for address computation
  );

  // Create validator for the user's EOA
  const ecdsaValidator = await signerToEcdsaValidator(client, {
    signer: {
      ...tempAccount,
      address: userEoaAddress, // Override with actual user address
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // Create kernel account to get the counterfactual address
  const account = await createKernelAccount(client, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
    index,
  });

  return account.address;
}

/**
 * Create a Kernel smart account for a user
 *
 * @param userPrivateKey - The user's private key (for signing)
 * @param index - Optional index for multiple wallets per user
 * @returns The Kernel smart account
 */
export async function createUserSmartAccount(
  userPrivateKey: Hex,
  index: bigint = 0n
): Promise<SmartAccount<KernelSmartAccountImplementation>> {
  const client = getPublicClient();
  const signer = privateKeyToAccount(userPrivateKey);

  // Create ECDSA validator for the user
  const ecdsaValidator = await signerToEcdsaValidator(client, {
    signer,
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
  });

  // Create kernel account
  const account = await createKernelAccount(client, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint: ENTRY_POINT,
    kernelVersion: KERNEL_VERSION,
    index,
  });

  console.log(`[ZeroDev] Created smart account: ${account.address}`);
  return account;
}

/**
 * Create a Kernel account client for sending transactions
 *
 * @param account - The Kernel smart account
 * @returns The Kernel account client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createAccountClient(
  account: SmartAccount<KernelSmartAccountImplementation>
): Promise<any> {
  const chain = getChain(env.CHAIN_ID);
  const rpcUrl = getZeroDevRpcUrl();
  const client = getPublicClient();

  // Create paymaster client for sponsored transactions
  const zerodevPaymaster = createZeroDevPaymasterClient({
    chain,
    transport: http(rpcUrl),
  });

  // Create kernel account client
  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(rpcUrl),
    client,
    paymaster: {
      getPaymasterData(userOperation) {
        return zerodevPaymaster.sponsorUserOperation({ userOperation });
      },
    },
  });

  return kernelClient;
}

/**
 * Build a UserOperation for a transaction
 *
 * @param account - The Kernel smart account
 * @param to - Target contract address
 * @param value - ETH value to send (in wei)
 * @param data - Calldata for the transaction
 * @returns The prepared UserOperation
 */
export async function buildUserOperation(
  account: SmartAccount<KernelSmartAccountImplementation>,
  to: Address,
  value: bigint,
  data: Hex
) {
  const kernelClient = await createAccountClient(account);

  // Encode the calls using the account's encodeCalls method
  const callData = await kernelClient.account.encodeCalls([
    {
      to,
      value,
      data,
    },
  ]);

  return { callData };
}

/**
 * Sign a UserOperation hash using a Lit Protocol PKP
 *
 * @param pkpPublicKey - The PKP public key
 * @param userOpHash - The UserOperation hash to sign
 * @returns The signature
 */
export async function signUserOpWithPKP(
  pkpPublicKey: string,
  userOpHash: Hex
): Promise<Hex> {
  console.log(`[ZeroDev] Signing UserOp with PKP: ${pkpPublicKey.slice(0, 20)}...`);

  const result = await signWithLitPKP(pkpPublicKey, userOpHash);

  if (!result.success || !result.signature) {
    throw new Error(`Failed to sign UserOp: ${result.error || "Unknown error"}`);
  }

  return result.signature.signature as Hex;
}

/**
 * Submit a UserOperation to the bundler
 *
 * @param account - The Kernel smart account
 * @param to - Target address
 * @param value - ETH value to send
 * @param data - Calldata
 * @returns The UserOperation hash
 */
export async function submitUserOperation(
  account: SmartAccount<KernelSmartAccountImplementation>,
  to: Address,
  value: bigint,
  data: Hex
): Promise<Hex> {
  const kernelClient = await createAccountClient(account);

  console.log("[ZeroDev] Submitting UserOperation...");

  // Encode the calls and send user operation
  const callData = await kernelClient.account.encodeCalls([
    {
      to,
      value,
      data,
    },
  ]);

  const userOpHash = await kernelClient.sendUserOperation({
    callData,
  });

  console.log(`[ZeroDev] UserOperation submitted: ${userOpHash}`);

  return userOpHash as Hex;
}

/**
 * Execute a batch of transactions for a smart wallet
 *
 * @param account - The Kernel smart account
 * @param transactions - Array of transactions to execute
 * @returns The UserOperation hash
 */
export async function executeBatchTransactions(
  account: SmartAccount<KernelSmartAccountImplementation>,
  transactions: Array<{ to: Address; value: bigint; data: Hex }>
): Promise<Hex> {
  const kernelClient = await createAccountClient(account);

  console.log(`[ZeroDev] Executing batch of ${transactions.length} transactions...`);

  // Encode the batch of calls
  const callData = await kernelClient.account.encodeCalls(transactions);

  const userOpHash = await kernelClient.sendUserOperation({
    callData,
  });

  console.log(`[ZeroDev] Batch UserOperation submitted: ${userOpHash}`);

  return userOpHash as Hex;
}

/**
 * Encode function call data using viem
 *
 * @param abi - The contract ABI
 * @param functionName - The function to call
 * @param args - The function arguments
 * @returns The encoded calldata
 */
export function encodeCallData(
  abi: readonly unknown[],
  functionName: string,
  args: readonly unknown[]
): Hex {
  return encodeFunctionData({
    abi: abi as readonly unknown[],
    functionName,
    args,
  });
}

/**
 * Wait for a UserOperation to be confirmed
 *
 * @param account - The Kernel smart account
 * @param userOpHash - The UserOperation hash
 * @param timeout - Timeout in milliseconds (default: 15 seconds)
 * @returns The UserOperation receipt
 */
export async function waitForUserOpReceipt(
  account: SmartAccount<KernelSmartAccountImplementation>,
  userOpHash: Hex,
  timeout: number = 15000
) {
  const kernelClient = await createAccountClient(account);

  console.log(`[ZeroDev] Waiting for UserOp confirmation: ${userOpHash}`);

  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout,
  });

  console.log(`[ZeroDev] UserOp confirmed: ${receipt.receipt.transactionHash}`);

  return receipt;
}

// ============================================================================
// PKP Session Key Integration
// ============================================================================

/**
 * Create a custom signer that uses a Lit PKP for signing
 * This allows the PKP to sign UserOperations on behalf of the smart wallet
 */
export interface PKPSignerConfig {
  pkpPublicKey: string;
  pkpEthAddress: Address;
}

/**
 * Create a Kernel account where the owner is a user's EOA
 * but a PKP has permission to sign transactions (as a session key)
 *
 * For MVP: We'll use a simpler approach where the smart wallet
 * is controlled by the user's EOA, and the PKP signs through
 * the Lit Action after the user has delegated authority.
 *
 * @param userEoaAddress - The user's EOA address (owner)
 * @param _pkpEthAddress - The PKP's ETH address (reserved for future session key setup)
 * @param index - Optional wallet index
 */
export async function computeSmartWalletWithPKPSigner(
  userEoaAddress: Address,
  _pkpEthAddress: Address,
  index: bigint = 0n
): Promise<Address> {
  // For now, we compute the address based on the user's EOA
  // The PKP session key will be added after wallet deployment
  // TODO: In future, use _pkpEthAddress to set up session key permissions
  return computeSmartWalletAddress(userEoaAddress, index);
}

/**
 * Prepare a UserOperation and get its details for PKP signing
 * This is used when we need the PKP to sign instead of the EOA
 *
 * @param account - The Kernel smart account
 * @param to - Target contract address
 * @param value - ETH value to send
 * @param data - Calldata
 * @returns The prepared user operation details
 */
export async function prepareUserOpForPKPSigning(
  account: SmartAccount<KernelSmartAccountImplementation>,
  to: Address,
  value: bigint,
  data: Hex
) {
  const kernelClient = await createAccountClient(account);

  // Encode the calls
  const callData = await kernelClient.account.encodeCalls([
    { to, value, data },
  ]);

  // Return the call data for signing
  return {
    callData,
    sender: account.address,
  };
}

/**
 * Send a UserOperation and wait for confirmation
 * Convenience function that combines submit and wait
 *
 * @param account - The Kernel smart account
 * @param to - Target address
 * @param value - ETH value to send
 * @param data - Calldata
 * @param timeout - Timeout in milliseconds (default: 15 seconds)
 * @returns The UserOperation receipt
 */
export async function sendAndWaitForUserOp(
  account: SmartAccount<KernelSmartAccountImplementation>,
  to: Address,
  value: bigint,
  data: Hex,
  timeout: number = 15000
) {
  const userOpHash = await submitUserOperation(account, to, value, data);
  const receipt = await waitForUserOpReceipt(account, userOpHash, timeout);
  return { userOpHash, receipt };
}

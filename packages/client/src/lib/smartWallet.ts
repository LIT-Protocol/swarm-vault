import { createPublicClient, http, getAddress, type Address } from "viem";
import { baseSepolia, base } from "viem/chains";
import { createKernelAccount, addressToEmptyAccount } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import {
  toPermissionValidator,
  serializePermissionAccount,
} from "@zerodev/permissions";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import type { EIP1193Provider } from "viem";

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
  /** The user's wallet provider (from wagmi) */
  walletProvider: EIP1193Provider;
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
  const { walletProvider, pkpEthAddress, index = 0n } = params;

  console.log("=== Creating Agent Wallet ===");
  console.log("PKP ETH Address:", pkpEthAddress);
  console.log("Index:", index.toString());

  // Create ECDSA validator using the user's wallet provider (owner)
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: walletProvider,
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

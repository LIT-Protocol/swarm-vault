/**
 * Gnosis SAFE integration service
 * Handles SAFE signature verification for proposal sign-off
 */

import SafeApiKitModule from "@safe-global/api-kit";
import Safe, { hashSafeMessage } from "@safe-global/protocol-kit";
import {
  type Address,
  createPublicClient,
  keccak256,
  toBytes,
  http,
} from "viem";
import { env } from "./env.js";
import { EIP712TypedData } from "@safe-global/types-kit";
import { base } from "viem/chains";

// Handle ESM default export compatibility
const SafeApiKit =
  (SafeApiKitModule as unknown as { default: typeof SafeApiKitModule })
    .default || SafeApiKitModule;

/**
 * EIP-712 domain for SwarmVault proposals
 */
export const SWARM_VAULT_DOMAIN = {
  name: "SwarmVault",
  version: "1",
  chainId: env.CHAIN_ID,
} as const;

/**
 * EIP-712 types for proposal approval
 */
export const PROPOSAL_APPROVAL_TYPES = {
  ProposalApproval: [
    { name: "swarmId", type: "string" },
    { name: "proposalId", type: "string" },
    { name: "actionType", type: "string" },
    { name: "actionDataHash", type: "bytes32" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

/**
 * Get the SAFE API Kit for the current chain
 * The SDK automatically uses the correct Transaction Service URL for supported chains
 * Requires SAFE_API_KEY environment variable
 */
export function getSafeApiKit() {
  if (!env.SAFE_API_KEY) {
    throw new Error(
      "SAFE_API_KEY is required. Get your API key at https://developer.safe.global"
    );
  }

  return new SafeApiKit({
    chainId: BigInt(env.CHAIN_ID),
    apiKey: env.SAFE_API_KEY,
  });
}

/**
 * Create the EIP-712 typed data for a proposal
 * This is the message that will be signed by SAFE owners
 *
 * The Safe Protocol Kit will use this typed data structure directly,
 * allowing wallets to display a human-readable, structured message.
 */
export function createProposalMessage(
  swarmId: string,
  proposalId: string,
  actionType: string,
  actionDataHash: string,
  expiresAt: Date,
  verifyingContract: string
): EIP712TypedData {
  const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);

  return {
    domain: {
      name: SWARM_VAULT_DOMAIN.name,
      version: SWARM_VAULT_DOMAIN.version,
      chainId: SWARM_VAULT_DOMAIN.chainId,
      verifyingContract,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ProposalApproval: [
        { name: "swarmId", type: "string" },
        { name: "proposalId", type: "string" },
        { name: "actionType", type: "string" },
        { name: "actionDataHash", type: "bytes32" },
        { name: "expiresAt", type: "uint256" },
      ],
    },
    primaryType: "ProposalApproval",
    message: {
      swarmId,
      proposalId,
      actionType,
      actionDataHash,
      expiresAt: expiresAtUnix,
    },
  };
}

/**
 * Hash action data for inclusion in the message hash
 */
export function hashActionData(actionData: unknown): string {
  const jsonStr = JSON.stringify(
    actionData,
    Object.keys(actionData as object).sort()
  );
  return keccak256(toBytes(jsonStr));
}

/**
 * Serialize EIP712TypedData to JSON for storage
 */
export function serializeTypedData(typedData: EIP712TypedData): string {
  return JSON.stringify(typedData);
}

/**
 * Deserialize EIP712TypedData from JSON storage
 */
export function deserializeTypedData(json: string): EIP712TypedData {
  return JSON.parse(json) as EIP712TypedData;
}

/**
 * Check if a SAFE address is valid and accessible
 */
export async function validateSafeAddress(safeAddress: string): Promise<{
  valid: boolean;
  owners?: string[];
  threshold?: number;
  error?: string;
}> {
  try {
    const apiKit = getSafeApiKit();
    const safeInfo = await apiKit.getSafeInfo(safeAddress);

    return {
      valid: true,
      owners: safeInfo.owners,
      threshold: safeInfo.threshold,
    };
  } catch (error) {
    console.error("[SAFE] Error validating SAFE address:", error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Failed to validate SAFE",
    };
  }
}

/**
 * Check if a message has been signed by a SAFE
 * Uses the SAFE Transaction Service to check for off-chain signatures
 *
 * @param safeAddress - The Safe address
 * @param message - The EIP712TypedData or raw message string (will be hashed for lookup)
 */
export async function checkSafeMessageSignature(
  safeAddress: string,
  message: string | EIP712TypedData
): Promise<{
  signed: boolean;
  confirmations?: number;
  threshold?: number;
  signatures?: string[];
}> {
  try {
    const apiKit = getSafeApiKit();

    // Hash the message to get the Safe message hash for lookup
    // hashSafeMessage handles both string and EIP712TypedData
    const messageHash = hashSafeMessage(message);

    // Try to get the message from SAFE Transaction Service
    const safeMessage = await apiKit.getMessage(messageHash);

    // Check if we have enough confirmations
    const safeInfo = await apiKit.getSafeInfo(safeAddress);
    const confirmations = safeMessage.confirmations?.length || 0;
    const threshold = safeInfo.threshold;

    const signed = confirmations >= threshold;

    return {
      signed,
      confirmations,
      threshold,
      signatures: safeMessage.confirmations?.map((c) => c.signature) || [],
    };
  } catch (error) {
    // If message not found, it hasn't been signed yet
    if (error instanceof Error && error.message.includes("not found")) {
      return {
        signed: false,
        confirmations: 0,
      };
    }

    console.error("[SAFE] Error checking message signature:", error);
    return {
      signed: false,
      confirmations: 0,
    };
  }
}

/**
 * Get the URL to sign a message in the SAFE app
 *
 * @param safeAddress - The Safe address
 * @param message - The EIP712TypedData or raw message string (will be hashed for the URL)
 */
export function getSafeSignUrl(
  safeAddress: string,
  message: string | EIP712TypedData
): string {
  const chainPrefix = env.CHAIN_ID === 8453 ? "base" : "basesep";
  // Safe app expects the hash of the message in the URL
  // hashSafeMessage handles both string and EIP712TypedData
  const messageHash = hashSafeMessage(message);
  // TODO: calculate safe message hash using protocol kit
  // this doesn't work yet - we don't have protocolKit ready on the backend.
  // once we come back to fixing SAFE sign-off, we should use this.
  // const safeMessageHash = await protocolKit.getSafeMessageHash(messageHash);
  return `https://app.safe.global/transactions/msg?safe=${chainPrefix}:${safeAddress}&messageHash=${messageHash}`;
}

/**
 * Propose a message to SAFE for signing
 * This creates a message proposal that SAFE owners can sign
 *
 * IMPORTANT: The signature must be from a SAFE owner. If the signer
 * is not a SAFE owner, this will fail with "Signer is not an owner".
 *
 * @param safeAddress - The Safe address
 * @param message - The EIP712TypedData or raw message string
 * @param signature - The signature from a SAFE owner
 */
export async function proposeMessageToSafe(
  safeAddress: string,
  message: string | EIP712TypedData,
  signature: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const apiKit = getSafeApiKit();

    // The SAFE API Kit expects the message with a valid signature from an owner
    // This will appear in the SAFE app for signing by other owners
    // For EIP712TypedData, the API Kit handles it directly
    await apiKit.addMessage(safeAddress, {
      message: message,
      signature: signature,
    });

    const messageHash = hashSafeMessage(message);
    console.log(`[SAFE] Message proposed to SAFE: ${messageHash}`);

    return { success: true };
  } catch (error) {
    console.error("[SAFE] Error proposing message to SAFE:", error);

    // Provide more helpful error messages
    const errorMessage =
      error instanceof Error ? error.message : "Failed to propose message";

    // Common error: signer is not a SAFE owner
    if (errorMessage.includes("Signer") || errorMessage.includes("owner")) {
      return {
        success: false,
        error:
          "The signing wallet is not a SAFE owner. Please ensure the manager's wallet is added as an owner on the SAFE.",
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Verify a SAFE signature on-chain (fallback method)
 * This is used if the Transaction Service is unavailable
 *
 * @param safeAddress - The Safe address
 * @param message - The EIP712TypedData or raw message string
 */
export async function verifySafeSignatureOnChain(
  safeAddress: Address,
  message: string | EIP712TypedData,
  _rpcUrl: string // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<boolean> {
  try {
    // This would use the SAFE contract's isValidSignature method
    // For now, we rely on the Transaction Service
    console.warn(
      "[SAFE] On-chain verification not implemented, using Transaction Service"
    );

    const result = await checkSafeMessageSignature(safeAddress, message);
    return result.signed;
  } catch (error) {
    console.error("[SAFE] Error verifying signature on-chain:", error);
    return false;
  }
}

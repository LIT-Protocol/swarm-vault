/**
 * Gnosis SAFE integration service
 * Handles SAFE signature verification for proposal sign-off
 */

import SafeApiKitModule from "@safe-global/api-kit";
import { type Address, keccak256, toBytes } from "viem";
import { env } from "./env.js";

// Handle ESM default export compatibility
const SafeApiKit = (SafeApiKitModule as unknown as { default: typeof SafeApiKitModule }).default || SafeApiKitModule;

/**
 * Get the SAFE API Kit for the current chain
 * The SDK automatically uses the correct Transaction Service URL for supported chains
 * Requires SAFE_API_KEY environment variable
 */
export function getSafeApiKit() {
  if (!env.SAFE_API_KEY) {
    throw new Error("SAFE_API_KEY is required. Get your API key at https://developer.safe.global");
  }

  return new SafeApiKit({
    chainId: BigInt(env.CHAIN_ID),
    apiKey: env.SAFE_API_KEY,
  });
}

/**
 * Create the raw message string for a proposal
 * This is the message that will be signed by SAFE owners
 *
 * IMPORTANT: This returns a raw string (not hashed) because the Safe Protocol Kit
 * will handle all the hashing internally when signing.
 */
export function createProposalMessage(
  swarmId: string,
  proposalId: string,
  actionType: string,
  actionDataHash: string,
  expiresAt: Date
): string {
  // Create a human-readable message that includes all proposal details
  // The Safe SDK will hash this message according to EIP-191/EIP-712
  const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);
  return `SwarmVault Proposal Approval\n\nSwarm: ${swarmId}\nProposal: ${proposalId}\nAction: ${actionType}\nData Hash: ${actionDataHash}\nExpires: ${expiresAtUnix}`;
}

/**
 * Hash action data for inclusion in the message hash
 */
export function hashActionData(actionData: unknown): string {
  const jsonStr = JSON.stringify(actionData, Object.keys(actionData as object).sort());
  return keccak256(toBytes(jsonStr));
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
 */
export async function checkSafeMessageSignature(
  safeAddress: string,
  messageHash: string
): Promise<{
  signed: boolean;
  confirmations?: number;
  threshold?: number;
  signatures?: string[];
}> {
  try {
    const apiKit = getSafeApiKit();

    // Try to get the message from SAFE Transaction Service
    // The message hash is used to look up pending messages
    const message = await apiKit.getMessage(messageHash);

    // Check if we have enough confirmations
    const safeInfo = await apiKit.getSafeInfo(safeAddress);
    const confirmations = message.confirmations?.length || 0;
    const threshold = safeInfo.threshold;

    const signed = confirmations >= threshold;

    return {
      signed,
      confirmations,
      threshold,
      signatures: message.confirmations?.map(c => c.signature) || [],
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
 */
export function getSafeSignUrl(safeAddress: string, messageHash: string): string {
  const chainPrefix = env.CHAIN_ID === 8453 ? "base" : "basesep";
  return `https://app.safe.global/transactions/msg?safe=${chainPrefix}:${safeAddress}&messageHash=${messageHash}`;
}

/**
 * Propose a message to SAFE for signing
 * This creates a message proposal that SAFE owners can sign
 *
 * IMPORTANT: The signature must be from a SAFE owner. If the signer
 * is not a SAFE owner, this will fail with "Signer is not an owner".
 */
export async function proposeMessageToSafe(
  safeAddress: string,
  messageHash: string,
  signature: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const apiKit = getSafeApiKit();

    // The SAFE API Kit expects the message with a valid signature from an owner
    // This will appear in the SAFE app for signing by other owners
    await apiKit.addMessage(safeAddress, {
      message: messageHash,
      signature: signature,
    });

    console.log(`[SAFE] Message proposed to SAFE: ${messageHash}`);

    return { success: true };
  } catch (error) {
    console.error("[SAFE] Error proposing message to SAFE:", error);

    // Provide more helpful error messages
    const errorMessage = error instanceof Error ? error.message : "Failed to propose message";

    // Common error: signer is not a SAFE owner
    if (errorMessage.includes("Signer") || errorMessage.includes("owner")) {
      return {
        success: false,
        error: "The signing wallet is not a SAFE owner. Please ensure the manager's wallet is added as an owner on the SAFE.",
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
 */
export async function verifySafeSignatureOnChain(
  safeAddress: Address,
  messageHash: string,
  _rpcUrl: string // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<boolean> {
  try {
    // This would use the SAFE contract's isValidSignature method
    // For now, we rely on the Transaction Service
    console.warn("[SAFE] On-chain verification not implemented, using Transaction Service");

    const result = await checkSafeMessageSignature(safeAddress, messageHash);
    return result.signed;
  } catch (error) {
    console.error("[SAFE] Error verifying signature on-chain:", error);
    return false;
  }
}

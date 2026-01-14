/**
 * Gnosis SAFE integration service
 * Handles SAFE signature verification for proposal sign-off
 */

import Safe from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import { type Address, keccak256, encodePacked, toBytes } from "viem";
import { env } from "./env.js";

// SAFE Transaction Service URLs by chain ID
const SAFE_TX_SERVICE_URLS: Record<number, string> = {
  8453: "https://safe-transaction-base.safe.global", // Base Mainnet
  84532: "https://safe-transaction-base-sepolia.safe.global", // Base Sepolia
};

/**
 * Get the SAFE API Kit for the current chain
 */
export function getSafeApiKit(): SafeApiKit {
  const txServiceUrl = SAFE_TX_SERVICE_URLS[env.CHAIN_ID];
  if (!txServiceUrl) {
    throw new Error(`No SAFE Transaction Service URL for chain ${env.CHAIN_ID}`);
  }

  return new SafeApiKit({
    chainId: BigInt(env.CHAIN_ID),
    txServiceUrl,
  });
}

/**
 * Compute the EIP-712 message hash for a proposal
 * This is what the SAFE needs to sign
 */
export function computeProposalMessageHash(
  swarmId: string,
  proposalId: string,
  actionType: string,
  actionDataHash: string,
  expiresAt: Date
): string {
  // Create a deterministic hash from proposal data
  // Using keccak256 of packed encoding
  const message = encodePacked(
    ["string", "string", "string", "string", "bytes32", "uint256"],
    [
      "SwarmVault Proposal",
      swarmId,
      proposalId,
      actionType,
      actionDataHash as `0x${string}`,
      BigInt(Math.floor(expiresAt.getTime() / 1000)),
    ]
  );

  return keccak256(message);
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
 */
export async function proposeMessageToSafe(
  safeAddress: string,
  messageHash: string,
  proposerAddress: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const apiKit = getSafeApiKit();

    // The SAFE API Kit expects the message to be proposed
    // This will appear in the SAFE app for signing
    await apiKit.addMessage(safeAddress, {
      message: messageHash,
      signature: "0x", // Empty signature - will be filled by owners
    });

    console.log(`[SAFE] Message proposed to SAFE: ${messageHash}`);

    return { success: true };
  } catch (error) {
    console.error("[SAFE] Error proposing message to SAFE:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to propose message",
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
  rpcUrl: string
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

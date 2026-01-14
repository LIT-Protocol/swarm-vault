/**
 * Gnosis SAFE integration service
 * Handles SAFE signature verification for proposal sign-off
 */

import SafeApiKitModule from "@safe-global/api-kit";
import { type Address, keccak256, encodePacked, toBytes, encodeAbiParameters, concat, hashMessage } from "viem";
import { env } from "./env.js";

// Safe EIP-712 type hashes
const DOMAIN_SEPARATOR_TYPEHASH = keccak256(
  toBytes("EIP712Domain(uint256 chainId,address verifyingContract)")
);
const SAFE_MSG_TYPEHASH = keccak256(toBytes("SafeMessage(bytes message)"));

// Handle ESM default export compatibility
const SafeApiKit = (SafeApiKitModule as unknown as { default: typeof SafeApiKitModule }).default || SafeApiKitModule;

/**
 * Get the SAFE API Kit for the current chain
 * The SDK automatically uses the correct Transaction Service URL for supported chains
 */
export function getSafeApiKit() {
  return new SafeApiKit({
    chainId: BigInt(env.CHAIN_ID),
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
 * Compute the Safe message hash that needs to be signed
 *
 * This follows Safe's EIP-712 message signing flow:
 * 1. Hash the original message with EIP-191 (personal_sign format)
 * 2. Wrap in SafeMessage struct and hash with EIP-712 domain
 *
 * The user must sign this hash (as raw bytes) for Safe to accept the signature.
 */
export function computeSafeMessageHash(
  safeAddress: string,
  message: string
): string {
  // Step 1: Compute EIP-191 hash of the message (what personal_sign would hash)
  // For a string message, this is keccak256("\x19Ethereum Signed Message:\n" + len + message)
  const messageHash = hashMessage(message);

  // Step 2: Compute the EIP-712 domain separator for this Safe
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [DOMAIN_SEPARATOR_TYPEHASH, BigInt(env.CHAIN_ID), safeAddress as Address]
    )
  );

  // Step 3: Compute the SafeMessage struct hash
  // SafeMessage(bytes message) where message is the EIP-191 hash
  const safeMessageStructHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [SAFE_MSG_TYPEHASH, messageHash as `0x${string}`]
    )
  );

  // Step 4: Compute final EIP-712 hash: keccak256("\x19\x01" + domainSeparator + structHash)
  const safeMessageHash = keccak256(
    concat([
      "0x1901" as `0x${string}`,
      domainSeparator as `0x${string}`,
      safeMessageStructHash as `0x${string}`,
    ])
  );

  return safeMessageHash;
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

/**
 * Safe message signing utilities
 * Uses the Safe Protocol Kit to sign messages for Safe off-chain message signing
 */

import Safe, { SigningMethod } from "@safe-global/protocol-kit";
import { EIP712TypedData } from "@safe-global/types-kit";

/**
 * Sign a message for a Safe using the Safe Protocol Kit
 *
 * This uses Safe's official signMessage method which handles all the
 * EIP-712 signing correctly. The message should be a EIP712TypedData object - the
 * Safe Protocol Kit will hash it internally.
 *
 * @param safeAddress - The Safe address
 * @param message - The EIP712TypedData object (may contain serialized BigInt markers)
 * @returns The signature
 */
export async function signSafeMessage(
  safeAddress: string,
  message: EIP712TypedData
): Promise<string> {
  console.log("[safeMessage] Initializing Protocol Kit with signer...");
  console.log("[safeMessage] Safe address:", safeAddress);
  console.log("[safeMessage] Raw message from API:", message);

  // Use window.ethereum as the provider
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = (window as any).ethereum;

  if (!provider) {
    throw new Error(
      "No wallet provider found. Please install a wallet like MetaMask."
    );
  }

  // Initialize Protocol Kit with the user's wallet as signer
  const protocolKit = await Safe.init({
    provider,
    safeAddress: safeAddress,
  });

  // Create the Safe message from EIP-712 typed data
  const safeMessage = protocolKit.createMessage(message);
  console.log(
    "[safeMessage] Created Safe message from EIP-712 typed data",
    safeMessage
  );

  // Sign the message using ETH_SIGN_TYPED_DATA_V4
  // This will show a structured, human-readable message in the user's wallet
  const signedMessage = await protocolKit.signMessage(
    safeMessage,
    SigningMethod.ETH_SIGN_TYPED_DATA_V4
  );

  console.log("[safeMessage] Message signed successfully", signedMessage);

  // Get the signature from the signed message
  // The signatures are stored in a Map, get the first one (the user's signature)
  const signatures = signedMessage.signatures;
  const signatureArray = Array.from(signatures.values());

  if (signatureArray.length === 0) {
    throw new Error("No signature found after signing");
  }

  const signature = signatureArray[0].data;
  console.log("[safeMessage] Signature:", signature);

  return signature;
}

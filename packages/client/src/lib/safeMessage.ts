/**
 * Safe message signing utilities
 * Uses the Safe Protocol Kit to sign messages for Safe off-chain message signing
 */

import Safe, { SigningMethod } from "@safe-global/protocol-kit";

// EIP-1193 provider interface
interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

/**
 * Sign a message for a Safe using the Safe Protocol Kit
 *
 * This uses Safe's official signMessage method which handles all the
 * EIP-712 signing correctly. The message should be a raw string - the
 * Safe Protocol Kit will hash it internally.
 *
 * @param safeAddress - The Safe address
 * @param message - The raw message string (NOT pre-hashed)
 * @returns The signature
 */
export async function signSafeMessage(
  safeAddress: string,
  message: string
): Promise<string> {
  console.log("[safeMessage] Initializing Protocol Kit with signer...");
  console.log("[safeMessage] Safe address:", safeAddress);
  console.log("[safeMessage] Message:", message);

  // Use window.ethereum as the provider
  const provider = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;

  if (!provider) {
    throw new Error("No wallet provider found. Please install a wallet like MetaMask.");
  }

  // Initialize Protocol Kit with the user's wallet as signer
  const protocolKit = await Safe.init({
    provider: provider,
    safeAddress: safeAddress,
  });

  // Create the Safe message
  const safeMessage = protocolKit.createMessage(message);
  console.log("[safeMessage] Created Safe message");

  // Sign the message using ETH_SIGN_TYPED_DATA_V4
  // This is the recommended method for off-chain message signing
  const signedMessage = await protocolKit.signMessage(
    safeMessage,
    SigningMethod.ETH_SIGN_TYPED_DATA_V4
  );

  console.log("[safeMessage] Message signed successfully");

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

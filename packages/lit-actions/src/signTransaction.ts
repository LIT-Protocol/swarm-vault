/**
 * Lit Action for signing UserOperations with a swarm's PKP
 *
 * This action is called by the backend to sign UserOperation hashes
 * for each member's agent wallet in a swarm transaction.
 *
 * Input parameters (passed via jsParams):
 * - userOpHashes: Array of hex strings representing UserOperation hashes to sign
 * - publicKey: The PKP public key (compressed, hex string)
 *
 * Returns via LitActions.setResponse:
 * - signatures: Array of signature objects with r, s, v values
 */

// Lit Action global declarations for Naga SDK
declare const LitActions: {
  signAndCombineEcdsa: (params: {
    toSign: Uint8Array;
    publicKey: string;
    sigName: string;
  }) => Promise<string>;
  setResponse: (params: { response: string }) => void;
};

// jsParams object containing all input parameters
declare const jsParams: {
  userOpHashes: string[];
  publicKey: string;
};

/**
 * Convert a hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Main Lit Action execution
 */
(async () => {
  // Access parameters via jsParams
  const { userOpHashes, publicKey } = jsParams;

  // Validate inputs
  if (!userOpHashes || !Array.isArray(userOpHashes)) {
    LitActions.setResponse({
      response: JSON.stringify({
        success: false,
        error: "userOpHashes must be an array of hex strings",
      }),
    });
    return;
  }

  if (!publicKey || typeof publicKey !== "string") {
    LitActions.setResponse({
      response: JSON.stringify({
        success: false,
        error: "publicKey is required",
      }),
    });
    return;
  }

  const signatures: Array<{
    index: number;
    sigName: string;
    signature: string;
  }> = [];

  try {
    // Sign each UserOperation hash
    for (let i = 0; i < userOpHashes.length; i++) {
      const hash = userOpHashes[i];

      // Convert hex hash to bytes
      const hashBytes = hexToBytes(hash);

      // Validate hash length (should be 32 bytes for keccak256)
      if (hashBytes.length !== 32) {
        throw new Error(
          `Invalid hash length at index ${i}: expected 32 bytes, got ${hashBytes.length}`
        );
      }

      // Create unique signature name for this operation
      const sigName = `sig_${i}`;

      // Sign the hash with the PKP using signAndCombineEcdsa
      // This combines signature shares within the Lit Action
      const signature = await LitActions.signAndCombineEcdsa({
        toSign: hashBytes,
        publicKey,
        sigName,
      });

      signatures.push({
        index: i,
        sigName,
        signature,
      });
    }

    // Return success response with combined signatures
    LitActions.setResponse({
      response: JSON.stringify({
        success: true,
        signedCount: signatures.length,
        signatures: signatures.map((s) => ({
          sigName: s.sigName,
          signature: s.signature,
        })),
      }),
    });
  } catch (error) {
    LitActions.setResponse({
      response: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    });
  }
})();

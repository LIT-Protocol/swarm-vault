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
 * Returns via Lit.Actions.setResponse:
 * - signatures: Array of { r, s, v } signature objects
 */

// Lit Action global declarations
declare const Lit: {
  Actions: {
    signEcdsa: (params: {
      toSign: Uint8Array;
      publicKey: string;
      sigName: string;
    }) => Promise<void>;
    setResponse: (params: { response: string }) => void;
  };
};

// Input parameters injected by the backend
declare const userOpHashes: string[];
declare const publicKey: string;

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
  // Validate inputs
  if (!userOpHashes || !Array.isArray(userOpHashes)) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: "userOpHashes must be an array of hex strings",
      }),
    });
    return;
  }

  if (!publicKey || typeof publicKey !== "string") {
    Lit.Actions.setResponse({
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

      // Sign the hash with the PKP
      await Lit.Actions.signEcdsa({
        toSign: hashBytes,
        publicKey,
        sigName,
      });

      signatures.push({
        index: i,
        sigName,
      });
    }

    // Return success response
    // Note: The actual signature values are accessible via the sigName
    // in the executeJs response.signatures object
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: true,
        signedCount: signatures.length,
        signatures: signatures.map((s) => s.sigName),
      }),
    });
  } catch (error) {
    Lit.Actions.setResponse({
      response: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    });
  }
})();

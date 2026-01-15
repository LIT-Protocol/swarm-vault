/**
 * Lit Action for signing UserOperations with SAFE sign-off verification
 *
 * This action extends the basic signing action to include SAFE signature verification.
 * It ensures that the SAFE has approved the proposal before the PKP signs.
 *
 * Input parameters (passed via jsParams):
 * - userOpHashes: Array of hex strings representing UserOperation hashes to sign
 * - publicKey: The PKP public key (compressed, hex string)
 * - safeAddress: (optional) The SAFE address requiring sign-off
 * - proposalHash: (optional) The proposal message hash that SAFE should have signed
 * - apiUrl: (optional) The swarm-vault API URL for fetching proposal status
 * - proposalId: (optional) The proposal ID to verify
 *
 * If safeAddress is provided, the action will verify SAFE approval before signing.
 *
 * Returns via LitActions.setResponse:
 * - success: boolean
 * - signatures: Array of signature objects
 * - error: string (if failed)
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

// Globals for fetch (available in Lit Actions)
declare const fetch: typeof globalThis.fetch;

// jsParams object containing all input parameters
declare const jsParams: {
  userOpHashes: string[];
  publicKey: string;
  safeAddress?: string;
  proposalHash?: string;
  apiUrl?: string;
  proposalId?: string;
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
 * Verify SAFE has signed the proposal
 * This fetches the proposal status from the API and checks if SAFE has approved
 */
async function verifySafeApproval(params: {
  safeAddress?: string;
  proposalId?: string;
  apiUrl?: string;
}): Promise<{
  verified: boolean;
  error?: string;
}> {
  const { safeAddress, proposalId, apiUrl } = params;

  if (!safeAddress || !proposalId || !apiUrl) {
    // No SAFE verification required
    return { verified: true };
  }

  try {
    // Fetch proposal status from the API
    const response = await fetch(`${apiUrl}/api/proposals/${proposalId}/status`);

    if (!response.ok) {
      return {
        verified: false,
        error: `Failed to fetch proposal status: ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      success: boolean;
      data?: {
        status: string;
        signed: boolean;
      };
      error?: string;
    };

    if (!data.success) {
      return {
        verified: false,
        error: data.error || "Failed to verify proposal",
      };
    }

    // Check if SAFE has signed
    if (!data.data?.signed) {
      return {
        verified: false,
        error: `Proposal not approved by SAFE (status: ${data.data?.status || "unknown"})`,
      };
    }

    return { verified: true };
  } catch (error) {
    return {
      verified: false,
      error: `SAFE verification error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Main Lit Action execution
 */
(async () => {
  // Access parameters via jsParams
  const { userOpHashes, publicKey, safeAddress, proposalId, apiUrl } = jsParams;

  // Validate basic inputs
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

  // If SAFE address is provided, verify SAFE approval before signing
  if (safeAddress) {
    const safeVerification = await verifySafeApproval({
      safeAddress,
      proposalId,
      apiUrl,
    });

    if (!safeVerification.verified) {
      LitActions.setResponse({
        response: JSON.stringify({
          success: false,
          error: safeVerification.error || "SAFE approval required but not verified",
          requiresSafeApproval: true,
        }),
      });
      return;
    }
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
        safeVerified: !!safeAddress,
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

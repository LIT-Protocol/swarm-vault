import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { executeLitAction } from "./lit.js";

// Get the directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the bundled Lit Action
const SIGN_TRANSACTION_ACTION_PATH = join(
  __dirname,
  "../../../../lit-actions/dist/signTransaction.js"
);

// Cache the loaded Lit Action code
let signTransactionCode: string | null = null;

/**
 * Load the bundled Lit Action code for signing transactions
 */
function getSignTransactionCode(): string {
  if (!signTransactionCode) {
    signTransactionCode = readFileSync(SIGN_TRANSACTION_ACTION_PATH, "utf-8");
  }
  return signTransactionCode;
}

/**
 * Sign multiple UserOperation hashes using a PKP
 *
 * @param pkpPublicKey - The PKP public key to sign with
 * @param userOpHashes - Array of UserOperation hashes (hex strings) to sign
 * @returns Object containing signatures indexed by sigName (sig_0, sig_1, etc.)
 */
export async function signUserOperations(
  pkpPublicKey: string,
  userOpHashes: string[]
): Promise<{
  success: boolean;
  signatures: Record<
    string,
    {
      r: string;
      s: string;
      v: number;
      signature: string; // Combined r + s + v hex string
    }
  >;
  error?: string;
}> {
  const litActionCode = getSignTransactionCode();

  try {
    const result = await executeLitAction({
      pkpPublicKey,
      litActionCode,
      jsParams: {
        userOpHashes,
        publicKey: pkpPublicKey,
      },
    });

    // Parse the response from the Lit Action
    const response = JSON.parse(result.response as string);

    if (!response.success) {
      return {
        success: false,
        signatures: {},
        error: response.error,
      };
    }

    // Extract and format signatures
    const signatures: Record<
      string,
      { r: string; s: string; v: number; signature: string }
    > = {};

    for (const sigName of response.signatures) {
      const sig = result.signatures[sigName];
      if (sig) {
        // The signature object from Lit contains r, s, and recid (v)
        const sigData = sig as {
          r: string;
          s: string;
          recid: number;
          signature: string;
        };

        // V value is recid + 27 for Ethereum
        const v = sigData.recid + 27;

        // Combine into full signature
        const r = sigData.r.startsWith("0x") ? sigData.r : `0x${sigData.r}`;
        const s = sigData.s.startsWith("0x") ? sigData.s : `0x${sigData.s}`;
        const fullSig = sigData.signature.startsWith("0x")
          ? sigData.signature
          : `0x${sigData.signature}`;

        signatures[sigName] = {
          r,
          s,
          v,
          signature: fullSig,
        };
      }
    }

    return {
      success: true,
      signatures,
    };
  } catch (error) {
    console.error("[LitActions] Error signing UserOperations:", error);
    return {
      success: false,
      signatures: {},
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Sign a single UserOperation hash
 * Convenience wrapper around signUserOperations
 */
export async function signUserOperation(
  pkpPublicKey: string,
  userOpHash: string
): Promise<{
  success: boolean;
  signature?: { r: string; s: string; v: number; signature: string };
  error?: string;
}> {
  const result = await signUserOperations(pkpPublicKey, [userOpHash]);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  const sig = result.signatures["sig_0"];
  if (!sig) {
    return {
      success: false,
      error: "Signature not found in response",
    };
  }

  return {
    success: true,
    signature: sig,
  };
}

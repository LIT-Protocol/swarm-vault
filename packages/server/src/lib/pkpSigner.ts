import { toAccount } from "viem/accounts";
import {
  type Address,
  type Hex,
  type SignableMessage,
  type TypedData,
  type TypedDataDefinition,
  hashMessage,
  hashTypedData,
  keccak256,
  serializeTransaction,
  type TransactionSerializable,
} from "viem";
import { signUserOperation as signWithLitPKP } from "./litActions.js";

/**
 * Create a custom viem account that uses a Lit PKP for signing.
 * This account can be used as a sessionKeySigner for ZeroDev permission accounts.
 *
 * @param pkpPublicKey - The PKP public key (used for signing via Lit Action)
 * @param pkpEthAddress - The ETH address derived from the PKP public key
 */
export function createPkpViemAccount(
  pkpPublicKey: string,
  pkpEthAddress: Address
) {
  return toAccount({
    address: pkpEthAddress,

    /**
     * Sign a message using the PKP
     */
    async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
      // Hash the message according to EIP-191
      const messageHash = hashMessage(message);

      console.log(`[PKP Signer] Signing message hash: ${messageHash}`);

      const result = await signWithLitPKP(pkpPublicKey, messageHash);

      if (!result.success || !result.signature) {
        throw new Error(
          `PKP signMessage failed: ${result.error || "Unknown error"}`
        );
      }

      return result.signature.signature as Hex;
    },

    /**
     * Sign a transaction using the PKP
     */
    async signTransaction(
      transaction: TransactionSerializable
    ): Promise<Hex> {
      // Serialize the transaction and hash it
      const serialized = serializeTransaction(transaction);
      const txHash = keccak256(serialized);

      console.log(`[PKP Signer] Signing transaction hash: ${txHash}`);

      const result = await signWithLitPKP(pkpPublicKey, txHash);

      if (!result.success || !result.signature) {
        throw new Error(
          `PKP signTransaction failed: ${result.error || "Unknown error"}`
        );
      }

      // For transactions, we need to return the serialized signed transaction
      // The signature from Lit is in the format r + s + v
      const sig = result.signature;
      const v = BigInt(sig.v);
      const r = sig.r as Hex;
      const s = sig.s as Hex;

      // Re-serialize with the signature
      return serializeTransaction(transaction, { r, s, v }) as Hex;
    },

    /**
     * Sign typed data (EIP-712) using the PKP
     */
    async signTypedData<
      const typedData extends TypedData | Record<string, unknown>,
      primaryType extends keyof typedData | "EIP712Domain" = keyof typedData
    >(
      typedDataDef: TypedDataDefinition<typedData, primaryType>
    ): Promise<Hex> {
      // Hash the typed data according to EIP-712
      const typedDataHash = hashTypedData(typedDataDef);

      console.log(`[PKP Signer] Signing typed data hash: ${typedDataHash}`);

      const result = await signWithLitPKP(pkpPublicKey, typedDataHash);

      if (!result.success || !result.signature) {
        throw new Error(
          `PKP signTypedData failed: ${result.error || "Unknown error"}`
        );
      }

      return result.signature.signature as Hex;
    },
  });
}

/**
 * Type for the PKP Viem Account
 */
export type PkpViemAccount = ReturnType<typeof createPkpViemAccount>;

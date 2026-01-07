/**
 * Lit Action for signing transactions with the swarm's PKP
 *
 * This action will be called by the backend to sign UserOperations
 * for each member's agent wallet.
 *
 * Input parameters (passed via jsParams):
 * - transactions: Array of { walletAddress, callData, value }
 * - publicKey: The PKP public key
 *
 * Returns:
 * - signatures: Array of signed transactions
 */

declare const Lit: {
  Actions: {
    signEcdsa: (params: {
      toSign: Uint8Array;
      publicKey: string;
      sigName: string;
    }) => Promise<void>;
  };
};

declare const publicKey: string;
declare const transactions: Array<{
  walletAddress: string;
  callData: string;
  value: string;
}>;

(async () => {
  const signatures: string[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    // Create the hash to sign (this will be the UserOperation hash)
    const messageHash = new Uint8Array(32);

    // Sign with the PKP
    await Lit.Actions.signEcdsa({
      toSign: messageHash,
      publicKey,
      sigName: `sig_${i}`,
    });
  }

  // Return the signatures
  // In a real implementation, we'd return the actual signature values
  console.log("Signed", transactions.length, "transactions");
})();

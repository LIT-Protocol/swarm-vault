import { createLitClient, type LitClient } from "@lit-protocol/lit-client";
import { createAuthManager, storagePlugins } from "@lit-protocol/auth";
import { nagaDev, nagaTest, naga } from "@lit-protocol/networks";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { env } from "./env.js";

// Get the network configuration based on environment
function getLitNetwork() {
  const network = env.LIT_NETWORK;
  if (network === "naga-dev") return nagaDev;
  if (network === "naga-test") return nagaTest;
  if (network === "naga") return naga;
  // Default to naga-dev for development
  return nagaDev;
}

// Singleton instances
let litClient: LitClient | null = null;
let authManager: ReturnType<typeof createAuthManager> | null = null;

/**
 * Get or create the Lit Client singleton
 */
export async function getLitClient(): Promise<LitClient> {
  if (litClient) {
    return litClient;
  }

  const network = getLitNetwork();
  console.log(`[Lit] Connecting to Lit Network: ${env.LIT_NETWORK}`);

  litClient = await createLitClient({
    network,
  });

  console.log("[Lit] Connected to Lit Network");

  return litClient;
}

/**
 * Get or create the Auth Manager singleton
 */
function getAuthManager() {
  if (authManager) {
    return authManager;
  }

  authManager = createAuthManager({
    storage: storagePlugins.localStorageNode({
      appName: "swarm-vault",
      networkName: env.LIT_NETWORK,
      storagePath: "./.lit-auth-storage",
    }),
  });

  return authManager;
}

/**
 * Get the subsidizing wallet account from environment
 */
function getSubsidizingAccount() {
  if (!env.LIT_PRIVATE_KEY) {
    throw new Error("LIT_PRIVATE_KEY is required for PKP operations");
  }
  return privateKeyToAccount(env.LIT_PRIVATE_KEY as Hex);
}

/**
 * Get an EOA auth context using the subsidizing wallet
 * Used for PKP minting and Lit Action execution
 */
export async function getEoaAuthContext() {
  const client = await getLitClient();
  const manager = getAuthManager();
  const account = getSubsidizingAccount();

  console.log(`[Lit] Creating EOA auth context for: ${account.address}`);

  const authContext = await manager.createEoaAuthContext({
    config: { account },
    authConfig: {
      resources: [
        ["pkp-signing", "*"],
        ["lit-action-execution", "*"],
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 60).toISOString(), // 1 hour
    },
    litClient: client,
  });

  return authContext;
}

/**
 * Mint a new PKP for a swarm
 * Returns the PKP public key, token ID, and ETH address
 */
export async function mintPKP(): Promise<{
  publicKey: string;
  tokenId: string;
  ethAddress: string;
}> {
  const client = await getLitClient();
  const account = getSubsidizingAccount();

  console.log("[Lit] Minting new PKP...");

  // Mint a new PKP using the litClient with EOA
  const mintResult = await client.mintWithEoa({
    account,
  });

  console.log(`[Lit] PKP minted successfully`);
  console.log(`[Lit] Token ID: ${mintResult.data.tokenId}`);
  console.log(`[Lit] Public Key: ${mintResult.data.publicKey}`);
  console.log(`[Lit] ETH Address: ${mintResult.data.ethAddress}`);

  return {
    publicKey: mintResult.data.publicKey,
    tokenId: mintResult.data.tokenId,
    ethAddress: mintResult.data.ethAddress,
  };
}

/**
 * Execute a Lit Action with PKP signing
 */
export async function executeLitAction(params: {
  pkpPublicKey: string;
  litActionCode?: string;
  ipfsId?: string;
  jsParams: Record<string, unknown>;
}): Promise<{ signatures: Record<string, unknown>; response: unknown }> {
  const client = await getLitClient();
  const authContext = await getEoaAuthContext();

  console.log("[Lit] Executing Lit Action...");

  const result = await client.executeJs({
    code: params.litActionCode,
    ipfsId: params.ipfsId,
    authContext,
    jsParams: params.jsParams,
  });

  console.log("[Lit] Lit Action executed successfully");

  return {
    signatures: result.signatures,
    response: result.response,
  };
}

/**
 * Get a PKP Viem account for signing transactions
 * This allows the PKP to be used as a viem account for signing
 */
export async function getPkpViemAccount(params: {
  pkpPublicKey: string;
  chainConfig: Parameters<LitClient["getPkpViemAccount"]>[0]["chainConfig"];
}) {
  const client = await getLitClient();
  const manager = getAuthManager();
  const account = getSubsidizingAccount();

  // Create a PKP auth context
  // First, get auth data from the EOA
  const { ViemAccountAuthenticator } = await import("@lit-protocol/auth");
  const authData = await ViemAccountAuthenticator.authenticate(account);

  const pkpAuthContext = await manager.createPkpAuthContext({
    authData,
    pkpPublicKey: params.pkpPublicKey as `0x${string}`,
    authConfig: {
      resources: [
        ["pkp-signing", "*"],
        ["lit-action-execution", "*"],
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 60).toISOString(), // 1 hour
    },
    litClient: client,
  });

  // Get the PKP viem account
  const pkpViemAccount = await client.getPkpViemAccount({
    pkpPublicKey: params.pkpPublicKey as `0x${string}`,
    authContext: pkpAuthContext,
    chainConfig: params.chainConfig,
  });

  return pkpViemAccount;
}

/**
 * Check if Lit client is connected
 */
export function isLitConnected(): boolean {
  return litClient !== null;
}

/**
 * Disconnect from Lit Network (for cleanup)
 * Note: The new SDK may not have explicit disconnect, but we clear our singletons
 */
export async function disconnectLit(): Promise<void> {
  litClient = null;
  authManager = null;
  console.log("[Lit] Cleared Lit client instances");
}

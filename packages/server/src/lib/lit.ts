import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LIT_NETWORK, type LIT_NETWORK_VALUES } from "@lit-protocol/constants";
import {
  LitAbility,
  LitActionResource,
  LitPKPResource,
  createSiweMessage,
  generateAuthSig,
} from "@lit-protocol/auth-helpers";
// Use ethers v5 packages for Lit SDK compatibility (Lit SDK uses ethers v5)
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import { env } from "./env.js";

// Lit Chronicle Yellowstone RPC URL
const LIT_RPC_URL = "https://yellowstone-rpc.litprotocol.com";

// Get the Lit network from environment
const getLitNetwork = (): LIT_NETWORK_VALUES => {
  const network = env.LIT_NETWORK;
  if (network === "datil-dev") return LIT_NETWORK.DatilDev;
  if (network === "datil-test") return LIT_NETWORK.DatilTest;
  if (network === "datil") return LIT_NETWORK.Datil;
  // Default to datil-dev for development
  return LIT_NETWORK.DatilDev;
};

// Singleton instances
let litNodeClient: LitNodeClient | null = null;
let litContracts: LitContracts | null = null;

/**
 * Get or create the Lit Node Client singleton
 */
export async function getLitNodeClient(): Promise<LitNodeClient> {
  if (litNodeClient && litNodeClient.ready) {
    return litNodeClient;
  }

  const network = getLitNetwork();
  console.log(`[Lit] Connecting to Lit Network: ${network}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  litNodeClient = new LitNodeClient({
    litNetwork: network as any,
    debug: env.NODE_ENV === "development",
  });

  await litNodeClient.connect();
  console.log("[Lit] Connected to Lit Network");

  return litNodeClient;
}

/**
 * Get the subsidizing wallet from environment, connected to Lit network
 */
function getSubsidizingWallet(): Wallet {
  if (!env.LIT_PRIVATE_KEY) {
    throw new Error("LIT_PRIVATE_KEY is required for PKP operations");
  }
  // Create provider for Lit Chronicle Yellowstone network (using ethers v5)
  const provider = new JsonRpcProvider(LIT_RPC_URL);
  // Connect wallet to provider
  return new Wallet(env.LIT_PRIVATE_KEY, provider);
}

/**
 * Get or create the Lit Contracts SDK singleton
 * Used for PKP minting and management
 */
export async function getLitContracts(): Promise<LitContracts> {
  if (litContracts) {
    return litContracts;
  }

  const network = getLitNetwork();
  const wallet = getSubsidizingWallet();

  console.log(`[Lit] Initializing Lit Contracts for network: ${network}`);
  console.log(`[Lit] Using subsidizing wallet: ${wallet.address}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  litContracts = new LitContracts({
    signer: wallet,
    network: network as any,
    debug: env.NODE_ENV === "development",
  });

  await litContracts.connect();
  console.log("[Lit] Lit Contracts SDK connected");

  return litContracts;
}

// Type for session signatures map
type SessionSigsMap = Record<
  string,
  { sig: string; derivedVia: string; signedMessage: string; address: string }
>;

/**
 * Generate session signatures for PKP operations
 * Uses the subsidizing wallet to create auth signatures
 */
export async function getSessionSigs(): Promise<SessionSigsMap> {
  const client = await getLitNodeClient();
  const wallet = getSubsidizingWallet();

  // Get session signatures
  const sessionSigs = await client.getSessionSigs({
    chain: "ethereum",
    expiration: new Date(Date.now() + 1000 * 60 * 60).toISOString(), // 1 hour
    resourceAbilityRequests: [
      {
        resource: new LitPKPResource("*"),
        ability: LitAbility.PKPSigning,
      },
      {
        resource: new LitActionResource("*"),
        ability: LitAbility.LitActionExecution,
      },
    ],
    authNeededCallback: async ({
      uri,
      expiration,
      resourceAbilityRequests,
    }) => {
      // Generate SIWE auth sig
      const siweMessage = await createSiweMessage({
        uri,
        walletAddress: wallet.address,
        nonce: await client.getLatestBlockhash(),
        expiration: expiration,
        resources: resourceAbilityRequests,
        litNodeClient: client,
      });

      const authSig = await generateAuthSig({
        signer: wallet,
        toSign: siweMessage,
      });

      return authSig;
    },
  });

  return sessionSigs as SessionSigsMap;
}

/**
 * Mint a new PKP for a swarm
 * Returns the PKP public key and token ID
 */
export async function mintPKP(): Promise<{
  publicKey: string;
  tokenId: string;
  ethAddress: string;
}> {
  const contracts = await getLitContracts();

  console.log("[Lit] Minting new PKP...");

  // Mint a new PKP using the contracts SDK
  const mintInfo = await contracts.pkpNftContractUtils.write.mint();

  console.log(`[Lit] PKP minted successfully`);
  console.log(`[Lit] Token ID: ${mintInfo.pkp.tokenId}`);
  console.log(`[Lit] Public Key: ${mintInfo.pkp.publicKey}`);
  console.log(`[Lit] ETH Address: ${mintInfo.pkp.ethAddress}`);

  return {
    publicKey: mintInfo.pkp.publicKey,
    tokenId: mintInfo.pkp.tokenId,
    ethAddress: mintInfo.pkp.ethAddress,
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
  const client = await getLitNodeClient();
  const sessionSigs = await getSessionSigs();

  console.log("[Lit] Executing Lit Action...");

  const result = await client.executeJs({
    sessionSigs,
    code: params.litActionCode,
    ipfsId: params.ipfsId,
    jsParams: params.jsParams,
  });

  console.log("[Lit] Lit Action executed successfully");

  return {
    signatures: result.signatures,
    response: result.response,
  };
}

/**
 * Disconnect from Lit Network (for cleanup)
 */
export async function disconnectLit(): Promise<void> {
  if (litNodeClient) {
    await litNodeClient.disconnect();
    litNodeClient = null;
    console.log("[Lit] Disconnected from Lit Network");
  }
  litContracts = null;
}

/**
 * Check if Lit client is connected
 */
export function isLitConnected(): boolean {
  return litNodeClient?.ready ?? false;
}

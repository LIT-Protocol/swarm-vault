import { type Address, createPublicClient, http, parseAbi } from "viem";
import { baseSepolia, base } from "viem/chains";
import { env } from "./env.js";

// ERC20 ABI for balanceOf
const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

// Balance cache with TTL (30 seconds)
const CACHE_TTL_MS = 30_000;

interface TokenBalanceInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  balance: string;
}

interface CachedBalance {
  ethBalance: string;
  tokens: TokenBalanceInfo[];
  fetchedAt: number;
}

// Token metadata cache (permanent, tokens don't change)
interface TokenMetadata {
  symbol: string;
  name: string;
  decimals: number;
  logo?: string;
}
const tokenMetadataCache = new Map<string, TokenMetadata>();

const balanceCache = new Map<string, CachedBalance>();

/**
 * Get the chain configuration based on chain ID
 */
function getChain() {
  return env.CHAIN_ID === 8453 ? base : baseSepolia;
}

/**
 * Get the Alchemy RPC URL for the current chain
 */
function getAlchemyRpcUrl(): string {
  if (!env.ALCHEMY_API_KEY) {
    // Fallback to public RPC if no Alchemy key
    return env.CHAIN_ID === 8453
      ? "https://mainnet.base.org"
      : "https://sepolia.base.org";
  }

  const network = env.CHAIN_ID === 8453 ? "base-mainnet" : "base-sepolia";
  return `https://${network}.g.alchemy.com/v2/${env.ALCHEMY_API_KEY}`;
}

// Cached public client for balance fetching
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let balanceClient: any = null;

function getBalanceClient() {
  if (!balanceClient) {
    balanceClient = createPublicClient({
      chain: getChain(),
      transport: http(getAlchemyRpcUrl()),
    });
  }
  return balanceClient;
}

/**
 * Fetch ETH balance for an address
 */
export async function getEthBalance(address: Address): Promise<bigint> {
  const client = getBalanceClient();
  return await client.getBalance({ address });
}

/**
 * Fetch ERC20 token balance for an address
 */
export async function getTokenBalance(
  address: Address,
  tokenAddress: Address
): Promise<bigint> {
  const client = getBalanceClient();

  try {
    const balance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    return balance;
  } catch (error) {
    console.error(
      `[Alchemy] Failed to fetch balance for token ${tokenAddress}:`,
      error
    );
    return 0n;
  }
}

/**
 * Fetch multiple token balances in parallel
 */
export async function getTokenBalances(
  address: Address,
  tokenAddresses: Address[]
): Promise<Map<Address, bigint>> {
  const balances = new Map<Address, bigint>();

  if (tokenAddresses.length === 0) {
    return balances;
  }

  const results = await Promise.allSettled(
    tokenAddresses.map((token) => getTokenBalance(address, token))
  );

  for (let i = 0; i < tokenAddresses.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      balances.set(tokenAddresses[i], result.value);
    } else {
      balances.set(tokenAddresses[i], 0n);
    }
  }

  return balances;
}

/**
 * Get current block timestamp
 */
export async function getBlockTimestamp(): Promise<bigint> {
  const client = getBalanceClient();
  const block = await client.getBlock();
  return block.timestamp;
}

/**
 * Fetch all context data needed for template resolution
 */
export async function getWalletContext(
  walletAddress: Address,
  tokenAddresses: Address[]
): Promise<{
  walletAddress: Address;
  ethBalance: bigint;
  tokenBalances: Map<Address, bigint>;
  blockTimestamp: bigint;
}> {
  const [ethBalance, tokenBalances, blockTimestamp] = await Promise.all([
    getEthBalance(walletAddress),
    getTokenBalances(walletAddress, tokenAddresses),
    getBlockTimestamp(),
  ]);

  return {
    walletAddress,
    ethBalance,
    tokenBalances,
    blockTimestamp,
  };
}

/**
 * Alchemy API response types
 */
interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string | null;
  error?: string;
}

interface AlchemyTokenBalancesResponse {
  jsonrpc: string;
  id: number;
  result: {
    address: string;
    tokenBalances: AlchemyTokenBalance[];
    pageKey?: string;
  };
}

interface AlchemyTokenMetadataResponse {
  jsonrpc: string;
  id: number;
  result: {
    decimals: number;
    logo: string | null;
    name: string;
    symbol: string;
  };
}

/**
 * Fetch all ERC-20 token balances using Alchemy's alchemy_getTokenBalances
 */
async function fetchAllTokenBalances(
  walletAddress: Address
): Promise<AlchemyTokenBalance[]> {
  if (!env.ALCHEMY_API_KEY) {
    console.warn("[Alchemy] No API key configured, cannot fetch token balances");
    return [];
  }

  const rpcUrl = getAlchemyRpcUrl();

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getTokenBalances",
        params: [walletAddress, "erc20"],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as AlchemyTokenBalancesResponse;

    if (!data.result?.tokenBalances) {
      return [];
    }

    // Filter out tokens with zero balance or errors
    return data.result.tokenBalances.filter(
      (t) => t.tokenBalance && t.tokenBalance !== "0x0" && !t.error
    );
  } catch (error) {
    console.error("[Alchemy] Failed to fetch token balances:", error);
    return [];
  }
}

/**
 * Fetch token metadata using Alchemy's alchemy_getTokenMetadata
 */
async function fetchTokenMetadata(
  tokenAddress: string
): Promise<TokenMetadata | null> {
  // Check cache first
  const cached = tokenMetadataCache.get(tokenAddress.toLowerCase());
  if (cached) {
    return cached;
  }

  if (!env.ALCHEMY_API_KEY) {
    return null;
  }

  const rpcUrl = getAlchemyRpcUrl();

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getTokenMetadata",
        params: [tokenAddress],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as AlchemyTokenMetadataResponse;

    if (!data.result) {
      return null;
    }

    const metadata: TokenMetadata = {
      symbol: data.result.symbol || "???",
      name: data.result.name || "Unknown Token",
      decimals: data.result.decimals ?? 18,
      logo: data.result.logo || undefined,
    };

    // Cache the metadata
    tokenMetadataCache.set(tokenAddress.toLowerCase(), metadata);

    return metadata;
  } catch (error) {
    console.error(
      `[Alchemy] Failed to fetch metadata for token ${tokenAddress}:`,
      error
    );
    return null;
  }
}

/**
 * Get cached wallet balances for display (ETH + all ERC-20 tokens)
 * Uses Alchemy's alchemy_getTokenBalances to discover all tokens
 * Uses in-memory cache with 30s TTL
 */
export async function getWalletBalancesForDisplay(
  walletAddress: Address,
  forceRefresh = false
): Promise<CachedBalance> {
  const cacheKey = walletAddress.toLowerCase();
  const now = Date.now();

  // Check cache
  if (!forceRefresh) {
    const cached = balanceCache.get(cacheKey);
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      return cached;
    }
  }

  // Fetch ETH balance and all token balances in parallel
  const [ethBalance, tokenBalances] = await Promise.all([
    getEthBalance(walletAddress),
    fetchAllTokenBalances(walletAddress),
  ]);

  // Fetch metadata for each token with a non-zero balance
  const tokensWithMetadata: TokenBalanceInfo[] = [];

  if (tokenBalances.length > 0) {
    // Fetch metadata in parallel (limit concurrency to avoid rate limits)
    const metadataPromises = tokenBalances.map(async (token) => {
      const metadata = await fetchTokenMetadata(token.contractAddress);
      if (metadata && token.tokenBalance) {
        return {
          address: token.contractAddress,
          symbol: metadata.symbol,
          name: metadata.name,
          decimals: metadata.decimals,
          logoUrl: metadata.logo,
          balance: BigInt(token.tokenBalance).toString(),
        };
      }
      return null;
    });

    const results = await Promise.all(metadataPromises);
    for (const result of results) {
      if (result) {
        tokensWithMetadata.push(result);
      }
    }
  }

  // Sort tokens by symbol for consistent display
  tokensWithMetadata.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const result: CachedBalance = {
    ethBalance: ethBalance.toString(),
    tokens: tokensWithMetadata,
    fetchedAt: now,
  };

  // Cache the result
  balanceCache.set(cacheKey, result);

  return result;
}

/**
 * Clear cached balance for an address
 */
export function clearBalanceCache(walletAddress: Address): void {
  balanceCache.delete(walletAddress.toLowerCase());
}

/**
 * Get current chain ID
 */
export function getCurrentChainId(): number {
  return env.CHAIN_ID;
}

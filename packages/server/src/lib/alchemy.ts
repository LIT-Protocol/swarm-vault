import { type Address, createPublicClient, http, parseAbi } from "viem";
import { baseSepolia, base } from "viem/chains";
import { env } from "./env.js";

// ERC20 ABI for balanceOf
const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

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

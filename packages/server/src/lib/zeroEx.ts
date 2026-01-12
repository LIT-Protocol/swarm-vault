import { type Address } from "viem";
import { env } from "./env.js";

// 0x API base URL (unified for all chains in v2)
const ZEROX_API_BASE = "https://api.0x.org";

// Fee configuration
export interface FeeConfig {
  recipientAddress: Address;
  bps: number; // Basis points (e.g., 50 = 0.5%)
}

/**
 * Get the current fee configuration from environment
 * Returns null if no fee recipient is configured
 */
export function getFeeConfig(): FeeConfig | null {
  if (!env.SWAP_FEE_RECIPIENT) {
    return null;
  }
  return {
    recipientAddress: env.SWAP_FEE_RECIPIENT as Address,
    bps: env.SWAP_FEE_BPS,
  };
}

// Permit2 contract address (same across all chains)
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;

// 0x Exchange Proxy (Swap Router) on Base
export const ZEROX_EXCHANGE_PROXY: Record<number, Address> = {
  8453: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // Base Mainnet
  84532: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", // Base Sepolia (if supported)
};

// Types for 0x API v2 responses
export interface ZeroExFees {
  integratorFee: {
    amount: string;
    token: string;
    type: string;
  } | null;
  integratorFees: Array<{
    amount: string;
    token: string;
    type: string;
  }> | null;
  zeroExFee: {
    amount: string;
    token: string;
    type: string;
  } | null;
  gasFee: {
    amount: string;
    token: string;
    type: string;
  } | null;
}

export interface ZeroExRoute {
  fills: Array<{
    from: string;
    to: string;
    source: string;
    proportionBps: string;
  }>;
  tokens: Array<{
    address: string;
    symbol: string;
  }>;
}

export interface ZeroExIssues {
  allowance: {
    actual: string;
    spender: string;
  } | null;
  balance: {
    token: string;
    actual: string;
    expected: string;
  } | null;
  simulationIncomplete: boolean;
  invalidSourcesPassed: string[];
}

// v2 Quote response (for execution, includes transaction)
export interface ZeroExQuote {
  allowanceTarget: string;
  blockNumber: string;
  buyAmount: string;
  minBuyAmount: string;
  buyToken: string;
  fees: ZeroExFees;
  gas: string;
  gasPrice: string;
  issues: ZeroExIssues;
  liquidityAvailable: boolean;
  route: ZeroExRoute;
  sellAmount: string;
  sellToken: string;
  tokenMetadata: {
    buyToken: { buyTaxBps: string; sellTaxBps: string; transferTaxBps: string };
    sellToken: { buyTaxBps: string; sellTaxBps: string; transferTaxBps: string };
  };
  totalNetworkFee: string;
  zid: string;
  // Transaction fields (present in quote, not price)
  transaction?: {
    to: string;
    data: string;
    gas: string;
    gasPrice: string;
    value: string;
  };
  permit2?: {
    type: string;
    hash: string;
    eip712: {
      types: Record<string, Array<{ name: string; type: string }>>;
      domain: Record<string, string | number>;
      message: Record<string, unknown>;
      primaryType: string;
    };
  };
}

// v2 Price response (for preview, no transaction)
export interface ZeroExPriceResponse {
  allowanceTarget: string;
  blockNumber: string;
  buyAmount: string;
  minBuyAmount: string;
  buyToken: string;
  fees: ZeroExFees;
  gas: string;
  gasPrice: string;
  issues: ZeroExIssues;
  liquidityAvailable: boolean;
  route: ZeroExRoute;
  sellAmount: string;
  sellToken: string;
  tokenMetadata: {
    buyToken: { buyTaxBps: string; sellTaxBps: string; transferTaxBps: string };
    sellToken: { buyTaxBps: string; sellTaxBps: string; transferTaxBps: string };
  };
  totalNetworkFee: string;
  zid: string;
}

export interface SwapQuoteParams {
  sellToken: Address;
  buyToken: Address;
  sellAmount: string; // Amount in wei
  takerAddress: Address; // The smart wallet address
  slippagePercentage?: number; // e.g., 0.01 for 1%
}

export interface SwapPreviewResult {
  walletAddress: Address;
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  buyAmount: string;
  estimatedPriceImpact: string;
  sources: Array<{ name: string; proportion: string }>;
  gasEstimate: string;
  feeAmount?: string; // Fee amount in buy token (if fees enabled)
  error?: string;
}

export interface SwapExecuteData {
  walletAddress: Address;
  sellToken: Address;
  buyToken: Address;
  sellAmount: string;
  buyAmount: string;
  transaction: {
    to: Address;
    data: string;
    value: string;
  };
  permit2Data?: ZeroExQuote["permit2"];
  allowanceTarget: Address;
  feeAmount?: string; // Fee amount in buy token (if fees enabled)
  error?: string;
}

/**
 * Get the 0x API headers with API key (v2 API)
 */
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "0x-version": "v2", // Required for v2 API
  };

  if (env.ZEROX_API_KEY) {
    headers["0x-api-key"] = env.ZEROX_API_KEY;
  }

  return headers;
}

/**
 * Get a price quote (for preview, doesn't include transaction data)
 * Uses v2 API with permit2 endpoint
 */
export async function getPrice(params: SwapQuoteParams): Promise<ZeroExPriceResponse> {
  if (!env.ZEROX_API_KEY) {
    throw new Error("ZEROX_API_KEY is required for swap quotes");
  }

  // v2 API uses 'taker' instead of 'takerAddress'
  const queryParams = new URLSearchParams({
    chainId: env.CHAIN_ID.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.takerAddress,
  });

  // v2 uses slippageBps instead of slippagePercentage (basis points, 100 = 1%)
  if (params.slippagePercentage !== undefined) {
    const slippageBps = Math.round(params.slippagePercentage * 10000);
    queryParams.set("slippageBps", slippageBps.toString());
  }

  // Add fee parameters if configured
  // v2 uses swapFeeBps and swapFeeRecipient
  const feeConfig = getFeeConfig();
  if (feeConfig) {
    queryParams.set("swapFeeBps", feeConfig.bps.toString());
    queryParams.set("swapFeeRecipient", feeConfig.recipientAddress);
  }

  // v2 API endpoint (using allowance-holder for simpler approve+swap flow)
  const url = `${ZEROX_API_BASE}/swap/allowance-holder/price?${queryParams.toString()}`;

  console.log("[0x] Price API request:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[0x] Price API error:", response.status, errorBody);
    throw new Error(`0x API error: ${response.status} - ${errorBody}`);
  }

  return response.json() as Promise<ZeroExPriceResponse>;
}

/**
 * Get a full swap quote (includes transaction data for execution)
 * Uses v2 API with permit2 endpoint
 */
export async function getQuote(params: SwapQuoteParams): Promise<ZeroExQuote> {
  if (!env.ZEROX_API_KEY) {
    throw new Error("ZEROX_API_KEY is required for swap quotes");
  }

  // v2 API uses 'taker' instead of 'takerAddress'
  const queryParams = new URLSearchParams({
    chainId: env.CHAIN_ID.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.takerAddress,
  });

  // v2 uses slippageBps instead of slippagePercentage (basis points, 100 = 1%)
  if (params.slippagePercentage !== undefined) {
    const slippageBps = Math.round(params.slippagePercentage * 10000);
    queryParams.set("slippageBps", slippageBps.toString());
  }

  // Add fee parameters if configured
  // v2 uses swapFeeBps and swapFeeRecipient
  const feeConfig = getFeeConfig();
  if (feeConfig) {
    queryParams.set("swapFeeBps", feeConfig.bps.toString());
    queryParams.set("swapFeeRecipient", feeConfig.recipientAddress);
  }

  // v2 API endpoint (using allowance-holder for simpler approve+swap flow)
  const url = `${ZEROX_API_BASE}/swap/allowance-holder/quote?${queryParams.toString()}`;

  console.log("[0x] Quote API request:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[0x] Quote API error:", response.status, errorBody);
    throw new Error(`0x API error: ${response.status} - ${errorBody}`);
  }

  const quote = await response.json() as ZeroExQuote;
  console.log("[0x] Quote response:", {
    liquidityAvailable: quote.liquidityAvailable,
    allowanceTarget: quote.allowanceTarget,
    sellAmount: quote.sellAmount,
    buyAmount: quote.buyAmount,
    hasTransaction: !!quote.transaction,
    transactionTo: quote.transaction?.to,
  });

  return quote;
}

/**
 * Get swap preview for multiple wallets
 */
export async function getSwapPreviewForWallets(
  walletAddresses: Address[],
  sellToken: Address,
  buyToken: Address,
  getAmount: (walletAddress: Address) => Promise<string>, // Function to get sell amount per wallet
  slippagePercentage: number = 0.01
): Promise<SwapPreviewResult[]> {
  const results: SwapPreviewResult[] = [];

  for (const walletAddress of walletAddresses) {
    try {
      const sellAmount = await getAmount(walletAddress);

      if (sellAmount === "0" || !sellAmount) {
        results.push({
          walletAddress,
          sellToken,
          buyToken,
          sellAmount: "0",
          buyAmount: "0",
          estimatedPriceImpact: "0",
          sources: [],
          gasEstimate: "0",
          error: "No balance to swap",
        });
        continue;
      }

      const price = await getPrice({
        sellToken,
        buyToken,
        sellAmount,
        takerAddress: walletAddress,
        slippagePercentage,
      });

      // Check liquidity availability (v2 API)
      if (!price.liquidityAvailable) {
        results.push({
          walletAddress,
          sellToken,
          buyToken,
          sellAmount,
          buyAmount: "0",
          estimatedPriceImpact: "0",
          sources: [],
          gasEstimate: "0",
          error: "No liquidity available for this swap",
        });
        continue;
      }

      // Calculate fee amount from integrator fee (v2 API)
      let feeAmount: string | undefined;
      if (price.fees?.integratorFee?.amount) {
        feeAmount = price.fees.integratorFee.amount;
      }

      // Convert route.fills to sources format for UI compatibility
      const sources = price.route.fills.map(fill => ({
        name: fill.source,
        proportion: (Number(fill.proportionBps) / 100).toString() + "%",
      }));

      results.push({
        walletAddress,
        sellToken,
        buyToken,
        sellAmount: price.sellAmount,
        buyAmount: price.buyAmount,
        estimatedPriceImpact: "0", // v2 doesn't provide this directly
        sources,
        gasEstimate: price.gas,
        feeAmount,
      });
    } catch (error) {
      console.error(`[0x] Failed to get price for wallet ${walletAddress}:`, error);
      results.push({
        walletAddress,
        sellToken,
        buyToken,
        sellAmount: "0",
        buyAmount: "0",
        estimatedPriceImpact: "0",
        sources: [],
        gasEstimate: "0",
        error: error instanceof Error ? error.message : "Failed to get quote",
      });
    }
  }

  return results;
}

/**
 * Get swap execution data for multiple wallets
 */
export async function getSwapExecuteDataForWallets(
  walletAddresses: Address[],
  sellToken: Address,
  buyToken: Address,
  getAmount: (walletAddress: Address) => Promise<string>,
  slippagePercentage: number = 0.01
): Promise<SwapExecuteData[]> {
  const results: SwapExecuteData[] = [];

  for (const walletAddress of walletAddresses) {
    try {
      const sellAmount = await getAmount(walletAddress);

      if (sellAmount === "0" || !sellAmount) {
        results.push({
          walletAddress,
          sellToken,
          buyToken,
          sellAmount: "0",
          buyAmount: "0",
          transaction: { to: "0x" as Address, data: "0x", value: "0" },
          allowanceTarget: "0x" as Address,
          error: "No balance to swap",
        });
        continue;
      }

      const quote = await getQuote({
        sellToken,
        buyToken,
        sellAmount,
        takerAddress: walletAddress,
        slippagePercentage,
      });

      // Check liquidity availability (v2 API)
      if (!quote.liquidityAvailable) {
        results.push({
          walletAddress,
          sellToken,
          buyToken,
          sellAmount,
          buyAmount: "0",
          transaction: { to: "0x" as Address, data: "0x", value: "0" },
          allowanceTarget: "0x" as Address,
          error: "No liquidity available for this swap",
        });
        continue;
      }

      // Check if transaction data is available
      if (!quote.transaction) {
        results.push({
          walletAddress,
          sellToken,
          buyToken,
          sellAmount,
          buyAmount: "0",
          transaction: { to: "0x" as Address, data: "0x", value: "0" },
          allowanceTarget: "0x" as Address,
          error: "No transaction data returned from 0x API",
        });
        continue;
      }

      // Calculate fee amount from integrator fee (v2 API)
      let feeAmount: string | undefined;
      if (quote.fees?.integratorFee?.amount) {
        feeAmount = quote.fees.integratorFee.amount;
      }

      results.push({
        walletAddress,
        sellToken,
        buyToken,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        transaction: {
          to: quote.transaction.to as Address,
          data: quote.transaction.data,
          value: quote.transaction.value,
        },
        permit2Data: quote.permit2,
        allowanceTarget: quote.allowanceTarget as Address,
        feeAmount,
      });
    } catch (error) {
      console.error(`[0x] Failed to get quote for wallet ${walletAddress}:`, error);
      results.push({
        walletAddress,
        sellToken,
        buyToken,
        sellAmount: "0",
        buyAmount: "0",
        transaction: { to: "0x" as Address, data: "0x", value: "0" },
        allowanceTarget: "0x" as Address,
        error: error instanceof Error ? error.message : "Failed to get quote",
      });
    }
  }

  return results;
}

/**
 * Check if a token needs approval for the 0x allowance target
 */
export function isNativeToken(tokenAddress: Address): boolean {
  return tokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

/**
 * Build an ERC20 approval transaction for the 0x allowance target
 */
export function buildApprovalData(
  tokenAddress: Address,
  spender: Address,
  amount: bigint = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") // Max uint256
): { to: Address; data: string; value: string } {
  // ERC20 approve(address spender, uint256 amount)
  const selector = "0x095ea7b3";
  const spenderPadded = spender.slice(2).padStart(64, "0");
  const amountPadded = amount.toString(16).padStart(64, "0");

  return {
    to: tokenAddress,
    data: `${selector}${spenderPadded}${amountPadded}`,
    value: "0",
  };
}

/**
 * Get current chain ID
 */
export function getChainId(): number {
  return env.CHAIN_ID;
}

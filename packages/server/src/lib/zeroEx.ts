import { type Address } from "viem";
import { env } from "./env.js";
import { bpsToPercentage } from "@swarm-vault/shared";

// 0x API base URL for Base chain
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

// Types for 0x API responses
export interface ZeroExQuote {
  chainId: number;
  price: string;
  grossPrice: string;
  estimatedPriceImpact: string;
  value: string;
  gasPrice: string;
  gas: string;
  estimatedGas: string;
  protocolFee: string;
  minimumProtocolFee: string;
  buyTokenAddress: string;
  buyAmount: string;
  grossBuyAmount: string;
  sellTokenAddress: string;
  sellAmount: string;
  grossSellAmount: string;
  sources: Array<{ name: string; proportion: string }>;
  allowanceTarget: string;
  sellTokenToEthRate: string;
  buyTokenToEthRate: string;
  expectedSlippage: string | null;
  transaction: {
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

export interface ZeroExPriceResponse {
  chainId: number;
  price: string;
  grossPrice: string;
  estimatedPriceImpact: string;
  value: string;
  gasPrice: string;
  estimatedGas: string;
  buyTokenAddress: string;
  buyAmount: string;
  grossBuyAmount: string;
  sellTokenAddress: string;
  sellAmount: string;
  grossSellAmount: string;
  sources: Array<{ name: string; proportion: string }>;
  allowanceTarget: string;
  sellTokenToEthRate: string;
  buyTokenToEthRate: string;
  expectedSlippage: string | null;
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
 * Get the 0x API headers with API key
 */
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (env.ZEROX_API_KEY) {
    headers["0x-api-key"] = env.ZEROX_API_KEY;
  }

  return headers;
}

/**
 * Get a price quote (for preview, doesn't include transaction data)
 */
export async function getPrice(params: SwapQuoteParams): Promise<ZeroExPriceResponse> {
  if (!env.ZEROX_API_KEY) {
    throw new Error("ZEROX_API_KEY is required for swap quotes");
  }

  const queryParams = new URLSearchParams({
    chainId: env.CHAIN_ID.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    takerAddress: params.takerAddress,
  });

  if (params.slippagePercentage !== undefined) {
    queryParams.set("slippagePercentage", params.slippagePercentage.toString());
  }

  // Add fee parameters if configured
  const feeConfig = getFeeConfig();
  if (feeConfig) {
    queryParams.set("buyTokenPercentageFee", bpsToPercentage(feeConfig.bps).toString());
    queryParams.set("feeRecipient", feeConfig.recipientAddress);
  }

  const url = `${ZEROX_API_BASE}/swap/v1/price?${queryParams.toString()}`;

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
 */
export async function getQuote(params: SwapQuoteParams): Promise<ZeroExQuote> {
  if (!env.ZEROX_API_KEY) {
    throw new Error("ZEROX_API_KEY is required for swap quotes");
  }

  const queryParams = new URLSearchParams({
    chainId: env.CHAIN_ID.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    takerAddress: params.takerAddress,
  });

  if (params.slippagePercentage !== undefined) {
    queryParams.set("slippagePercentage", params.slippagePercentage.toString());
  }

  // Add fee parameters if configured
  const feeConfig = getFeeConfig();
  if (feeConfig) {
    queryParams.set("buyTokenPercentageFee", bpsToPercentage(feeConfig.bps).toString());
    queryParams.set("feeRecipient", feeConfig.recipientAddress);
  }

  const url = `${ZEROX_API_BASE}/swap/v1/quote?${queryParams.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[0x] Quote API error:", response.status, errorBody);
    throw new Error(`0x API error: ${response.status} - ${errorBody}`);
  }

  return response.json() as Promise<ZeroExQuote>;
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

      // Calculate fee amount (grossBuyAmount - buyAmount)
      let feeAmount: string | undefined;
      if (price.grossBuyAmount && price.buyAmount) {
        const gross = BigInt(price.grossBuyAmount);
        const net = BigInt(price.buyAmount);
        if (gross > net) {
          feeAmount = (gross - net).toString();
        }
      }

      results.push({
        walletAddress,
        sellToken,
        buyToken,
        sellAmount: price.sellAmount,
        buyAmount: price.buyAmount,
        estimatedPriceImpact: price.estimatedPriceImpact || "0",
        sources: price.sources,
        gasEstimate: price.estimatedGas,
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

      // Calculate fee amount (grossBuyAmount - buyAmount)
      let feeAmount: string | undefined;
      if (quote.grossBuyAmount && quote.buyAmount) {
        const gross = BigInt(quote.grossBuyAmount);
        const net = BigInt(quote.buyAmount);
        if (gross > net) {
          feeAmount = (gross - net).toString();
        }
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

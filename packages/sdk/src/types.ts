/**
 * Swarm Vault SDK Types
 */

// ============================================================================
// Core Types
// ============================================================================

export interface User {
  id: string;
  walletAddress: string;
  twitterId: string | null;
  twitterUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Swarm {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  manager?: {
    id: string;
    walletAddress: string;
    twitterUsername: string | null;
  };
  memberCount?: number;
  isManager?: boolean;
}

export interface SwarmMember {
  id: string;
  swarmId: string;
  userId: string;
  agentWalletAddress: string;
  status: "ACTIVE" | "LEFT";
  joinedAt: string;
  user?: {
    id: string;
    walletAddress: string;
  };
}

// ============================================================================
// Transaction Types
// ============================================================================

export type TransactionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type TransactionTargetStatus = "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED";

export interface Transaction {
  id: string;
  swarmId: string;
  status: TransactionStatus;
  template: TransactionTemplate;
  createdAt: string;
  updatedAt: string;
  targets?: TransactionTarget[];
}

export interface TransactionTarget {
  id: string;
  transactionId: string;
  membershipId: string;
  userOpHash: string | null;
  txHash: string | null;
  status: TransactionTargetStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  membership?: {
    agentWalletAddress: string;
    user?: {
      walletAddress: string;
    };
  };
}

export interface ABITransactionTemplate {
  mode: "abi";
  contractAddress: string;
  abi: unknown[];
  functionName: string;
  args: unknown[];
  value: string;
}

export interface RawTransactionTemplate {
  mode: "raw";
  contractAddress: string;
  data: string;
  value: string;
}

export type TransactionTemplate = ABITransactionTemplate | RawTransactionTemplate;

// ============================================================================
// Swap Types
// ============================================================================

export interface SwapPreviewParams {
  /** Token address to sell (use 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE for native ETH) */
  sellToken: string;
  /** Token address to buy */
  buyToken: string;
  /** Percentage of token balance to sell (1-100, default 100) */
  sellPercentage?: number;
  /** Slippage tolerance percentage (default 1) */
  slippagePercentage?: number;
}

export interface SwapExecuteParams extends SwapPreviewParams {}

export interface SwapMemberPreview {
  membershipId: string;
  userId: string;
  userWalletAddress: string;
  agentWalletAddress: string;
  sellAmount: string;
  buyAmount: string;
  feeAmount?: string;
  estimatedPriceImpact?: number;
  sources?: string[];
  error?: string;
}

export interface SwapFeeInfo {
  bps: number;
  percentage: string;
  recipientAddress: string;
}

export interface SwapPreviewResult {
  sellToken: string;
  buyToken: string;
  sellPercentage: number;
  slippagePercentage: number;
  members: SwapMemberPreview[];
  totalSellAmount: string;
  totalBuyAmount: string;
  totalFeeAmount?: string;
  successCount: number;
  errorCount: number;
  fee: SwapFeeInfo | null;
}

export interface SwapExecuteResult {
  transactionId: string;
  status: "PENDING";
  memberCount: number;
  message: string;
  fee: SwapFeeInfo | null;
}

// ============================================================================
// Holdings Types
// ============================================================================

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

export interface TokenHolding extends TokenInfo {
  totalBalance: string;
  holderCount: number;
}

export interface SwarmHoldings {
  ethBalance: string;
  tokens: TokenHolding[];
  memberCount: number;
  commonTokens: TokenInfo[];
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  details?: unknown;
}

// ============================================================================
// Client Options
// ============================================================================

export interface SwarmVaultClientOptions {
  /** Base URL of the Swarm Vault API (default: https://api.swarmvault.xyz) */
  baseUrl?: string;
  /** API key for authentication (starts with 'svk_') */
  apiKey?: string;
  /** JWT token for authentication (alternative to API key) */
  jwt?: string;
  /** Custom fetch function (for testing or custom implementations) */
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export interface WaitForTransactionOptions {
  /** Maximum time to wait in milliseconds (default: 300000 = 5 minutes) */
  timeoutMs?: number;
  /** Polling interval in milliseconds (default: 3000 = 3 seconds) */
  pollIntervalMs?: number;
  /** Callback called on each poll with current status */
  onPoll?: (transaction: Transaction) => void;
}

// ============================================================================
// Error Types
// ============================================================================

export class SwarmVaultError extends Error {
  public readonly errorCode?: string;
  public readonly statusCode?: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    options?: {
      errorCode?: string;
      statusCode?: number;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = "SwarmVaultError";
    this.errorCode = options?.errorCode;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
  }
}

// ============================================================================
// Common Token Addresses
// ============================================================================

/** Native ETH address used in swap APIs */
export const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/** Common token addresses on Base Mainnet */
export const BASE_MAINNET_TOKENS = {
  ETH: NATIVE_ETH_ADDRESS,
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
  cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
} as const;

/** Common token addresses on Base Sepolia (testnet) */
export const BASE_SEPOLIA_TOKENS = {
  ETH: NATIVE_ETH_ADDRESS,
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;

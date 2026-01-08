// Chain configuration
export const CHAINS = {
  BASE_SEPOLIA: 84532,
  BASE_MAINNET: 8453,
} as const;

export type ChainId = (typeof CHAINS)[keyof typeof CHAINS];

// Lit Protocol configuration
export const LIT_NETWORKS = {
  NAGA_DEV: "naga-dev",
  DATIL_DEV: "datil-dev",
  DATIL_TEST: "datil-test",
} as const;

export type LitNetwork = (typeof LIT_NETWORKS)[keyof typeof LIT_NETWORKS];

// Common contract addresses on Base
export const BASE_CONTRACTS = {
  // Base Sepolia
  84532: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    UNISWAP_ROUTER: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  },
  // Base Mainnet
  8453: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    UNISWAP_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481",
  },
} as const;

// Token metadata for display
export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
}

// Common tokens on Base Sepolia
export const BASE_SEPOLIA_TOKENS: TokenInfo[] = [
  {
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
  },
  {
    address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  },
];

// Common tokens on Base Mainnet
export const BASE_MAINNET_TOKENS: TokenInfo[] = [
  {
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
  },
  {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  },
];

// Get tokens for a chain
export function getTokensForChain(chainId: number): TokenInfo[] {
  if (chainId === 8453) return BASE_MAINNET_TOKENS;
  return BASE_SEPOLIA_TOKENS;
}

// API routes
export const API_ROUTES = {
  AUTH: {
    NONCE: "/api/auth/nonce",
    LOGIN: "/api/auth/login",
    ME: "/api/auth/me",
  },
  SWARMS: {
    LIST: "/api/swarms",
    CREATE: "/api/swarms",
    GET: (id: string) => `/api/swarms/${id}`,
    MEMBERS: (id: string) => `/api/swarms/${id}/members`,
    JOIN: (id: string) => `/api/swarms/${id}/join`,
    TRANSACTIONS: (id: string) => `/api/swarms/${id}/transactions`,
  },
  MEMBERSHIPS: {
    LIST: "/api/memberships",
    GET: (id: string) => `/api/memberships/${id}`,
    BALANCE: (id: string) => `/api/memberships/${id}/balance`,
  },
  TRANSACTIONS: {
    GET: (id: string) => `/api/transactions/${id}`,
  },
} as const;

import { z } from "zod";

// User
export interface User {
  id: string;
  walletAddress: string;
  twitterId: string | null;
  twitterUsername: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Swarm
export interface Swarm {
  id: string;
  name: string;
  description: string;
  litPkpPublicKey: string;
  litPkpTokenId: string;
  // Visibility settings
  isPublic: boolean;
  inviteCode: string | null;
  // SAFE integration
  safeAddress: string | null;
  requireSafeSignoff: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateSwarmSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  isPublic: z.boolean().optional().default(false),
});

export type CreateSwarmInput = z.infer<typeof CreateSwarmSchema>;

export const UpdateSwarmVisibilitySchema = z.object({
  isPublic: z.boolean(),
});

export type UpdateSwarmVisibilityInput = z.infer<typeof UpdateSwarmVisibilitySchema>;

export const JoinSwarmSchema = z.object({
  agentWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  sessionKeyApproval: z.string(),
  inviteCode: z.string().optional(),
});

export type JoinSwarmInput = z.infer<typeof JoinSwarmSchema>;

// Membership
export type MembershipStatus = "ACTIVE" | "LEFT";

export interface SwarmMembership {
  id: string;
  swarmId: string;
  userId: string;
  agentWalletAddress: string;
  status: MembershipStatus;
  joinedAt: Date;
}

// Transaction
export type TransactionStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type TransactionTargetStatus =
  | "PENDING"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED";

export interface Transaction {
  id: string;
  swarmId: string;
  status: TransactionStatus;
  template: TransactionTemplate;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionTarget {
  id: string;
  transactionId: string;
  membershipId: string;
  resolvedTxData: ResolvedTransactionData;
  userOpHash: string | null;
  txHash: string | null;
  status: TransactionTargetStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Transaction Template
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

export interface ResolvedTransactionData {
  to: string;
  data: string;
  value: bigint;
}

// Error Codes
export enum ErrorCode {
  // Authentication errors (1xxx)
  UNAUTHORIZED = "AUTH_001",
  INVALID_TOKEN = "AUTH_002",
  TOKEN_EXPIRED = "AUTH_003",
  INVALID_SIGNATURE = "AUTH_004",
  NONCE_EXPIRED = "AUTH_005",

  // Validation errors (2xxx)
  VALIDATION_ERROR = "VAL_001",
  INVALID_ADDRESS = "VAL_002",
  INVALID_TEMPLATE = "VAL_003",
  INVALID_AMOUNT = "VAL_004",

  // Resource errors (3xxx)
  NOT_FOUND = "RES_001",
  ALREADY_EXISTS = "RES_002",
  SWARM_NOT_FOUND = "RES_003",
  MEMBERSHIP_NOT_FOUND = "RES_004",
  TRANSACTION_NOT_FOUND = "RES_005",
  USER_NOT_FOUND = "RES_006",

  // Permission errors (4xxx)
  FORBIDDEN = "PERM_001",
  NOT_MANAGER = "PERM_002",
  NOT_MEMBER = "PERM_003",
  ALREADY_MEMBER = "PERM_004",
  TWITTER_NOT_LINKED = "PERM_005",
  INVITE_CODE_REQUIRED = "PERM_006",
  INVALID_INVITE_CODE = "PERM_007",

  // External service errors (5xxx)
  LIT_ERROR = "EXT_001",
  ZERODEV_ERROR = "EXT_002",
  ALCHEMY_ERROR = "EXT_003",
  ZEROX_ERROR = "EXT_004",
  BUNDLER_ERROR = "EXT_005",
  TWITTER_ERROR = "EXT_006",
  SAFE_ERROR = "EXT_007",

  // Transaction errors (6xxx)
  TX_FAILED = "TX_001",
  TX_REJECTED = "TX_002",
  INSUFFICIENT_BALANCE = "TX_003",
  NO_ACTIVE_MEMBERS = "TX_004",
  SIGNING_FAILED = "TX_005",

  // Proposal errors (7xxx)
  PROPOSAL_NOT_FOUND = "PROP_001",
  PROPOSAL_NOT_APPROVED = "PROP_002",
  PROPOSAL_EXPIRED = "PROP_003",
  PROPOSAL_ALREADY_EXECUTED = "PROP_004",
  SAFE_SIGNOFF_REQUIRED = "PROP_005",
  SAFE_NOT_CONFIGURED = "PROP_006",

  // Internal errors (9xxx)
  INTERNAL_ERROR = "INT_001",
  DATABASE_ERROR = "INT_002",
  CONFIG_ERROR = "INT_003",
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: ErrorCode;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  errorCode: ErrorCode;
  details?: unknown;
}

// Auth types
export interface AuthResponse {
  token: string;
  user: User;
}

export interface NonceResponse {
  nonce: string;
}

// SAFE Sign-off types
export type ProposedActionStatus =
  | "PROPOSED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "EXPIRED";

export type ProposedActionType = "SWAP" | "TRANSACTION";

export interface ProposedAction {
  id: string;
  swarmId: string;
  managerId: string;
  actionType: ProposedActionType;
  actionData: SwapActionData | TransactionActionData;
  safeMessageHash: string;
  status: ProposedActionStatus;
  proposedAt: Date;
  approvedAt: Date | null;
  executedAt: Date | null;
  expiresAt: Date;
  executionTxId: string | null;
}

export interface SwapActionData {
  type: "swap";
  sellToken: string;
  buyToken: string;
  sellPercentage: number;
  slippagePercentage: number;
}

export interface TransactionActionData {
  type: "transaction";
  template: TransactionTemplate;
}

export const CreateProposalSchema = z.object({
  actionType: z.enum(["SWAP", "TRANSACTION"]),
  actionData: z.union([
    z.object({
      type: z.literal("swap"),
      sellToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      buyToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      sellPercentage: z.number().min(1).max(100),
      slippagePercentage: z.number().min(0).max(50),
    }),
    z.object({
      type: z.literal("transaction"),
      template: z.any(), // Validated separately
    }),
  ]),
  expiresInHours: z.number().min(1).max(168).default(24), // Max 1 week
});

export type CreateProposalInput = z.infer<typeof CreateProposalSchema>;

export const UpdateSwarmSafeSchema = z.object({
  safeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable(),
  requireSafeSignoff: z.boolean(),
});

export type UpdateSwarmSafeInput = z.infer<typeof UpdateSwarmSafeSchema>;

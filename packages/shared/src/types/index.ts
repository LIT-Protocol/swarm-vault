import { z } from "zod";

// User
export interface User {
  id: string;
  walletAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

// Swarm
export interface Swarm {
  id: string;
  name: string;
  description: string;
  socialUrl: string | null;
  litPkpPublicKey: string;
  litPkpTokenId: string;
  createdAt: Date;
  updatedAt: Date;
}

export const CreateSwarmSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  socialUrl: z.string().url().optional(),
});

export type CreateSwarmInput = z.infer<typeof CreateSwarmSchema>;

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

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Auth types
export interface AuthResponse {
  token: string;
  user: User;
}

export interface NonceResponse {
  nonce: string;
}

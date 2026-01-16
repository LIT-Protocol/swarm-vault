import type { ErrorRequestHandler } from "express";
import { ErrorCode } from "@swarm-vault/shared";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

// User-friendly error messages mapped to error codes
const USER_FRIENDLY_MESSAGES: Record<ErrorCode, string> = {
  // Authentication
  [ErrorCode.UNAUTHORIZED]: "Please sign in to continue",
  [ErrorCode.INVALID_TOKEN]: "Your session has expired. Please sign in again",
  [ErrorCode.TOKEN_EXPIRED]: "Your session has expired. Please sign in again",
  [ErrorCode.INVALID_SIGNATURE]: "Signature verification failed. Please try again",
  [ErrorCode.NONCE_EXPIRED]: "Sign-in request expired. Please try again",

  // Validation
  [ErrorCode.VALIDATION_ERROR]: "Please check your input and try again",
  [ErrorCode.INVALID_ADDRESS]: "Invalid wallet address format",
  [ErrorCode.INVALID_TEMPLATE]: "Invalid transaction template",
  [ErrorCode.INVALID_AMOUNT]: "Invalid amount specified",

  // Resources
  [ErrorCode.NOT_FOUND]: "The requested resource was not found",
  [ErrorCode.ALREADY_EXISTS]: "This resource already exists",
  [ErrorCode.SWARM_NOT_FOUND]: "Swarm not found",
  [ErrorCode.MEMBERSHIP_NOT_FOUND]: "Membership not found",
  [ErrorCode.TRANSACTION_NOT_FOUND]: "Transaction not found",
  [ErrorCode.USER_NOT_FOUND]: "User not found",

  // Permissions
  [ErrorCode.FORBIDDEN]: "You don't have permission to perform this action",
  [ErrorCode.NOT_MANAGER]: "Only swarm managers can perform this action",
  [ErrorCode.NOT_MEMBER]: "You must be a member of this swarm",
  [ErrorCode.ALREADY_MEMBER]: "You are already a member of this swarm",
  [ErrorCode.TWITTER_NOT_LINKED]: "Twitter account not linked",

  // External services
  [ErrorCode.LIT_ERROR]: "Key signing service is temporarily unavailable",
  [ErrorCode.ZERODEV_ERROR]: "Wallet service is temporarily unavailable",
  [ErrorCode.ALCHEMY_ERROR]: "Balance service is temporarily unavailable",
  [ErrorCode.ZEROX_ERROR]: "Swap service is temporarily unavailable",
  [ErrorCode.BUNDLER_ERROR]: "Transaction bundler is temporarily unavailable",
  [ErrorCode.TWITTER_ERROR]: "Twitter service is temporarily unavailable",
  [ErrorCode.SAFE_ERROR]: "Safe service is temporarily unavailable",

  // Transactions
  [ErrorCode.TX_FAILED]: "Transaction failed",
  [ErrorCode.TX_REJECTED]: "Transaction was rejected",
  [ErrorCode.INSUFFICIENT_BALANCE]: "Insufficient balance for this transaction",
  [ErrorCode.NO_ACTIVE_MEMBERS]: "No active members in this swarm",
  [ErrorCode.SIGNING_FAILED]: "Failed to sign the transaction",

  // Proposals
  [ErrorCode.PROPOSAL_NOT_FOUND]: "Proposal not found",
  [ErrorCode.PROPOSAL_NOT_APPROVED]: "Proposal has not been approved",
  [ErrorCode.PROPOSAL_EXPIRED]: "Proposal has expired",
  [ErrorCode.PROPOSAL_ALREADY_EXECUTED]: "Proposal has already been executed",
  [ErrorCode.SAFE_SIGNOFF_REQUIRED]: "Safe sign-off is required for this action",
  [ErrorCode.SAFE_NOT_CONFIGURED]: "Safe is not configured for this swarm",

  // Internal
  [ErrorCode.INTERNAL_ERROR]: "An unexpected error occurred. Please try again",
  [ErrorCode.DATABASE_ERROR]: "Database error. Please try again later",
  [ErrorCode.CONFIG_ERROR]: "Server configuration error",
};

export function getUserFriendlyMessage(code: ErrorCode): string {
  return USER_FRIENDLY_MESSAGES[code] || "An unexpected error occurred";
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("Error:", err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: getUserFriendlyMessage(err.code),
      errorCode: err.code,
      details: process.env.NODE_ENV === "development" ? err.details : undefined,
    });
    return;
  }

  // Handle Prisma errors
  if (err.code === "P2002") {
    res.status(409).json({
      success: false,
      error: getUserFriendlyMessage(ErrorCode.ALREADY_EXISTS),
      errorCode: ErrorCode.ALREADY_EXISTS,
    });
    return;
  }

  if (err.code === "P2025") {
    res.status(404).json({
      success: false,
      error: getUserFriendlyMessage(ErrorCode.NOT_FOUND),
      errorCode: ErrorCode.NOT_FOUND,
    });
    return;
  }

  // Handle Zod validation errors
  if (err.name === "ZodError") {
    res.status(400).json({
      success: false,
      error: getUserFriendlyMessage(ErrorCode.VALIDATION_ERROR),
      errorCode: ErrorCode.VALIDATION_ERROR,
      details: process.env.NODE_ENV === "development" ? err.errors : undefined,
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    error: getUserFriendlyMessage(ErrorCode.INTERNAL_ERROR),
    errorCode: ErrorCode.INTERNAL_ERROR,
  });
};

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

// API key prefix for Swarm Vault keys
export const API_KEY_PREFIX = "svk_";

export interface JWTPayload {
  userId: string;
  walletAddress: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Validates an API key and returns the user payload if valid
 */
async function validateApiKey(apiKey: string): Promise<JWTPayload | null> {
  // API key format: svk_<prefix>_<rest>
  // We store the first 8 chars after the prefix as apiKeyPrefix
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  // Extract the prefix portion for lookup (first 8 chars after svk_)
  const keyBody = apiKey.slice(API_KEY_PREFIX.length);
  const prefix = keyBody.slice(0, 8);

  // Find users with matching prefix
  const user = await prisma.user.findFirst({
    where: { apiKeyPrefix: `${API_KEY_PREFIX}${prefix}` },
  });

  if (!user || !user.apiKeyHash) {
    return null;
  }

  // Verify the full API key against the stored hash
  const isValid = await bcrypt.compare(apiKey, user.apiKeyHash);
  if (!isValid) {
    return null;
  }

  return {
    userId: user.id,
    walletAddress: user.walletAddress,
  };
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Missing or invalid authorization header",
    });
    return;
  }

  const token = authHeader.slice(7);

  // Check if this is an API key (starts with svk_)
  if (token.startsWith(API_KEY_PREFIX)) {
    try {
      const payload = await validateApiKey(token);
      if (payload) {
        req.user = payload;
        next();
        return;
      }
    } catch (error) {
      console.error("API key validation error:", error);
    }
    res.status(401).json({
      success: false,
      error: "Invalid API key",
    });
    return;
  }

  // Otherwise, treat as JWT
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
    return;
  }
}

export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  // Check if this is an API key (starts with svk_)
  if (token.startsWith(API_KEY_PREFIX)) {
    try {
      const payload = await validateApiKey(token);
      if (payload) {
        req.user = payload;
      }
    } catch {
      // API key invalid, but that's okay for optional auth
    }
    next();
    return;
  }

  // Otherwise, treat as JWT
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    req.user = payload;
  } catch {
    // Token invalid, but that's okay for optional auth
  }

  next();
}

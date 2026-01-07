import { Router, Request, Response } from "express";
import { SiweMessage, generateNonce } from "siwe";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// In-memory nonce store (in production, use Redis or database)
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

// Clean up expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [address, data] of nonceStore.entries()) {
    if (data.expiresAt < now) {
      nonceStore.delete(address);
    }
  }
}, 60000); // Clean every minute

// POST /api/auth/nonce - Generate nonce for SIWE
router.post("/nonce", (req: Request, res: Response) => {
  const { address } = req.body;

  if (!address || typeof address !== "string") {
    res.status(400).json({
      success: false,
      error: "Address is required",
    });
    return;
  }

  const normalizedAddress = address.toLowerCase();
  const nonce = generateNonce();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  nonceStore.set(normalizedAddress, { nonce, expiresAt });

  res.json({
    success: true,
    data: { nonce },
  });
});

// POST /api/auth/login - Verify SIWE signature and return JWT
router.post("/login", async (req: Request, res: Response) => {
  const { message, signature } = req.body;

  if (!message || !signature) {
    res.status(400).json({
      success: false,
      error: "Message and signature are required",
    });
    return;
  }

  try {
    const siweMessage = new SiweMessage(message);
    const { data: verifiedMessage } = await siweMessage.verify({ signature });

    const normalizedAddress = verifiedMessage.address.toLowerCase();

    // Verify nonce
    const storedData = nonceStore.get(normalizedAddress);
    if (!storedData) {
      res.status(400).json({
        success: false,
        error: "Nonce not found. Please request a new nonce.",
      });
      return;
    }

    if (storedData.expiresAt < Date.now()) {
      nonceStore.delete(normalizedAddress);
      res.status(400).json({
        success: false,
        error: "Nonce expired. Please request a new nonce.",
      });
      return;
    }

    if (storedData.nonce !== verifiedMessage.nonce) {
      res.status(400).json({
        success: false,
        error: "Invalid nonce",
      });
      return;
    }

    // Clear used nonce
    nonceStore.delete(normalizedAddress);

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress: verifiedMessage.address },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { walletAddress: verifiedMessage.address },
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        walletAddress: user.walletAddress,
      },
      env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    console.error("SIWE verification failed:", error);
    res.status(400).json({
      success: false,
      error: "Invalid signature",
    });
  }
});

// GET /api/auth/me - Get current user
router.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        walletAddress: user.walletAddress,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to get user:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user",
    });
  }
});

export const authRouter = router;

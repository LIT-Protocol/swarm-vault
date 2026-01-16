import { Router, Request, Response } from "express";
import { SiweMessage, generateNonce } from "siwe";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// In-memory nonce store (in production, use Redis or database)
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

// In-memory store for Twitter OAuth state and PKCE verifiers
const twitterOAuthStore = new Map<
  string,
  { state: string; codeVerifier: string; userId: string; expiresAt: number }
>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [address, data] of nonceStore.entries()) {
    if (data.expiresAt < now) {
      nonceStore.delete(address);
    }
  }
  for (const [state, data] of twitterOAuthStore.entries()) {
    if (data.expiresAt < now) {
      twitterOAuthStore.delete(state);
    }
  }
}, 60000); // Clean every minute

// Helper function to generate PKCE code verifier and challenge
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * @openapi
 * /api/auth/nonce:
 *   post:
 *     tags: [Authentication]
 *     summary: Get SIWE nonce
 *     description: Generate a nonce for Sign-In With Ethereum (SIWE) authentication. The nonce expires in 5 minutes.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address:
 *                 type: string
 *                 pattern: "^0x[a-fA-F0-9]{40}$"
 *                 description: Ethereum wallet address
 *                 example: "0x1234567890abcdef1234567890abcdef12345678"
 *     responses:
 *       200:
 *         description: Nonce generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     nonce:
 *                       type: string
 *                       description: Random nonce for SIWE message
 *                       example: "8fj2k9d0s"
 *       400:
 *         description: Invalid address
 */
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

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Login with SIWE signature
 *     description: |
 *       Verify a signed SIWE (Sign-In With Ethereum) message and return a JWT token.
 *       The JWT token is valid for 7 days and should be included in the Authorization header
 *       for authenticated requests.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message, signature]
 *             properties:
 *               message:
 *                 type: string
 *                 description: The prepared SIWE message that was signed
 *                 example: "swarm-vault.com wants you to sign in with your Ethereum account:\n0x1234...5678\n\nSign in to Swarm Vault\n\nURI: https://swarm-vault.com\nVersion: 1\nChain ID: 8453\nNonce: 8fj2k9d0s\nIssued At: 2024-01-15T00:00:00.000Z"
 *               signature:
 *                 type: string
 *                 description: The signature of the SIWE message
 *                 example: "0x..."
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: JWT token for authenticated requests
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     user:
 *                       $ref: "#/components/schemas/User"
 *       400:
 *         description: Invalid signature or expired nonce
 */
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
          twitterId: user.twitterId,
          twitterUsername: user.twitterUsername,
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

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get current user
 *     description: Get the authenticated user's profile information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: "#/components/schemas/User"
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: User not found
 */
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
        twitterId: user.twitterId,
        twitterUsername: user.twitterUsername,
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

// GET /api/auth/twitter - Initiate Twitter OAuth flow
router.get("/twitter", authMiddleware, (req: Request, res: Response) => {
  if (!env.TWITTER_CLIENT_ID || !env.TWITTER_CLIENT_SECRET || !env.TWITTER_CALLBACK_URL) {
    res.status(500).json({
      success: false,
      error: "Twitter OAuth is not configured",
    });
    return;
  }

  const userId = req.user!.userId;
  const state = crypto.randomBytes(16).toString("hex");
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Store state and verifier for callback validation
  twitterOAuthStore.set(state, {
    state,
    codeVerifier,
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });

  // Build Twitter OAuth 2.0 authorization URL
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.TWITTER_CLIENT_ID,
    redirect_uri: env.TWITTER_CALLBACK_URL,
    scope: "tweet.read users.read",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  res.json({
    success: true,
    data: { authUrl },
  });
});

// GET /api/auth/twitter/callback - Handle Twitter OAuth callback
router.get("/twitter/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  // Get frontend URL from environment or default
  const frontendUrl = process.env.VITE_API_URL?.replace(":3001", ":5173") || "http://localhost:5173";

  if (error) {
    res.redirect(`${frontendUrl}/settings?twitter_error=${encodeURIComponent(error as string)}`);
    return;
  }

  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    res.redirect(`${frontendUrl}/settings?twitter_error=missing_params`);
    return;
  }

  // Validate state and get stored data
  const storedData = twitterOAuthStore.get(state);
  if (!storedData) {
    res.redirect(`${frontendUrl}/settings?twitter_error=invalid_state`);
    return;
  }

  if (storedData.expiresAt < Date.now()) {
    twitterOAuthStore.delete(state);
    res.redirect(`${frontendUrl}/settings?twitter_error=expired`);
    return;
  }

  // Clear used state
  twitterOAuthStore.delete(state);

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${env.TWITTER_CLIENT_ID}:${env.TWITTER_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: env.TWITTER_CALLBACK_URL!,
        code_verifier: storedData.codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Twitter token exchange failed:", errorData);
      res.redirect(`${frontendUrl}/settings?twitter_error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Twitter
    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      console.error("Twitter user fetch failed:", await userResponse.text());
      res.redirect(`${frontendUrl}/settings?twitter_error=user_fetch_failed`);
      return;
    }

    const userData = await userResponse.json();
    const twitterId = userData.data.id;
    const twitterUsername = userData.data.username;

    // Check if this Twitter account is already linked to another user
    const existingUser = await prisma.user.findUnique({
      where: { twitterId },
    });

    if (existingUser && existingUser.id !== storedData.userId) {
      res.redirect(`${frontendUrl}/settings?twitter_error=already_linked`);
      return;
    }

    // Update user with Twitter info
    await prisma.user.update({
      where: { id: storedData.userId },
      data: { twitterId, twitterUsername },
    });

    res.redirect(`${frontendUrl}/settings?twitter_success=true`);
  } catch (err) {
    console.error("Twitter OAuth error:", err);
    res.redirect(`${frontendUrl}/settings?twitter_error=unknown`);
  }
});

// POST /api/auth/twitter/disconnect - Disconnect Twitter account
router.post("/twitter/disconnect", authMiddleware, async (req: Request, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { twitterId: null, twitterUsername: null },
    });

    res.json({
      success: true,
      data: { message: "Twitter account disconnected" },
    });
  } catch (error) {
    console.error("Failed to disconnect Twitter:", error);
    res.status(500).json({
      success: false,
      error: "Failed to disconnect Twitter account",
    });
  }
});

export const authRouter: Router = router;

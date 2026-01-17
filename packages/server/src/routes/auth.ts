import { Router, Request, Response } from "express";
import { SiweMessage, generateNonce } from "siwe";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { authMiddleware, API_KEY_PREFIX } from "../middleware/auth.js";

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

// POST /api/auth/nonce - Get SIWE nonce (frontend use only, not documented in API docs)
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

// POST /api/auth/login - Login with SIWE signature (frontend use only, not documented in API docs)
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
 *     summary: Verify API key and get user info
 *     description: |
 *       Verify your API key is valid and retrieve your user profile.
 *       Use this endpoint to test your API key is working correctly.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key valid, user profile retrieved
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
 *         description: Invalid or missing API key
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
  if (
    !env.TWITTER_CLIENT_ID ||
    !env.TWITTER_CLIENT_SECRET ||
    !env.TWITTER_CALLBACK_URL
  ) {
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
  const frontendUrl = env.CLIENT_URL;

  if (error) {
    res.redirect(
      `${frontendUrl}/settings?twitter_error=${encodeURIComponent(
        error as string
      )}`
    );
    return;
  }

  if (
    !code ||
    !state ||
    typeof code !== "string" ||
    typeof state !== "string"
  ) {
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
    const tokenResponse = await fetch(
      "https://api.twitter.com/2/oauth2/token",
      {
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
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Twitter token exchange failed:", errorData);
      res.redirect(
        `${frontendUrl}/settings?twitter_error=token_exchange_failed`
      );
      return;
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
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

    const userData = (await userResponse.json()) as {
      data: { id: string; username: string };
    };
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
router.post(
  "/twitter/disconnect",
  authMiddleware,
  async (req: Request, res: Response) => {
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
  }
);

// =============================================================================
// API Key Management
// =============================================================================

/**
 * @openapi
 * /api/auth/api-key:
 *   get:
 *     tags: [Authentication]
 *     summary: Get API key info
 *     description: |
 *       Get information about the user's current API key.
 *       Returns the key prefix (for identification) and creation date.
 *       The full API key is never returned.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key info retrieved successfully
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
 *                     hasApiKey:
 *                       type: boolean
 *                       description: Whether the user has an API key configured
 *                     prefix:
 *                       type: string
 *                       description: First 12 chars of the API key for identification
 *                       example: "svk_a1b2c3d4"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       description: When the API key was created
 *       401:
 *         description: Unauthorized
 */
router.get("/api-key", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        apiKeyPrefix: true,
        apiKeyCreatedAt: true,
      },
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
        hasApiKey: !!user.apiKeyPrefix,
        prefix: user.apiKeyPrefix,
        createdAt: user.apiKeyCreatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to get API key info:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get API key info",
    });
  }
});

/**
 * @openapi
 * /api/auth/api-key/generate:
 *   post:
 *     tags: [Authentication]
 *     summary: Generate new API key
 *     description: |
 *       Generate a new API key for programmatic access to the Swarm Vault API.
 *
 *       **IMPORTANT:** The full API key is only returned ONCE in this response.
 *       Store it securely - you will not be able to retrieve it again.
 *
 *       If you already have an API key, generating a new one will automatically
 *       revoke the old key.
 *
 *       Use the API key by including it in the Authorization header:
 *       `Authorization: Bearer svk_xxxxx...`
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key generated successfully
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
 *                     apiKey:
 *                       type: string
 *                       description: The full API key (shown only once!)
 *                       example: "svk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
 *                     prefix:
 *                       type: string
 *                       description: Key prefix for identification
 *                       example: "svk_a1b2c3d4"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/api-key/generate",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      // Generate a random 32-byte API key
      const randomBytes = crypto.randomBytes(32);
      const keyBody = randomBytes.toString("base64url"); // URL-safe base64
      const fullApiKey = `${API_KEY_PREFIX}${keyBody}`;

      // Extract prefix for storage (first 8 chars of the body)
      const prefix = `${API_KEY_PREFIX}${keyBody.slice(0, 8)}`;

      // Hash the full key for secure storage
      const saltRounds = 10;
      const apiKeyHash = await bcrypt.hash(fullApiKey, saltRounds);

      const now = new Date();

      // Update user with the new API key (this automatically revokes any existing key)
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: {
          apiKeyHash,
          apiKeyPrefix: prefix,
          apiKeyCreatedAt: now,
        },
      });

      // Return the full key ONLY ONCE
      res.json({
        success: true,
        data: {
          apiKey: fullApiKey,
          prefix,
          createdAt: now,
        },
      });
    } catch (error) {
      console.error("Failed to generate API key:", error);
      res.status(500).json({
        success: false,
        error: "Failed to generate API key",
      });
    }
  }
);

/**
 * @openapi
 * /api/auth/api-key:
 *   delete:
 *     tags: [Authentication]
 *     summary: Revoke API key
 *     description: |
 *       Revoke the current API key. After revocation, the key can no longer
 *       be used for authentication. You can generate a new key at any time.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key revoked successfully
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
 *                     message:
 *                       type: string
 *                       example: "API key revoked"
 *       401:
 *         description: Unauthorized
 */
router.delete(
  "/api-key",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      await prisma.user.update({
        where: { id: req.user!.userId },
        data: {
          apiKeyHash: null,
          apiKeyPrefix: null,
          apiKeyCreatedAt: null,
        },
      });

      res.json({
        success: true,
        data: { message: "API key revoked" },
      });
    } catch (error) {
      console.error("Failed to revoke API key:", error);
      res.status(500).json({
        success: false,
        error: "Failed to revoke API key",
      });
    }
  }
);

export const authRouter: Router = router;

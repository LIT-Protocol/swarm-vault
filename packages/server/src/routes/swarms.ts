import { Router, Request, Response } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";
import { mintPKP } from "../lib/lit.js";
import { CreateSwarmSchema, UpdateSwarmSafeSchema, UpdateSwarmVisibilitySchema } from "@swarm-vault/shared";
import { validateSafeAddress } from "../lib/safe.js";

const router = Router();

// Generate a unique invite code (12 characters, alphanumeric)
function generateInviteCode(): string {
  return crypto.randomBytes(9).toString("base64url").slice(0, 12);
}

/**
 * @openapi
 * /api/swarms:
 *   get:
 *     tags: [Swarms]
 *     summary: List all swarms
 *     description: |
 *       Get a list of all public swarms. If authenticated, the response includes
 *       whether the current user is a manager of each swarm.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     responses:
 *       200:
 *         description: Swarms retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: "#/components/schemas/Swarm"
 */
router.get("/", optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // Build where clause based on user role
    // Non-authenticated users only see public swarms
    // Authenticated users see public swarms + their own managed swarms
    let whereClause: { OR?: Array<{ isPublic?: boolean; managers?: { some: { userId: string } } }> } = {};

    if (req.user) {
      // Authenticated: show public swarms OR swarms they manage
      whereClause = {
        OR: [
          { isPublic: true },
          { managers: { some: { userId: req.user.userId } } },
        ],
      };
    } else {
      // Non-authenticated: only public swarms
      whereClause = {
        OR: [{ isPublic: true }],
      };
    }

    const swarms = await prisma.swarm.findMany({
      where: whereClause,
      include: {
        managers: {
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
                twitterUsername: true,
              },
            },
          },
        },
        _count: {
          select: {
            memberships: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const result = swarms.map((swarm: { id: string; name: string; description: string; isPublic: boolean; createdAt: Date; updatedAt: Date; managers: { userId: string; user: { id: string; walletAddress: string; twitterUsername: string | null } }[]; _count: { memberships: number } }) => ({
      id: swarm.id,
      name: swarm.name,
      description: swarm.description,
      isPublic: swarm.isPublic,
      createdAt: swarm.createdAt,
      updatedAt: swarm.updatedAt,
      managers: swarm.managers.map((m: { user: { id: string; walletAddress: string; twitterUsername: string | null } }) => ({
        id: m.user.id,
        walletAddress: m.user.walletAddress,
        twitterUsername: m.user.twitterUsername,
      })),
      memberCount: swarm._count.memberships,
      isManager: req.user
        ? swarm.managers.some((m: { userId: string }) => m.userId === req.user!.userId)
        : false,
    }));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Failed to list swarms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to list swarms",
    });
  }
});

/**
 * @openapi
 * /api/swarms:
 *   post:
 *     tags: [Swarms]
 *     summary: Create a new swarm
 *     description: |
 *       Create a new swarm with the authenticated user as manager.
 *       Requires a linked Twitter account for manager verification.
 *       A new Lit Protocol PKP is minted for the swarm.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Name of the swarm
 *                 example: "Alpha Traders"
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Description of the swarm
 *                 example: "A swarm for professional traders"
 *     responses:
 *       201:
 *         description: Swarm created successfully
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
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     litPkpPublicKey:
 *                       type: string
 *                       description: Public key of the swarm's Lit PKP (only visible to manager)
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     managers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           walletAddress:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Twitter account not connected
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    // Check if user has linked Twitter account
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { twitterId: true, twitterUsername: true },
    });

    if (!user?.twitterId) {
      res.status(403).json({
        success: false,
        error: "You must connect your Twitter account before creating a swarm",
        errorCode: "PERM_005",
      });
      return;
    }

    // Validate input
    const parseResult = CreateSwarmSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.errors[0].message,
      });
      return;
    }

    const { name, description, isPublic } = parseResult.data;

    // Generate invite code for private swarms (also for public swarms for future use)
    const inviteCode = generateInviteCode();

    // Mint a new PKP for this swarm
    console.log(`[Swarm] Minting PKP for new swarm: ${name}`);
    const pkp = await mintPKP();

    // Create swarm with the authenticated user as manager
    const swarm = await prisma.swarm.create({
      data: {
        name,
        description,
        isPublic,
        inviteCode,
        litPkpPublicKey: pkp.publicKey,
        litPkpTokenId: pkp.tokenId,
        litPkpEthAddress: pkp.ethAddress,
        managers: {
          create: {
            userId: req.user!.userId,
          },
        },
      },
      include: {
        managers: {
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
              },
            },
          },
        },
      },
    });

    console.log(`[Swarm] Created swarm: ${swarm.id} (isPublic: ${isPublic})`);

    res.status(201).json({
      success: true,
      data: {
        id: swarm.id,
        name: swarm.name,
        description: swarm.description,
        isPublic: swarm.isPublic,
        inviteCode: swarm.inviteCode,
        litPkpPublicKey: swarm.litPkpPublicKey,
        createdAt: swarm.createdAt,
        updatedAt: swarm.updatedAt,
        managers: swarm.managers.map((m: { user: { id: string; walletAddress: string } }) => ({
          id: m.user.id,
          walletAddress: m.user.walletAddress,
        })),
      },
    });
  } catch (error) {
    console.error("Failed to create swarm:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create swarm",
    });
  }
});

/**
 * @openapi
 * /api/swarms/{id}:
 *   get:
 *     tags: [Swarms]
 *     summary: Get swarm details
 *     description: |
 *       Get detailed information about a specific swarm.
 *       Managers see additional details like PKP public key.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Swarm ID
 *     responses:
 *       200:
 *         description: Swarm details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: "#/components/schemas/Swarm"
 *       404:
 *         description: Swarm not found
 */
router.get("/:id", optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const swarm = await prisma.swarm.findUnique({
      where: { id },
      include: {
        managers: {
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
                twitterUsername: true,
              },
            },
          },
        },
        memberships: req.user ? {
          where: { userId: req.user.userId, status: "ACTIVE" },
          select: { id: true },
        } : false,
        _count: {
          select: {
            memberships: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    });

    if (!swarm) {
      res.status(404).json({
        success: false,
        error: "Swarm not found",
      });
      return;
    }

    const isManager = req.user
      ? swarm.managers.some((m: { userId: string }) => m.userId === req.user!.userId)
      : false;

    const isMember = req.user && Array.isArray(swarm.memberships) && swarm.memberships.length > 0;

    // Access control for private swarms:
    // Only show private swarms if user is manager or member
    if (!swarm.isPublic && !isManager && !isMember) {
      res.status(404).json({
        success: false,
        error: "Swarm not found",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: swarm.id,
        name: swarm.name,
        description: swarm.description,
        isPublic: swarm.isPublic,
        // Only managers can see the invite code
        inviteCode: isManager ? swarm.inviteCode : undefined,
        litPkpPublicKey: isManager ? swarm.litPkpPublicKey : undefined,
        // PKP ETH address is needed by authenticated users to create their agent wallet
        litPkpEthAddress: req.user ? swarm.litPkpEthAddress : undefined,
        // SAFE configuration (visible to all, but only managers can modify)
        safeAddress: swarm.safeAddress,
        requireSafeSignoff: swarm.requireSafeSignoff,
        createdAt: swarm.createdAt,
        updatedAt: swarm.updatedAt,
        managers: swarm.managers.map((m: { user: { id: string; walletAddress: string; twitterUsername: string | null } }) => ({
          id: m.user.id,
          walletAddress: m.user.walletAddress,
          twitterUsername: m.user.twitterUsername,
        })),
        memberCount: swarm._count.memberships,
        isManager,
        isMember: !!isMember,
      },
    });
  } catch (error) {
    console.error("Failed to get swarm:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get swarm",
    });
  }
});

/**
 * @openapi
 * /api/swarms/{id}/members:
 *   get:
 *     tags: [Swarms]
 *     summary: Get swarm members
 *     description: |
 *       Get a list of all active members in the swarm.
 *       **Manager only** - only swarm managers can view members.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Swarm ID
 *     responses:
 *       200:
 *         description: Members retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       userId:
 *                         type: string
 *                         format: uuid
 *                       walletAddress:
 *                         type: string
 *                         description: User's EOA wallet address
 *                       agentWalletAddress:
 *                         type: string
 *                         description: User's smart wallet address for this swarm
 *                       status:
 *                         type: string
 *                         enum: [ACTIVE, LEFT]
 *                       joinedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can view members
 *       404:
 *         description: Swarm not found
 */
router.get("/:id/members", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // First verify the swarm exists and user is a manager
    const swarm = await prisma.swarm.findUnique({
      where: { id },
      include: {
        managers: true,
      },
    });

    if (!swarm) {
      res.status(404).json({
        success: false,
        error: "Swarm not found",
      });
      return;
    }

    const isManager = swarm.managers.some((m: { userId: string }) => m.userId === req.user!.userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Only managers can view swarm members",
      });
      return;
    }

    // Get all members
    const memberships = await prisma.swarmMembership.findMany({
      where: {
        swarmId: id,
        status: "ACTIVE",
      },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    res.json({
      success: true,
      data: memberships.map((m: { id: string; agentWalletAddress: string; status: string; joinedAt: Date; user: { id: string; walletAddress: string } }) => ({
        id: m.id,
        userId: m.user.id,
        walletAddress: m.user.walletAddress,
        agentWalletAddress: m.agentWalletAddress,
        status: m.status,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (error) {
    console.error("Failed to get swarm members:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get swarm members",
    });
  }
});

// PATCH /api/swarms/:id/safe - Update SAFE configuration (manager only)
router.patch("/:id/safe", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify swarm exists and user is a manager
    const swarm = await prisma.swarm.findUnique({
      where: { id },
      include: {
        managers: true,
      },
    });

    if (!swarm) {
      res.status(404).json({
        success: false,
        error: "Swarm not found",
        errorCode: "RES_003",
      });
      return;
    }

    const isManager = swarm.managers.some((m: { userId: string }) => m.userId === req.user!.userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Only managers can update SAFE configuration",
        errorCode: "PERM_002",
      });
      return;
    }

    // Validate input
    const parseResult = UpdateSwarmSafeSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.errors[0].message,
        errorCode: "VAL_001",
      });
      return;
    }

    let { safeAddress, requireSafeSignoff } = parseResult.data;

    // Strip network prefix from SAFE address (e.g., "base:0x..." -> "0x...")
    if (safeAddress && safeAddress.includes(":")) {
      safeAddress = safeAddress.slice(safeAddress.indexOf(":") + 1);
    }

    // If enabling SAFE sign-off, validate the SAFE address
    if (requireSafeSignoff && safeAddress) {
      const validation = await validateSafeAddress(safeAddress);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error || "Invalid SAFE address",
          errorCode: "VAL_002",
        });
        return;
      }
    }

    // Can't require sign-off without a SAFE address
    if (requireSafeSignoff && !safeAddress) {
      res.status(400).json({
        success: false,
        error: "Cannot require SAFE sign-off without a SAFE address",
        errorCode: "VAL_001",
      });
      return;
    }

    // Update the swarm
    const updated = await prisma.swarm.update({
      where: { id },
      data: {
        safeAddress,
        requireSafeSignoff,
      },
    });

    console.log(`[Swarm] Updated SAFE config for ${id}: safeAddress=${safeAddress}, requireSafeSignoff=${requireSafeSignoff}`);

    res.json({
      success: true,
      data: {
        id: updated.id,
        safeAddress: updated.safeAddress,
        requireSafeSignoff: updated.requireSafeSignoff,
      },
    });
  } catch (error) {
    console.error("Failed to update SAFE configuration:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update SAFE configuration",
      errorCode: "INT_001",
    });
  }
});

/**
 * @openapi
 * /api/swarms/invite/{inviteCode}:
 *   get:
 *     tags: [Swarms]
 *     summary: Get swarm by invite code
 *     description: |
 *       Get swarm details using an invite code. This allows users to preview
 *       a private swarm before joining.
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     parameters:
 *       - name: inviteCode
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique invite code for the swarm
 *     responses:
 *       200:
 *         description: Swarm details retrieved successfully
 *       404:
 *         description: Invalid invite code
 */
router.get("/invite/:inviteCode", optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.params;

    const swarm = await prisma.swarm.findUnique({
      where: { inviteCode },
      include: {
        managers: {
          include: {
            user: {
              select: {
                id: true,
                walletAddress: true,
                twitterUsername: true,
              },
            },
          },
        },
        _count: {
          select: {
            memberships: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    });

    if (!swarm) {
      res.status(404).json({
        success: false,
        error: "Invalid invite code",
        errorCode: "PERM_007",
      });
      return;
    }

    // Check if user is already a member
    let isMember = false;
    if (req.user) {
      const membership = await prisma.swarmMembership.findUnique({
        where: {
          swarmId_userId: {
            swarmId: swarm.id,
            userId: req.user.userId,
          },
        },
      });
      isMember = membership?.status === "ACTIVE";
    }

    res.json({
      success: true,
      data: {
        id: swarm.id,
        name: swarm.name,
        description: swarm.description,
        isPublic: swarm.isPublic,
        litPkpEthAddress: req.user ? swarm.litPkpEthAddress : undefined,
        createdAt: swarm.createdAt,
        updatedAt: swarm.updatedAt,
        managers: swarm.managers.map((m: { user: { id: string; walletAddress: string; twitterUsername: string | null } }) => ({
          id: m.user.id,
          walletAddress: m.user.walletAddress,
          twitterUsername: m.user.twitterUsername,
        })),
        memberCount: swarm._count.memberships,
        isMember,
      },
    });
  } catch (error) {
    console.error("Failed to get swarm by invite code:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get swarm",
      errorCode: "INT_001",
    });
  }
});

/**
 * @openapi
 * /api/swarms/{id}/visibility:
 *   patch:
 *     tags: [Swarms]
 *     summary: Update swarm visibility
 *     description: Toggle whether a swarm is public or private. Manager only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isPublic]
 *             properties:
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Visibility updated successfully
 *       403:
 *         description: Only managers can update visibility
 *       404:
 *         description: Swarm not found
 */
router.patch("/:id/visibility", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify swarm exists and user is a manager
    const swarm = await prisma.swarm.findUnique({
      where: { id },
      include: { managers: true },
    });

    if (!swarm) {
      res.status(404).json({
        success: false,
        error: "Swarm not found",
        errorCode: "RES_003",
      });
      return;
    }

    const isManager = swarm.managers.some((m: { userId: string }) => m.userId === req.user!.userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Only managers can update swarm visibility",
        errorCode: "PERM_002",
      });
      return;
    }

    // Validate input
    const parseResult = UpdateSwarmVisibilitySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.errors[0].message,
        errorCode: "VAL_001",
      });
      return;
    }

    const { isPublic } = parseResult.data;

    // Update the swarm
    const updated = await prisma.swarm.update({
      where: { id },
      data: { isPublic },
    });

    console.log(`[Swarm] Updated visibility for ${id}: isPublic=${isPublic}`);

    res.json({
      success: true,
      data: {
        id: updated.id,
        isPublic: updated.isPublic,
        inviteCode: updated.inviteCode,
      },
    });
  } catch (error) {
    console.error("Failed to update swarm visibility:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update swarm visibility",
      errorCode: "INT_001",
    });
  }
});

/**
 * @openapi
 * /api/swarms/{id}/invite/regenerate:
 *   post:
 *     tags: [Swarms]
 *     summary: Regenerate invite code
 *     description: Generate a new invite code, invalidating the old one. Manager only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Invite code regenerated successfully
 *       403:
 *         description: Only managers can regenerate invite codes
 *       404:
 *         description: Swarm not found
 */
router.post("/:id/invite/regenerate", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify swarm exists and user is a manager
    const swarm = await prisma.swarm.findUnique({
      where: { id },
      include: { managers: true },
    });

    if (!swarm) {
      res.status(404).json({
        success: false,
        error: "Swarm not found",
        errorCode: "RES_003",
      });
      return;
    }

    const isManager = swarm.managers.some((m: { userId: string }) => m.userId === req.user!.userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Only managers can regenerate invite codes",
        errorCode: "PERM_002",
      });
      return;
    }

    // Generate new invite code
    const newInviteCode = generateInviteCode();

    const updated = await prisma.swarm.update({
      where: { id },
      data: { inviteCode: newInviteCode },
    });

    console.log(`[Swarm] Regenerated invite code for ${id}`);

    res.json({
      success: true,
      data: {
        id: updated.id,
        inviteCode: updated.inviteCode,
      },
    });
  } catch (error) {
    console.error("Failed to regenerate invite code:", error);
    res.status(500).json({
      success: false,
      error: "Failed to regenerate invite code",
      errorCode: "INT_001",
    });
  }
});

export const swarmsRouter: Router = router;

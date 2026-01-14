import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";
import { mintPKP } from "../lib/lit.js";
import { CreateSwarmSchema, UpdateSwarmSafeSchema } from "@swarm-vault/shared";
import { validateSafeAddress } from "../lib/safe.js";

const router = Router();

// GET /api/swarms - List all swarms (public, with optional auth for manager info)
router.get("/", optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const swarms = await prisma.swarm.findMany({
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

    const result = swarms.map((swarm) => ({
      id: swarm.id,
      name: swarm.name,
      description: swarm.description,
      createdAt: swarm.createdAt,
      updatedAt: swarm.updatedAt,
      managers: swarm.managers.map((m) => ({
        id: m.user.id,
        walletAddress: m.user.walletAddress,
        twitterUsername: m.user.twitterUsername,
      })),
      memberCount: swarm._count.memberships,
      isManager: req.user
        ? swarm.managers.some((m) => m.userId === req.user!.userId)
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

// POST /api/swarms - Create a new swarm (requires auth + Twitter)
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

    const { name, description } = parseResult.data;

    // Mint a new PKP for this swarm
    console.log(`[Swarm] Minting PKP for new swarm: ${name}`);
    const pkp = await mintPKP();

    // Create swarm with the authenticated user as manager
    const swarm = await prisma.swarm.create({
      data: {
        name,
        description,
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

    console.log(`[Swarm] Created swarm: ${swarm.id}`);

    res.status(201).json({
      success: true,
      data: {
        id: swarm.id,
        name: swarm.name,
        description: swarm.description,
        litPkpPublicKey: swarm.litPkpPublicKey,
        createdAt: swarm.createdAt,
        updatedAt: swarm.updatedAt,
        managers: swarm.managers.map((m) => ({
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

// GET /api/swarms/:id - Get swarm details
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
      ? swarm.managers.some((m) => m.userId === req.user!.userId)
      : false;

    res.json({
      success: true,
      data: {
        id: swarm.id,
        name: swarm.name,
        description: swarm.description,
        litPkpPublicKey: isManager ? swarm.litPkpPublicKey : undefined,
        // PKP ETH address is needed by authenticated users to create their agent wallet
        litPkpEthAddress: req.user ? swarm.litPkpEthAddress : undefined,
        // SAFE configuration (visible to all, but only managers can modify)
        safeAddress: swarm.safeAddress,
        requireSafeSignoff: swarm.requireSafeSignoff,
        createdAt: swarm.createdAt,
        updatedAt: swarm.updatedAt,
        managers: swarm.managers.map((m) => ({
          id: m.user.id,
          walletAddress: m.user.walletAddress,
          twitterUsername: m.user.twitterUsername,
        })),
        memberCount: swarm._count.memberships,
        isManager,
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

// GET /api/swarms/:id/members - Get swarm members (manager only)
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

    const isManager = swarm.managers.some((m) => m.userId === req.user!.userId);
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
      data: memberships.map((m) => ({
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

    const isManager = swarm.managers.some((m) => m.userId === req.user!.userId);
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

export const swarmsRouter: Router = router;

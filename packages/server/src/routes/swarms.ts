import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";
import { mintPKP } from "../lib/lit.js";
import { CreateSwarmSchema } from "@swarm-vault/shared";

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
      socialUrl: swarm.socialUrl,
      createdAt: swarm.createdAt,
      updatedAt: swarm.updatedAt,
      managers: swarm.managers.map((m) => ({
        id: m.user.id,
        walletAddress: m.user.walletAddress,
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

// POST /api/swarms - Create a new swarm (requires auth)
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    // Validate input
    const parseResult = CreateSwarmSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.errors[0].message,
      });
      return;
    }

    const { name, description, socialUrl } = parseResult.data;

    // Mint a new PKP for this swarm
    console.log(`[Swarm] Minting PKP for new swarm: ${name}`);
    const pkp = await mintPKP();

    // Create swarm with the authenticated user as manager
    const swarm = await prisma.swarm.create({
      data: {
        name,
        description,
        socialUrl,
        litPkpPublicKey: pkp.publicKey,
        litPkpTokenId: pkp.tokenId,
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
        socialUrl: swarm.socialUrl,
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
        socialUrl: swarm.socialUrl,
        litPkpPublicKey: isManager ? swarm.litPkpPublicKey : undefined,
        createdAt: swarm.createdAt,
        updatedAt: swarm.updatedAt,
        managers: swarm.managers.map((m) => ({
          id: m.user.id,
          walletAddress: m.user.walletAddress,
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

export const swarmsRouter: Router = router;

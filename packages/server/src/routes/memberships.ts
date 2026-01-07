import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { computeSmartWalletAddress } from "../lib/zerodev.js";
import type { Address } from "viem";

const router = Router();

// POST /api/swarms/:swarmId/join - Join a swarm
router.post(
  "/swarms/:swarmId/join",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { swarmId } = req.params;
      const userId = req.user!.userId;
      const userWalletAddress = req.user!.walletAddress;

      // Check if swarm exists
      const swarm = await prisma.swarm.findUnique({
        where: { id: swarmId },
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

      // Check if user is already a member
      const existingMembership = await prisma.swarmMembership.findUnique({
        where: {
          swarmId_userId: {
            swarmId,
            userId,
          },
        },
      });

      if (existingMembership) {
        if (existingMembership.status === "ACTIVE") {
          res.status(400).json({
            success: false,
            error: "You are already a member of this swarm",
          });
          return;
        }

        // If they previously left, reactivate membership
        const updatedMembership = await prisma.swarmMembership.update({
          where: { id: existingMembership.id },
          data: {
            status: "ACTIVE",
            joinedAt: new Date(),
          },
          include: {
            swarm: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        });

        res.json({
          success: true,
          data: {
            id: updatedMembership.id,
            swarmId: updatedMembership.swarmId,
            swarmName: updatedMembership.swarm.name,
            agentWalletAddress: updatedMembership.agentWalletAddress,
            status: updatedMembership.status,
            joinedAt: updatedMembership.joinedAt,
          },
        });
        return;
      }

      // Compute the smart wallet address for this user
      console.log(
        `[Membership] Computing smart wallet for user ${userWalletAddress} in swarm ${swarmId}`
      );

      // Use a unique index for each swarm membership to prevent address collisions
      // We'll use a hash-based approach, but for now use 0n as we have the unique constraint
      const agentWalletAddress = await computeSmartWalletAddress(
        userWalletAddress as Address,
        0n
      );

      console.log(`[Membership] Computed agent wallet: ${agentWalletAddress}`);

      // Create the membership
      const membership = await prisma.swarmMembership.create({
        data: {
          swarmId,
          userId,
          agentWalletAddress,
          status: "ACTIVE",
        },
        include: {
          swarm: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      });

      console.log(`[Membership] Created membership: ${membership.id}`);

      res.status(201).json({
        success: true,
        data: {
          id: membership.id,
          swarmId: membership.swarmId,
          swarmName: membership.swarm.name,
          agentWalletAddress: membership.agentWalletAddress,
          status: membership.status,
          joinedAt: membership.joinedAt,
        },
      });
    } catch (error) {
      console.error("Failed to join swarm:", error);
      res.status(500).json({
        success: false,
        error: "Failed to join swarm",
      });
    }
  }
);

// GET /api/memberships - Get current user's memberships
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const memberships = await prisma.swarmMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
      },
      include: {
        swarm: {
          select: {
            id: true,
            name: true,
            description: true,
            socialUrl: true,
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
        swarmId: m.swarmId,
        swarmName: m.swarm.name,
        swarmDescription: m.swarm.description,
        swarmSocialUrl: m.swarm.socialUrl,
        agentWalletAddress: m.agentWalletAddress,
        status: m.status,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (error) {
    console.error("Failed to get memberships:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get memberships",
    });
  }
});

// GET /api/memberships/:id - Get membership details
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const membership = await prisma.swarmMembership.findUnique({
      where: { id },
      include: {
        swarm: {
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
        },
      },
    });

    if (!membership) {
      res.status(404).json({
        success: false,
        error: "Membership not found",
      });
      return;
    }

    // Ensure user owns this membership
    if (membership.userId !== userId) {
      res.status(403).json({
        success: false,
        error: "You do not have access to this membership",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: membership.id,
        swarmId: membership.swarmId,
        agentWalletAddress: membership.agentWalletAddress,
        status: membership.status,
        joinedAt: membership.joinedAt,
        swarm: {
          id: membership.swarm.id,
          name: membership.swarm.name,
          description: membership.swarm.description,
          socialUrl: membership.swarm.socialUrl,
          memberCount: membership.swarm._count.memberships,
          managers: membership.swarm.managers.map((m) => ({
            id: m.user.id,
            walletAddress: m.user.walletAddress,
          })),
        },
      },
    });
  } catch (error) {
    console.error("Failed to get membership:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get membership",
    });
  }
});

// POST /api/memberships/:id/leave - Leave a swarm
router.post("/:id/leave", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const membership = await prisma.swarmMembership.findUnique({
      where: { id },
    });

    if (!membership) {
      res.status(404).json({
        success: false,
        error: "Membership not found",
      });
      return;
    }

    // Ensure user owns this membership
    if (membership.userId !== userId) {
      res.status(403).json({
        success: false,
        error: "You do not have access to this membership",
      });
      return;
    }

    if (membership.status === "LEFT") {
      res.status(400).json({
        success: false,
        error: "You have already left this swarm",
      });
      return;
    }

    // Update status to LEFT
    const updatedMembership = await prisma.swarmMembership.update({
      where: { id },
      data: {
        status: "LEFT",
      },
    });

    res.json({
      success: true,
      data: {
        id: updatedMembership.id,
        status: updatedMembership.status,
      },
    });
  } catch (error) {
    console.error("Failed to leave swarm:", error);
    res.status(500).json({
      success: false,
      error: "Failed to leave swarm",
    });
  }
});

export const membershipsRouter: Router = router;

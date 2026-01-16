import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { z } from "zod";
import { getWalletBalancesForDisplay, getCurrentChainId } from "../lib/alchemy.js";
import { type Address } from "viem";

const router = Router();

// Schema for join request - client must compute wallet and approval
const JoinSwarmSchema = z.object({
  agentWalletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  sessionKeyApproval: z.string().min(1, "Session key approval is required"),
});

/**
 * @openapi
 * /api/swarms/{swarmId}/join:
 *   post:
 *     tags: [Memberships]
 *     summary: Join a swarm
 *     description: |
 *       Join a swarm as a member. The client must create the smart wallet
 *       and serialize the permission account before calling this endpoint.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: swarmId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Swarm ID to join
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentWalletAddress, sessionKeyApproval]
 *             properties:
 *               agentWalletAddress:
 *                 type: string
 *                 pattern: "^0x[a-fA-F0-9]{40}$"
 *                 description: The smart wallet address created by the client
 *               sessionKeyApproval:
 *                 type: string
 *                 description: Serialized permission account for PKP signing
 *     responses:
 *       201:
 *         description: Successfully joined swarm
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: "#/components/schemas/Membership"
 *       400:
 *         description: Already a member or invalid data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Swarm not found
 */
router.post(
  "/swarms/:swarmId/join",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { swarmId } = req.params;
      const userId = req.user!.userId;

      // Validate request body
      const parseResult = JoinSwarmSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: parseResult.error.errors[0].message,
        });
        return;
      }

      const { agentWalletAddress, sessionKeyApproval } = parseResult.data;

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

        // If they previously left, reactivate membership with new approval
        const updatedMembership = await prisma.swarmMembership.update({
          where: { id: existingMembership.id },
          data: {
            status: "ACTIVE",
            joinedAt: new Date(),
            agentWalletAddress,
            sessionKeyApproval,
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

      console.log(
        `[Membership] Creating membership for user in swarm ${swarmId}`
      );
      console.log(`[Membership] Agent wallet: ${agentWalletAddress}`);

      // Create the membership with client-provided data
      const membership = await prisma.swarmMembership.create({
        data: {
          swarmId,
          userId,
          agentWalletAddress,
          sessionKeyApproval,
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

/**
 * @openapi
 * /api/memberships:
 *   get:
 *     tags: [Memberships]
 *     summary: List user's memberships
 *     description: Get all active swarm memberships for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Memberships retrieved successfully
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
 *                     $ref: "#/components/schemas/Membership"
 *       401:
 *         description: Unauthorized
 */
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
          },
        },
      },
      orderBy: {
        joinedAt: "desc",
      },
    });

    res.json({
      success: true,
      data: memberships.map((m: { id: string; swarmId: string; agentWalletAddress: string; status: string; joinedAt: Date; swarm: { name: string; description: string } }) => ({
        id: m.id,
        swarmId: m.swarmId,
        swarmName: m.swarm.name,
        swarmDescription: m.swarm.description,
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

/**
 * @openapi
 * /api/memberships/{id}:
 *   get:
 *     tags: [Memberships]
 *     summary: Get membership details
 *     description: Get detailed information about a specific membership
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Membership ID
 *     responses:
 *       200:
 *         description: Membership details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     swarmId:
 *                       type: string
 *                     agentWalletAddress:
 *                       type: string
 *                     status:
 *                       type: string
 *                     joinedAt:
 *                       type: string
 *                       format: date-time
 *                     swarm:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                         memberCount:
 *                           type: integer
 *                         managers:
 *                           type: array
 *                           items:
 *                             type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not your membership
 *       404:
 *         description: Membership not found
 */
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
          memberCount: membership.swarm._count.memberships,
          managers: membership.swarm.managers.map((m: { user: { id: string; walletAddress: string } }) => ({
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

/**
 * @openapi
 * /api/memberships/{id}/leave:
 *   post:
 *     tags: [Memberships]
 *     summary: Leave a swarm
 *     description: Leave a swarm membership. The agent wallet remains but swarm managers can no longer execute transactions.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Membership ID
 *     responses:
 *       200:
 *         description: Successfully left swarm
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [LEFT]
 *       400:
 *         description: Already left
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not your membership
 *       404:
 *         description: Membership not found
 */
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

/**
 * @openapi
 * /api/memberships/{id}/balance:
 *   get:
 *     tags: [Memberships]
 *     summary: Get agent wallet balance
 *     description: Get ETH and token balances for the membership's agent wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Membership ID
 *       - name: refresh
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Force refresh from blockchain (bypasses cache)
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: "#/components/schemas/WalletBalance"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not your membership
 *       404:
 *         description: Membership not found
 */
router.get("/:id/balance", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const refresh = req.query.refresh === "true";

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

    // Fetch balances with caching
    const balances = await getWalletBalancesForDisplay(
      membership.agentWalletAddress as Address,
      refresh
    );

    res.json({
      success: true,
      data: {
        walletAddress: membership.agentWalletAddress,
        chainId: getCurrentChainId(),
        ethBalance: balances.ethBalance,
        tokens: balances.tokens,
        fetchedAt: balances.fetchedAt,
        cached: !refresh && Date.now() - balances.fetchedAt > 1000,
      },
    });
  } catch (error) {
    console.error("Failed to get balance:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get balance",
    });
  }
});

export const membershipsRouter: Router = router;

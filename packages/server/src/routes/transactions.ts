import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  ExecuteTransactionSchema,
  validateTemplate,
  type TransactionTemplateInput,
} from "@swarm-vault/shared";
import { executeSwarmTransaction } from "../lib/transactionExecutor.js";

const router = Router();

// POST /api/swarms/:id/transactions - Execute a swarm transaction (manager only)
router.post(
  "/swarms/:id/transactions",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: swarmId } = req.params;

      // Verify swarm exists and user is a manager
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

      const isManager = swarm.managers.some((m) => m.userId === req.user!.userId);
      if (!isManager) {
        res.status(403).json({
          success: false,
          error: "Only managers can execute swarm transactions",
        });
        return;
      }

      // Validate the transaction template
      const parseResult = ExecuteTransactionSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: parseResult.error.errors[0].message,
        });
        return;
      }

      const { template } = parseResult.data;

      // Validate template structure and placeholders
      const validation = validateTemplate(template);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
        });
        return;
      }

      // Get all active members
      const memberships = await prisma.swarmMembership.findMany({
        where: {
          swarmId,
          status: "ACTIVE",
        },
        include: {
          user: true,
        },
      });

      if (memberships.length === 0) {
        res.status(400).json({
          success: false,
          error: "No active members in this swarm",
        });
        return;
      }

      // Check that all members have session key approvals
      const membersWithoutApproval = memberships.filter(
        (m) => !m.sessionKeyApproval
      );
      if (membersWithoutApproval.length > 0) {
        res.status(400).json({
          success: false,
          error: `${membersWithoutApproval.length} member(s) have not completed wallet setup`,
        });
        return;
      }

      // Create the transaction record
      const transaction = await prisma.transaction.create({
        data: {
          swarmId,
          template: template as object,
          status: "PENDING",
        },
      });

      console.log(
        `[Transaction] Created transaction ${transaction.id} for swarm ${swarmId}`
      );

      // Start async execution (don't await - return immediately)
      executeSwarmTransaction(
        transaction.id,
        swarm,
        memberships,
        template as TransactionTemplateInput
      ).catch((error) => {
        console.error(`[Transaction] Execution error for ${transaction.id}:`, error);
      });

      res.status(202).json({
        success: true,
        data: {
          transactionId: transaction.id,
          status: "PENDING",
          memberCount: memberships.length,
        },
      });
    } catch (error) {
      console.error("Failed to execute transaction:", error);
      res.status(500).json({
        success: false,
        error: "Failed to execute transaction",
      });
    }
  }
);

// GET /api/swarms/:id/transactions - List swarm transactions (manager only)
router.get(
  "/swarms/:id/transactions",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id: swarmId } = req.params;

      // Verify swarm exists and user is a manager
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

      const isManager = swarm.managers.some((m) => m.userId === req.user!.userId);
      if (!isManager) {
        res.status(403).json({
          success: false,
          error: "Only managers can view swarm transactions",
        });
        return;
      }

      const transactions = await prisma.transaction.findMany({
        where: { swarmId },
        include: {
          _count: {
            select: {
              targets: true,
            },
          },
          targets: {
            select: {
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const result = transactions.map((tx) => {
        const statusCounts = {
          pending: 0,
          submitted: 0,
          confirmed: 0,
          failed: 0,
        };

        for (const target of tx.targets) {
          statusCounts[target.status.toLowerCase() as keyof typeof statusCounts]++;
        }

        return {
          id: tx.id,
          status: tx.status,
          template: tx.template,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt,
          targetCount: tx._count.targets,
          statusCounts,
        };
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("Failed to list transactions:", error);
      res.status(500).json({
        success: false,
        error: "Failed to list transactions",
      });
    }
  }
);

// GET /api/transactions/:id - Get transaction details
router.get(
  "/transactions/:id",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const transaction = await prisma.transaction.findUnique({
        where: { id },
        include: {
          swarm: {
            include: {
              managers: true,
            },
          },
          targets: {
            include: {
              membership: {
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
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      if (!transaction) {
        res.status(404).json({
          success: false,
          error: "Transaction not found",
        });
        return;
      }

      // Verify user is a manager of the swarm
      const isManager = transaction.swarm.managers.some(
        (m) => m.userId === req.user!.userId
      );
      if (!isManager) {
        res.status(403).json({
          success: false,
          error: "Only managers can view transaction details",
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: transaction.id,
          swarmId: transaction.swarmId,
          status: transaction.status,
          template: transaction.template,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          targets: transaction.targets.map((t) => ({
            id: t.id,
            membershipId: t.membershipId,
            userWallet: t.membership.user.walletAddress,
            agentWallet: t.membership.agentWalletAddress,
            resolvedTxData: t.resolvedTxData,
            userOpHash: t.userOpHash,
            txHash: t.txHash,
            status: t.status,
            error: t.error,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          })),
        },
      });
    } catch (error) {
      console.error("Failed to get transaction:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get transaction",
      });
    }
  }
);

export const transactionsRouter: Router = router;

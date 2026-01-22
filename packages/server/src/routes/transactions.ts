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

/**
 * @openapi
 * /api/swarms/{id}/transactions:
 *   post:
 *     tags: [Transactions]
 *     summary: Execute a custom transaction
 *     description: |
 *       Execute a custom transaction across all swarm member wallets using a template.
 *       Templates support placeholders for wallet addresses, balances, and computed values.
 *       **Manager only** - only swarm managers can execute transactions.
 *
 *       The transaction is executed asynchronously - poll the returned transaction ID for status updates.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template]
 *             properties:
 *               template:
 *                 type: object
 *                 required: [contractAddress]
 *                 properties:
 *                   contractAddress:
 *                     type: string
 *                     pattern: "^0x[a-fA-F0-9]{40}$"
 *                     description: Target contract address
 *                   abi:
 *                     type: array
 *                     description: Contract ABI (required for ABI mode)
 *                   functionName:
 *                     type: string
 *                     description: Function to call (required for ABI mode)
 *                   args:
 *                     type: array
 *                     description: Function arguments (can include placeholders)
 *                   data:
 *                     type: string
 *                     description: Raw calldata hex (for raw mode, can include placeholders)
 *                   value:
 *                     type: string
 *                     description: ETH value to send (wei, can be placeholder)
 *                     default: "0"
 *           example:
 *             template:
 *               contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *               abi: [{"name": "transfer", "type": "function", "inputs": [{"name": "to", "type": "address"}, {"name": "amount", "type": "uint256"}]}]
 *               functionName: "transfer"
 *               args: ["0x1234567890abcdef1234567890abcdef12345678", "{{percentage:tokenBalance:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913:50}}"]
 *               value: "0"
 *     responses:
 *       202:
 *         description: Transaction execution started
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
 *                     transactionId:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       enum: [PENDING]
 *                     memberCount:
 *                       type: integer
 *       400:
 *         description: Invalid template or no active members
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can execute transactions
 *       404:
 *         description: Swarm not found
 */
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

      const isManager = swarm.managers.some((m: { userId: string }) => m.userId === req.user!.userId);
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

      const { template, membershipIds } = parseResult.data;

      // Validate template structure and placeholders
      const validation = validateTemplate(template);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
        });
        return;
      }

      // Build membership filter
      const membershipFilter: { swarmId: string; status: string; id?: { in: string[] } } = {
        swarmId,
        status: "ACTIVE",
      };
      if (membershipIds && membershipIds.length > 0) {
        membershipFilter.id = { in: membershipIds };
      }

      // Get active members (optionally filtered by membershipIds)
      const memberships = await prisma.swarmMembership.findMany({
        where: membershipFilter,
        include: {
          user: true,
        },
      });

      if (memberships.length === 0) {
        res.status(400).json({
          success: false,
          error: membershipIds ? "No matching active members found" : "No active members in this swarm",
        });
        return;
      }

      // Check that all members have session key approvals
      const membersWithoutApproval = memberships.filter(
        (m: { sessionKeyApproval: string | null }) => !m.sessionKeyApproval
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

/**
 * @openapi
 * /api/swarms/{id}/transactions:
 *   get:
 *     tags: [Transactions]
 *     summary: List swarm transactions
 *     description: |
 *       Get a list of all transactions executed for this swarm.
 *       **Manager only** - only swarm managers can view transactions.
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
 *         description: Transactions retrieved successfully
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
 *                     $ref: "#/components/schemas/Transaction"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can view transactions
 *       404:
 *         description: Swarm not found
 */
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

      const isManager = swarm.managers.some((m: { userId: string }) => m.userId === req.user!.userId);
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

      const result = transactions.map((tx: { id: string; status: string; template: unknown; createdAt: Date; updatedAt: Date; targets: { status: string }[]; _count: { targets: number } }) => {
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

/**
 * @openapi
 * /api/transactions/{id}:
 *   get:
 *     tags: [Transactions]
 *     summary: Get transaction details
 *     description: |
 *       Get detailed status and results for a specific transaction.
 *       Includes per-member status for tracking progress.
 *       **Manager only** - only swarm managers can view transaction details.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction details retrieved successfully
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
 *                       format: uuid
 *                     swarmId:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       enum: [PENDING, PROCESSING, COMPLETED, FAILED]
 *                     template:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     targets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           membershipId:
 *                             type: string
 *                           userWallet:
 *                             type: string
 *                           agentWallet:
 *                             type: string
 *                           resolvedTxData:
 *                             type: object
 *                           userOpHash:
 *                             type: string
 *                             nullable: true
 *                           txHash:
 *                             type: string
 *                             nullable: true
 *                           status:
 *                             type: string
 *                             enum: [PENDING, SUBMITTED, CONFIRMED, FAILED]
 *                           error:
 *                             type: string
 *                             nullable: true
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can view transaction details
 *       404:
 *         description: Transaction not found
 */
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
        (m: { userId: string }) => m.userId === req.user!.userId
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
          targets: transaction.targets.map((t: { id: string; membershipId: string; resolvedTxData: unknown; userOpHash: string | null; txHash: string | null; status: string; error: string | null; createdAt: Date; updatedAt: Date; membership: { agentWalletAddress: string; user: { walletAddress: string } } }) => ({
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

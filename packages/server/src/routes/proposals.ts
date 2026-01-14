/**
 * Proposal routes for SAFE sign-off flow
 */

import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { CreateProposalSchema, ErrorCode } from "@swarm-vault/shared";
import {
  computeProposalMessageHash,
  hashActionData,
  checkSafeMessageSignature,
  getSafeSignUrl,
} from "../lib/safe.js";
import { executeSwapTransaction } from "../lib/swapExecutor.js";
import { executeSwarmTransaction } from "../lib/transactionExecutor.js";
import { getSwapQuotes, type SwapExecuteData } from "../lib/zeroEx.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

/**
 * Helper to verify manager access to a swarm
 */
async function verifyManager(swarmId: string, userId: string) {
  const swarm = await prisma.swarm.findUnique({
    where: { id: swarmId },
    include: {
      managers: true,
      memberships: {
        where: { status: "ACTIVE" },
        include: { user: true },
      },
    },
  });

  if (!swarm) {
    return { error: "Swarm not found", code: ErrorCode.SWARM_NOT_FOUND };
  }

  const isManager = swarm.managers.some((m) => m.userId === userId);
  if (!isManager) {
    return { error: "Not a manager of this swarm", code: ErrorCode.NOT_MANAGER };
  }

  return { swarm };
}

// POST /api/swarms/:id/proposals - Create a new proposal
router.post("/swarms/:id/proposals", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: swarmId } = req.params;
    const userId = req.user!.userId;

    // Verify manager access
    const managerCheck = await verifyManager(swarmId, userId);
    if ("error" in managerCheck) {
      res.status(managerCheck.code === ErrorCode.SWARM_NOT_FOUND ? 404 : 403).json({
        success: false,
        error: managerCheck.error,
        errorCode: managerCheck.code,
      });
      return;
    }

    const { swarm } = managerCheck;

    // Check if SAFE sign-off is required
    if (!swarm.requireSafeSignoff || !swarm.safeAddress) {
      res.status(400).json({
        success: false,
        error: "This swarm does not require SAFE sign-off. Execute actions directly.",
        errorCode: ErrorCode.SAFE_NOT_CONFIGURED,
      });
      return;
    }

    // Validate input
    const parseResult = CreateProposalSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.errors[0].message,
        errorCode: ErrorCode.VALIDATION_ERROR,
      });
      return;
    }

    const { actionType, actionData, expiresInHours } = parseResult.data;

    // Generate proposal ID first so it can be included in the hash
    const proposalId = uuidv4();

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + (expiresInHours || 24) * 60 * 60 * 1000);

    // Compute the message hash for SAFE to sign
    const actionDataHash = hashActionData(actionData);
    const safeMessageHash = computeProposalMessageHash(
      swarmId,
      proposalId,
      actionType,
      actionDataHash,
      expiresAt
    );

    // Create the proposal
    const proposal = await prisma.proposedAction.create({
      data: {
        id: proposalId,
        swarmId,
        managerId: userId,
        actionType,
        actionData: actionData as object,
        safeMessageHash,
        expiresAt,
      },
    });

    // Generate SAFE signing URL
    const signUrl = getSafeSignUrl(swarm.safeAddress!, safeMessageHash);

    console.log(`[Proposals] Created proposal ${proposal.id} for swarm ${swarmId}`);

    res.status(201).json({
      success: true,
      data: {
        id: proposal.id,
        actionType: proposal.actionType,
        actionData: proposal.actionData,
        safeMessageHash: proposal.safeMessageHash,
        status: proposal.status,
        proposedAt: proposal.proposedAt,
        expiresAt: proposal.expiresAt,
        signUrl,
      },
    });
  } catch (error) {
    console.error("Failed to create proposal:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create proposal",
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
  }
});

// GET /api/swarms/:id/proposals - List proposals for a swarm
router.get("/swarms/:id/proposals", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: swarmId } = req.params;
    const userId = req.user!.userId;

    // Verify manager access
    const managerCheck = await verifyManager(swarmId, userId);
    if ("error" in managerCheck) {
      res.status(managerCheck.code === ErrorCode.SWARM_NOT_FOUND ? 404 : 403).json({
        success: false,
        error: managerCheck.error,
        errorCode: managerCheck.code,
      });
      return;
    }

    const { swarm } = managerCheck;

    // Get all proposals (not expired or executed)
    const proposals = await prisma.proposedAction.findMany({
      where: { swarmId },
      orderBy: { proposedAt: "desc" },
    });

    // Generate sign URLs for pending proposals
    const result = proposals.map((p) => ({
      id: p.id,
      actionType: p.actionType,
      actionData: p.actionData,
      safeMessageHash: p.safeMessageHash,
      status: p.status,
      proposedAt: p.proposedAt,
      approvedAt: p.approvedAt,
      executedAt: p.executedAt,
      expiresAt: p.expiresAt,
      executionTxId: p.executionTxId,
      signUrl: p.status === "PROPOSED" && swarm.safeAddress
        ? getSafeSignUrl(swarm.safeAddress, p.safeMessageHash)
        : undefined,
    }));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Failed to list proposals:", error);
    res.status(500).json({
      success: false,
      error: "Failed to list proposals",
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
  }
});

// GET /api/proposals/:id - Get proposal details
router.get("/proposals/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const proposal = await prisma.proposedAction.findUnique({
      where: { id },
      include: {
        swarm: {
          include: { managers: true },
        },
      },
    });

    if (!proposal) {
      res.status(404).json({
        success: false,
        error: "Proposal not found",
        errorCode: ErrorCode.PROPOSAL_NOT_FOUND,
      });
      return;
    }

    // Verify manager access
    const isManager = proposal.swarm.managers.some((m) => m.userId === userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Not a manager of this swarm",
        errorCode: ErrorCode.NOT_MANAGER,
      });
      return;
    }

    // Get sign URL
    const signUrl = proposal.status === "PROPOSED" && proposal.swarm.safeAddress
      ? getSafeSignUrl(proposal.swarm.safeAddress, proposal.safeMessageHash)
      : undefined;

    res.json({
      success: true,
      data: {
        id: proposal.id,
        swarmId: proposal.swarmId,
        actionType: proposal.actionType,
        actionData: proposal.actionData,
        safeMessageHash: proposal.safeMessageHash,
        status: proposal.status,
        proposedAt: proposal.proposedAt,
        approvedAt: proposal.approvedAt,
        executedAt: proposal.executedAt,
        expiresAt: proposal.expiresAt,
        executionTxId: proposal.executionTxId,
        signUrl,
      },
    });
  } catch (error) {
    console.error("Failed to get proposal:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get proposal",
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
  }
});

// GET /api/proposals/:id/status - Check approval status
router.get("/proposals/:id/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const proposal = await prisma.proposedAction.findUnique({
      where: { id },
      include: {
        swarm: {
          include: { managers: true },
        },
      },
    });

    if (!proposal) {
      res.status(404).json({
        success: false,
        error: "Proposal not found",
        errorCode: ErrorCode.PROPOSAL_NOT_FOUND,
      });
      return;
    }

    // Verify manager access
    const isManager = proposal.swarm.managers.some((m) => m.userId === userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Not a manager of this swarm",
        errorCode: ErrorCode.NOT_MANAGER,
      });
      return;
    }

    // Check if expired
    if (new Date() > proposal.expiresAt && proposal.status === "PROPOSED") {
      await prisma.proposedAction.update({
        where: { id },
        data: { status: "EXPIRED" },
      });

      res.json({
        success: true,
        data: {
          status: "EXPIRED",
          signed: false,
          message: "Proposal has expired",
        },
      });
      return;
    }

    // If already executed or rejected, return that status
    if (proposal.status !== "PROPOSED" && proposal.status !== "APPROVED") {
      res.json({
        success: true,
        data: {
          status: proposal.status,
          signed: proposal.status === "EXECUTED",
        },
      });
      return;
    }

    // Check SAFE signature
    if (!proposal.swarm.safeAddress) {
      res.status(400).json({
        success: false,
        error: "No SAFE configured for this swarm",
        errorCode: ErrorCode.SAFE_NOT_CONFIGURED,
      });
      return;
    }

    const signatureCheck = await checkSafeMessageSignature(
      proposal.swarm.safeAddress,
      proposal.safeMessageHash
    );

    // Update proposal status if now approved
    if (signatureCheck.signed && proposal.status === "PROPOSED") {
      await prisma.proposedAction.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          status: "APPROVED",
          signed: true,
          confirmations: signatureCheck.confirmations,
          threshold: signatureCheck.threshold,
          message: "Proposal approved by SAFE. Ready to execute.",
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        status: proposal.status,
        signed: signatureCheck.signed,
        confirmations: signatureCheck.confirmations,
        threshold: signatureCheck.threshold,
        message: signatureCheck.signed
          ? "Proposal approved. Ready to execute."
          : `Waiting for SAFE signatures (${signatureCheck.confirmations || 0}/${signatureCheck.threshold || "?"})`,
      },
    });
  } catch (error) {
    console.error("Failed to check proposal status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check proposal status",
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
  }
});

// POST /api/proposals/:id/execute - Execute an approved proposal
router.post("/proposals/:id/execute", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const proposal = await prisma.proposedAction.findUnique({
      where: { id },
      include: {
        swarm: {
          include: {
            managers: true,
            memberships: {
              where: { status: "ACTIVE" },
              include: { user: true },
            },
          },
        },
      },
    });

    if (!proposal) {
      res.status(404).json({
        success: false,
        error: "Proposal not found",
        errorCode: ErrorCode.PROPOSAL_NOT_FOUND,
      });
      return;
    }

    // Verify manager access
    const isManager = proposal.swarm.managers.some((m) => m.userId === userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Not a manager of this swarm",
        errorCode: ErrorCode.NOT_MANAGER,
      });
      return;
    }

    // Check if already executed
    if (proposal.status === "EXECUTED") {
      res.status(400).json({
        success: false,
        error: "Proposal has already been executed",
        errorCode: ErrorCode.PROPOSAL_ALREADY_EXECUTED,
      });
      return;
    }

    // Check if expired
    if (new Date() > proposal.expiresAt) {
      await prisma.proposedAction.update({
        where: { id },
        data: { status: "EXPIRED" },
      });

      res.status(400).json({
        success: false,
        error: "Proposal has expired",
        errorCode: ErrorCode.PROPOSAL_EXPIRED,
      });
      return;
    }

    // Verify SAFE signature
    if (!proposal.swarm.safeAddress) {
      res.status(400).json({
        success: false,
        error: "No SAFE configured for this swarm",
        errorCode: ErrorCode.SAFE_NOT_CONFIGURED,
      });
      return;
    }

    const signatureCheck = await checkSafeMessageSignature(
      proposal.swarm.safeAddress,
      proposal.safeMessageHash
    );

    if (!signatureCheck.signed) {
      res.status(400).json({
        success: false,
        error: `Proposal not yet approved by SAFE (${signatureCheck.confirmations || 0}/${signatureCheck.threshold || "?"} signatures)`,
        errorCode: ErrorCode.PROPOSAL_NOT_APPROVED,
      });
      return;
    }

    // Check for active members
    const memberships = proposal.swarm.memberships;
    if (memberships.length === 0) {
      res.status(400).json({
        success: false,
        error: "No active members in swarm",
        errorCode: ErrorCode.NO_ACTIVE_MEMBERS,
      });
      return;
    }

    // Update proposal status to approved if not already
    if (proposal.status === "PROPOSED") {
      await prisma.proposedAction.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
        },
      });
    }

    // Create transaction record
    const transaction = await prisma.transaction.create({
      data: {
        swarmId: proposal.swarmId,
        template: proposal.actionData as object,
        status: "PENDING",
      },
    });

    // Execute based on action type
    const actionData = proposal.actionData as { type: string; [key: string]: unknown };

    if (actionData.type === "swap") {
      // Execute swap
      const swapData = actionData as {
        type: "swap";
        sellToken: string;
        buyToken: string;
        sellPercentage: number;
        slippagePercentage: number;
      };

      // Get quotes for each member
      const walletAddresses = memberships.map(m => m.agentWalletAddress);
      const quotes = await getSwapQuotes(
        swapData.sellToken,
        swapData.buyToken,
        walletAddresses,
        swapData.sellPercentage,
        swapData.slippagePercentage
      );

      // Execute the swap
      executeSwapTransaction(
        transaction.id,
        proposal.swarm,
        memberships,
        quotes as SwapExecuteData[]
      ).catch((err) => {
        console.error(`[Proposals] Swap execution error for ${transaction.id}:`, err);
      });
    } else if (actionData.type === "transaction") {
      // Execute transaction template
      const txData = actionData as { type: "transaction"; template: unknown };

      executeSwarmTransaction(
        transaction.id,
        proposal.swarm,
        memberships,
        txData.template as never
      ).catch((err) => {
        console.error(`[Proposals] Transaction execution error for ${transaction.id}:`, err);
      });
    }

    // Update proposal with execution reference
    await prisma.proposedAction.update({
      where: { id },
      data: {
        status: "EXECUTED",
        executedAt: new Date(),
        executionTxId: transaction.id,
      },
    });

    console.log(`[Proposals] Executed proposal ${id} -> transaction ${transaction.id}`);

    res.json({
      success: true,
      data: {
        proposalId: proposal.id,
        transactionId: transaction.id,
        status: "EXECUTED",
        message: "Proposal execution started",
      },
    });
  } catch (error) {
    console.error("Failed to execute proposal:", error);
    res.status(500).json({
      success: false,
      error: "Failed to execute proposal",
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
  }
});

// POST /api/proposals/:id/cancel - Cancel a proposal (manager only)
router.post("/proposals/:id/cancel", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const proposal = await prisma.proposedAction.findUnique({
      where: { id },
      include: {
        swarm: {
          include: { managers: true },
        },
      },
    });

    if (!proposal) {
      res.status(404).json({
        success: false,
        error: "Proposal not found",
        errorCode: ErrorCode.PROPOSAL_NOT_FOUND,
      });
      return;
    }

    // Verify manager access
    const isManager = proposal.swarm.managers.some((m) => m.userId === userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Not a manager of this swarm",
        errorCode: ErrorCode.NOT_MANAGER,
      });
      return;
    }

    // Can only cancel PROPOSED or APPROVED proposals
    if (proposal.status !== "PROPOSED" && proposal.status !== "APPROVED") {
      res.status(400).json({
        success: false,
        error: `Cannot cancel proposal with status: ${proposal.status}`,
        errorCode: ErrorCode.VALIDATION_ERROR,
      });
      return;
    }

    // Update status to REJECTED
    await prisma.proposedAction.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    console.log(`[Proposals] Cancelled proposal ${id}`);

    res.json({
      success: true,
      data: {
        id: proposal.id,
        status: "REJECTED",
        message: "Proposal cancelled",
      },
    });
  } catch (error) {
    console.error("Failed to cancel proposal:", error);
    res.status(500).json({
      success: false,
      error: "Failed to cancel proposal",
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
  }
});

export const proposalsRouter: Router = router;

import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { MembershipStatus, Prisma } from "@prisma/client";
import { authMiddleware } from "../middleware/auth.js";
import {
  getSwapPreviewForWallets,
  getSwapExecuteDataForWallets,
  isNativeToken,
  getFeeConfig,
} from "../lib/zeroEx.js";
import { formatBps } from "@swarm-vault/shared";
import { getEthBalance, getTokenBalance, getWalletBalancesForDisplay } from "../lib/alchemy.js";
import { executeSwapTransaction } from "../lib/swapExecutor.js";
import { type Address } from "viem";
import { getTokensForChain } from "@swarm-vault/shared";
import { env } from "../lib/env.js";

const router = Router();

// Validation schemas
const SwapPreviewSchema = z.object({
  sellToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid sell token address"),
  buyToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid buy token address"),
  sellPercentage: z.number().min(1).max(100).optional().default(100),
  slippagePercentage: z.number().min(0.01).max(50).optional().default(1),
  membershipIds: z.array(z.string().uuid()).optional(),
});

const SwapExecuteSchema = z.object({
  sellToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid sell token address"),
  buyToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid buy token address"),
  sellPercentage: z.number().min(1).max(100).optional().default(100),
  slippagePercentage: z.number().min(0.01).max(50).optional().default(1),
  membershipIds: z.array(z.string().uuid()).optional(),
});

/**
 * @openapi
 * /api/swarms/{id}/swap/preview:
 *   post:
 *     tags: [Swaps]
 *     summary: Preview swap for all swarm members
 *     description: |
 *       Get a preview of what a swap would look like for all swarm members.
 *       Returns expected amounts for each member without executing the swap.
 *       **Manager only** - only swarm managers can preview swaps.
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
 *             required: [sellToken, buyToken]
 *             properties:
 *               sellToken:
 *                 type: string
 *                 pattern: "^0x[a-fA-F0-9]{40}$"
 *                 description: Token address to sell (use 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE for ETH)
 *                 example: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *               buyToken:
 *                 type: string
 *                 pattern: "^0x[a-fA-F0-9]{40}$"
 *                 description: Token address to buy
 *                 example: "0x4200000000000000000000000000000000000006"
 *               sellPercentage:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 100
 *                 description: Percentage of token balance to sell
 *               slippagePercentage:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 50
 *                 default: 1
 *                 description: Slippage tolerance percentage
 *     responses:
 *       200:
 *         description: Swap preview generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: "#/components/schemas/SwapPreview"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can preview swaps
 *       404:
 *         description: Swarm not found
 */
router.post("/:id/swap/preview", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate input
    const parseResult = SwapPreviewSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.errors[0].message,
      });
      return;
    }

    const { sellToken, buyToken, sellPercentage, slippagePercentage, membershipIds } = parseResult.data;

    // Build membership filter
    const membershipFilter: Prisma.SwarmMembershipWhereInput = { status: MembershipStatus.ACTIVE };
    if (membershipIds && membershipIds.length > 0) {
      membershipFilter.id = { in: membershipIds };
    }

    // Verify swarm exists and user is a manager
    const swarm = await prisma.swarm.findUnique({
      where: { id },
      include: {
        managers: true,
        memberships: {
          where: membershipFilter,
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
        error: "Only managers can preview swaps",
      });
      return;
    }

    if (swarm.memberships.length === 0) {
      res.json({
        success: true,
        data: {
          sellToken,
          buyToken,
          sellPercentage,
          slippagePercentage,
          members: [],
          totalSellAmount: "0",
          totalBuyAmount: "0",
        },
      });
      return;
    }

    // Get wallet addresses
    const walletAddresses = swarm.memberships.map(
      (m) => m.agentWalletAddress as Address
    );

    // Function to get sell amount for each wallet based on percentage
    const getAmount = async (walletAddress: Address): Promise<string> => {
      let balance: bigint;

      if (isNativeToken(sellToken as Address)) {
        balance = await getEthBalance(walletAddress);
      } else {
        balance = await getTokenBalance(walletAddress, sellToken as Address);
      }

      if (balance === 0n) return "0";

      // Apply percentage
      const amount = (balance * BigInt(sellPercentage)) / 100n;
      return amount.toString();
    };

    // Get previews for all wallets
    const previews = await getSwapPreviewForWallets(
      walletAddresses,
      sellToken as Address,
      buyToken as Address,
      getAmount,
      slippagePercentage / 100 // Convert to decimal
    );

    // Calculate totals
    const totalSellAmount = previews.reduce(
      (sum, p) => sum + BigInt(p.sellAmount),
      0n
    );
    const totalBuyAmount = previews.reduce(
      (sum, p) => sum + BigInt(p.buyAmount),
      0n
    );

    // Map previews to include user info
    const memberPreviews = previews.map((preview) => {
      const membership = swarm.memberships.find(
        (m) => m.agentWalletAddress.toLowerCase() === preview.walletAddress.toLowerCase()
      );
      return {
        membershipId: membership?.id,
        userId: membership?.user.id,
        userWalletAddress: membership?.user.walletAddress,
        agentWalletAddress: preview.walletAddress,
        sellAmount: preview.sellAmount,
        buyAmount: preview.buyAmount,
        feeAmount: preview.feeAmount,
        estimatedPriceImpact: preview.estimatedPriceImpact,
        sources: preview.sources,
        error: preview.error,
      };
    });

    // Calculate total fee amount
    const totalFeeAmount = previews.reduce(
      (sum, p) => sum + BigInt(p.feeAmount || "0"),
      0n
    );

    // Get fee config for response
    const feeConfig = getFeeConfig();

    res.json({
      success: true,
      data: {
        sellToken,
        buyToken,
        sellPercentage,
        slippagePercentage,
        members: memberPreviews,
        totalSellAmount: totalSellAmount.toString(),
        totalBuyAmount: totalBuyAmount.toString(),
        totalFeeAmount: totalFeeAmount.toString(),
        successCount: previews.filter((p) => !p.error).length,
        errorCount: previews.filter((p) => p.error).length,
        // Fee info for transparency
        fee: feeConfig ? {
          bps: feeConfig.bps,
          percentage: formatBps(feeConfig.bps),
          recipientAddress: feeConfig.recipientAddress,
        } : null,
      },
    });
  } catch (error) {
    console.error("Failed to get swap preview:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get swap preview",
    });
  }
});

/**
 * @openapi
 * /api/swarms/{id}/swap/execute:
 *   post:
 *     tags: [Swaps]
 *     summary: Execute swap for all swarm members
 *     description: |
 *       Execute a token swap for all active swarm members.
 *       The swap is executed asynchronously - poll the returned transaction ID for status updates.
 *       **Manager only** - only swarm managers can execute swaps.
 *
 *       A platform fee (default 0.5%) is deducted from the buy token amount.
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
 *             required: [sellToken, buyToken]
 *             properties:
 *               sellToken:
 *                 type: string
 *                 pattern: "^0x[a-fA-F0-9]{40}$"
 *                 description: Token address to sell
 *               buyToken:
 *                 type: string
 *                 pattern: "^0x[a-fA-F0-9]{40}$"
 *                 description: Token address to buy
 *               sellPercentage:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 100
 *               slippagePercentage:
 *                 type: number
 *                 minimum: 0.01
 *                 maximum: 50
 *                 default: 1
 *     responses:
 *       200:
 *         description: Swap execution started
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
 *                       description: Transaction ID for status polling
 *                     status:
 *                       type: string
 *                       enum: [PENDING]
 *                     memberCount:
 *                       type: integer
 *                     message:
 *                       type: string
 *                     fee:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         bps:
 *                           type: integer
 *                         percentage:
 *                           type: string
 *                         recipientAddress:
 *                           type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can execute swaps
 *       404:
 *         description: Swarm not found
 */
router.post("/:id/swap/execute", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validate input
    const parseResult = SwapExecuteSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.errors[0].message,
      });
      return;
    }

    const { sellToken, buyToken, sellPercentage, slippagePercentage, membershipIds } = parseResult.data;

    // Build membership filter
    const membershipFilter: Prisma.SwarmMembershipWhereInput = { status: MembershipStatus.ACTIVE };
    if (membershipIds && membershipIds.length > 0) {
      membershipFilter.id = { in: membershipIds };
    }

    // Verify swarm exists and user is a manager
    const swarm = await prisma.swarm.findUnique({
      where: { id },
      include: {
        managers: true,
        memberships: {
          where: membershipFilter,
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
        error: "Only managers can execute swaps",
      });
      return;
    }

    if (swarm.memberships.length === 0) {
      res.status(400).json({
        success: false,
        error: membershipIds ? "No matching active members found" : "No active members in swarm",
      });
      return;
    }

    // Get fee config for the transaction record
    const feeConfig = getFeeConfig();

    // Create a transaction record
    const transaction = await prisma.transaction.create({
      data: {
        swarmId: id,
        status: "PENDING",
        template: {
          type: "swap",
          sellToken,
          buyToken,
          sellPercentage,
          slippagePercentage,
          fee: feeConfig ? {
            bps: feeConfig.bps,
            recipientAddress: feeConfig.recipientAddress,
          } : null,
        },
      },
    });

    // Get wallet addresses
    const walletAddresses = swarm.memberships.map(
      (m) => m.agentWalletAddress as Address
    );

    // Function to get sell amount for each wallet
    const getAmount = async (walletAddress: Address): Promise<string> => {
      let balance: bigint;

      if (isNativeToken(sellToken as Address)) {
        balance = await getEthBalance(walletAddress);
      } else {
        balance = await getTokenBalance(walletAddress, sellToken as Address);
      }

      if (balance === 0n) return "0";

      const amount = (balance * BigInt(sellPercentage)) / 100n;
      return amount.toString();
    };

    // Get execution data for all wallets
    const executeData = await getSwapExecuteDataForWallets(
      walletAddresses,
      sellToken as Address,
      buyToken as Address,
      getAmount,
      slippagePercentage / 100
    );

    // Start async execution - cast memberships to satisfy type requirements
    // The executor only needs id, walletAddress from user, which we have
    executeSwapTransaction(
      transaction.id,
      swarm,
      swarm.memberships as any,
      executeData
    ).catch((error) => {
      console.error(`[Swap] Background execution failed for ${transaction.id}:`, error);
    });

    res.json({
      success: true,
      data: {
        transactionId: transaction.id,
        status: "PENDING",
        memberCount: swarm.memberships.length,
        message: "Swap execution started. Poll transaction status for updates.",
        // Include fee info for transparency
        fee: feeConfig ? {
          bps: feeConfig.bps,
          percentage: formatBps(feeConfig.bps),
          recipientAddress: feeConfig.recipientAddress,
        } : null,
      },
    });
  } catch (error) {
    console.error("Failed to execute swap:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to execute swap",
    });
  }
});

/**
 * @openapi
 * /api/swarms/{id}/holdings:
 *   get:
 *     tags: [Swaps]
 *     summary: Get aggregate swarm holdings
 *     description: |
 *       Get aggregate token holdings across all swarm members.
 *       Returns total ETH and token balances with holder counts.
 *       **Manager only** - only swarm managers can view holdings.
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
 *         description: Holdings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: "#/components/schemas/Holdings"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can view holdings
 *       404:
 *         description: Swarm not found
 */
router.get("/:id/holdings", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verify swarm exists and user is a manager
    const swarm = await prisma.swarm.findUnique({
      where: { id },
      include: {
        managers: true,
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
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

    const isManager = swarm.managers.some((m) => m.userId === req.user!.userId);
    if (!isManager) {
      res.status(403).json({
        success: false,
        error: "Only managers can view holdings",
      });
      return;
    }

    if (swarm.memberships.length === 0) {
      res.json({
        success: true,
        data: {
          ethBalance: "0",
          tokens: [],
          memberCount: 0,
        },
      });
      return;
    }

    // Aggregate balances across all members
    interface TokenAggregate {
      address: string;
      symbol: string;
      name: string;
      decimals: number;
      logoUrl?: string;
      totalBalance: bigint;
      holderCount: number;
    }

    const tokenAggregates = new Map<string, TokenAggregate>();
    let totalEthBalance = 0n;

    for (const membership of swarm.memberships) {
      const balances = await getWalletBalancesForDisplay(
        membership.agentWalletAddress as Address,
        false
      );

      totalEthBalance += BigInt(balances.ethBalance);

      for (const token of balances.tokens) {
        const key = token.address.toLowerCase();
        const existing = tokenAggregates.get(key);

        if (existing) {
          existing.totalBalance += BigInt(token.balance);
          existing.holderCount += 1;
        } else {
          tokenAggregates.set(key, {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            logoUrl: token.logoUrl,
            totalBalance: BigInt(token.balance),
            holderCount: 1,
          });
        }
      }
    }

    // Convert to response format
    const tokens = Array.from(tokenAggregates.values())
      .map((t) => ({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoUrl: t.logoUrl,
        totalBalance: t.totalBalance.toString(),
        holderCount: t.holderCount,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    res.json({
      success: true,
      data: {
        ethBalance: totalEthBalance.toString(),
        tokens,
        memberCount: swarm.memberships.length,
        commonTokens: getTokensForChain(env.CHAIN_ID),
      },
    });
  } catch (error) {
    console.error("Failed to get holdings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get holdings",
    });
  }
});

export const swapRouter: Router = router;

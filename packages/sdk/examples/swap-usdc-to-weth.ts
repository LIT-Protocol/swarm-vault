/**
 * Example: Swap 50% of all users' USDC to WETH
 *
 * This script demonstrates how to use the Swarm Vault SDK to execute a swap
 * across all members of a swarm.
 *
 * Prerequisites:
 * 1. Get your API key from the Swarm Vault settings page
 * 2. Set the SWARMVAULT_API_KEY environment variable
 * 3. Know your swarm ID (or use the script to find it)
 *
 * Usage:
 *   npx tsx examples/swap-usdc-to-weth.ts [swarm-id]
 *
 * Or with environment variable for swarm ID:
 *   SWARM_ID=xxx npx tsx examples/swap-usdc-to-weth.ts
 */

import * as readline from "readline";
import {
  SwarmVaultClient,
  BASE_MAINNET_TOKENS,
  SwarmVaultError,
} from "../src/index.js";

// Helper to prompt user for confirmation
function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// Configuration
const API_KEY = process.env.SWARMVAULT_API_KEY;
const SWARM_ID = process.argv[2] || process.env.SWARM_ID;
const API_BASE_URL =
  process.env.SWARMVAULT_API_URL || "https://api.swarmvault.xyz";

// For testnet, use BASE_SEPOLIA_TOKENS instead
const SELL_TOKEN = BASE_MAINNET_TOKENS.USDC;
const BUY_TOKEN = BASE_MAINNET_TOKENS.WETH;
const SELL_PERCENTAGE = 50; // Swap 50% of USDC balance
const SLIPPAGE_PERCENTAGE = 1; // 1% slippage tolerance

async function main() {
  // Validate configuration
  if (!API_KEY) {
    console.error("Error: SWARMVAULT_API_KEY environment variable is required");
    console.error("Get your API key from the Swarm Vault settings page");
    process.exit(1);
  }

  // Initialize the client
  const client = new SwarmVaultClient({
    baseUrl: API_BASE_URL,
    apiKey: API_KEY,
  });

  try {
    // Verify authentication
    console.log("Authenticating...");
    const me = await client.getMe();
    console.log(`Authenticated as: ${me.walletAddress}`);
    if (me.twitterUsername) {
      console.log(`Twitter: @${me.twitterUsername}`);
    }
    console.log();

    // Get swarm ID if not provided
    let swarmId = SWARM_ID;
    if (!swarmId) {
      console.log("No swarm ID provided. Listing your swarms...\n");
      const swarms = await client.listSwarms();
      const managedSwarms = swarms.filter((s) => s.isManager);

      if (managedSwarms.length === 0) {
        console.error("You don't manage any swarms.");
        process.exit(1);
      }

      console.log("Your swarms:");
      managedSwarms.forEach((s, i) => {
        console.log(
          `  ${i + 1}. ${s.name} (${s.id}) - ${s.memberCount} members`
        );
      });
      console.log();

      // Use the first managed swarm
      swarmId = managedSwarms[0].id;
      console.log(`Using swarm: ${managedSwarms[0].name}\n`);
    }

    // Get swarm details
    const swarm = await client.getSwarm(swarmId);
    console.log(`Swarm: ${swarm.name}`);
    console.log(`Description: ${swarm.description}`);
    console.log();

    // Get current holdings
    console.log("Fetching swarm holdings...");
    const holdings = await client.getSwarmHoldings(swarmId);
    console.log(`Members: ${holdings.memberCount}`);
    console.log(`Total ETH: ${formatWei(holdings.ethBalance, 18)} ETH`);

    // Find USDC in holdings
    const usdcHolding = holdings.tokens.find(
      (t) => t.address.toLowerCase() === SELL_TOKEN.toLowerCase()
    );

    if (!usdcHolding || BigInt(usdcHolding.totalBalance) === 0n) {
      console.log("\nNo USDC holdings found in this swarm.");
      console.log("Available tokens:");
      holdings.tokens.forEach((t) => {
        console.log(
          `  - ${t.symbol}: ${formatWei(t.totalBalance, t.decimals)} (${
            t.holderCount
          } holders)`
        );
      });
      process.exit(0);
    }

    console.log(
      `Total USDC: ${formatWei(usdcHolding.totalBalance, 6)} USDC (${
        usdcHolding.holderCount
      } holders)`
    );
    console.log();

    // Preview the swap
    console.log(`Previewing swap: ${SELL_PERCENTAGE}% USDC → WETH`);
    console.log(`Slippage tolerance: ${SLIPPAGE_PERCENTAGE}%`);
    console.log();

    const preview = await client.previewSwap(swarmId, {
      sellToken: SELL_TOKEN,
      buyToken: BUY_TOKEN,
      sellPercentage: SELL_PERCENTAGE,
      slippagePercentage: SLIPPAGE_PERCENTAGE,
    });

    console.log("Swap Preview:");
    console.log(`  Total sell: ${formatWei(preview.totalSellAmount, 6)} USDC`);
    console.log(
      `  Expected buy: ${formatWei(preview.totalBuyAmount, 18)} WETH`
    );
    if (preview.fee) {
      console.log(
        `  Platform fee: ${preview.fee.percentage} (${formatWei(
          preview.totalFeeAmount || "0",
          18
        )} WETH)`
      );
    }
    console.log(`  Success: ${preview.successCount} members`);
    if (preview.errorCount > 0) {
      console.log(`  Errors: ${preview.errorCount} members`);
    }
    console.log();

    // Show per-member breakdown
    console.log("Per-member breakdown:");
    for (const member of preview.members) {
      if (member.error) {
        console.log(
          `  ${truncateAddress(member.agentWalletAddress)}: Error - ${
            member.error
          }`
        );
      } else if (BigInt(member.sellAmount) === 0n) {
        console.log(
          `  ${truncateAddress(member.agentWalletAddress)}: No USDC balance`
        );
      } else {
        console.log(
          `  ${truncateAddress(member.agentWalletAddress)}: ${formatWei(
            member.sellAmount,
            6
          )} USDC → ${formatWei(member.buyAmount, 18)} WETH`
        );
      }
    }
    console.log();

    // Ask for confirmation
    const shouldExecute = await confirm(
      "Do you want to execute this swap? (y/n): "
    );
    if (!shouldExecute) {
      console.log("Swap cancelled.");
      process.exit(0);
    }

    console.log("\nExecuting swap...");
    const result = await client.executeSwap(swarmId, {
      sellToken: SELL_TOKEN,
      buyToken: BUY_TOKEN,
      sellPercentage: SELL_PERCENTAGE,
      slippagePercentage: SLIPPAGE_PERCENTAGE,
    });

    console.log(`Transaction started: ${result.transactionId}`);
    console.log(`Members: ${result.memberCount}`);
    if (result.fee) {
      console.log(`Fee: ${result.fee.percentage}`);
    }
    console.log();

    // Wait for completion with progress updates
    console.log("Waiting for transaction to complete...");
    const transaction = await client.waitForTransaction(result.transactionId, {
      timeoutMs: 300000, // 5 minutes
      pollIntervalMs: 3000, // 3 seconds
      onPoll: (tx) => {
        const targets = tx.targets || [];
        const confirmed = targets.filter(
          (t) => t.status === "CONFIRMED"
        ).length;
        const failed = targets.filter((t) => t.status === "FAILED").length;
        const pending = targets.filter(
          (t) => t.status === "PENDING" || t.status === "SUBMITTED"
        ).length;
        console.log(
          `  Status: ${tx.status} | Confirmed: ${confirmed} | Failed: ${failed} | Pending: ${pending}`
        );
      },
    });

    console.log();
    console.log(`Transaction ${transaction.status}!`);

    // Show results
    if (transaction.targets) {
      const confirmed = transaction.targets.filter(
        (t) => t.status === "CONFIRMED"
      );
      const failed = transaction.targets.filter((t) => t.status === "FAILED");

      console.log(`  Confirmed: ${confirmed.length}`);
      console.log(`  Failed: ${failed.length}`);

      if (failed.length > 0) {
        console.log("\nFailed transactions:");
        for (const target of failed) {
          console.log(
            `  ${target.membership?.agentWalletAddress}: ${target.error}`
          );
        }
      }

      if (confirmed.length > 0) {
        console.log("\nSuccessful transactions:");
        for (const target of confirmed) {
          console.log(
            `  ${truncateAddress(
              target.membership?.agentWalletAddress || ""
            )}: ${target.txHash}`
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof SwarmVaultError) {
      console.error(`Error: ${error.message}`);
      if (error.errorCode) {
        console.error(`Error code: ${error.errorCode}`);
      }
      if (error.details) {
        console.error("Details:", JSON.stringify(error.details, null, 2));
      }
    } else {
      throw error;
    }
    process.exit(1);
  }
}

// Helper functions
function formatWei(wei: string, decimals: number): string {
  const value = BigInt(wei);
  const divisor = BigInt(10 ** decimals);
  const intPart = value / divisor;
  const fracPart = value % divisor;

  if (fracPart === 0n) {
    return intPart.toString();
  }

  const fracStr = fracPart.toString().padStart(decimals, "0");
  // Trim trailing zeros but keep at least 2 decimal places for readability
  const trimmed = fracStr.replace(/0+$/, "").padEnd(2, "0").slice(0, 6);
  return `${intPart}.${trimmed}`;
}

function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Run
main();

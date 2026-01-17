/**
 * Example: Check holdings across all managed swarms
 *
 * This script demonstrates how to use the Swarm Vault SDK to view
 * token holdings across all swarms you manage.
 *
 * Prerequisites:
 * 1. Get your API key from the Swarm Vault settings page
 * 2. Set the SWARMVAULT_API_KEY environment variable
 *
 * Usage:
 *   npx tsx examples/check-holdings.ts
 */

import { SwarmVaultClient, SwarmVaultError } from "../src/index.js";

// Configuration
const API_KEY = process.env.SWARMVAULT_API_KEY;
const API_BASE_URL = process.env.SWARMVAULT_API_URL || "https://api.swarmvault.xyz";

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

    // List all swarms
    console.log("Fetching swarms...\n");
    const swarms = await client.listSwarms();
    const managedSwarms = swarms.filter((s) => s.isManager);

    if (managedSwarms.length === 0) {
      console.log("You don't manage any swarms.");
      process.exit(0);
    }

    console.log(`You manage ${managedSwarms.length} swarm(s):\n`);

    // Get holdings for each swarm
    for (const swarm of managedSwarms) {
      console.log("═".repeat(60));
      console.log(`Swarm: ${swarm.name}`);
      console.log(`ID: ${swarm.id}`);
      console.log(`Description: ${swarm.description}`);
      console.log("-".repeat(60));

      const holdings = await client.getSwarmHoldings(swarm.id);

      console.log(`Members: ${holdings.memberCount}`);
      console.log();

      // ETH balance
      const ethBalance = formatWei(holdings.ethBalance, 18);
      console.log(`ETH Balance: ${ethBalance} ETH`);
      console.log();

      // Token balances
      if (holdings.tokens.length > 0) {
        console.log("Token Holdings:");
        console.log("  " + "-".repeat(56));
        console.log(
          "  " +
            padEnd("Token", 10) +
            padEnd("Balance", 20) +
            padEnd("Holders", 10) +
            "Address"
        );
        console.log("  " + "-".repeat(56));

        for (const token of holdings.tokens) {
          const balance = formatWei(token.totalBalance, token.decimals);
          console.log(
            "  " +
              padEnd(token.symbol, 10) +
              padEnd(balance, 20) +
              padEnd(token.holderCount.toString(), 10) +
              truncateAddress(token.address)
          );
        }
      } else {
        console.log("No token holdings.");
      }

      console.log();
    }

    // Summary
    console.log("═".repeat(60));
    console.log("SUMMARY");
    console.log("-".repeat(60));

    let totalMembers = 0;
    const aggregatedTokens = new Map<string, { symbol: string; balance: bigint; decimals: number }>();
    let totalEth = 0n;

    for (const swarm of managedSwarms) {
      const holdings = await client.getSwarmHoldings(swarm.id);
      totalMembers += holdings.memberCount;
      totalEth += BigInt(holdings.ethBalance);

      for (const token of holdings.tokens) {
        const key = token.address.toLowerCase();
        const existing = aggregatedTokens.get(key);
        if (existing) {
          existing.balance += BigInt(token.totalBalance);
        } else {
          aggregatedTokens.set(key, {
            symbol: token.symbol,
            balance: BigInt(token.totalBalance),
            decimals: token.decimals,
          });
        }
      }
    }

    console.log(`Total Swarms: ${managedSwarms.length}`);
    console.log(`Total Members: ${totalMembers}`);
    console.log(`Total ETH: ${formatWei(totalEth.toString(), 18)} ETH`);

    if (aggregatedTokens.size > 0) {
      console.log("\nTotal Token Holdings:");
      for (const [, token] of aggregatedTokens) {
        console.log(`  ${token.symbol}: ${formatWei(token.balance.toString(), token.decimals)}`);
      }
    }

    console.log();

  } catch (error) {
    if (error instanceof SwarmVaultError) {
      console.error(`Error: ${error.message}`);
      if (error.errorCode) {
        console.error(`Error code: ${error.errorCode}`);
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
  const trimmed = fracStr.replace(/0+$/, "").padEnd(2, "0").slice(0, 6);
  return `${intPart}.${trimmed}`;
}

function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function padEnd(str: string, length: number): string {
  return str.padEnd(length);
}

// Run
main();

#!/usr/bin/env node

// ../../packages/sdk/dist/index.js
var SwarmVaultError = class extends Error {
  errorCode;
  statusCode;
  details;
  constructor(message, options) {
    super(message);
    this.name = "SwarmVaultError";
    this.errorCode = options?.errorCode;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
  }
};
var NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
var BASE_MAINNET_TOKENS = {
  ETH: NATIVE_ETH_ADDRESS,
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA",
  cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22"
};
var DEFAULT_BASE_URL = "https://api.swarmvault.xyz";
var DEFAULT_TIMEOUT_MS = 3e5;
var DEFAULT_POLL_INTERVAL_MS = 3e3;
var SwarmVaultClient = class {
  baseUrl;
  apiKey;
  jwt;
  fetchFn;
  /**
   * Create a new Swarm Vault client.
   *
   * @param options - Client configuration options
   * @param options.baseUrl - Base URL of the API (default: https://api.swarmvault.xyz)
   * @param options.apiKey - API key for authentication (recommended)
   * @param options.jwt - JWT token for authentication (alternative to API key)
   */
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.jwt = options.jwt;
    this.fetchFn = options.fetch || globalThis.fetch;
    if (!this.fetchFn) {
      throw new SwarmVaultError(
        "fetch is not available. Please provide a fetch implementation or use Node.js 18+."
      );
    }
  }
  // ===========================================================================
  // Authentication
  // ===========================================================================
  /**
   * Set the API key for authentication.
   * API keys start with 'svk_' and can be generated in the Swarm Vault settings.
   *
   * @param apiKey - The API key
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.jwt = void 0;
  }
  /**
   * Set the JWT token for authentication.
   * JWTs are obtained through the SIWE login flow.
   *
   * @param jwt - The JWT token
   */
  setJwt(jwt) {
    this.jwt = jwt;
    this.apiKey = void 0;
  }
  /**
   * Get the currently authenticated user.
   *
   * @returns The authenticated user
   * @throws {SwarmVaultError} If not authenticated or request fails
   */
  async getMe() {
    return this.request("GET", "/api/auth/me");
  }
  // ===========================================================================
  // Swarms
  // ===========================================================================
  /**
   * List all swarms. Returns public swarms for unauthenticated requests,
   * or includes management status for authenticated requests.
   *
   * @returns Array of swarms
   */
  async listSwarms() {
    return this.request("GET", "/api/swarms");
  }
  /**
   * Get details of a specific swarm.
   *
   * @param swarmId - The swarm ID
   * @returns Swarm details
   * @throws {SwarmVaultError} If swarm not found
   */
  async getSwarm(swarmId) {
    return this.request("GET", `/api/swarms/${swarmId}`);
  }
  /**
   * Get members of a swarm.
   * **Manager only** - requires authentication as a swarm manager.
   *
   * @param swarmId - The swarm ID
   * @returns Array of swarm members
   * @throws {SwarmVaultError} If not authorized or swarm not found
   */
  async getSwarmMembers(swarmId) {
    return this.request("GET", `/api/swarms/${swarmId}/members`);
  }
  /**
   * Get aggregate token holdings across all swarm members.
   * **Manager only** - requires authentication as a swarm manager.
   *
   * @param swarmId - The swarm ID
   * @param options - Optional settings
   * @param options.includeMembers - Include per-member balances in the response
   * @returns Aggregated holdings with ETH balance, token balances, and common tokens
   * @throws {SwarmVaultError} If not authorized or swarm not found
   */
  async getSwarmHoldings(swarmId, options) {
    const queryParams = options?.includeMembers ? "?includeMembers=true" : "";
    return this.request("GET", `/api/swarms/${swarmId}/holdings${queryParams}`);
  }
  // ===========================================================================
  // Swaps
  // ===========================================================================
  /**
   * Preview a swap for all swarm members without executing it.
   * **Manager only** - requires authentication as a swarm manager.
   *
   * Use this to see expected amounts before executing a swap.
   *
   * @param swarmId - The swarm ID
   * @param params - Swap parameters
   * @param params.sellToken - Token address to sell (use NATIVE_ETH_ADDRESS for ETH)
   * @param params.buyToken - Token address to buy
   * @param params.sellPercentage - Percentage of balance to sell (1-100, default 100)
   * @param params.slippagePercentage - Slippage tolerance (default 1%)
   * @returns Preview with per-member amounts and totals
   *
   * @example
   * ```typescript
   * const preview = await client.previewSwap('swarm-id', {
   *   sellToken: BASE_MAINNET_TOKENS.USDC,
   *   buyToken: BASE_MAINNET_TOKENS.WETH,
   *   sellPercentage: 50,
   *   slippagePercentage: 1,
   * });
   *
   * console.log(`Total sell: ${preview.totalSellAmount}`);
   * console.log(`Expected buy: ${preview.totalBuyAmount}`);
   * console.log(`Success: ${preview.successCount}, Errors: ${preview.errorCount}`);
   * ```
   */
  async previewSwap(swarmId, params) {
    return this.request("POST", `/api/swarms/${swarmId}/swap/preview`, {
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellPercentage: params.sellPercentage ?? 100,
      slippagePercentage: params.slippagePercentage ?? 1,
      ...params.membershipIds && { membershipIds: params.membershipIds }
    });
  }
  /**
   * Execute a swap for all swarm members.
   * **Manager only** - requires authentication as a swarm manager.
   *
   * The swap is executed asynchronously. Use `waitForTransaction` to wait for completion.
   *
   * A platform fee (default 0.5%) is deducted from the buy token amount.
   *
   * @param swarmId - The swarm ID
   * @param params - Swap parameters
   * @param params.sellToken - Token address to sell
   * @param params.buyToken - Token address to buy
   * @param params.sellPercentage - Percentage of balance to sell (1-100, default 100)
   * @param params.slippagePercentage - Slippage tolerance (default 1%)
   * @returns Transaction ID and status
   *
   * @example
   * ```typescript
   * // Execute swap
   * const result = await client.executeSwap('swarm-id', {
   *   sellToken: BASE_MAINNET_TOKENS.USDC,
   *   buyToken: BASE_MAINNET_TOKENS.WETH,
   *   sellPercentage: 50,
   * });
   *
   * console.log(`Transaction started: ${result.transactionId}`);
   *
   * // Wait for completion
   * const tx = await client.waitForTransaction(result.transactionId, {
   *   onPoll: (t) => console.log(`Status: ${t.status}`),
   * });
   *
   * console.log(`Transaction ${tx.status}`);
   * ```
   */
  async executeSwap(swarmId, params) {
    return this.request("POST", `/api/swarms/${swarmId}/swap/execute`, {
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellPercentage: params.sellPercentage ?? 100,
      slippagePercentage: params.slippagePercentage ?? 1,
      ...params.membershipIds && { membershipIds: params.membershipIds }
    });
  }
  // ===========================================================================
  // Transactions
  // ===========================================================================
  /**
   * Execute a raw transaction template for all swarm members.
   * **Manager only** - requires authentication as a swarm manager.
   *
   * This is an advanced method for custom transactions. For swaps, prefer `executeSwap`.
   *
   * @param swarmId - The swarm ID
   * @param template - Transaction template (ABI mode or raw calldata mode)
   * @returns Transaction ID and status
   *
   * @example
   * ```typescript
   * // ABI mode example - transfer tokens
   * const result = await client.executeTransaction('swarm-id', {
   *   mode: 'abi',
   *   contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
   *   abi: [{
   *     name: 'transfer',
   *     type: 'function',
   *     inputs: [
   *       { name: 'to', type: 'address' },
   *       { name: 'amount', type: 'uint256' },
   *     ],
   *     outputs: [{ type: 'bool' }],
   *   }],
   *   functionName: 'transfer',
   *   args: ['0xRecipient', '{{percentage:tokenBalance:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913:50}}'],
   *   value: '0',
   * });
   * ```
   */
  async executeTransaction(swarmId, templateOrParams) {
    const body = "template" in templateOrParams ? templateOrParams : { template: templateOrParams };
    return this.request(
      "POST",
      `/api/swarms/${swarmId}/transactions`,
      body
    );
  }
  /**
   * List transactions for a swarm.
   *
   * @param swarmId - The swarm ID
   * @returns Array of transactions
   */
  async listTransactions(swarmId) {
    return this.request("GET", `/api/swarms/${swarmId}/transactions`);
  }
  /**
   * Get details of a specific transaction, including per-member status.
   *
   * @param transactionId - The transaction ID
   * @returns Transaction details with targets
   */
  async getTransaction(transactionId) {
    return this.request("GET", `/api/transactions/${transactionId}`);
  }
  /**
   * Wait for a transaction to complete.
   *
   * Polls the transaction status until it reaches COMPLETED or FAILED,
   * or until the timeout is reached.
   *
   * @param transactionId - The transaction ID
   * @param options - Wait options
   * @param options.timeoutMs - Maximum wait time (default 5 minutes)
   * @param options.pollIntervalMs - Polling interval (default 3 seconds)
   * @param options.onPoll - Callback called on each poll
   * @returns The completed transaction
   * @throws {SwarmVaultError} If timeout is reached or transaction fails
   *
   * @example
   * ```typescript
   * const tx = await client.waitForTransaction(transactionId, {
   *   timeoutMs: 60000, // 1 minute
   *   pollIntervalMs: 2000, // 2 seconds
   *   onPoll: (t) => {
   *     const confirmed = t.targets?.filter(t => t.status === 'CONFIRMED').length ?? 0;
   *     const total = t.targets?.length ?? 0;
   *     console.log(`Progress: ${confirmed}/${total}`);
   *   },
   * });
   * ```
   */
  async waitForTransaction(transactionId, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const startTime = Date.now();
    while (true) {
      const transaction = await this.getTransaction(transactionId);
      if (options.onPoll) {
        options.onPoll(transaction);
      }
      if (transaction.status === "COMPLETED") {
        return transaction;
      }
      if (transaction.status === "FAILED") {
        throw new SwarmVaultError(`Transaction failed: ${transactionId}`, {
          errorCode: "TX_FAILED",
          details: transaction.targets?.filter((t) => t.error)
        });
      }
      if (Date.now() - startTime > timeoutMs) {
        throw new SwarmVaultError(
          `Transaction timeout: ${transactionId} did not complete within ${timeoutMs}ms`,
          {
            errorCode: "TX_TIMEOUT",
            details: { lastStatus: transaction.status }
          }
        );
      }
      await this.sleep(pollIntervalMs);
    }
  }
  // ===========================================================================
  // Private Methods
  // ===========================================================================
  async request(method, path, body) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    } else if (this.jwt) {
      headers["Authorization"] = `Bearer ${this.jwt}`;
    }
    const response = await this.fetchFn(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : void 0
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new SwarmVaultError(data.error || `Request failed with status ${response.status}`, {
        errorCode: data.errorCode,
        statusCode: response.status,
        details: data.details
      });
    }
    return data.data;
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/preview-swap.ts
var TOKEN_MAP = {
  ETH: NATIVE_ETH_ADDRESS,
  WETH: BASE_MAINNET_TOKENS.WETH,
  USDC: BASE_MAINNET_TOKENS.USDC,
  DAI: BASE_MAINNET_TOKENS.DAI,
  USDC_BRIDGED: BASE_MAINNET_TOKENS.USDbC,
  USDBC: BASE_MAINNET_TOKENS.USDbC,
  CBETH: BASE_MAINNET_TOKENS.cbETH
};
function resolveToken(input) {
  const upper = input.toUpperCase();
  if (TOKEN_MAP[upper]) {
    return TOKEN_MAP[upper];
  }
  if (input.startsWith("0x") && input.length === 42) {
    return input;
  }
  throw new Error(
    `Unknown token: ${input}. Use an address or symbol (ETH, WETH, USDC, DAI, USDbC, cbETH)`
  );
}
function parseArgs() {
  const args = process.argv.slice(2);
  let membershipIds;
  const membersIndex = args.findIndex((a) => a === "--members");
  if (membersIndex !== -1 && args[membersIndex + 1]) {
    membershipIds = args[membersIndex + 1].split(",").map((id) => id.trim());
    args.splice(membersIndex, 2);
  }
  const [swarmId, sellTokenInput, buyTokenInput, sellPctStr, slippageStr] = args;
  return { swarmId, sellTokenInput, buyTokenInput, sellPctStr, slippageStr, membershipIds };
}
async function main() {
  const apiKey = process.env.SWARM_VAULT_API_KEY;
  const apiUrl = process.env.SWARM_VAULT_API_URL;
  if (!apiKey) {
    console.error("Error: SWARM_VAULT_API_KEY environment variable is required");
    console.error("Get your API key from https://swarmvault.xyz/settings");
    process.exit(1);
  }
  const { swarmId, sellTokenInput, buyTokenInput, sellPctStr, slippageStr, membershipIds } = parseArgs();
  if (!swarmId || !sellTokenInput || !buyTokenInput) {
    console.error(
      "Usage: pnpm preview-swap <swarmId> <sellToken> <buyToken> [sellPercentage] [slippagePercentage] [--members id1,id2,...]"
    );
    console.error("");
    console.error("Example: pnpm preview-swap abc-123 USDC WETH 50 1");
    console.error("Example: pnpm preview-swap abc-123 USDC WETH 50 1 --members member-id-1,member-id-2");
    console.error("");
    console.error("Token symbols: ETH, WETH, USDC, DAI, USDbC, cbETH");
    console.error("Or use full token addresses (0x...)");
    process.exit(1);
  }
  const sellToken = resolveToken(sellTokenInput);
  const buyToken = resolveToken(buyTokenInput);
  const sellPercentage = sellPctStr ? parseInt(sellPctStr, 10) : 100;
  const slippagePercentage = slippageStr ? parseFloat(slippageStr) : 1;
  if (sellPercentage < 1 || sellPercentage > 100) {
    console.error("Error: sellPercentage must be between 1 and 100");
    process.exit(1);
  }
  const client = new SwarmVaultClient({
    apiKey,
    baseUrl: apiUrl
  });
  try {
    console.log("Preview Swap");
    console.log("============");
    console.log(`Swarm: ${swarmId}`);
    console.log(`Sell: ${sellTokenInput} (${sellToken})`);
    console.log(`Buy: ${buyTokenInput} (${buyToken})`);
    console.log(`Sell Percentage: ${sellPercentage}%`);
    console.log(`Slippage: ${slippagePercentage}%`);
    if (membershipIds) {
      console.log(`Members: ${membershipIds.length} specified`);
    } else {
      console.log(`Members: All active members`);
    }
    console.log("");
    console.log("Fetching preview...\n");
    const preview = await client.previewSwap(swarmId, {
      sellToken,
      buyToken,
      sellPercentage,
      slippagePercentage,
      membershipIds
    });
    console.log("Results:");
    console.log(`  Total Sell Amount: ${preview.totalSellAmount}`);
    console.log(`  Total Buy Amount: ${preview.totalBuyAmount}`);
    if (preview.totalFeeAmount) {
      console.log(`  Total Fee Amount: ${preview.totalFeeAmount}`);
    }
    console.log(`  Successful: ${preview.successCount}`);
    console.log(`  Errors: ${preview.errorCount}`);
    console.log("");
    if (preview.fee) {
      console.log(`Platform Fee: ${preview.fee.percentage}`);
      console.log(`Fee Recipient: ${preview.fee.recipientAddress}`);
      console.log("");
    }
    console.log("Per-Member Breakdown:");
    console.log("-".repeat(80));
    for (const member of preview.members) {
      if (member.error) {
        console.log(`  ${truncateAddress(member.agentWalletAddress)}: ERROR - ${member.error}`);
      } else {
        console.log(
          `  ${truncateAddress(member.agentWalletAddress)}: ${member.sellAmount} -> ${member.buyAmount}`
        );
        if (member.feeAmount) {
          console.log(`    Fee: ${member.feeAmount}`);
        }
        if (member.estimatedPriceImpact) {
          console.log(`    Price Impact: ${member.estimatedPriceImpact}%`);
        }
      }
    }
    console.log("");
    console.log("--- JSON Output ---");
    console.log(JSON.stringify(preview, null, 2));
    if (preview.errorCount === 0) {
      console.log("\n\u2713 Preview looks good! Run execute-swap to proceed.");
    } else {
      console.log(
        `
\u26A0 ${preview.errorCount} member(s) will fail. Review errors above.`
      );
    }
  } catch (error) {
    if (error instanceof SwarmVaultError) {
      console.error(`Error [${error.errorCode || "UNKNOWN"}]: ${error.message}`);
      if (error.details) {
        console.error("Details:", JSON.stringify(error.details, null, 2));
      }
    } else {
      console.error("Error:", error);
    }
    process.exit(1);
  }
}
function truncateAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
main();

/**
 * Swarm Vault SDK Client
 *
 * A TypeScript client for the Swarm Vault API, enabling managers to execute
 * swaps and transactions on behalf of their swarm members.
 *
 * @example
 * ```typescript
 * import { SwarmVaultClient } from '@swarmvault/sdk';
 *
 * const client = new SwarmVaultClient({
 *   apiKey: 'svk_your_api_key_here',
 * });
 *
 * // Get swarm holdings
 * const holdings = await client.getSwarmHoldings('swarm-id');
 *
 * // Execute a swap
 * const result = await client.executeSwap('swarm-id', {
 *   sellToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
 *   buyToken: '0x4200000000000000000000000000000000000006',   // WETH
 *   sellPercentage: 50,
 * });
 *
 * // Wait for completion
 * const tx = await client.waitForTransaction(result.transactionId);
 * ```
 */

import type {
  ApiResponse,
  Swarm,
  SwarmMember,
  SwarmHoldings,
  SwapPreviewParams,
  SwapPreviewResult,
  SwapExecuteParams,
  SwapExecuteResult,
  Transaction,
  TransactionTemplate,
  User,
  SwarmVaultClientOptions,
  WaitForTransactionOptions,
} from "./types.js";
import { SwarmVaultError } from "./types.js";

const DEFAULT_BASE_URL = "https://api.swarmvault.xyz";
const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
const DEFAULT_POLL_INTERVAL_MS = 3000; // 3 seconds

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class SwarmVaultClient {
  private baseUrl: string;
  private apiKey?: string;
  private jwt?: string;
  private fetchFn: FetchFn;

  /**
   * Create a new Swarm Vault client.
   *
   * @param options - Client configuration options
   * @param options.baseUrl - Base URL of the API (default: https://api.swarmvault.xyz)
   * @param options.apiKey - API key for authentication (recommended)
   * @param options.jwt - JWT token for authentication (alternative to API key)
   */
  constructor(options: SwarmVaultClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.jwt = options.jwt;
    this.fetchFn = options.fetch || (globalThis.fetch as FetchFn);

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
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.jwt = undefined;
  }

  /**
   * Set the JWT token for authentication.
   * JWTs are obtained through the SIWE login flow.
   *
   * @param jwt - The JWT token
   */
  setJwt(jwt: string): void {
    this.jwt = jwt;
    this.apiKey = undefined;
  }

  /**
   * Get the currently authenticated user.
   *
   * @returns The authenticated user
   * @throws {SwarmVaultError} If not authenticated or request fails
   */
  async getMe(): Promise<User> {
    return this.request<User>("GET", "/api/auth/me");
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
  async listSwarms(): Promise<Swarm[]> {
    return this.request<Swarm[]>("GET", "/api/swarms");
  }

  /**
   * Get details of a specific swarm.
   *
   * @param swarmId - The swarm ID
   * @returns Swarm details
   * @throws {SwarmVaultError} If swarm not found
   */
  async getSwarm(swarmId: string): Promise<Swarm> {
    return this.request<Swarm>("GET", `/api/swarms/${swarmId}`);
  }

  /**
   * Get members of a swarm.
   * **Manager only** - requires authentication as a swarm manager.
   *
   * @param swarmId - The swarm ID
   * @returns Array of swarm members
   * @throws {SwarmVaultError} If not authorized or swarm not found
   */
  async getSwarmMembers(swarmId: string): Promise<SwarmMember[]> {
    return this.request<SwarmMember[]>("GET", `/api/swarms/${swarmId}/members`);
  }

  /**
   * Get aggregate token holdings across all swarm members.
   * **Manager only** - requires authentication as a swarm manager.
   *
   * @param swarmId - The swarm ID
   * @returns Aggregated holdings with ETH balance, token balances, and common tokens
   * @throws {SwarmVaultError} If not authorized or swarm not found
   */
  async getSwarmHoldings(swarmId: string): Promise<SwarmHoldings> {
    return this.request<SwarmHoldings>("GET", `/api/swarms/${swarmId}/holdings`);
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
  async previewSwap(swarmId: string, params: SwapPreviewParams): Promise<SwapPreviewResult> {
    return this.request<SwapPreviewResult>("POST", `/api/swarms/${swarmId}/swap/preview`, {
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellPercentage: params.sellPercentage ?? 100,
      slippagePercentage: params.slippagePercentage ?? 1,
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
  async executeSwap(swarmId: string, params: SwapExecuteParams): Promise<SwapExecuteResult> {
    return this.request<SwapExecuteResult>("POST", `/api/swarms/${swarmId}/swap/execute`, {
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellPercentage: params.sellPercentage ?? 100,
      slippagePercentage: params.slippagePercentage ?? 1,
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
  async executeTransaction(
    swarmId: string,
    template: TransactionTemplate
  ): Promise<{ transactionId: string; status: string }> {
    return this.request<{ transactionId: string; status: string }>(
      "POST",
      `/api/swarms/${swarmId}/transactions`,
      template
    );
  }

  /**
   * List transactions for a swarm.
   *
   * @param swarmId - The swarm ID
   * @returns Array of transactions
   */
  async listTransactions(swarmId: string): Promise<Transaction[]> {
    return this.request<Transaction[]>("GET", `/api/swarms/${swarmId}/transactions`);
  }

  /**
   * Get details of a specific transaction, including per-member status.
   *
   * @param transactionId - The transaction ID
   * @returns Transaction details with targets
   */
  async getTransaction(transactionId: string): Promise<Transaction> {
    return this.request<Transaction>("GET", `/api/transactions/${transactionId}`);
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
  async waitForTransaction(
    transactionId: string,
    options: WaitForTransactionOptions = {}
  ): Promise<Transaction> {
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
          details: transaction.targets?.filter((t) => t.error),
        });
      }

      if (Date.now() - startTime > timeoutMs) {
        throw new SwarmVaultError(
          `Transaction timeout: ${transactionId} did not complete within ${timeoutMs}ms`,
          {
            errorCode: "TX_TIMEOUT",
            details: { lastStatus: transaction.status },
          }
        );
      }

      await this.sleep(pollIntervalMs);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add authorization header
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    } else if (this.jwt) {
      headers["Authorization"] = `Bearer ${this.jwt}`;
    }

    const response = await this.fetchFn(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as ApiResponse<T>;

    if (!response.ok || !data.success) {
      throw new SwarmVaultError(data.error || `Request failed with status ${response.status}`, {
        errorCode: data.errorCode,
        statusCode: response.status,
        details: data.details,
      });
    }

    return data.data as T;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

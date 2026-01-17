/**
 * Swarm Vault SDK
 *
 * A TypeScript SDK for the Swarm Vault API, enabling managers to execute
 * swaps and transactions on behalf of their swarm members.
 *
 * @packageDocumentation
 *
 * @example Quick Start
 * ```typescript
 * import { SwarmVaultClient, BASE_MAINNET_TOKENS } from '@swarmvault/sdk';
 *
 * // Initialize client with your API key
 * const client = new SwarmVaultClient({
 *   apiKey: 'svk_your_api_key_here',
 * });
 *
 * // Get your swarms
 * const swarms = await client.listSwarms();
 * const mySwarm = swarms.find(s => s.isManager);
 *
 * // Check holdings
 * const holdings = await client.getSwarmHoldings(mySwarm.id);
 * console.log('ETH Balance:', holdings.ethBalance);
 * console.log('Tokens:', holdings.tokens);
 *
 * // Preview a swap
 * const preview = await client.previewSwap(mySwarm.id, {
 *   sellToken: BASE_MAINNET_TOKENS.USDC,
 *   buyToken: BASE_MAINNET_TOKENS.WETH,
 *   sellPercentage: 50, // Sell 50% of USDC
 * });
 *
 * // Execute the swap
 * const result = await client.executeSwap(mySwarm.id, {
 *   sellToken: BASE_MAINNET_TOKENS.USDC,
 *   buyToken: BASE_MAINNET_TOKENS.WETH,
 *   sellPercentage: 50,
 * });
 *
 * // Wait for completion
 * const tx = await client.waitForTransaction(result.transactionId, {
 *   onPoll: (t) => console.log('Status:', t.status),
 * });
 *
 * console.log('Swap completed!', tx.status);
 * ```
 */

// Main client
export { SwarmVaultClient } from "./client.js";

// Types
export type {
  // Client options
  SwarmVaultClientOptions,
  WaitForTransactionOptions,
  // Core types
  User,
  Swarm,
  SwarmMember,
  // Transaction types
  Transaction,
  TransactionTarget,
  TransactionStatus,
  TransactionTargetStatus,
  TransactionTemplate,
  ABITransactionTemplate,
  RawTransactionTemplate,
  // Swap types
  SwapPreviewParams,
  SwapPreviewResult,
  SwapExecuteParams,
  SwapExecuteResult,
  SwapMemberPreview,
  SwapFeeInfo,
  // Holdings types
  SwarmHoldings,
  TokenHolding,
  TokenInfo,
  // API types
  ApiResponse,
} from "./types.js";

// Error class
export { SwarmVaultError } from "./types.js";

// Token constants
export {
  NATIVE_ETH_ADDRESS,
  BASE_MAINNET_TOKENS,
  BASE_SEPOLIA_TOKENS,
} from "./types.js";

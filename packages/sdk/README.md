# @swarmvault/sdk

TypeScript SDK for the Swarm Vault API. Execute swaps and transactions on behalf of your swarm members with a simple, type-safe client.

## Installation

```bash
npm install @swarmvault/sdk
# or
pnpm add @swarmvault/sdk
# or
yarn add @swarmvault/sdk
```

## Quick Start

```typescript
import { SwarmVaultClient, BASE_MAINNET_TOKENS } from '@swarmvault/sdk';

// Initialize client with your API key
const client = new SwarmVaultClient({
  apiKey: 'svk_your_api_key_here',
});

// Get your swarms
const swarms = await client.listSwarms();
const mySwarm = swarms.find(s => s.isManager);

// Check holdings
const holdings = await client.getSwarmHoldings(mySwarm.id);
console.log('ETH Balance:', holdings.ethBalance);
console.log('Tokens:', holdings.tokens);

// Preview a swap
const preview = await client.previewSwap(mySwarm.id, {
  sellToken: BASE_MAINNET_TOKENS.USDC,
  buyToken: BASE_MAINNET_TOKENS.WETH,
  sellPercentage: 50, // Sell 50% of USDC
});

console.log('Expected output:', preview.totalBuyAmount, 'WETH');

// Execute the swap
const result = await client.executeSwap(mySwarm.id, {
  sellToken: BASE_MAINNET_TOKENS.USDC,
  buyToken: BASE_MAINNET_TOKENS.WETH,
  sellPercentage: 50,
});

// Wait for completion
const tx = await client.waitForTransaction(result.transactionId, {
  onPoll: (t) => console.log('Status:', t.status),
});

console.log('Swap completed!');
```

## Authentication

### API Key (Recommended)

Generate an API key from the Swarm Vault settings page. API keys start with `svk_`.

```typescript
const client = new SwarmVaultClient({
  apiKey: 'svk_your_api_key_here',
});
```

### JWT Token

Alternatively, you can use a JWT token obtained through the SIWE login flow:

```typescript
const client = new SwarmVaultClient({
  jwt: 'eyJhbGciOiJIUzI1NiIs...',
});

// Or set it later
client.setJwt(token);
```

## API Reference

### Client Options

```typescript
const client = new SwarmVaultClient({
  // API base URL (default: https://api.swarmvault.xyz)
  baseUrl: 'https://api.swarmvault.xyz',

  // API key for authentication
  apiKey: 'svk_...',

  // Or JWT token
  jwt: 'eyJ...',

  // Custom fetch function (optional, for testing)
  fetch: customFetch,
});
```

### Authentication Methods

#### `getMe()`

Get the authenticated user.

```typescript
const user = await client.getMe();
console.log(user.walletAddress);
console.log(user.twitterUsername);
```

#### `setApiKey(key: string)`

Set or update the API key.

```typescript
client.setApiKey('svk_new_key');
```

#### `setJwt(token: string)`

Set or update the JWT token.

```typescript
client.setJwt('eyJ...');
```

### Swarm Methods

#### `listSwarms()`

List all swarms. Returns your management status for authenticated requests.

```typescript
const swarms = await client.listSwarms();
const managedSwarms = swarms.filter(s => s.isManager);
```

#### `getSwarm(swarmId: string)`

Get details of a specific swarm.

```typescript
const swarm = await client.getSwarm('swarm-id');
console.log(swarm.name, swarm.memberCount);
```

#### `getSwarmMembers(swarmId: string)`

Get members of a swarm. **Manager only.**

```typescript
const members = await client.getSwarmMembers('swarm-id');
for (const member of members) {
  console.log(member.agentWalletAddress, member.status);
}
```

#### `getSwarmHoldings(swarmId: string)`

Get aggregate token holdings across all swarm members. **Manager only.**

```typescript
const holdings = await client.getSwarmHoldings('swarm-id');
console.log('ETH:', holdings.ethBalance);
console.log('Members:', holdings.memberCount);
for (const token of holdings.tokens) {
  console.log(`${token.symbol}: ${token.totalBalance} (${token.holderCount} holders)`);
}
```

### Swap Methods

#### `previewSwap(swarmId: string, params: SwapPreviewParams)`

Preview a swap without executing it. **Manager only.**

```typescript
const preview = await client.previewSwap('swarm-id', {
  sellToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  buyToken: '0x4200000000000000000000000000000000000006',   // WETH
  sellPercentage: 50,      // Sell 50% of balance (default: 100)
  slippagePercentage: 1,   // 1% slippage (default: 1)
});

console.log('Total sell:', preview.totalSellAmount);
console.log('Total buy:', preview.totalBuyAmount);
console.log('Success:', preview.successCount);
console.log('Errors:', preview.errorCount);

// Per-member breakdown
for (const member of preview.members) {
  if (member.error) {
    console.log(`${member.agentWalletAddress}: Error - ${member.error}`);
  } else {
    console.log(`${member.agentWalletAddress}: ${member.sellAmount} → ${member.buyAmount}`);
  }
}
```

#### `executeSwap(swarmId: string, params: SwapExecuteParams)`

Execute a swap for all swarm members. **Manager only.**

A platform fee (default 0.5%) is deducted from the buy token amount.

```typescript
const result = await client.executeSwap('swarm-id', {
  sellToken: BASE_MAINNET_TOKENS.USDC,
  buyToken: BASE_MAINNET_TOKENS.WETH,
  sellPercentage: 50,
  slippagePercentage: 1,
});

console.log('Transaction ID:', result.transactionId);
console.log('Members:', result.memberCount);
console.log('Fee:', result.fee?.percentage);
```

### Transaction Methods

#### `executeTransaction(swarmId: string, template: TransactionTemplate)`

Execute a raw transaction template. **Manager only.** For swaps, prefer `executeSwap`.

```typescript
// ABI mode
const result = await client.executeTransaction('swarm-id', {
  mode: 'abi',
  contractAddress: '0x...',
  abi: [{ name: 'transfer', type: 'function', ... }],
  functionName: 'transfer',
  args: ['0xRecipient', '{{percentage:tokenBalance:0x...:50}}'],
  value: '0',
});

// Raw calldata mode
const result = await client.executeTransaction('swarm-id', {
  mode: 'raw',
  contractAddress: '0x...',
  data: '0xa9059cbb...',
  value: '0',
});
```

#### `listTransactions(swarmId: string)`

List all transactions for a swarm.

```typescript
const transactions = await client.listTransactions('swarm-id');
for (const tx of transactions) {
  console.log(tx.id, tx.status, tx.createdAt);
}
```

#### `getTransaction(transactionId: string)`

Get transaction details including per-member status.

```typescript
const tx = await client.getTransaction('tx-id');
console.log('Status:', tx.status);
for (const target of tx.targets || []) {
  console.log(`${target.membership?.agentWalletAddress}: ${target.status}`);
}
```

#### `waitForTransaction(transactionId: string, options?: WaitForTransactionOptions)`

Wait for a transaction to complete.

```typescript
const tx = await client.waitForTransaction('tx-id', {
  timeoutMs: 300000,    // 5 minutes (default)
  pollIntervalMs: 3000, // 3 seconds (default)
  onPoll: (transaction) => {
    const confirmed = transaction.targets?.filter(t => t.status === 'CONFIRMED').length ?? 0;
    const total = transaction.targets?.length ?? 0;
    console.log(`Progress: ${confirmed}/${total}`);
  },
});

console.log('Final status:', tx.status);
```

## Token Constants

The SDK exports common token addresses for convenience:

```typescript
import {
  NATIVE_ETH_ADDRESS,
  BASE_MAINNET_TOKENS,
  BASE_SEPOLIA_TOKENS
} from '@swarmvault/sdk';

// Native ETH (for swaps)
const ethAddress = NATIVE_ETH_ADDRESS;
// => '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

// Base Mainnet tokens
BASE_MAINNET_TOKENS.USDC  // => '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
BASE_MAINNET_TOKENS.WETH  // => '0x4200000000000000000000000000000000000006'
BASE_MAINNET_TOKENS.DAI   // => '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
BASE_MAINNET_TOKENS.USDbC // => '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'
BASE_MAINNET_TOKENS.cbETH // => '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22'

// Base Sepolia tokens (testnet)
BASE_SEPOLIA_TOKENS.USDC  // => '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
BASE_SEPOLIA_TOKENS.WETH  // => '0x4200000000000000000000000000000000000006'
```

## Error Handling

The SDK throws `SwarmVaultError` for API errors:

```typescript
import { SwarmVaultClient, SwarmVaultError } from '@swarmvault/sdk';

try {
  const holdings = await client.getSwarmHoldings('swarm-id');
} catch (error) {
  if (error instanceof SwarmVaultError) {
    console.error('Message:', error.message);
    console.error('Error Code:', error.errorCode);
    console.error('Status Code:', error.statusCode);
    console.error('Details:', error.details);
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `AUTH_001` | Unauthorized - missing or invalid authentication |
| `AUTH_002` | Invalid token |
| `RES_003` | Swarm not found |
| `PERM_002` | Not a manager of this swarm |
| `TX_001` | Transaction failed |
| `TX_003` | Insufficient balance |

## Template Placeholders

When using `executeTransaction`, you can use placeholders that get resolved per-member:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{walletAddress}}` | Agent wallet address | `0x1234...` |
| `{{ethBalance}}` | ETH balance (wei) | `1000000000000000000` |
| `{{tokenBalance:0xAddr}}` | Token balance | `500000000` |
| `{{percentage:ethBalance:50}}` | 50% of ETH | `500000000000000000` |
| `{{percentage:tokenBalance:0xAddr:100}}` | 100% of token | `500000000` |
| `{{blockTimestamp}}` | Current timestamp | `1704567890` |
| `{{deadline:300}}` | Timestamp + 300s | `1704568190` |
| `{{slippage:amount:5}}` | Amount - 5% | `950000000` |

## Examples

See the [examples directory](./examples) for complete working examples:

- `check-holdings.ts` - View holdings across all managed swarms
- `swap-usdc-to-weth.ts` - Preview and execute a swap

## TypeScript

The SDK is fully typed. Import types as needed:

```typescript
import type {
  Swarm,
  SwarmMember,
  SwarmHoldings,
  Transaction,
  TransactionTarget,
  SwapPreviewResult,
  SwapExecuteResult,
  SwarmVaultClientOptions,
} from '@swarmvault/sdk';
```

## Requirements

- Node.js 18+ (for native fetch) or provide a custom fetch implementation
- TypeScript 4.7+ (optional, for type checking)

## License

MIT

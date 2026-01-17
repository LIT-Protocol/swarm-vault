# Swarm Vault SDK Examples

This directory contains example scripts demonstrating how to use the Swarm Vault SDK.

## Prerequisites

1. **Get an API Key**: Go to the Swarm Vault settings page and generate an API key
2. **Set Environment Variable**: Export your API key as `SWARMVAULT_API_KEY`

```bash
export SWARMVAULT_API_KEY=svk_your_api_key_here
```

## Running Examples

The examples are TypeScript files that can be run with `tsx`:

```bash
# Install tsx globally (if not installed)
npm install -g tsx

# From the SDK package directory
cd packages/sdk

# Run an example
npx tsx examples/check-holdings.ts
```

## Available Examples

### check-holdings.ts

View token holdings across all swarms you manage.

```bash
npx tsx examples/check-holdings.ts
```

**What it does:**
- Lists all swarms you manage
- Shows ETH and token balances for each swarm
- Provides an aggregated summary across all swarms

### swap-usdc-to-weth.ts

Preview (and optionally execute) a swap of 50% USDC to WETH.

```bash
# Preview swap for a specific swarm
npx tsx examples/swap-usdc-to-weth.ts YOUR_SWARM_ID

# Or let it use your first managed swarm
npx tsx examples/swap-usdc-to-weth.ts
```

**What it does:**
- Authenticates with your API key
- Fetches swarm holdings
- Previews a 50% USDC → WETH swap
- Shows per-member breakdown
- (Optionally) Executes the swap with progress tracking

**Note:** By default, the execution code is commented out for safety. Uncomment it in the script to actually execute swaps.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SWARMVAULT_API_KEY` | Yes | Your API key (starts with `svk_`) |
| `SWARMVAULT_API_URL` | No | API base URL (default: `https://api.swarmvault.xyz`) |
| `SWARM_ID` | No | Default swarm ID for swap example |

## Writing Your Own Scripts

Here's a minimal example to get started:

```typescript
import { SwarmVaultClient, BASE_MAINNET_TOKENS } from '@swarmvault/sdk';

const client = new SwarmVaultClient({
  apiKey: process.env.SWARMVAULT_API_KEY,
});

async function main() {
  // Get authenticated user
  const me = await client.getMe();
  console.log('Logged in as:', me.walletAddress);

  // List your swarms
  const swarms = await client.listSwarms();
  const mySwarms = swarms.filter(s => s.isManager);

  for (const swarm of mySwarms) {
    // Get holdings
    const holdings = await client.getSwarmHoldings(swarm.id);
    console.log(`${swarm.name}: ${holdings.memberCount} members`);

    // Preview a swap
    const preview = await client.previewSwap(swarm.id, {
      sellToken: BASE_MAINNET_TOKENS.USDC,
      buyToken: BASE_MAINNET_TOKENS.WETH,
      sellPercentage: 100,
    });
    console.log(`  Would swap ${preview.totalSellAmount} USDC for ${preview.totalBuyAmount} WETH`);
  }
}

main().catch(console.error);
```

## Error Handling

The SDK throws `SwarmVaultError` for API errors:

```typescript
import { SwarmVaultClient, SwarmVaultError } from '@swarmvault/sdk';

try {
  const holdings = await client.getSwarmHoldings('invalid-id');
} catch (error) {
  if (error instanceof SwarmVaultError) {
    console.error('API Error:', error.message);
    console.error('Error Code:', error.errorCode);
    console.error('Details:', error.details);
  }
}
```

## Testnet Usage

For testnet (Base Sepolia), use `BASE_SEPOLIA_TOKENS` instead of `BASE_MAINNET_TOKENS`:

```typescript
import { BASE_SEPOLIA_TOKENS } from '@swarmvault/sdk';

const preview = await client.previewSwap(swarmId, {
  sellToken: BASE_SEPOLIA_TOKENS.USDC,
  buyToken: BASE_SEPOLIA_TOKENS.WETH,
  sellPercentage: 50,
});
```

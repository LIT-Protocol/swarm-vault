# @swarmvault/claude-skill

A Claude skill for Swarm Vault manager trading. Execute swaps and transactions on behalf of your swarm members through Claude.

## What This Skill Enables

With this skill, Claude can help you:

- **Check holdings** across all your swarm members
- **Preview swaps** before executing them
- **Execute token swaps** (e.g., "swap 50% of USDC to WETH")
- **Execute custom transactions** using template placeholders
- **Monitor transaction status** until completion

## Installation

### For Claude Code

1. Clone or copy this skill to your project:

```bash
# From the swarm-vault monorepo
cd packages/claude-skill
pnpm install
```

2. Configure your environment:

```bash
cp .env.example .env
# Edit .env and add your SWARM_VAULT_API_KEY
```

3. Add the skill context to Claude Code:

```bash
# Point Claude Code to the SKILL.md file
claude --add-context ./SKILL.md
```

### For Standalone Use

1. Install dependencies:

```bash
npm install @swarmvault/sdk tsx
```

2. Set environment variables:

```bash
export SWARM_VAULT_API_KEY="svk_your_api_key_here"
```

3. Run scripts directly:

```bash
npx tsx src/check-holdings.ts <swarmId>
```

## Getting Your API Key

1. Go to [https://swarmvault.xyz/settings](https://swarmvault.xyz/settings)
2. Connect your wallet (the one you use to manage swarms)
3. Click "Generate API Key"
4. Copy the key immediately (it's only shown once!)

## Available Commands

### Check Holdings

View what tokens your swarm members hold:

```bash
pnpm check-holdings                    # List all your swarms
pnpm check-holdings <swarmId>          # Get holdings for specific swarm
```

### Preview Swap

Always preview before executing:

```bash
pnpm preview-swap <swarmId> USDC WETH 50 1
#                           sell buy  %  slippage
```

### Execute Swap

Execute a swap across all member wallets:

```bash
pnpm execute-swap <swarmId> USDC WETH 50 1
```

### Execute Transaction

Execute a custom transaction template:

```bash
pnpm execute-transaction <swarmId> ./template.json
pnpm execute-transaction <swarmId> --inline '{"mode":"abi",...}'
```

### Check Transaction

Monitor transaction status:

```bash
pnpm check-transaction <txId>          # Check current status
pnpm check-transaction <txId> --wait   # Wait for completion
```

## Token Symbols

The following token symbols are supported (Base Mainnet):

| Symbol | Token |
|--------|-------|
| ETH | Native ETH |
| WETH | Wrapped ETH |
| USDC | USD Coin |
| DAI | Dai Stablecoin |
| USDbC | Bridged USDC |
| cbETH | Coinbase ETH |

Or use full token addresses (0x...).

## Template Placeholders

When using `execute-transaction`, you can use these placeholders:

| Placeholder | Description |
|-------------|-------------|
| `{{walletAddress}}` | Agent wallet address |
| `{{ethBalance}}` | ETH balance in wei |
| `{{tokenBalance:0xAddr}}` | ERC20 token balance |
| `{{percentage:ethBalance:N}}` | N% of ETH balance |
| `{{percentage:tokenBalance:0xAddr:N}}` | N% of token balance |
| `{{blockTimestamp}}` | Current block timestamp |
| `{{deadline:N}}` | Timestamp + N seconds |
| `{{slippage:amount:N}}` | Amount minus N% |

See [SKILL.md](./SKILL.md) for detailed examples.

## Example Workflow

```bash
# 1. Check what tokens your swarm holds
pnpm check-holdings my-swarm-id

# 2. Preview swapping 50% of USDC to WETH
pnpm preview-swap my-swarm-id USDC WETH 50 1

# 3. If preview looks good, execute the swap
pnpm execute-swap my-swarm-id USDC WETH 50 1

# 4. Transaction ID is returned, monitor until complete
pnpm check-transaction <txId> --wait
```

## Using with Claude

Once configured, you can ask Claude natural language questions like:

- "What tokens does my swarm hold?"
- "Preview swapping 25% of our ETH to USDC"
- "Execute a swap of all USDC to WETH with 2% slippage"
- "Check the status of transaction abc-123"

Claude will use the appropriate commands and interpret the results for you.

## Troubleshooting

### "SWARM_VAULT_API_KEY environment variable is required"

Set your API key:
```bash
export SWARM_VAULT_API_KEY="svk_..."
```

### "Not a manager of this swarm"

You can only execute trades for swarms you manage. Check you're using the correct API key.

### "Insufficient balance"

One or more members don't have enough tokens. Preview first to see per-member details.

## Documentation

- [SKILL.md](./SKILL.md) - Full skill context with all features documented
- [SDK README](../sdk/README.md) - Underlying SDK documentation
- [API Docs](https://api.swarmvault.xyz/api/docs) - Full API reference

## License

MIT

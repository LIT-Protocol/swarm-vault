# @swarmvault/claude-skill

A Claude Code skill for Swarm Vault manager trading. Execute swaps and transactions using natural language.

## Installation

```bash
npx add-skill LIT-Protocol/swarm-vault --skill swarm-vault-manager-trading
```

## Setup

1. **Get your API key** from [swarmvault.xyz/settings](https://swarmvault.xyz/settings)

2. **Set your environment variable:**
   ```bash
   export SWARM_VAULT_API_KEY="svk_your_api_key_here"
   ```

3. **Start using Claude Code** - just ask what you want to do!

## Usage

Once installed, you can ask Claude things like:

- "What tokens does my swarm hold?"
- "Preview swapping 50% of USDC to WETH"
- "Execute a swap of all ETH to USDC with 2% slippage"
- "Check the status of my last transaction"

Claude will use the skill to execute the appropriate commands and interpret the results for you.

## Example Workflow

```
You: What swarms do I manage?

Claude: Let me check your swarms...
[runs check-holdings]
You manage 2 swarms:
1. Alpha Traders (12 members, 5.2 ETH, 10,000 USDC)
2. DeFi Squad (8 members, 2.1 ETH, 5,000 USDC)

You: Preview swapping 50% of USDC to WETH for Alpha Traders

Claude: [runs preview-swap]
Preview for Alpha Traders:
- Selling: 5,000 USDC (50% of holdings)
- Buying: ~1.85 WETH (estimated)
- Members affected: 12
- All members have sufficient balance

You: Execute that swap

Claude: [runs execute-swap]
Swap initiated! Transaction ID: abc-123
Waiting for confirmation...
✓ 12/12 members confirmed
Swap completed successfully!
```

## Available Commands

The skill provides these commands that Claude can use:

| Command | Description |
|---------|-------------|
| `check-holdings [swarmId]` | View token holdings |
| `preview-swap <swarmId> <sell> <buy> [%] [slippage]` | Preview a swap |
| `execute-swap <swarmId> <sell> <buy> [%] [slippage]` | Execute a swap |
| `execute-transaction <swarmId> <template>` | Execute raw transaction |
| `check-transaction <txId> [--wait]` | Check transaction status |

## Token Symbols

You can use these symbols instead of addresses:

- `ETH` - Native ETH
- `WETH` - Wrapped ETH
- `USDC` - USD Coin
- `DAI` - Dai Stablecoin
- `USDbC` - Bridged USDC
- `cbETH` - Coinbase ETH

## Documentation

For advanced usage and template placeholders, see [SKILL.md](./SKILL.md).

## Links

- [Swarm Vault](https://swarmvault.xyz)
- [API Documentation](https://api.swarmvault.xyz/api/docs)
- [JavaScript SDK](https://www.npmjs.com/package/@swarmvault/sdk)
- [GitHub](https://github.com/LIT-Protocol/swarm-vault)

## License

MIT

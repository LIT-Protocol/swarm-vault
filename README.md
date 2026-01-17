# Swarm Vault

A platform that enables managers to execute transactions on behalf of multiple users on Base blockchain. Users join "swarms" managed by trusted managers, and each user gets a ZeroDev smart wallet that the swarm's Lit Protocol PKP can sign transactions for.

## Features

- **Swarm Management**: Create and manage swarms with multiple members
- **Smart Wallets**: ZeroDev Kernel v3 smart wallets for each member
- **Transaction Templating**: Execute parameterized transactions across all swarm members
- **Token Swaps**: Integrated 0x DEX aggregator for optimal swap routing
- **Balance Tracking**: Real-time balance display via Alchemy
- **Withdrawals**: Users can withdraw funds directly from their agent wallets
- **Manager SDK**: TypeScript SDK for programmatic trading (`@swarmvault/sdk`)
- **API Documentation**: Interactive API docs at `/api/docs`

## Tech Stack

- **Frontend**: Vite + React + TypeScript + TailwindCSS
- **Backend**: Express + TypeScript
- **Database**: PostgreSQL + Prisma
- **Monorepo**: pnpm workspaces
- **Blockchain**: Base (Sepolia for dev, Mainnet for prod)
- **Smart Wallets**: ZeroDev (Kernel v3)
- **Signing**: Lit Protocol PKP + Lit Actions
- **Wallet Connection**: wagmi + viem
- **Balance Indexing**: Alchemy

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- PostgreSQL 14+
- Lit Protocol account (for PKP minting)
- ZeroDev account (project ID)
- Alchemy account (API key)
- 0x account (API key)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd swarm-vault
pnpm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/swarm_vault

# Lit Protocol
LIT_NETWORK=datil-dev
LIT_PRIVATE_KEY=0x...  # EOA for subsidizing Lit costs

# ZeroDev
ZERODEV_PROJECT_ID=your-project-id

# Chain (84532 = Base Sepolia, 8453 = Base Mainnet)
CHAIN_ID=84532

# Alchemy
ALCHEMY_API_KEY=your-alchemy-api-key

# 0x DEX Aggregator
ZEROX_API_KEY=your-0x-api-key

# Auth
JWT_SECRET=your-jwt-secret-at-least-32-characters

# Server
PORT=3001
NODE_ENV=development

# Client (for Vite)
VITE_API_URL=http://localhost:3001
VITE_CHAIN_ID=84532
VITE_ZERODEV_PROJECT_ID=your-project-id
```

### 3. Set Up Database

```bash
pnpm db:migrate
```

### 4. Run Development Servers

```bash
pnpm dev
```

This starts both the client (port 5173) and server (port 3001).

## Project Structure

```
swarm-vault/
├── packages/
│   ├── client/          # Vite + React frontend
│   ├── server/          # Express backend
│   ├── shared/          # Shared types, utils, constants
│   ├── sdk/             # TypeScript SDK for managers (@swarmvault/sdk)
│   └── lit-actions/     # Lit Action source code
├── prisma/
│   └── schema.prisma    # Database schema
├── .env.example
├── package.json
└── pnpm-workspace.yaml
```

## Environment Variables

### Server Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | `postgresql://user:pass@localhost:5432/swarm_vault` |
| `LIT_NETWORK` | Lit Protocol network | Yes | `datil-dev`, `datil-test`, `datil` |
| `LIT_PRIVATE_KEY` | EOA private key for subsidizing Lit costs | Yes | `0x...` |
| `ZERODEV_PROJECT_ID` | ZeroDev project ID | Yes | `abc123` |
| `CHAIN_ID` | Target blockchain chain ID | Yes | `84532` (Base Sepolia) or `8453` (Base Mainnet) |
| `ALCHEMY_API_KEY` | Alchemy API key for balance fetching | Yes | `your-key` |
| `ZEROX_API_KEY` | 0x API key for swap quotes | Yes | `your-key` |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) | Yes | `your-secret` |
| `PORT` | Server port | No | `3001` (default) |
| `NODE_ENV` | Environment mode | No | `development` or `production` |
| `CLIENT_URL` | Frontend URL for CORS | Prod | `https://your-frontend.com` |

### Client Variables (Vite)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `VITE_API_URL` | Backend API URL | Yes | `http://localhost:3001` |
| `VITE_CHAIN_ID` | Target chain ID | Yes | `84532` |
| `VITE_ZERODEV_PROJECT_ID` | ZeroDev project ID | Yes | `abc123` |

## Programmatic Access for Managers

Managers can programmatically execute swaps and transactions on behalf of their swarm members. There are two options:

### Option 1: TypeScript SDK (Recommended for JS/TS projects)

Install the SDK:

```bash
npm install @swarmvault/sdk
```

Quick example:

```typescript
import { SwarmVaultClient, BASE_MAINNET_TOKENS } from '@swarmvault/sdk';

const client = new SwarmVaultClient({
  apiKey: 'svk_your_api_key_here', // Get from Settings page
});

// Check holdings
const holdings = await client.getSwarmHoldings('swarm-id');

// Execute a swap (50% USDC to WETH)
const result = await client.executeSwap('swarm-id', {
  sellToken: BASE_MAINNET_TOKENS.USDC,
  buyToken: BASE_MAINNET_TOKENS.WETH,
  sellPercentage: 50,
});

// Wait for completion
const tx = await client.waitForTransaction(result.transactionId);
```

See [packages/sdk/README.md](./packages/sdk/README.md) for full documentation.

### Option 2: Direct API (Any language)

Use the REST API directly with your API key or JWT:

```bash
# Get holdings
curl -H "Authorization: Bearer svk_your_api_key" \
  https://api.swarmvault.xyz/api/swarms/{id}/holdings

# Execute swap
curl -X POST -H "Authorization: Bearer svk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"sellToken":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","buyToken":"0x4200000000000000000000000000000000000006","sellPercentage":50}' \
  https://api.swarmvault.xyz/api/swarms/{id}/swap/execute
```

Interactive API documentation is available at `/api/docs`. The OpenAPI spec is at `/api/openapi.json` (useful for LLMs and code generation).

## API Reference

### Authentication

#### Get Nonce
```
POST /api/auth/nonce
Content-Type: application/json

Request:
{ "address": "0x..." }

Response:
{ "success": true, "data": { "nonce": "abc123" } }
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

Request:
{
  "message": "SIWE message...",
  "signature": "0x..."
}

Response:
{
  "success": true,
  "data": {
    "token": "jwt-token",
    "user": { "id": "uuid", "walletAddress": "0x..." }
  }
}
```

#### Get Current User
```
GET /api/auth/me
Authorization: Bearer <token>

Response:
{ "success": true, "data": { "id": "uuid", "walletAddress": "0x..." } }
```

### Swarms

#### List Swarms
```
GET /api/swarms

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "My Swarm",
      "description": "...",
      "memberCount": 5,
      "isManager": false
    }
  ]
}
```

#### Create Swarm
```
POST /api/swarms
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "name": "My Swarm",
  "description": "Description here"
}

Response:
{ "success": true, "data": { "id": "uuid", ... } }
```

#### Get Swarm Details
```
GET /api/swarms/:id

Response:
{ "success": true, "data": { "id": "uuid", "name": "...", ... } }
```

#### Get Swarm Members (Manager Only)
```
GET /api/swarms/:id/members
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "agentWalletAddress": "0x...",
      "status": "ACTIVE",
      "user": { "walletAddress": "0x..." }
    }
  ]
}
```

### Memberships

#### Join Swarm
```
POST /api/swarms/:id/join
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "agentWalletAddress": "0x...",
  "sessionKeyApproval": "serialized-approval"
}

Response:
{ "success": true, "data": { "id": "uuid", "agentWalletAddress": "0x..." } }
```

#### List User Memberships
```
GET /api/memberships
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "swarmId": "uuid",
      "swarmName": "...",
      "agentWalletAddress": "0x...",
      "status": "ACTIVE"
    }
  ]
}
```

#### Get Membership Details
```
GET /api/memberships/:id
Authorization: Bearer <token>

Response:
{ "success": true, "data": { ... } }
```

#### Get Membership Balance
```
GET /api/memberships/:id/balance
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "ethBalance": "1000000000000000000",
    "tokens": [
      {
        "address": "0x...",
        "symbol": "USDC",
        "name": "USD Coin",
        "decimals": 6,
        "balance": "500000000",
        "logo": "https://..."
      }
    ],
    "fetchedAt": "2024-01-07T12:00:00Z",
    "cached": false
  }
}
```

#### Leave Swarm
```
POST /api/memberships/:id/leave
Authorization: Bearer <token>

Response:
{ "success": true }
```

### Transactions

#### Execute Transaction
```
POST /api/swarms/:id/transactions
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "template": {
    "mode": "abi",
    "contractAddress": "0x...",
    "abi": [...],
    "functionName": "transfer",
    "args": ["{{walletAddress}}", "{{percentage:ethBalance:50}}"],
    "value": "0"
  }
}

Response:
{ "success": true, "data": { "id": "uuid", "status": "PENDING" } }
```

#### List Swarm Transactions
```
GET /api/swarms/:id/transactions
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "status": "COMPLETED",
      "createdAt": "...",
      "targets": [...]
    }
  ]
}
```

#### Get Transaction Status
```
GET /api/transactions/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "COMPLETED",
    "targets": [
      {
        "membershipId": "uuid",
        "status": "CONFIRMED",
        "txHash": "0x...",
        "error": null
      }
    ]
  }
}
```

### Swaps

#### Get Swarm Holdings
```
GET /api/swarms/:id/holdings
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "ethBalance": "5000000000000000000",
    "tokens": [
      {
        "address": "0x...",
        "symbol": "USDC",
        "totalBalance": "1000000000",
        "holders": 3
      }
    ]
  }
}
```

#### Preview Swap
```
POST /api/swarms/:id/swap/preview
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "sellToken": "0x...",
  "buyToken": "0x...",
  "sellPercentage": 100,
  "slippagePercentage": 1
}

Response:
{
  "success": true,
  "data": {
    "quotes": [
      {
        "membershipId": "uuid",
        "sellAmount": "1000000",
        "buyAmount": "500000000000000",
        "price": "0.000002"
      }
    ],
    "totalSellAmount": "1000000",
    "totalBuyAmount": "500000000000000"
  }
}
```

#### Execute Swap
```
POST /api/swarms/:id/swap/execute
Authorization: Bearer <token>
Content-Type: application/json

Request:
{
  "sellToken": "0x...",
  "buyToken": "0x...",
  "sellPercentage": 100,
  "slippagePercentage": 1
}

Response:
{ "success": true, "data": { "transactionId": "uuid" } }
```

## Template Placeholders

Transaction templates support these placeholders:

| Placeholder | Description | Example Output |
|-------------|-------------|----------------|
| `{{walletAddress}}` | Agent wallet address | `0x1234...abcd` |
| `{{ethBalance}}` | Current ETH balance (wei) | `1000000000000000000` |
| `{{tokenBalance:0xAddress}}` | ERC20 token balance | `500000000` |
| `{{percentage:ethBalance:50}}` | 50% of ETH balance | `500000000000000000` |
| `{{percentage:tokenBalance:0xAddr:100}}` | 100% of token balance | `500000000` |
| `{{blockTimestamp}}` | Current block timestamp | `1704567890` |
| `{{deadline:300}}` | Timestamp + N seconds | `1704568190` |
| `{{slippage:amount:5}}` | Amount minus 5% | `950000000` |

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_001` | Unauthorized - not signed in |
| `AUTH_002` | Invalid token |
| `AUTH_003` | Token expired |
| `AUTH_004` | Invalid signature |
| `AUTH_005` | Nonce expired |
| `VAL_001` | Validation error |
| `VAL_002` | Invalid address format |
| `VAL_003` | Invalid template structure |
| `VAL_004` | Invalid amount |
| `RES_001` | Resource not found |
| `RES_002` | Resource already exists |
| `RES_003` | Swarm not found |
| `RES_004` | Membership not found |
| `RES_005` | Transaction not found |
| `PERM_001` | Forbidden |
| `PERM_002` | Not a manager |
| `PERM_003` | Not a member |
| `PERM_004` | Already a member |
| `EXT_001` | Lit Protocol error |
| `EXT_002` | ZeroDev error |
| `EXT_003` | Alchemy error |
| `EXT_004` | 0x API error |
| `EXT_005` | Bundler error |
| `TX_001` | Transaction failed |
| `TX_002` | Transaction rejected |
| `TX_003` | Insufficient balance |
| `TX_004` | No active members |
| `TX_005` | Signing failed |
| `INT_001` | Internal error |
| `INT_002` | Database error |
| `INT_003` | Configuration error |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all packages in development mode |
| `pnpm build` | Build all packages |
| `pnpm lint` | Run linting across all packages |
| `pnpm test` | Run tests across all packages |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:push` | Push schema to database |
| `pnpm db:seed` | Seed development data |

## Testing

```bash
# Run all tests
pnpm test

# Run tests with watch mode
pnpm --filter @swarm-vault/shared test:watch

# Run tests with coverage
pnpm test:coverage
```

## License

MIT

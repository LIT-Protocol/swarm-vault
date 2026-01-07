# Swarm Vault - Technical Plan

## Overview

Swarm Vault is a platform that enables managers to execute transactions on behalf of multiple users on Base. Users join "swarms" managed by trusted managers, and each user gets a ZeroDev smart wallet ("agent wallet") that the swarm's Lit Protocol PKP can sign transactions for.

## Architecture

### Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Backend**: Express + TypeScript
- **Database**: PostgreSQL + Prisma
- **Monorepo**: pnpm workspaces
- **Blockchain**: Base (Sepolia for dev, Mainnet for prod)
- **Smart Wallets**: ZeroDev (Kernel v3)
- **Signing**: Lit Protocol PKP + Lit Actions (naga-dev)
- **Wallet Connection**: wagmi + viem
- **Balance Indexing**: Alchemy

### Monorepo Structure

```
swarm-vault/
├── packages/
│   ├── client/          # Vite + React frontend
│   ├── server/          # Express backend
│   ├── shared/          # Shared types, utils, constants
│   └── lit-actions/     # Lit Action source code
├── prisma/
│   └── schema.prisma
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

## Core Concepts

### User Types

1. **Manager**: Creates and operates swarms. Can execute transactions across all swarm member wallets.
2. **User**: Joins swarms and deposits funds into their agent wallet.

### Swarm

A swarm is a group created by a manager. Each swarm has:
- Name, description, social media URL
- A Lit Protocol PKP (owned by the manager)
- Multiple user memberships

### Agent Wallet

Each user's membership in a swarm creates a ZeroDev smart wallet:
- **Owner**: User's MetaMask EOA (can always withdraw manually)
- **Session Signer**: Swarm's Lit PKP (allows manager to execute transactions)
- Uses counterfactual deployment (only deployed on first transaction)

## Data Model

### Entities

```
User
├── id (uuid)
├── walletAddress (string, unique) - MetaMask EOA
├── createdAt
└── updatedAt

Swarm
├── id (uuid)
├── name (string)
├── description (text)
├── socialUrl (string, optional)
├── managerId (fk -> User)
├── litPkpPublicKey (string)
├── litPkpTokenId (string)
├── createdAt
└── updatedAt

SwarmMembership
├── id (uuid)
├── swarmId (fk -> Swarm)
├── userId (fk -> User)
├── agentWalletAddress (string) - ZeroDev smart wallet address
├── joinedAt
└── status (active, left)

Transaction
├── id (uuid)
├── swarmId (fk -> Swarm)
├── txHash (string, optional) - null until confirmed
├── status (pending, submitted, confirmed, failed)
├── txData (json) - raw transaction data
├── createdAt
└── updatedAt

TransactionTarget
├── id (uuid)
├── transactionId (fk -> Transaction)
├── membershipId (fk -> SwarmMembership)
├── txHash (string, optional)
├── status (pending, submitted, confirmed, failed)
├── error (text, optional)
```

## Key Flows

### 1. User Registration / Login

1. User clicks "Connect Wallet"
2. wagmi prompts MetaMask connection
3. User signs SIWE (Sign-In With Ethereum) message
4. Backend verifies signature, creates/returns JWT
5. User record created if new

### 2. Manager Creates Swarm

1. Manager fills out swarm form (name, description, social URL)
2. Backend calls Lit Protocol to mint a new PKP
3. PKP public key and token ID stored with swarm
4. Swarm created in database

### 3. User Joins Swarm

1. User browses public swarm list
2. User clicks "Join" on a swarm
3. Backend computes ZeroDev counterfactual address for user+swarm
4. Backend adds Lit PKP as session signer on the smart wallet
5. SwarmMembership created with agent wallet address
6. User shown their agent wallet address to deposit funds

### 4. Manager Executes Swarm Transaction

1. Manager constructs transaction (to, value, data) in dashboard
2. Manager submits to backend API
3. Backend creates Transaction record
4. Backend calls Lit Action with:
   - Transaction data
   - List of all member agent wallet addresses
   - PKP public key
5. Lit Action signs UserOperations for each wallet
6. Backend submits UserOperations to ZeroDev bundler
7. Backend updates transaction status as confirmations arrive

### 5. User Views Balance

1. User opens their swarm membership dashboard
2. Frontend calls Alchemy API to get ETH + ERC20 balances
3. Balances displayed for each agent wallet

### 6. User Withdraws (via WalletConnect)

1. User clicks "Connect to dApp" button
2. WalletConnect modal opens
3. User connects to external dApp (e.g., Zerion)
4. User initiates transfer from dApp
5. Transaction signed by user's MetaMask (as wallet owner)

## API Endpoints

### Auth
- `POST /api/auth/nonce` - Get SIWE nonce
- `POST /api/auth/login` - Verify signature, return JWT
- `GET /api/auth/me` - Get current user

### Swarms
- `GET /api/swarms` - List all public swarms
- `POST /api/swarms` - Create new swarm (manager)
- `GET /api/swarms/:id` - Get swarm details
- `GET /api/swarms/:id/members` - Get swarm members

### Memberships
- `GET /api/memberships` - Get user's memberships
- `POST /api/swarms/:id/join` - Join a swarm
- `GET /api/memberships/:id` - Get membership details

### Transactions (Manager)
- `POST /api/swarms/:id/transactions` - Execute swarm transaction
- `GET /api/swarms/:id/transactions` - List swarm transactions
- `GET /api/transactions/:id` - Get transaction status

### Balances
- `GET /api/memberships/:id/balance` - Get agent wallet balance

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/swarm_vault

# Lit Protocol
LIT_NETWORK=naga-dev
LIT_PRIVATE_KEY=0x...  # EOA for subsidizing Lit costs

# ZeroDev
ZERODEV_PROJECT_ID=...

# Chain
CHAIN_ID=84532  # 84532 = Base Sepolia, 8453 = Base Mainnet

# Alchemy
ALCHEMY_API_KEY=...

# Auth
JWT_SECRET=...
```

## Security Considerations

1. **User Sovereignty**: Users always retain ownership via their MetaMask EOA
2. **Manager Trust**: Currently managers are fully trusted; future: add transaction simulation in Lit Action
3. **Session Keys**: PKP session keys should have appropriate permissions/expiry
4. **API Auth**: All mutating endpoints require valid JWT
5. **Input Validation**: Validate all transaction data before signing

## Future Enhancements

1. **Transaction Simulation**: Use Alchemy simulation API in Lit Action to detect malicious transactions
2. **WalletConnect Integration**: Let users connect their agent wallet to dApps
3. **Spending Limits**: Allow users to set per-transaction or daily limits
4. **Multi-sig Manager**: Require multiple managers to approve transactions
5. **Fee Structure**: Take percentage of profits or flat fee

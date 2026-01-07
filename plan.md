# Swarm Vault - Technical Plan

## Overview

Swarm Vault is a platform that enables managers to execute transactions on behalf of multiple users on Base. Users join "swarms" managed by trusted managers, and each user gets a ZeroDev smart wallet ("agent wallet") that the swarm's Lit Protocol PKP can sign transactions for.

## Architecture

### Tech Stack

- **Frontend**: Vite + React + TypeScript + TailwindCSS
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

### Transaction Templating

Since swarm transactions execute across multiple wallets with different balances, we need a templating system to customize transaction parameters per wallet.

#### Template Placeholders

| Placeholder | Description | Example Output |
|-------------|-------------|----------------|
| `{{walletAddress}}` | Agent wallet address | `0x1234...abcd` |
| `{{ethBalance}}` | Current ETH balance (wei) | `1000000000000000000` |
| `{{tokenBalance:0xAddress}}` | ERC20 token balance | `500000000` |
| `{{percentage:ethBalance:50}}` | 50% of ETH balance | `500000000000000000` |
| `{{percentage:tokenBalance:0xAddr:100}}` | 100% of token balance | `500000000` |
| `{{blockTimestamp}}` | Current block timestamp | `1704567890` |
| `{{deadline:300}}` | Timestamp + N seconds (for swap deadlines) | `1704568190` |
| `{{slippage:amount:5}}` | Amount minus 5% (for minAmountOut) | `950000000` |

#### Transaction Template Structure

**ABI Mode** (recommended):
1. **Contract address** - target contract
2. **ABI** - contract ABI (full or just the function)
3. **Function name** - function to call
4. **Arguments** - array with template placeholders
5. **Value** - ETH to send (can be templated)

**Raw Calldata Mode** (advanced):
1. **Contract address** - target contract
2. **Data** - hex-encoded calldata (can include placeholders)
3. **Value** - ETH to send (can be templated)

#### Example: Swap all USDC for ETH

```json
{
  "contractAddress": "0x2626664c2603336E57B271c5C0b26F421741e481",
  "abi": [{"name": "exactInputSingle", "type": "function", ...}],
  "functionName": "exactInputSingle",
  "args": [{
    "tokenIn": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "tokenOut": "0x4200000000000000000000000000000000000006",
    "fee": 3000,
    "recipient": "{{walletAddress}}",
    "amountIn": "{{percentage:tokenBalance:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913:100}}",
    "amountOutMinimum": 0,
    "sqrtPriceLimitX96": 0
  }],
  "value": "0"
}
```

#### Pre-built Templates (Future)

Common operations as one-click templates:
- **ERC20 Transfer**: Send tokens to an address
- **Uniswap Swap**: Swap token A for token B
- **Wrap/Unwrap ETH**: Convert ETH ↔ WETH
- **Approve Token**: Approve spender for token

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
├── status (pending, processing, completed, failed)
├── template (json) - transaction template with placeholders
├── createdAt
└── updatedAt

TransactionTarget
├── id (uuid)
├── transactionId (fk -> Transaction)
├── membershipId (fk -> SwarmMembership)
├── resolvedTxData (json) - template with placeholders resolved for this wallet
├── userOpHash (string, optional) - ZeroDev UserOperation hash
├── txHash (string, optional) - on-chain transaction hash
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

1. Manager constructs transaction template in dashboard:
   - Selects contract address
   - Pastes ABI or selects from common ABIs
   - Chooses function and fills arguments with placeholders
2. Manager submits template to backend API
3. Backend creates Transaction record with template
4. For each swarm member:
   a. Fetch current balances via Alchemy
   b. Resolve template placeholders (walletAddress, balances, percentages)
   c. Encode transaction calldata using viem
   d. Create TransactionTarget with resolved data
5. Backend calls Lit Action with:
   - Array of resolved transactions (one per wallet)
   - PKP public key
6. Lit Action signs UserOperations for each wallet
7. Backend submits UserOperations to ZeroDev bundler
8. Backend polls for confirmations and updates TransactionTarget status

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

---

## Implementation Notes & Learnings

### Phase 1 Learnings (Project Setup)

**Completed:** 2024-01-07

#### Structure Decisions

1. **Monorepo with pnpm workspaces**: Chose pnpm for better disk space efficiency and stricter dependency resolution. The `workspace:*` protocol ensures packages always use local versions.

2. **TypeScript Configuration**: Created a `tsconfig.base.json` at root with shared settings. Each package extends this and adds package-specific options:
   - Client uses `noEmit: true` since Vite handles bundling
   - Server and shared output to `dist/` directories
   - Lit Actions use `noEmit: true` since esbuild handles bundling

3. **Path Aliases**: Client uses `@/*` path alias via Vite config for cleaner imports. Server uses direct imports since Express doesn't need path aliasing.

4. **ESM Throughout**: All packages use `"type": "module"` for native ES modules. This requires:
   - `.js` extensions in import paths for shared types
   - `tsx` for running TypeScript server code directly

#### Database Schema Notes

1. **SwarmManager Junction Table**: Added a separate `SwarmManager` table (not in original plan) to support multiple managers per swarm in the future. This provides flexibility without schema changes later.

2. **Enum Types**: Used Prisma enums for status fields (`MembershipStatus`, `TransactionStatus`, `TransactionTargetStatus`) for type safety and database-level validation.

3. **Cascade Deletes**: Added `onDelete: Cascade` to all foreign key relations so deleting a swarm cleans up memberships and transactions automatically.

#### Key Files Created

- `packages/shared/src/types/index.ts` - All shared TypeScript types and Zod schemas
- `packages/shared/src/constants/index.ts` - Chain IDs, contract addresses, API routes
- `packages/shared/src/utils/index.ts` - Address formatting, token utilities
- `packages/server/src/lib/prisma.ts` - Singleton Prisma client with dev HMR support
- `packages/server/src/lib/env.ts` - Zod-validated environment variables
- `packages/server/src/middleware/errorHandler.ts` - Centralized error handling with Prisma/Zod support
- `packages/client/src/lib/wagmi.ts` - wagmi v2 config for Base Sepolia/Mainnet
- `packages/client/src/lib/api.ts` - Type-safe API client with JWT support

#### Next Steps for Phase 2

1. Implement SIWE authentication flow on server
2. Create auth context/provider on client
3. Add JWT middleware to protect routes
4. Store/refresh JWT tokens properly

### Phase 2 Learnings (Authentication)

**Completed:** 2025-01-07

#### SIWE Implementation

1. **Nonce Management**: Used in-memory Map for nonce storage with 5-minute expiration. In production, Redis or database storage is recommended for distributed systems. Nonces are tied to wallet addresses and automatically cleaned up via setInterval.

2. **SIWE Message Structure**: Created SIWE messages with domain, address, statement, uri, version, chainId, and nonce. The `prepareMessage()` method formats it for signing.

3. **Signature Verification**: Used siwe v2's `verify()` method which returns verified message data. Handles both valid and invalid signatures gracefully.

#### Auth Middleware

1. **Two Middleware Variants**: Created `authMiddleware` (required auth) and `optionalAuthMiddleware` (auth if present) to support different endpoint needs.

2. **Express Type Extension**: Extended Express Request type globally to include `user?: JWTPayload` for TypeScript support.

3. **JWT Payload**: Stored minimal data (userId, walletAddress) in JWT to reduce token size while providing necessary identification.

#### Frontend Auth Context

1. **Three-State Auth Flow**: Implemented distinct states: (1) Not connected, (2) Connected but not signed in, (3) Fully authenticated. The Layout component shows appropriate UI for each state.

2. **Auto-Logout on Disconnect**: useEffect watches `isConnected` from wagmi and clears auth state when wallet disconnects.

3. **Token Persistence**: JWT stored in localStorage with key `swarm_vault_token`. On mount, attempts to restore session by calling `/api/auth/me`.

4. **API Client Integration**: The api client singleton has `setToken()` method that attaches Bearer token to all requests automatically.

#### Key Files Created

- `packages/server/src/routes/auth.ts` - SIWE nonce and login endpoints
- `packages/server/src/middleware/auth.ts` - JWT verification middleware
- `packages/client/src/contexts/AuthContext.tsx` - React context for auth state
- `packages/client/src/components/ProtectedRoute.tsx` - Route guard component

#### Next Steps for Phase 3

1. Install Lit Protocol SDK and create client singleton
2. Implement PKP minting for swarm creation
3. Create Lit Action for signing transactions
4. Test Lit Action execution in isolation

### Phase 3 Learnings (Lit Protocol Integration)

**Completed:** 2025-01-07

#### Lit SDK Installation

1. **Package Selection**: Used `@lit-protocol/lit-node-client`, `@lit-protocol/contracts-sdk`, `@lit-protocol/auth-helpers`, and `@lit-protocol/constants` for comprehensive Lit Protocol integration.

2. **Network Configuration**: Updated environment variables to use Lit's Datil networks (`datil-dev`, `datil-test`, `datil`) instead of the deprecated `naga-dev`. The network names map to `LIT_NETWORK.DatilDev`, etc.

3. **Type Compatibility Issues**: The Lit SDK has some TypeScript type incompatibilities between versions. Needed to use `as any` type assertions for `litNetwork` and `network` parameters in `LitNodeClient` and `LitContracts` constructors.

4. **Ethers vs Viem**: The Lit SDK's `generateAuthSig` function expects an ethers `Wallet` or `Signer`, not a viem `WalletClient`. Added `ethers` package to server dependencies alongside existing `viem` for this purpose.

#### Lit Client Architecture

1. **Singleton Pattern**: Created singleton instances for both `LitNodeClient` and `LitContracts` to avoid reconnecting on each request. The client checks `litNodeClient.ready` before reusing.

2. **Session Management**: Implemented `getSessionSigs()` function that generates SIWE-based authentication and obtains session signatures for PKP signing and Lit Action execution. Sessions expire after 1 hour.

3. **Subsidized Operations**: All Lit operations (PKP minting, action execution) use a subsidizing wallet from `LIT_PRIVATE_KEY` environment variable. This wallet pays for gas on the Lit network.

#### Lit Action Development

1. **Bundling with esbuild**: Lit Actions must be bundled as IIFE (Immediately Invoked Function Expression) for execution on the Lit network. Used esbuild with `--format=iife --platform=neutral` flags.

2. **Lit Action Interface**: Actions receive parameters via global `jsParams` and return results via `Lit.Actions.setResponse()`. Signatures are collected using `Lit.Actions.signEcdsa()` with unique `sigName` identifiers.

3. **UserOperation Signing**: The Lit Action accepts an array of UserOperation hashes and signs each with the PKP. Signatures are returned with names `sig_0`, `sig_1`, etc., accessible in the `result.signatures` object.

#### Key Files Created

- `packages/server/src/lib/lit.ts` - Lit client singleton, PKP minting, session management
- `packages/server/src/lib/litActions.ts` - Helper to load and execute bundled Lit Actions
- `packages/lit-actions/src/signTransaction.ts` - Lit Action for signing UserOperations

#### Next Steps for Phase 4

1. Install ZeroDev SDK and configure bundler client
2. Create function to compute counterfactual wallet addresses
3. Implement session key registration for PKP signers
4. Connect Lit PKP signing to ZeroDev UserOperation flow

### Phase 4 Learnings (ZeroDev Integration)

**Completed:** 2025-01-07

#### ZeroDev SDK Installation

1. **Package Selection**: Used `@zerodev/sdk`, `@zerodev/ecdsa-validator`, and `permissionless` packages. The ZeroDev SDK is built on top of permissionless.js which provides account abstraction primitives.

2. **Kernel Version**: Using `KERNEL_V3_1` (Kernel v3.1) which is the latest stable version. This provides modular plugin architecture for validators and permission systems.

3. **Entry Point**: Using EntryPoint v0.7 (`getEntryPoint("0.7")`) which is the latest ERC-4337 specification.

#### Bundler & Paymaster Configuration

1. **RPC URL Format**: ZeroDev v3 provides a unified RPC endpoint:
   - Format: `https://rpc.zerodev.app/api/v3/{projectId}/chain/{chainId}`
   - Single URL for bundler, paymaster, and RPC operations

2. **Paymaster Integration**: Created `createZeroDevPaymasterClient` for sponsored transactions. The paymaster is configured in the kernel client's `paymaster.getPaymasterData` callback.

3. **Client Architecture**: Three client types work together:
   - `PublicClient` - for reading blockchain state (required for account creation)
   - `KernelAccountClient` - for smart account operations (includes `client` param pointing to PublicClient)
   - `PaymasterClient` - for gas sponsorship

4. **UserOperation Submission**: Use `sendUserOperation` with `encodeCalls` instead of `sendTransaction`:
   ```typescript
   const callData = await kernelClient.account.encodeCalls([{ to, value, data }]);
   const userOpHash = await kernelClient.sendUserOperation({ callData });
   ```

5. **Waiting for Confirmation**: Use `waitForUserOperationReceipt` on the kernel client:
   ```typescript
   await kernelClient.waitForUserOperationReceipt({ hash: userOpHash, timeout: 15000 });
   ```

#### Smart Wallet Address Computation

1. **Counterfactual Addresses**: Wallet addresses are deterministically computed from the owner's EOA address and an optional index. The wallet doesn't need to be deployed to know its address.

2. **ECDSA Validator**: Using `signerToEcdsaValidator` to create validators from EOA signers. This establishes the ownership relationship.

3. **Index Parameter**: The `index` parameter (default `0n`) allows creating multiple wallets per user if needed.

#### Type Compatibility

1. **TypeScript Challenges**: The ZeroDev SDK has complex generic types that sometimes require explicit type annotations or `as any` casts to satisfy TypeScript's strict checks.

2. **KernelClient Type**: Created a type alias `KernelClient = Awaited<ReturnType<typeof createKernelAccountClient<any, any, any>>>` to handle complex inferred types.

3. **Account Parameter**: Some client methods require the `account` parameter to be explicitly passed even when the client already has it attached, depending on the generic type inference.

#### Key Files Created

- `packages/server/src/lib/zerodev.ts` - ZeroDev client setup, wallet creation, UserOp building and submission

#### Key Functions

- `getBundlerUrl()` / `getPaymasterUrl()` - Derive RPC URLs from project ID
- `computeSmartWalletAddress()` - Compute counterfactual address for a user
- `createUserSmartAccount()` - Create a Kernel smart account
- `createAccountClient()` - Create a client for sending transactions
- `buildUserOperation()` - Prepare a UserOperation
- `signUserOpWithPKP()` - Sign UserOp using Lit PKP
- `submitUserOperation()` - Submit UserOp to bundler
- `executeBatchTransactions()` - Execute multiple transactions atomically
- `waitForUserOpReceipt()` - Poll for transaction confirmation

#### Next Steps for Phase 5

1. Create swarm management API endpoints (list, create, get)
2. Integrate PKP minting into swarm creation flow
3. Build manager dashboard UI for swarm management
4. Implement member listing with agent wallet addresses

### Phase 5 Learnings (Swarm Management)

**Completed:** 2025-01-07

#### Backend API Design

1. **Optional Auth for Public Routes**: Used `optionalAuthMiddleware` for listing swarms so public users can browse, but authenticated users get additional context (like `isManager` flag).

2. **Prisma Aggregations**: Used Prisma's `_count` feature with `include` to efficiently count active memberships without loading all records:
   ```typescript
   _count: {
     select: {
       memberships: { where: { status: "ACTIVE" } }
     }
   }
   ```

3. **Manager-Only Endpoints**: Added authorization check in `GET /api/swarms/:id/members` to verify the requesting user is a manager of the swarm before returning member data.

4. **PKP Info Privacy**: The `litPkpPublicKey` is only returned to managers, not public users, as a security consideration.

#### Frontend Architecture

1. **Vite TypeScript Configuration**: Added `vite-env.d.ts` with `/// <reference types="vite/client" />` and configured `"types": ["vite/client"]` in tsconfig to enable `import.meta.env` type support.

2. **Modal Component Pattern**: Created `CreateSwarmModal` as a self-contained component that handles its own form state, loading states, and error display. The parent component only passes `isOpen`, `onClose`, and `onCreated` callbacks.

3. **Protected Routes**: Used existing `ProtectedRoute` component wrapper for manager dashboard routes. Unprotected routes (like SwarmDiscovery) handle the unauthenticated state gracefully with informational messages.

4. **Search/Filter Client-Side**: For the SwarmDiscovery page, implemented client-side filtering since the swarm list is expected to be small. Server-side pagination/search would be needed for scale.

#### Key Files Created

- `packages/server/src/routes/swarms.ts` - All swarm CRUD endpoints
- `packages/client/src/pages/ManagerDashboard.tsx` - Manager's swarm list view
- `packages/client/src/pages/SwarmDetail.tsx` - Swarm detail with member table
- `packages/client/src/pages/SwarmDiscovery.tsx` - Public swarm browsing
- `packages/client/src/components/CreateSwarmModal.tsx` - Swarm creation form

#### Next Steps for Phase 6

1. Create membership endpoints (join swarm, list memberships)
2. Integrate ZeroDev wallet creation when user joins swarm
3. Build user dashboard for viewing memberships
4. Show agent wallet address and deposit instructions

### Phase 6 Learnings (User Membership)

**Completed:** 2025-01-07

#### Backend Membership Flow

1. **ZeroDev Address Computation**: The `computeSmartWalletAddress` function computes deterministic counterfactual addresses based on the user's EOA. This address is computed without deploying the smart wallet - deployment happens on first transaction.

2. **Re-joining Flow**: When a user leaves a swarm, their membership status changes to "LEFT" but the record is preserved. If they join again, the existing record is reactivated with a new `joinedAt` timestamp rather than creating a duplicate.

3. **Prisma Unique Constraints**: The `@@unique([swarmId, userId])` constraint on `SwarmMembership` ensures one membership per user per swarm. Used `findUnique` with the compound key for efficient lookups:
   ```typescript
   await prisma.swarmMembership.findUnique({
     where: { swarmId_userId: { swarmId, userId } }
   });
   ```

4. **Router Mounting Strategy**: The memberships router handles both `/api/memberships/*` routes and `/api/swarms/:id/join`. Mounted twice at `/api/memberships` and `/api` to handle both URL patterns cleanly.

#### Frontend User Experience

1. **Membership State Tracking**: SwarmDiscovery fetches both swarms and user memberships to show accurate membership status on each card. This enables showing "Member" badges and converting "Join" buttons to "View" links.

2. **Optimistic UI Updates**: After joining a swarm, the membership list and member count are updated locally before navigating to the detail page, providing instant feedback.

3. **Copy to Clipboard**: Implemented clipboard copy for agent wallet addresses with visual feedback ("Copied!" state that resets after 2 seconds).

4. **Leave Confirmation**: Added two-step leave flow - click "Leave Swarm" to show confirmation buttons, then "Confirm Leave" to execute. This prevents accidental leaves.

5. **External Links**: Added links to BaseScan (for balance viewing) and dApps like Zerion/Safe (for withdrawals), providing clear paths for users to interact with their agent wallets.

#### Navigation Improvements

1. **Header Navigation**: Added persistent navigation links (Discover, My Swarms, Manager) in the Layout header for authenticated users, improving discoverability of features.

2. **Cross-Page Links**: Added "My Swarms" link with count badge on SwarmDiscovery page, and "Discover Swarms" button on MySwarms page for easy navigation between views.

#### Key Files Created

- `packages/server/src/routes/memberships.ts` - All membership CRUD endpoints (join, list, detail, leave)
- `packages/client/src/pages/MySwarms.tsx` - User's membership list view
- `packages/client/src/pages/MembershipDetail.tsx` - Detailed membership view with deposit/withdraw instructions

#### Key Files Modified

- `packages/server/src/index.ts` - Added memberships router mounting
- `packages/client/src/App.tsx` - Added routes for my-swarms pages
- `packages/client/src/pages/SwarmDiscovery.tsx` - Enhanced with join functionality
- `packages/client/src/components/Layout.tsx` - Added navigation links

#### Next Steps for Phase 7

1. Create transaction template engine in shared package
2. Implement template placeholder resolution (walletAddress, balances, percentages)
3. Build transaction execution endpoint
4. Create manager UI for building and submitting transactions

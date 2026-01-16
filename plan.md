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

- Name, description
- A Lit Protocol PKP (owned by the manager)
- Multiple user memberships
- Manager's verified Twitter account displayed for trust/accountability

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

1. Manager fills out swarm form (name, description)
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

### 6. User Withdraws ERC20 (In-App)

1. User views their agent wallet balance on MembershipDetail page
2. Each token balance row has a "Withdraw" button
3. User clicks "Withdraw" on desired token
4. Modal opens showing:
   - Token symbol and current balance
   - Amount input (with "Max" button)
   - Destination: user's MetaMask EOA (pre-filled, read-only)
5. User clicks "Withdraw" in modal
6. Client builds ERC20 transfer transaction
7. User's MetaMask signs the transaction (as wallet owner)
8. Transaction submitted via ZeroDev bundler
9. Balance refreshes after confirmation

### 7. User Withdraws (via WalletConnect) [Alternative]

1. User clicks "Connect to dApp" button
2. WalletConnect modal opens
3. User connects to external dApp (e.g., Zerion)
4. User initiates transfer from dApp
5. Transaction signed by user's MetaMask (as wallet owner)

### 8. Manager Executes Swap (Simplified)

1. Manager navigates to swarm detail page
2. Manager clicks "New Swap" button
3. Swap form displays:
   - "Sell" token dropdown (populated from common tokens + any tokens held by members)
   - "Buy" token dropdown
   - Amount type: "Percentage of balance" (default 100%) or "Fixed amount"
   - Slippage tolerance input (default 1%)
4. Manager clicks "Preview Swap"
5. Backend calls 0x API `/swap/permit2/quote` for each member wallet:
   - Gets best route across DEXs
   - Returns expected output amounts per wallet
6. Manager reviews preview showing:
   - Per-member: input amount → expected output
   - Total volume across all wallets
   - Price impact warning if significant
7. Manager clicks "Execute Swap"
8. Backend builds transactions from 0x quote data:
   - Approval transaction if needed (for Permit2)
   - Swap transaction with 0x calldata
9. Transactions signed via PKP and submitted
10. Status updates shown in real-time

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

# 0x DEX Aggregator
ZEROX_API_KEY=...

# Auth
JWT_SECRET=...
```

## Security Considerations

1. **User Sovereignty**: Users always retain ownership via their MetaMask EOA
2. **Manager Trust**: Currently managers are fully trusted; future: add transaction simulation in Lit Action
3. **Session Keys**: PKP session keys should have appropriate permissions/expiry
4. **API Auth**: All mutating endpoints require valid JWT
5. **Input Validation**: Validate all transaction data before signing

## Upcoming Features

### Switch to Naga Lit Network (Phase 14)

The app currently uses the Datil Lit network. Phase 14 switches to the Naga network, which is Lit Protocol's latest production network.

**Note:** Since this app hasn't launched yet, no migration of existing PKPs is needed. Just wipe the local database and start fresh.

**Changes Required:**
1. Update `LIT_NETWORK` environment variable to `naga-dev` (development) or `naga` (production)
2. Update network validation in `packages/server/src/lib/env.ts`
3. Update network constants in `packages/server/src/lib/lit.ts`
4. Verify SDK compatibility with Naga network
5. Test all PKP operations (minting, signing, Lit Actions)

**Environment Variables:**
- `LIT_NETWORK` - Change from `datil-dev`/`datil` to `naga-dev`/`naga`

## Future Enhancements

1. **Transaction Simulation**: Use Alchemy simulation API in Lit Action to detect malicious transactions
2. **WalletConnect Integration**: Let users connect their agent wallet to dApps
3. **Spending Limits**: Allow users to set per-transaction or daily limits
4. **Analytics Dashboard**: Track swarm performance, TVL, transaction history

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

#### Phase 6 Fixes (Smart Wallet Architecture)

**Issue:** Initial implementation tried to create smart wallets server-side, but ZeroDev requires the user's wallet to sign the validator creation.

**Solution:** Moved smart wallet creation to client-side:

1. **Client creates the kernel account:**
   - Uses `signerToEcdsaValidator` with user's wallet (wagmi provider) as owner
   - Uses `addressToEmptyAccount` + `toECDSASigner` for PKP address (no private key needed)
   - Creates `toPermissionValidator` with `toSudoPolicy` for full PKP permissions
   - Combines into `createKernelAccount` with sudo (user) and regular (PKP) validators

2. **Client serializes the approval:**
   - `serializePermissionAccount(kernelAccount)` creates a string that backend can use
   - This approval allows the backend to reconstruct the account for PKP signing

3. **Backend stores and uses approval:**
   - Membership stores `sessionKeyApproval` in database
   - During transaction execution, backend uses `deserializePermissionAccount` with PKP signer

**Key Code Pattern (Client):**
```typescript
// Create empty account for PKP (we only need the address)
const emptyAccount = addressToEmptyAccount(pkpAddress);
const pkpSigner = await toECDSASigner({ signer: emptyAccount });

// Create permission validator with sudo policy
const permissionPlugin = await toPermissionValidator(publicClient, {
  signer: pkpSigner,
  policies: [toSudoPolicy({})],
  ...
});

// Create kernel account
const kernelAccount = await createKernelAccount(publicClient, {
  plugins: {
    sudo: ecdsaValidator,    // User's wallet
    regular: permissionPlugin, // PKP with full permissions
  },
  ...
});

// Serialize for backend
const approval = await serializePermissionAccount(kernelAccount);
```

**Database Changes:**
- Added `litPkpEthAddress` to `Swarm` model
- Added `sessionKeyApproval` to `SwarmMembership` model

#### Next Steps for Phase 7

1. Create transaction template engine in shared package
2. Implement template placeholder resolution (walletAddress, balances, percentages)
3. Build transaction execution endpoint using `deserializePermissionAccount`
4. Create manager UI for building and submitting transactions

### Phase 7 Learnings (Transaction Templating & Execution)

**Completed:** 2025-01-08

#### Template Engine Architecture

1. **Placeholder System**: Implemented a flexible placeholder system supporting:
   - Simple values: `{{walletAddress}}`, `{{ethBalance}}`, `{{blockTimestamp}}`
   - Parameterized values: `{{tokenBalance:0xAddress}}`, `{{deadline:300}}`
   - Percentage calculations: `{{percentage:ethBalance:50}}`, `{{percentage:tokenBalance:0x...:100}}`
   - Slippage calculations: `{{slippage:ethBalance:5}}` for minAmountOut scenarios

2. **Two Template Modes**:
   - **ABI Mode**: Contract ABI + function name + args array. Uses viem's `encodeFunctionData` for encoding.
   - **Raw Mode**: Direct hex calldata with placeholder substitution for advanced users.

3. **Recursive Resolution**: Template values are recursively resolved through objects and arrays, allowing placeholders in nested structures like swap parameters.

#### Backend Transaction Flow

1. **Async Execution Pattern**: Transaction submission returns immediately with status "PENDING", then executes asynchronously. This prevents HTTP timeouts for large swarms.

2. **Per-Member Resolution**: Each member's wallet context is fetched independently (ETH balance, token balances, block timestamp) before resolving placeholders.

3. **Permission Account Deserialization**: Uses `deserializePermissionAccount` from `@zerodev/permissions` to reconstruct the kernel account client from the stored `sessionKeyApproval`. This allows the PKP to sign on behalf of the user's smart wallet.

4. **Error Isolation**: Failures for individual members don't affect other members. Each TransactionTarget tracks its own status and error.

5. **Status Aggregation**: Parent Transaction status is derived from target statuses:
   - PROCESSING if any target is PENDING or SUBMITTED
   - COMPLETED if all targets are CONFIRMED
   - FAILED if any target failed and not all confirmed

#### Frontend Transaction UI

1. **Quick Load ABIs**: Pre-configured common ABIs (ERC20 Transfer, Approve, WETH operations) for faster template creation.

2. **Dynamic Form Generation**: Function arguments are dynamically generated from parsed ABI, with type hints for each input.

3. **Placeholder Reference**: In-form documentation for all available placeholders helps managers construct templates without external docs.

4. **Auto-Refresh**: Transaction history auto-refreshes every 5 seconds when there are pending/processing transactions.

#### Key Files Created

- `packages/shared/src/template/index.ts` - Template engine with placeholder parsing, extraction, and resolution
- `packages/server/src/lib/alchemy.ts` - Alchemy balance fetching service
- `packages/server/src/lib/transactionExecutor.ts` - Async transaction execution with ZeroDev integration
- `packages/server/src/routes/transactions.ts` - Transaction API endpoints
- `packages/client/src/components/TransactionForm.tsx` - Template builder modal
- `packages/client/src/components/TransactionHistory.tsx` - Transaction list and detail view

#### Dependencies Added

- `@zerodev/permissions` on server for `deserializePermissionAccount`

#### Phase 7 Fix: PKP Signer for Transaction Execution

**Issue:** Initial implementation of `deserializePermissionAccount` didn't include a signer, so the PKP couldn't actually sign transactions.

**Solution:** Created a custom viem account using `toAccount` that routes signing operations through Lit Protocol:

1. **`packages/server/src/lib/pkpSigner.ts`** - Custom viem account implementation:
   - Uses `toAccount` from viem to create a custom account
   - Implements `signMessage`, `signTransaction`, and `signTypedData`
   - Each method hashes the input appropriately and calls the Lit Action to sign
   - Uses `hashMessage` (EIP-191), `hashTypedData` (EIP-712), and `keccak256(serializeTransaction())` for transaction signing

2. **Updated `transactionExecutor.ts`**:
   - Creates PKP viem account from swarm's PKP public key and ETH address
   - Wraps it with `toECDSASigner` from ZeroDev permissions
   - Passes the signer as the 5th parameter to `deserializePermissionAccount`

**Key Code Pattern:**
```typescript
// Create custom viem account for PKP signing
const pkpViemAccount = createPkpViemAccount(
  swarm.litPkpPublicKey,
  swarm.litPkpEthAddress as Address
);

// Wrap with ZeroDev's ECDSA signer
const pkpSigner = await toECDSASigner({ signer: pkpViemAccount });

// Deserialize with the signer
const permissionAccount = await deserializePermissionAccount(
  publicClient,
  ENTRY_POINT,
  KERNEL_VERSION,
  membership.sessionKeyApproval!,
  pkpSigner  // <-- Pass the signer here
);
```

### Phase 8 Learnings (Balance Display)

**Completed:** 2025-01-08

#### Alchemy Integration Approach

1. **No SDK Needed**: Using Alchemy's JSON-RPC API directly with `fetch`. The Alchemy SDK would add overhead without significant benefit for our use case.

2. **Dynamic Token Discovery**: Uses `alchemy_getTokenBalances` with `"erc20"` tokenSpec to automatically discover all ERC-20 tokens in the wallet. No need to maintain a hardcoded token list.

3. **Token Metadata**: Uses `alchemy_getTokenMetadata` to fetch symbol, name, decimals, and logo for each discovered token. Metadata is permanently cached since tokens don't change.

4. **Balance Caching**: Implemented in-memory cache with 30-second TTL to reduce RPC calls. The `getWalletBalancesForDisplay` function checks cache first and supports a `forceRefresh` parameter.

#### Balance API Endpoint

1. **Route Design**: `GET /api/memberships/:id/balance` fetches balances for a membership's agent wallet. Accepts `?refresh=true` query param to bypass cache.

2. **Response Structure**: Returns ETH balance, token balances array with metadata, and cache information (fetchedAt timestamp, cached boolean).

3. **Authorization**: Only the membership owner can view their wallet balance, enforced via JWT authentication.

#### Frontend Balance Component

1. **Loading States**: Separate `isLoading` (initial load) and `isRefreshing` (manual refresh) states for appropriate UI feedback.

2. **Balance Formatting**: Using viem's `formatUnits` for proper decimal handling. Custom formatting handles very small amounts, showing "<0.0001" instead of scientific notation.

3. **Empty State**: Shows helpful message when wallet has no balance, prompting user to deposit funds.

4. **Visual Design**: Token icons from CoinGecko CDN with fallback to colored circle with symbol initial. ETH gets a custom gradient avatar.

5. **Network Indicator**: Shows current network (Base Mainnet vs Sepolia) and last update time in footer.

#### Key Files Created/Modified

- `packages/server/src/lib/alchemy.ts` - Added `alchemy_getTokenBalances` and `alchemy_getTokenMetadata` API calls, caching, and `getWalletBalancesForDisplay` function
- `packages/server/src/routes/memberships.ts` - Added balance endpoint
- `packages/client/src/components/BalanceDisplay.tsx` - New balance display component
- `packages/client/src/pages/MembershipDetail.tsx` - Integrated BalanceDisplay component

#### Next Steps for Phase 9

1. Add 0x API integration for swap quotes
2. Create swap preview and execution endpoints
3. Build manager swap UI

### Phase 8.5 Learnings (User ERC20 Withdrawal)

**Completed:** 2025-01-08

#### Client-Side Smart Wallet Architecture

1. **User as Sudo Validator**: The user's connected wallet (via wagmi) acts as the sudo/owner validator of their agent wallet. This means the user can directly sign transactions as the owner without needing the PKP.

2. **ZeroDev Client-Side Integration**: Created client-side withdrawal functions that:
   - Use `signerToEcdsaValidator` with the user's wallet client as the signer
   - Create a kernel account with the user as sudo validator
   - Use `createKernelAccountClient` with paymaster for gas sponsorship
   - Submit UserOperations directly to the bundler

3. **Wallet Address Verification**: Added verification step to ensure the computed kernel account address matches the stored agent wallet address. This prevents signing for the wrong account.

4. **Index Consistency**: The withdrawal functions use `swarmIdToIndex` to derive the same deterministic index used during wallet creation, ensuring the correct kernel account is reconstructed.

#### Withdrawal Flow

1. **Unified Pattern for ETH and ERC20**: Both `withdrawETH` and `withdrawToken` functions follow the same pattern:
   - Create ECDSA validator with user's wallet
   - Create kernel account
   - Create kernel client with paymaster
   - Encode and submit UserOperation
   - Wait for confirmation

2. **ERC20 Transfer Encoding**: Using viem's `encodeFunctionData` with a minimal ERC20 transfer ABI to build the calldata.

3. **Native ETH Transfer**: For ETH withdrawals, the call has `value: amount` and `data: "0x"` (empty calldata).

#### Modal UX Design

1. **Status States**: Implemented multiple status states (idle, preparing, signing, submitting, confirming, success, error) to provide clear feedback during the withdrawal process.

2. **Validation**: Amount validation checks for valid number format and balance limits before enabling the withdraw button.

3. **Auto-Refresh**: Balance is automatically refreshed after a successful withdrawal, with the modal closing after a brief delay to show success state.

4. **Error Display**: User-friendly error messages are displayed, with the full error available for debugging in the console.

#### Environment Configuration

1. **VITE_ZERODEV_PROJECT_ID**: Added client-side environment variable for ZeroDev project ID, required for bundler/paymaster RPC URL construction.

#### Key Files Created/Modified

- `packages/client/src/lib/smartWallet.ts` - Added `withdrawToken`, `withdrawETH`, `getZeroDevRpcUrl` functions
- `packages/client/src/components/WithdrawModal.tsx` - New modal component for withdrawal UI
- `packages/client/src/components/BalanceDisplay.tsx` - Added withdraw buttons and modal integration
- `packages/client/src/pages/MembershipDetail.tsx` - Updated to pass required props to BalanceDisplay
- `.env.example` - Added `VITE_ZERODEV_PROJECT_ID` variable

### Phase 9 Learnings (Manager Swap UI)

**Completed:** 2025-01-09

#### 0x API Integration

1. **API Version**: Used 0x Swap API v1 (`/swap/v1/price` for preview, `/swap/v1/quote` for execution). The API requires an API key passed via `0x-api-key` header.

2. **Quote vs Price Endpoints**:
   - `/swap/v1/price` - Lightweight endpoint for previews, returns expected amounts without transaction data
   - `/swap/v1/quote` - Full endpoint with transaction data for execution, includes `transaction.to`, `transaction.data`, and `allowanceTarget`

3. **Native ETH Handling**: 0x uses `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` as a special address for native ETH in swaps.

4. **Allowance Target**: The 0x API returns an `allowanceTarget` address where ERC20 approvals should be directed. This may differ from the swap router address.

#### Swap Execution Architecture

1. **Multi-Call Pattern**: Used ZeroDev's `encodeCalls` to batch approval and swap transactions into a single UserOperation. This provides atomicity and saves gas.

2. **Approval Strategy**: Before each swap, check the current allowance. If insufficient, add an approval call for max uint256 to the calls array. This ensures the swap has sufficient allowance.

3. **Reusing Transaction Infrastructure**: Created `swapExecutor.ts` following the same pattern as `transactionExecutor.ts`. Both use `deserializePermissionAccount` with PKP signer and create TransactionTarget records for status tracking.

#### Frontend Swap Flow

1. **Step-Based Modal**: Implemented a multi-step flow in a single component:
   - `form` - Token selection, percentage, slippage
   - `preview` - Show expected outcomes per member
   - `executing` - Loading state during submission
   - `done` - Success confirmation

2. **Holdings Aggregation**: Created `/api/swarms/:id/holdings` endpoint that aggregates token balances across all swarm members. This populates the "sell" dropdown with tokens actually held by members.

3. **Token Lists**: Combined approach of showing:
   - Held tokens with balances (from holdings endpoint)
   - Common tokens for the chain (from shared constants)
   - This allows swapping into tokens not currently held

4. **Percentage-Based Amounts**: Default to 100% of balance for simplicity. The percentage slider allows managers to swap partial balances across all members uniformly.

#### Key Files Created

- `packages/server/src/lib/zeroEx.ts` - 0x API service with quote/price functions
- `packages/server/src/lib/swapExecutor.ts` - Async swap execution with approval handling
- `packages/server/src/routes/swap.ts` - Swap API endpoints (preview, execute, holdings)
- `packages/client/src/components/SwapForm.tsx` - Multi-step swap UI component

#### Key Files Modified

- `packages/shared/src/constants/index.ts` - Added NATIVE_ETH constant, extended token lists, added swap API routes
- `packages/server/src/lib/env.ts` - Added ZEROX_API_KEY validation
- `packages/server/src/index.ts` - Registered swap router
- `packages/client/src/pages/SwarmDetail.tsx` - Added "New Swap" button and SwapForm modal
- `.env.example` - Added ZEROX_API_KEY

### Phase 10 Learnings (Polish & Testing)

**Completed:** 2025-01-09

#### Error Handling Architecture

1. **Structured Error Codes**: Implemented `ErrorCode` enum in shared package with categorized error codes:
   - `AUTH_*` - Authentication errors (001-005)
   - `VAL_*` - Validation errors (001-004)
   - `RES_*` - Resource errors (001-006)
   - `PERM_*` - Permission errors (001-004)
   - `EXT_*` - External service errors (001-005)
   - `TX_*` - Transaction errors (001-005)
   - `INT_*` - Internal errors (001-003)

2. **User-Friendly Messages**: Created a mapping of error codes to user-friendly messages in `errorHandler.ts`. Messages are generic enough to not leak sensitive information but specific enough to be actionable.

3. **Enhanced AppError Class**: Extended `AppError` to include `code` (ErrorCode) and `details` properties. Details are only exposed in development mode.

4. **ApiResponse Enhancement**: Added `errorCode` and `details` fields to the shared `ApiResponse` interface for programmatic error handling on the client.

#### React Error Handling

1. **ErrorBoundary Component**: Created class-based ErrorBoundary component that catches React render errors. Features:
   - Displays user-friendly error message
   - Shows error details in expandable section
   - "Try Again" and "Refresh Page" buttons for recovery
   - Accepts custom fallback prop for specialized error UIs

2. **ErrorDisplay Component**: Reusable component for displaying API errors with:
   - Multiple variants: `inline`, `banner`, `toast`
   - Optional dismiss and retry callbacks
   - Error code display for debugging

3. **Provider Hierarchy**: Wrapped entire app with ErrorBoundary at the top level in `main.tsx`, outside all other providers to catch any errors in the component tree.

#### Loading States

1. **LoadingSpinner Component**: Configurable spinner with:
   - Size variants: `sm`, `md`, `lg`
   - Optional text label
   - `fullScreen` mode for page-level loading

2. **LoadingSkeleton Components**: Created multiple skeleton variants:
   - `Skeleton` - Base component with pulse animation
   - `CardSkeleton` - Generic card placeholder
   - `SwarmCardSkeleton` - Specific to swarm cards
   - `TableSkeleton` - Table with configurable rows/columns
   - `BalanceSkeleton` - Balance display placeholder
   - `FormSkeleton` - Form inputs placeholder

3. **Page-Level Skeletons**: Updated `ManagerDashboard` and `MySwarms` pages to show skeleton grids while loading instead of basic spinners, providing better perceived performance.

#### Testing Infrastructure

1. **Vitest Setup**: Added Vitest as the test framework (preferred for Vite projects):
   - Added to root and shared package.json
   - Created `vitest.config.ts` with Node environment
   - Added test scripts: `test`, `test:watch`, `test:coverage`

2. **Template Engine Tests**: Created comprehensive test suite with 51 tests covering:
   - `parsePlaceholder` - All placeholder types and edge cases
   - `extractPlaceholders` - Nested objects and arrays
   - `getRequiredTokenAddresses` - Token address extraction
   - `resolvePlaceholder` - All resolution types
   - `resolveString` - String interpolation
   - `resolveValue` - Recursive resolution
   - `validateTemplate` - Schema validation
   - `resolveTemplate` - Full template resolution
   - Edge cases: zero balances, large numbers, decimal percentages

#### Documentation

1. **Comprehensive README**: Created README.md with:
   - Project overview and features
   - Tech stack description
   - Prerequisites and quick start guide
   - Project structure
   - Environment variables table
   - Complete API reference with request/response examples
   - Template placeholders reference
   - Error codes reference
   - Scripts reference
   - Testing instructions

#### Key Files Created

- `packages/shared/src/types/index.ts` - Added ErrorCode enum and enhanced ApiResponse
- `packages/server/src/middleware/errorHandler.ts` - Enhanced with error codes and user-friendly messages
- `packages/client/src/components/ErrorBoundary.tsx` - React error boundary
- `packages/client/src/components/ErrorDisplay.tsx` - Reusable error display
- `packages/client/src/components/LoadingSpinner.tsx` - Configurable spinner
- `packages/client/src/components/LoadingSkeleton.tsx` - Multiple skeleton variants
- `packages/shared/vitest.config.ts` - Vitest configuration
- `packages/shared/src/template/template.test.ts` - Template engine test suite
- `README.md` - Comprehensive project documentation

#### Key Files Modified

- `packages/client/src/main.tsx` - Added ErrorBoundary wrapper
- `packages/client/src/pages/ManagerDashboard.tsx` - Added skeleton loading and ErrorDisplay
- `packages/client/src/pages/MySwarms.tsx` - Added skeleton loading and ErrorDisplay
- `package.json` - Added test scripts and vitest dependency
- `packages/shared/package.json` - Added test scripts and vitest dependency

### Phase 11 Learnings (Twitter OAuth for Managers)

**Completed:** 2025-01-10

#### Twitter OAuth 2.0 with PKCE

1. **PKCE Flow**: Twitter requires PKCE (Proof Key for Code Exchange) for OAuth 2.0. Implemented code verifier and code challenge generation using SHA-256:
   ```typescript
   const codeVerifier = crypto.randomBytes(32).toString("base64url");
   const codeChallenge = crypto
     .createHash("sha256")
     .update(codeVerifier)
     .digest("base64url");
   ```

2. **State Management**: Used in-memory Map to store OAuth state, code verifier, and user ID during the authorization flow. Each entry expires after 10 minutes.

3. **Token Exchange**: Twitter's token endpoint requires Basic authentication with client credentials encoded in Base64:
   ```typescript
   Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`
   ```

4. **User Info Endpoint**: After obtaining access token, fetch user info from `https://api.twitter.com/2/users/me` to get Twitter ID and username.

#### Database & Schema

1. **Unique Constraint on twitterId**: Added unique constraint to prevent multiple users from linking the same Twitter account.

2. **Nullable Fields**: Both `twitterId` and `twitterUsername` are optional since users may not have connected Twitter yet.

#### Frontend Integration

1. **Settings Page**: Created dedicated Settings page with Twitter connection UI at `/settings` route.

2. **OAuth Callback Handling**: Twitter redirects back to backend callback URL, which then redirects to frontend `/settings` with success/error query parameters.

3. **Visual Indicators**: Added yellow dot indicator in navigation when Twitter is not connected, prompting managers to link their account.

4. **CreateSwarmModal Guard**: If user hasn't connected Twitter, modal shows a prompt to connect instead of the creation form.

#### Key Files Created

- `packages/client/src/pages/Settings.tsx` - Settings page with Twitter connection UI
- `prisma/migrations/20250110000000_add_twitter_fields/migration.sql` - Database migration

#### Key Files Modified

- `prisma/schema.prisma` - Added twitterId, twitterUsername to User model
- `packages/server/src/lib/env.ts` - Added Twitter OAuth environment variables
- `packages/server/src/routes/auth.ts` - Added Twitter OAuth endpoints
- `packages/server/src/routes/swarms.ts` - Added Twitter requirement check for swarm creation
- `packages/shared/src/types/index.ts` - Added Twitter fields to User type, added error codes
- `packages/client/src/App.tsx` - Added Settings route
- `packages/client/src/components/Layout.tsx` - Added Settings link with Twitter status
- `packages/client/src/components/CreateSwarmModal.tsx` - Added Twitter requirement check
- `packages/client/src/pages/SwarmDiscovery.tsx` - Display manager Twitter handle
- `packages/client/src/pages/SwarmDetail.tsx` - Display manager Twitter handle
- `packages/client/src/pages/ManagerDashboard.tsx` - Display manager Twitter handle
- `.env.example` - Added Twitter OAuth environment variables

### Phase 12 Learnings (0x Swap Fee Collection)

**Completed:** 2025-01-12

#### 0x API Fee Parameters

1. **Fee Parameter Names**: The 0x API v1 supports affiliate fees via:
   - `buyTokenPercentageFee` - decimal percentage of buy token (e.g., 0.005 for 0.5%)
   - `feeRecipient` - wallet address to receive the fee

2. **Fee Calculation from Response**: The API response includes both gross and net amounts:
   - `grossBuyAmount` - total amount before fees
   - `buyAmount` - net amount after fees
   - Fee amount = `grossBuyAmount - buyAmount`

3. **Basis Points Conversion**: Implemented helper functions in shared constants:
   - `bpsToPercentage(bps)` - converts basis points to decimal (50 → 0.005)
   - `formatBps(bps)` - formats for display (50 → "0.5%")

#### Environment Configuration

1. **Optional Fee Recipient**: Made `SWAP_FEE_RECIPIENT` optional - if not set, no fees are collected. This allows deploying without fees initially.

2. **Configurable Fee Rate**: `SWAP_FEE_BPS` defaults to 50 (0.5%) but can be adjusted from 0-1000 (0-10%).

3. **Fee Config Helper**: Created `getFeeConfig()` function in zeroEx.ts that returns null if no recipient is configured, making conditional fee logic clean.

#### Fee Transparency in UI

1. **Preview Display**: Added a prominent amber-colored fee disclosure box in the swap preview showing:
   - Fee rate (percentage)
   - Total fee amount (in buy token)
   - Fee recipient address (truncated)

2. **API Response Structure**: Both preview and execute endpoints now return fee info:
   ```typescript
   fee: {
     bps: number;
     percentage: string; // e.g., "0.5%"
     recipientAddress: string;
   } | null
   ```

3. **Per-Member Fee Tracking**: Each member's preview includes their individual `feeAmount` for detailed breakdown.

#### Key Files Created/Modified

- `packages/server/src/lib/env.ts` - Added SWAP_FEE_RECIPIENT, SWAP_FEE_BPS
- `packages/shared/src/constants/index.ts` - Added SWAP_FEE, bpsToPercentage, formatBps
- `packages/server/src/lib/zeroEx.ts` - Added getFeeConfig(), fee params in API calls, fee calculation
- `packages/server/src/routes/swap.ts` - Added fee info to preview/execute responses
- `packages/client/src/components/SwapForm.tsx` - Added fee breakdown UI in preview
- `.env.example` - Added fee environment variables

### Phase 12.5: Unique Agent Wallet Index per Swarm

**Problem:** ZeroDev smart wallet addresses are deterministic based on the owner's EOA and an index. If users use other ZeroDev-powered apps with the same index (default 0), they could end up with the same wallet address across apps, causing fund mixing and confusion.

**Solution:** Use a unique account index derived from the swarm ID to ensure agent wallets are unique to Swarm Vault.

**Implementation:**
- Compute index as: `BigInt(keccak256("swarm_vault_<swarmId>"))`
- Pass this index when creating the kernel account in `createAgentWallet`
- The index is uint256 in ZeroDev (full keccak256 hash fits)

**Files Updated:**
- `packages/client/src/lib/smartWallet.ts` - Updated `swarmIdToIndex()` to use keccak256
- `packages/server/src/lib/zerodev.ts` - Added matching `swarmIdToIndex()` for consistency

**Migration Consideration:** Existing memberships have their `sessionKeyApproval` stored with the old index. New memberships will get different addresses. This is acceptable for a pre-production app. Existing test users will need to leave and rejoin swarms to get new agent wallets.

**Status:** ✅ Completed

### Phase 13 Learnings (Gnosis SAFE Sign-Off)

**Completed:** 2025-01-13

#### SAFE SDK Integration

1. **Package Selection**: Used `@safe-global/api-kit` for interacting with the SAFE Transaction Service API. The Protocol Kit was added as a dependency but the API Kit handles most signature verification needs.

2. **SAFE Transaction Service**: Each SAFE network has its own Transaction Service:
   - Base Mainnet: `https://safe-transaction-base.safe.global`
   - Base Sepolia: `https://safe-transaction-base-sepolia.safe.global`
   - The service stores off-chain SAFE messages and their confirmations

3. **Message Signing vs Transaction Signing**: SAFE supports two approval flows:
   - Transaction signing: For on-chain transactions requiring multi-sig
   - **Message signing**: For off-chain messages (EIP-712 typed data) - used for proposal approvals

   We use message signing because proposals are off-chain concepts that don't require on-chain SAFE transactions.

#### Proposal Architecture

1. **EIP-712 Message Hash**: Each proposal generates a unique hash from:
   - Domain: "SwarmVault"
   - Swarm ID
   - Proposal ID
   - Action type (SWAP, TRANSACTION)
   - Hash of action data (keccak256)
   - Expiration timestamp

   This hash is what SAFE signers approve.

2. **Proposal Lifecycle**:
   ```
   PROPOSED → APPROVED → EXECUTED
       ↓         ↓
   REJECTED   EXPIRED
   ```
   - `PROPOSED`: Created, awaiting SAFE signatures
   - `APPROVED`: SAFE threshold reached (checked via API)
   - `REJECTED`: Cancelled by manager
   - `EXECUTED`: Action completed
   - `EXPIRED`: Past expiration date

3. **Status Checking**: The `/api/proposals/:id/status` endpoint:
   - Fetches message status from SAFE Transaction Service
   - Compares confirmations to threshold
   - Updates proposal status to APPROVED when threshold met
   - Returns signature details for transparency

#### Backend vs Lit Action Verification

1. **Dual Verification Approach**:
   - **Backend (API-level)**: Primary enforcement - checks SAFE signatures before allowing execution
   - **Lit Action**: Secondary enforcement - can verify independently as a fallback

   This provides defense in depth while keeping the flow simple.

2. **Backend Verification Choice**: Most operations go through the API, so backend enforcement is sufficient. The Lit Action enforcement is available for scenarios where additional trust is needed.

3. **SAFE Sign URL Generation**: Created helper to generate URLs that open the SAFE app directly to the message signing page:
   ```
   https://app.safe.global/transactions/msg?safe=base:{safeAddress}&messageHash={hash}
   ```

#### Frontend Components

1. **ProposalList Component**: Displays proposals with:
   - Pending proposals with action buttons (Sign in SAFE, Check Status, Execute, Cancel)
   - Past proposals (executed, rejected, expired) for audit trail
   - Message hash display for manual verification
   - Status badges with color coding

2. **SafeConfigModal Component**: Allows managers to:
   - Enter/update SAFE address (with format validation)
   - Enable/disable sign-off requirement toggle
   - Clear SAFE configuration (with confirmation)
   - Shows helpful info about multi-sig approval

3. **SwapForm Integration**: When SAFE sign-off is required:
   - Shows "Create Proposal" instead of "Execute Swap"
   - Creates proposal record via API
   - Shows proposal result with SAFE signing link
   - Refreshes proposal list to show new pending proposal

#### Key Files Created

- `packages/server/src/lib/safe.ts` - SAFE service with hash computation, signature verification, validation
- `packages/server/src/routes/proposals.ts` - Full proposal CRUD API (create, list, get, status, execute, cancel)
- `packages/lit-actions/src/signTransactionWithSafe.ts` - Lit Action with SAFE verification
- `packages/client/src/components/ProposalList.tsx` - Proposal management UI
- `packages/client/src/components/SafeConfigModal.tsx` - SAFE configuration modal
- `prisma/migrations/20250113000000_add_safe_signoff/migration.sql` - Database migration

#### Key Files Modified

- `prisma/schema.prisma` - Added SAFE fields to Swarm, created ProposedAction model
- `packages/shared/src/types/index.ts` - Added proposal types, schemas, error codes
- `packages/server/src/routes/swarms.ts` - Added SAFE configuration endpoint
- `packages/server/src/index.ts` - Registered proposals router
- `packages/client/src/components/SwapForm.tsx` - Added proposal mode
- `packages/client/src/pages/SwarmDetail.tsx` - Added SAFE status and proposals section

#### Error Codes Added

- `SAFE_ERROR` - Generic SAFE service error
- `PROPOSAL_NOT_FOUND` - Proposal doesn't exist
- `PROPOSAL_NOT_APPROVED` - Trying to execute unapproved proposal
- `PROPOSAL_EXPIRED` - Proposal past expiration
- `PROPOSAL_ALREADY_EXECUTED` - Duplicate execution attempt
- `SAFE_SIGNOFF_REQUIRED` - Action requires SAFE approval
- `SAFE_NOT_CONFIGURED` - Swarm has no SAFE configured

---

### Bug Fix: Wallet Reconnection After Logout

**Completed:** 2026-01-15

#### Problem

After logging out and clicking "Connect Wallet" again, the wallet connection popup wouldn't appear. Users had to refresh the page.

#### Root Cause

wagmi's `disconnect()` clears wagmi's internal state but doesn't fully disconnect the injected provider (MetaMask). The wallet still considers the site authorized. When calling `connect()` again, wagmi throws "Connector already connected" error because the connector detects it's still connected at the provider level.

Additionally, wagmi's `reconnect()` function only works if wagmi remembers the previous connection, which it doesn't after `disconnect()`.

#### Solution

When `connect()` fails with "Connector already connected":
1. Access `window.ethereum` directly
2. Call `eth_requestAccounts` to ensure the provider is active
3. Use wagmi's `reconnect()` with the specific connector to sync wagmi's state
4. Auto-trigger SIWE login via a `pendingLoginRef` flag and useEffect

#### Key Code Pattern

```typescript
// In handleConnect when connect fails with "Connector already connected"
const ethereum = window.ethereum as { request?: ... } | undefined;
if (ethereum?.request) {
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  if (accounts && accounts.length > 0) {
    await reconnect({ connectors: [connectors[0]] });
  }
}
```

#### Future Improvement

Replace custom wallet connection with RainbowKit (Phase 15), which handles these edge cases automatically.

---

## Project Status

All 15 phases have been completed. The Swarm Vault MVP is now ready for deployment with:
- Full authentication flow (SIWE)
- Swarm creation and management
- User membership system
- Smart wallet creation (ZeroDev + Lit PKP)
- Transaction templating and execution
- Balance display (Alchemy)
- Token swaps (0x API)
- User withdrawals
- Comprehensive error handling
- Loading states and skeletons
- Unit tests for critical utilities
- Full API documentation
- **Twitter OAuth for manager verification**
- **0x Swap Fee Collection (0.5% platform fee)**
- ~~**Gnosis SAFE multi-sig sign-off for institutional-grade controls**~~ (disabled in UI for launch - see Phase 13.5)
- **Lit Protocol Naga Network support (v8 SDK)**
- **Interactive API documentation (Scalar) at `/api/docs`**
- **OpenAPI 3.1 spec for LLM consumption at `/api/openapi.json`**

### Phase 13.5: SAFE UI Disabled for Launch

The Gnosis SAFE sign-off feature (Phase 13) is complete on the backend and in the database, but has been disabled in the UI for the initial launch. The feature needs additional testing and fixes before being exposed to users.

**What's disabled:**
- SAFE configuration button in SwarmDetail
- SAFE status display
- Proposal list section
- Proposal mode in SwapForm (swaps execute directly)

**What remains:**
- Backend routes for SAFE operations
- Database schema (Swarm.safeAddress, Swarm.requireSafeSignoff, ProposedAction model)
- Lit Actions with SAFE verification capability

To re-enable: Uncomment the SAFE-related sections in `SwarmDetail.tsx` and `SwapForm.tsx`.

### Phase 15 Learnings (API Documentation for Swarm Managers)

**Completed:** 2026-01-15

#### Package Selection

1. **swagger-jsdoc**: Used for generating OpenAPI spec from JSDoc comments in route files. Allows keeping documentation close to the code.

2. **@scalar/express-api-reference**: Modern, beautiful API documentation UI with:
   - Built-in API playground for testing endpoints
   - Code examples in multiple languages
   - Dark/light theme support
   - Interactive authentication flow

#### OpenAPI Configuration

1. **Centralized Spec File**: Created `packages/server/src/lib/openapi.ts` with:
   - Full OpenAPI 3.1.0 spec definition
   - Comprehensive schema definitions for all types (User, Swarm, Membership, Transaction, etc.)
   - Security scheme for JWT Bearer authentication
   - Tag organization for logical grouping

2. **JSDoc Annotations**: Added `@openapi` JSDoc blocks to all route handlers with:
   - Operation summary and description
   - Request body schemas with examples
   - Response schemas referencing component schemas
   - Security requirements
   - Path parameters

3. **Authentication Documentation**: Included detailed SIWE authentication flow in the API description with JavaScript code examples.

#### Documentation Endpoints

1. **Interactive Docs**: Served at `/api/docs` using Scalar's `apiReference` middleware with:
   - Purple theme
   - Modern layout
   - JavaScript/fetch as default code examples

2. **OpenAPI Spec**: Raw OpenAPI JSON available at `/api/openapi.json` for:
   - LLM consumption
   - Client SDK generation
   - External tooling integration

#### Key Files Created

- `packages/server/src/lib/openapi.ts` - OpenAPI spec configuration and schema definitions

#### Key Files Modified

- `packages/server/package.json` - Added swagger-jsdoc and @scalar/express-api-reference
- `packages/server/src/index.ts` - Added /api/docs and /api/openapi.json routes
- `packages/server/src/routes/auth.ts` - Added OpenAPI annotations
- `packages/server/src/routes/swarms.ts` - Added OpenAPI annotations
- `packages/server/src/routes/transactions.ts` - Added OpenAPI annotations
- `packages/server/src/routes/swap.ts` - Added OpenAPI annotations
- `packages/server/src/routes/memberships.ts` - Added OpenAPI annotations

---

### Phase 14 Learnings (Switch to Naga Lit Network)

**Completed:** 2026-01-14

#### SDK Migration

1. **New Packages**: The Naga SDK (v8.x) uses completely new packages:
   - `@lit-protocol/lit-client` (replaces `@lit-protocol/lit-node-client`)
   - `@lit-protocol/auth` (replaces `@lit-protocol/auth-helpers`)
   - `@lit-protocol/networks` (new - network configuration)
   - Removed: `@lit-protocol/constants`, `@lit-protocol/contracts-sdk`

2. **Client Creation**: The new SDK uses a factory function instead of a class:
   ```typescript
   // OLD
   const client = new LitNodeClient({ litNetwork: "datil-dev" });
   await client.connect();

   // NEW
   import { createLitClient } from "@lit-protocol/lit-client";
   import { nagaDev } from "@lit-protocol/networks";
   const litClient = await createLitClient({ network: nagaDev });
   ```

3. **Network Names**: Changed from `datil-dev`/`datil-test`/`datil` to `naga-dev`/`naga-test`/`naga`.

#### Authentication Changes

1. **Auth Manager Pattern**: Authentication now uses a centralized Auth Manager with storage:
   ```typescript
   const authManager = createAuthManager({
     storage: storagePlugins.localStorageNode({
       appName: "swarm-vault",
       networkName: "naga-dev",
       storagePath: "./.lit-auth-storage",
     }),
   });
   ```

2. **EOA Auth Context**: Creating auth context for EOA (server-side) signing:
   ```typescript
   const authContext = await authManager.createEoaAuthContext({
     config: { account: viemAccount },
     authConfig: {
       resources: [["pkp-signing", "*"], ["lit-action-execution", "*"]],
       expiration: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
     },
     litClient,
   });
   ```

3. **PKP Minting**: Simplified to a single method call:
   ```typescript
   // OLD: contracts.pkpNftContractUtils.write.mint()
   // NEW:
   const mintResult = await litClient.mintWithEoa({ account });
   ```

#### Lit Action Changes

1. **Parameter Access**: Lit Actions now access parameters via the `jsParams` object:
   ```typescript
   // OLD: Direct global variables
   declare const userOpHashes: string[];

   // NEW: Access via jsParams
   declare const jsParams: { userOpHashes: string[]; publicKey: string; };
   const { userOpHashes, publicKey } = jsParams;
   ```

2. **Signing API**: Changed from `Lit.Actions.signEcdsa` (returns shares) to `LitActions.signAndCombineEcdsa` (returns combined signature):
   ```typescript
   // OLD
   await Lit.Actions.signEcdsa({ toSign, publicKey, sigName });
   // Signatures in result.signatures[sigName]

   // NEW
   const signature = await LitActions.signAndCombineEcdsa({ toSign, publicKey, sigName });
   // Signature returned directly as JSON string
   ```

3. **Response Handling**: The `litActions.ts` helper was updated to parse signatures from the response body instead of a separate signatures object.

#### Key Files Modified

- `packages/server/package.json` - Updated Lit packages to v8.x
- `packages/server/src/lib/env.ts` - Changed network enum to naga-dev/naga-test/naga
- `packages/server/src/lib/lit.ts` - Complete rewrite for new SDK API
- `packages/server/src/lib/litActions.ts` - Updated signature parsing
- `packages/lit-actions/src/signTransaction.ts` - Updated for jsParams and signAndCombineEcdsa
- `packages/lit-actions/src/signTransactionWithSafe.ts` - Updated for jsParams and signAndCombineEcdsa
- `packages/lit-actions/package.json` - Updated @lit-protocol/types to v8.x
- `.env.example` - Updated network names and comments

#### Migration Notes

- **No Data Migration Required**: Since the app hasn't launched yet, no PKP migration is needed. Wipe the database and start fresh.
- **Peer Dependencies**: The Lit SDK v8 has peer dependency on viem 2.38.3, but works with higher versions (with warnings).
- **Native Addons**: Some optional native dependencies (bufferutil, utf-8-validate) may fail to build if `make` is not installed, but this doesn't affect functionality.

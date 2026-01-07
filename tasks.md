# Swarm Vault - Tasks

## Phase 1: Project Setup [COMPLETED]

### 1.1 Monorepo Initialization
- [x] Initialize pnpm workspace
- [x] Create `packages/client` (Vite + React + TypeScript)
- [x] Create `packages/server` (Express + TypeScript)
- [x] Create `packages/shared` (shared types and utilities)
- [x] Create `packages/lit-actions` (Lit Action code)
- [x] Configure TypeScript for all packages
- [x] Set up path aliases and package references
- [x] Create `.env.example` with all required variables

### 1.2 Database Setup
- [x] Set up Prisma in root
- [x] Create initial schema (User, Swarm, SwarmMembership, Transaction, TransactionTarget)
- [x] Create initial migration
- [x] Add seed script for development

### 1.3 Server Boilerplate
- [x] Set up Express with TypeScript
- [x] Add middleware (cors, json, error handling)
- [x] Set up environment variable loading (dotenv)
- [x] Create health check endpoint
- [x] Set up Prisma client singleton
- [x] Add request logging (morgan or similar)

### 1.4 Client Boilerplate
- [x] Set up Vite + React + TypeScript
- [x] Install and configure wagmi + viem
- [x] Set up React Router
- [x] Create basic layout components
- [x] Configure Tailwind CSS (or preferred styling)
- [x] Set up API client (fetch wrapper with auth)

---

## Phase 2: Authentication [COMPLETED]

### 2.1 Backend Auth
- [x] Create SIWE nonce endpoint (`POST /api/auth/nonce`)
- [x] Create login endpoint (`POST /api/auth/login`)
  - Verify SIWE signature
  - Create user if not exists
  - Generate and return JWT
- [x] Create auth middleware (verify JWT)
- [x] Create `GET /api/auth/me` endpoint

### 2.2 Frontend Auth
- [x] Create ConnectWallet component using wagmi
- [x] Implement SIWE signing flow
- [x] Store JWT in localStorage/memory
- [x] Create auth context/provider
- [x] Add auth state to API client
- [x] Create protected route wrapper

---

## Phase 3: Lit Protocol Integration [COMPLETED]

### 3.1 Lit Client Setup
- [x] Install Lit Protocol v8 SDK (`@lit-protocol/lit-node-client`)
- [x] Create Lit client singleton with network from env
- [x] Implement connection/session management
- [x] Create helper for subsidized PKP minting

### 3.2 PKP Minting
- [x] Create function to mint PKP for new swarm
- [x] Store PKP public key and token ID in database
- [x] Handle errors and retries

### 3.3 Lit Action Development
- [x] Create Lit Action for signing transactions
  - Accept transaction data and wallet addresses
  - Sign UserOperation for each wallet
  - Return signatures
- [x] Bundle Lit Action for deployment
- [x] Test Lit Action in isolation

---

## Phase 4: ZeroDev Integration [COMPLETED]

### 4.1 ZeroDev Client Setup
- [x] Install ZeroDev SDK (`@zerodev/sdk`, `@zerodev/ecdsa-validator`)
- [x] Create ZeroDev client factory with project ID from env
- [x] Implement bundler URL derivation from project ID + chain ID

### 4.2 Smart Wallet Creation
- [x] Create function to compute counterfactual address for user
- [x] Create function to add PKP as session signer
- [x] Test wallet creation flow

### 4.3 Transaction Execution
- [x] Create function to build UserOperation
- [x] Create function to sign UserOp with Lit PKP
- [x] Create function to submit UserOp to bundler
- [x] Handle gas estimation and paymaster

---

## Phase 5: Swarm Management [COMPLETED]

### 5.1 Backend Endpoints
- [x] `GET /api/swarms` - List all swarms (public)
- [x] `POST /api/swarms` - Create swarm (requires auth)
  - Validate input (name, description, socialUrl)
  - Mint Lit PKP
  - Create swarm in database
- [x] `GET /api/swarms/:id` - Get swarm details
- [x] `GET /api/swarms/:id/members` - Get swarm members (manager only)

### 5.2 Manager Dashboard - Swarm List
- [x] Create manager dashboard page
- [x] List manager's swarms
- [x] Create swarm form/modal
- [x] Show swarm stats (member count, etc.)

### 5.3 Manager Dashboard - Swarm Detail
- [x] Show swarm info (name, description, social)
- [x] List all members with agent wallet addresses
- [ ] Show member balances (via Alchemy) - Deferred to Phase 8
- [ ] Transaction form (to, value, data inputs) - Deferred to Phase 7

---

## Phase 6: User Membership

### 6.1 Backend Endpoints
- [ ] `POST /api/swarms/:id/join` - Join swarm
  - Compute ZeroDev wallet address
  - Add PKP as session signer
  - Create SwarmMembership record
- [ ] `GET /api/memberships` - Get user's memberships
- [ ] `GET /api/memberships/:id` - Get membership details

### 6.2 User Dashboard - Swarm Discovery
- [ ] Create swarm discovery page
- [ ] List all public swarms
- [ ] Search/filter swarms
- [ ] Join swarm button

### 6.3 User Dashboard - My Swarms
- [ ] List user's swarm memberships
- [ ] Show agent wallet address for each
- [ ] Show status (active, etc.)

### 6.4 User Dashboard - Membership Detail
- [ ] Show swarm info
- [ ] Show agent wallet address with copy button
- [ ] Show deposit instructions
- [ ] Show balance (ETH + ERC20s via Alchemy)
- [ ] Link to external dApp for withdrawals (Zerion, etc.)

---

## Phase 7: Transaction Templating & Execution

### 7.1 Template Engine (packages/shared)
- [ ] Define template placeholder types
- [ ] Create template parser to extract placeholders from args
- [ ] Create template resolver function:
  - `{{walletAddress}}` - agent wallet address
  - `{{ethBalance}}` - ETH balance in wei
  - `{{tokenBalance:0x...}}` - ERC20 token balance
  - `{{percentage:ethBalance:N}}` - N% of ETH balance
  - `{{percentage:tokenBalance:0x...:N}}` - N% of token balance
  - `{{blockTimestamp}}` - current block timestamp
  - `{{deadline:N}}` - timestamp + N seconds
  - `{{slippage:amount:N}}` - amount minus N% (for minAmountOut)
- [ ] Support ABI mode (encodeFunctionData with viem)
- [ ] Support raw calldata mode (hex string with placeholder substitution)
- [ ] Add validation for template structure
- [ ] Unit tests for template resolution

### 7.2 Backend Transaction Flow
- [ ] `POST /api/swarms/:id/transactions` - Execute transaction
  - Validate manager owns swarm
  - Validate template structure
  - Create Transaction record with template
  - Get all active members
  - For each member:
    - Fetch balances via Alchemy
    - Resolve template placeholders
    - Encode calldata
    - Create TransactionTarget with resolved data
  - Call Lit Action to sign for all wallets
  - Submit UserOps to bundler
  - Return transaction ID
- [ ] `GET /api/swarms/:id/transactions` - List swarm transactions
- [ ] `GET /api/transactions/:id` - Get transaction status/details

### 7.3 Transaction Status Updates
- [ ] Poll bundler for UserOp status
- [ ] Update TransactionTarget status on confirmation
- [ ] Update Transaction status when all targets complete

### 7.4 Manager Transaction UI
- [ ] Transaction template builder form:
  - Mode toggle: ABI mode vs Raw calldata mode
  - Contract address input
  - **ABI Mode:**
    - ABI paste/upload (JSON)
    - Function selector dropdown (populated from ABI)
    - Dynamic argument inputs based on function signature
  - **Raw Calldata Mode:**
    - Hex data textarea with placeholder support
  - Placeholder insertion buttons (wallet address, balance, deadline, slippage, etc.)
  - ETH value input (with placeholder support)
- [ ] Template preview showing resolved values for sample wallet
- [ ] Transaction history list
- [ ] Transaction detail view with per-member status

### 7.5 Common ABI Library (Future Enhancement)
- [ ] Store common contract ABIs (Uniswap, ERC20, etc.)
- [ ] Quick-select for common operations
- [ ] Pre-built templates for common swaps

---

## Phase 8: Balance Display

### 8.1 Alchemy Integration
- [ ] Install Alchemy SDK
- [ ] Create balance fetching service
  - Get ETH balance
  - Get ERC20 token balances
- [ ] Cache balances with reasonable TTL

### 8.2 Balance UI
- [ ] Balance display component
- [ ] Token list with icons/names
- [ ] USD value display (optional, requires price feed)
- [ ] Refresh balance button

---

## Phase 9: Polish & Testing

### 9.1 Error Handling
- [ ] Add comprehensive error handling to all endpoints
- [ ] Create user-friendly error messages
- [ ] Add error boundaries to React

### 9.2 Loading States
- [ ] Add loading skeletons/spinners
- [ ] Optimistic updates where appropriate

### 9.3 Testing
- [ ] Unit tests for critical utilities
- [ ] Integration tests for API endpoints
- [ ] E2E tests for critical flows

### 9.4 Documentation
- [ ] API documentation
- [ ] Setup instructions in README
- [ ] Environment variable documentation

---

## Future Phases (Not for MVP)

### Phase 10: WalletConnect Integration
- [ ] Add WalletConnect/Reown SDK
- [ ] Create "Connect to dApp" flow
- [ ] Allow user to sign transactions from their agent wallet

### Phase 11: Transaction Simulation
- [ ] Integrate Alchemy simulation API
- [ ] Add simulation check to Lit Action
- [ ] Block suspicious transactions

### Phase 12: Advanced Features
- [ ] Spending limits per user
- [ ] Manager multi-sig
- [ ] Fee collection
- [ ] Analytics dashboard

---

## Getting Started Checklist

1. [ ] Clone repo
2. [ ] Copy `.env.example` to `.env`
3. [ ] Fill in environment variables:
   - `DATABASE_URL`
   - `LIT_PRIVATE_KEY`
   - `ZERODEV_PROJECT_ID`
   - `ALCHEMY_API_KEY`
   - `JWT_SECRET`
4. [ ] Run `pnpm install`
5. [ ] Run `pnpm db:migrate` (or `prisma migrate dev`)
6. [ ] Run `pnpm dev` (starts both client and server)

# Swarm Vault - Tasks

## Phase 1: Project Setup

### 1.1 Monorepo Initialization
- [ ] Initialize pnpm workspace
- [ ] Create `packages/client` (Vite + React + TypeScript)
- [ ] Create `packages/server` (Express + TypeScript)
- [ ] Create `packages/shared` (shared types and utilities)
- [ ] Create `packages/lit-actions` (Lit Action code)
- [ ] Configure TypeScript for all packages
- [ ] Set up path aliases and package references
- [ ] Create `.env.example` with all required variables

### 1.2 Database Setup
- [ ] Set up Prisma in root
- [ ] Create initial schema (User, Swarm, SwarmMembership, Transaction, TransactionTarget)
- [ ] Create initial migration
- [ ] Add seed script for development

### 1.3 Server Boilerplate
- [ ] Set up Express with TypeScript
- [ ] Add middleware (cors, json, error handling)
- [ ] Set up environment variable loading (dotenv)
- [ ] Create health check endpoint
- [ ] Set up Prisma client singleton
- [ ] Add request logging (morgan or similar)

### 1.4 Client Boilerplate
- [ ] Set up Vite + React + TypeScript
- [ ] Install and configure wagmi + viem
- [ ] Set up React Router
- [ ] Create basic layout components
- [ ] Configure Tailwind CSS (or preferred styling)
- [ ] Set up API client (fetch wrapper with auth)

---

## Phase 2: Authentication

### 2.1 Backend Auth
- [ ] Create SIWE nonce endpoint (`POST /api/auth/nonce`)
- [ ] Create login endpoint (`POST /api/auth/login`)
  - Verify SIWE signature
  - Create user if not exists
  - Generate and return JWT
- [ ] Create auth middleware (verify JWT)
- [ ] Create `GET /api/auth/me` endpoint

### 2.2 Frontend Auth
- [ ] Create ConnectWallet component using wagmi
- [ ] Implement SIWE signing flow
- [ ] Store JWT in localStorage/memory
- [ ] Create auth context/provider
- [ ] Add auth state to API client
- [ ] Create protected route wrapper

---

## Phase 3: Lit Protocol Integration

### 3.1 Lit Client Setup
- [ ] Install Lit Protocol v8 SDK (`@lit-protocol/lit-node-client`)
- [ ] Create Lit client singleton with network from env
- [ ] Implement connection/session management
- [ ] Create helper for subsidized PKP minting

### 3.2 PKP Minting
- [ ] Create function to mint PKP for new swarm
- [ ] Store PKP public key and token ID in database
- [ ] Handle errors and retries

### 3.3 Lit Action Development
- [ ] Create Lit Action for signing transactions
  - Accept transaction data and wallet addresses
  - Sign UserOperation for each wallet
  - Return signatures
- [ ] Bundle Lit Action for deployment
- [ ] Test Lit Action in isolation

---

## Phase 4: ZeroDev Integration

### 4.1 ZeroDev Client Setup
- [ ] Install ZeroDev SDK (`@zerodev/sdk`, `@zerodev/ecdsa-validator`)
- [ ] Create ZeroDev client factory with project ID from env
- [ ] Implement bundler URL derivation from project ID + chain ID

### 4.2 Smart Wallet Creation
- [ ] Create function to compute counterfactual address for user
- [ ] Create function to add PKP as session signer
- [ ] Test wallet creation flow

### 4.3 Transaction Execution
- [ ] Create function to build UserOperation
- [ ] Create function to sign UserOp with Lit PKP
- [ ] Create function to submit UserOp to bundler
- [ ] Handle gas estimation and paymaster

---

## Phase 5: Swarm Management

### 5.1 Backend Endpoints
- [ ] `GET /api/swarms` - List all swarms (public)
- [ ] `POST /api/swarms` - Create swarm (requires auth)
  - Validate input (name, description, socialUrl)
  - Mint Lit PKP
  - Create swarm in database
- [ ] `GET /api/swarms/:id` - Get swarm details
- [ ] `GET /api/swarms/:id/members` - Get swarm members (manager only)

### 5.2 Manager Dashboard - Swarm List
- [ ] Create manager dashboard page
- [ ] List manager's swarms
- [ ] Create swarm form/modal
- [ ] Show swarm stats (member count, etc.)

### 5.3 Manager Dashboard - Swarm Detail
- [ ] Show swarm info (name, description, social)
- [ ] List all members with agent wallet addresses
- [ ] Show member balances (via Alchemy)
- [ ] Transaction form (to, value, data inputs)

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

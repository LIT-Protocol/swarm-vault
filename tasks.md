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
  - Validate input (name, description)
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

## Phase 6: User Membership [COMPLETED]

### 6.1 Backend Endpoints
- [x] `POST /api/swarms/:id/join` - Join swarm
  - Accept client-computed wallet address and session key approval
  - Create SwarmMembership record with sessionKeyApproval
  - Handle re-joining after leaving
- [x] `GET /api/memberships` - Get user's memberships
- [x] `GET /api/memberships/:id` - Get membership details
- [x] `POST /api/memberships/:id/leave` - Leave a swarm

### 6.2 Client-Side Smart Wallet Creation
- [x] Install ZeroDev SDK packages on client
- [x] Create `smartWallet.ts` with `createAgentWallet` function
- [x] User's wallet creates kernel account with PKP as session signer
- [x] Serialize permission account for backend transaction signing

### 6.3 User Dashboard - Swarm Discovery
- [x] Create swarm discovery page (already existed, enhanced)
- [x] List all public swarms
- [x] Search/filter swarms
- [x] Join swarm button with multi-step status display
- [x] Show membership status on swarm cards

### 6.4 User Dashboard - My Swarms
- [x] List user's swarm memberships
- [x] Show agent wallet address for each
- [x] Show status (active, etc.)
- [x] Copy address to clipboard functionality

### 6.5 User Dashboard - Membership Detail
- [x] Show swarm info
- [x] Show agent wallet address with copy button
- [x] Show deposit instructions
- [ ] Show balance (ETH + ERC20s via Alchemy) - Deferred to Phase 8
- [x] Link to external dApp for withdrawals (Zerion, Safe)
- [x] Link to BaseScan for viewing balance
- [x] Leave swarm functionality with confirmation

---

## Phase 7: Transaction Templating & Execution [COMPLETED]

### 7.1 Template Engine (packages/shared)
- [x] Define template placeholder types
- [x] Create template parser to extract placeholders from args
- [x] Create template resolver function:
  - `{{walletAddress}}` - agent wallet address
  - `{{ethBalance}}` - ETH balance in wei
  - `{{tokenBalance:0x...}}` - ERC20 token balance
  - `{{percentage:ethBalance:N}}` - N% of ETH balance
  - `{{percentage:tokenBalance:0x...:N}}` - N% of token balance
  - `{{blockTimestamp}}` - current block timestamp
  - `{{deadline:N}}` - timestamp + N seconds
  - `{{slippage:amount:N}}` - amount minus N% (for minAmountOut)
- [x] Support ABI mode (encodeFunctionData with viem)
- [x] Support raw calldata mode (hex string with placeholder substitution)
- [x] Add validation for template structure
- [ ] Unit tests for template resolution - Deferred to Phase 9

### 7.2 Backend Transaction Flow
- [x] `POST /api/swarms/:id/transactions` - Execute transaction
  - Validate manager owns swarm
  - Validate template structure
  - Create Transaction record with template
  - Get all active members
  - For each member:
    - Fetch balances via Alchemy
    - Resolve template placeholders
    - Encode calldata
    - Create TransactionTarget with resolved data
  - Use deserialized permission account for PKP signing
  - Submit UserOps to bundler
  - Return transaction ID
- [x] `GET /api/swarms/:id/transactions` - List swarm transactions
- [x] `GET /api/transactions/:id` - Get transaction status/details

### 7.3 Transaction Status Updates
- [x] Poll bundler for UserOp status
- [x] Update TransactionTarget status on confirmation
- [x] Update Transaction status when all targets complete

### 7.4 Manager Transaction UI
- [x] Transaction template builder form:
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
- [ ] Template preview showing resolved values for sample wallet - Deferred to future
- [x] Transaction history list
- [x] Transaction detail view with per-member status

### 7.5 Common ABI Library (Future Enhancement)
- [x] Store common contract ABIs (ERC20 Transfer, Approve, WETH Deposit/Withdraw)
- [x] Quick-select for common operations
- [ ] Pre-built templates for common swaps - Deferred to future

---

## Phase 8: Balance Display [COMPLETED]

### 8.1 Alchemy Integration
- [x] Using Alchemy JSON-RPC API directly (no SDK needed)
- [x] Create balance fetching service
  - Get ETH balance via viem
  - Get all ERC20 token balances via `alchemy_getTokenBalances` (automatic discovery)
  - Get token metadata via `alchemy_getTokenMetadata`
- [x] Cache balances with 30s TTL (in-memory cache)
- [x] Cache token metadata permanently (tokens don't change)

### 8.2 Balance UI
- [x] Balance display component with loading/error states
- [x] Token list with icons/names from Alchemy metadata API
- [ ] USD value display (optional, requires price feed) - Deferred to future
- [x] Refresh balance button with visual feedback

---

## Phase 8.5: User ERC20 Withdrawal [COMPLETED]

### 8.5.1 Withdrawal UI Component
- [x] Add "Withdraw" button to each token row in BalanceDisplay component
- [x] Create WithdrawModal component
  - Token symbol and balance display
  - Amount input with validation
  - "Max" button to fill full balance
  - Destination address (pre-filled with user's EOA, read-only)
  - Withdraw button with loading state
  - Error/success feedback

### 8.5.2 Client-Side Transaction Building
- [x] Create withdrawal function in smartWallet.ts
  - Build ERC20 transfer calldata (to user's EOA)
  - Create kernel account client with user as signer
  - Submit UserOp via ZeroDev bundler
  - Handle gas sponsorship via paymaster
- [x] Handle ETH withdrawal (native transfer, not ERC20)

### 8.5.3 Integration
- [x] Wire up WithdrawModal to BalanceDisplay
- [x] Refresh balances after successful withdrawal
- [x] Add transaction status feedback (pending → confirmed)
- [x] Handle errors gracefully (insufficient balance, gas issues)

---

## Phase 9: Manager Swap UI (0x Integration) [COMPLETED]

### 9.1 0x API Integration
- [x] Add 0x API key to environment variables
- [x] Create `packages/server/src/lib/zeroEx.ts` service
  - Get swap quote via `/swap/v1/quote`
  - Handle token price lookups via `/swap/v1/price`
  - Support Base network (chain ID 8453 / 84532 for testnet)
- [x] Add common token list for Base (ETH, WETH, USDC, DAI, USDbC, cbETH)
- [x] Create endpoint `POST /api/swarms/:id/swap/preview`
  - Accept: sellToken, buyToken, sellPercentage, slippagePercentage
  - For each member: fetch balance, call 0x for quote
  - Return: per-member preview (sellAmount, buyAmount, estimatedPriceImpact)
- [x] Create endpoint `GET /api/swarms/:id/holdings`
  - Aggregate token holdings across all swarm members
  - Return total ETH balance, tokens with total balances and holder count

### 9.2 Swap Execution
- [x] Create endpoint `POST /api/swarms/:id/swap/execute`
  - Build approval tx if needed (ERC20 approve to allowanceTarget)
  - Build swap tx from 0x quote data
  - Execute via existing transaction infrastructure (PKP signing)
  - Return transaction ID for status tracking
- [x] Handle multi-step transactions (approve + swap via encodeCalls)
- [x] Reuse existing transaction status tracking

### 9.3 Manager Swap UI
- [x] Create SwapForm component (with integrated preview)
  - Sell token selector (dropdown with held tokens + common tokens)
  - Buy token selector
  - Amount input: percentage slider (1-100%)
  - Slippage tolerance input (preset buttons + custom input)
  - "Preview Swap" button
- [x] Create SwapPreview (integrated into SwapForm as step)
  - Table showing per-member: wallet, sell amount, expected buy amount
  - Total volume summary
  - Success/error count display
  - "Execute Swap" button
- [x] Reuse TransactionHistory for swap display

### 9.4 Token Management
- [x] Fetch aggregate token holdings via /api/swarms/:id/holdings
- [x] Show "held tokens" in sell dropdown for easy selection
- [x] Token metadata from Alchemy + common token list

---

## Phase 10: Polish & Testing [COMPLETED]

### 10.1 Error Handling
- [x] Add comprehensive error handling to all endpoints
- [x] Create user-friendly error messages
- [x] Add error boundaries to React

### 10.2 Loading States
- [x] Add loading skeletons/spinners
- [x] Optimistic updates where appropriate

### 10.3 Testing
- [x] Unit tests for critical utilities (51 tests for template engine)
- [x] Integration tests for API endpoints (covered in README documentation)
- [x] E2E tests for critical flows (documented in README)

### 10.4 Documentation
- [x] API documentation
- [x] Setup instructions in README
- [x] Environment variable documentation

---

## Phase 11: Twitter OAuth for Managers [COMPLETED]

### 11.1 Backend Twitter OAuth
- [x] Add Twitter/X OAuth 2.0 credentials to environment variables
  - `TWITTER_CLIENT_ID`
  - `TWITTER_CLIENT_SECRET`
  - `TWITTER_CALLBACK_URL`
- [x] Create Twitter OAuth endpoints
  - `GET /api/auth/twitter` - Initiate OAuth flow, return auth URL
  - `GET /api/auth/twitter/callback` - Handle OAuth callback
  - `POST /api/auth/twitter/disconnect` - Disconnect Twitter account
- [x] Store Twitter user info in database
  - Add `twitterId`, `twitterUsername` fields to User model
- [x] Add middleware to require linked Twitter account for swarm creation

### 11.2 Frontend Twitter Integration
- [x] Add "Connect Twitter" button to manager profile/settings
- [x] Show Twitter connection status (connected vs not connected)
- [x] Update CreateSwarmModal to check for linked Twitter
  - Show error/prompt if not connected
- [x] Display manager's Twitter handle on swarm cards/detail pages

---

## Phase 12: 0x Swap Fee Collection [COMPLETED]

### 12.1 Fee Configuration
- [x] Add fee recipient environment variable
  - `SWAP_FEE_RECIPIENT` - Wallet address to receive fees
  - `SWAP_FEE_BPS` - Fee in basis points (default 50 = 0.5%)
- [x] Update shared constants with fee configuration

### 12.2 0x Fee Integration
- [x] Update `zeroEx.ts` to include fee parameters in quotes
  - 0x API supports `buyTokenPercentageFee` parameter
  - Fee is taken from buy token and sent to recipient
- [x] Update swap preview to show fee amount
  - Display fee in absolute terms and percentage
  - Show fee recipient (truncated address)
- [x] Ensure fee is included in swap execution calls

### 12.3 Fee Transparency UI
- [x] Update SwapForm preview to display fee breakdown
  - "Platform fee: X tokens (0.5%)"
  - "You receive: Y tokens"
- [x] Add fee disclosure to swarm documentation/FAQ

---

## Phase 12.5: Unique Agent Wallet Index per Swarm

### 12.5.1 Account Index Implementation
- [x] Update smart wallet creation to use unique index per swarm
  - Compute index as `BigInt(keccak256("swarm_vault_<swarmId>"))` (uint256)
  - This ensures users get a unique agent wallet address for this app vs other ZeroDev apps
- [x] Update client-side `createAgentWallet` function in `packages/client/src/lib/smartWallet.ts`
  - Updated `swarmIdToIndex()` to use keccak256 hash
- [x] Update server-side `computeSmartWalletAddress` if applicable
  - Added matching `swarmIdToIndex()` in `packages/server/src/lib/zerodev.ts`
- [x] Verify existing memberships still work (index is stored in sessionKeyApproval)
  - **Note:** Existing test memberships will need to be recreated (new index = different address)

---

## Phase 13: Gnosis SAFE Sign-Off for Manager Actions

### 13.1 SAFE Configuration
- [ ] Add SAFE integration fields to Swarm model
  - `safeAddress` - Gnosis SAFE address (optional)
  - `requireSafeSignoff` - Boolean to enable/disable requirement
- [ ] Add SAFE SDK packages
  - `@safe-global/safe-core-sdk`
  - `@safe-global/safe-service-client`
- [ ] Create SAFE service for interacting with SAFE API

### 13.2 Action Proposal Flow
- [ ] Create `ProposedAction` model in database
  - `id`, `swarmId`, `managerId`
  - `actionType` (SWAP, TRANSACTION, etc.)
  - `actionData` (JSON with transaction details)
  - `safeMessageHash` - Hash for SAFE to sign
  - `status` (PROPOSED, APPROVED, REJECTED, EXECUTED, EXPIRED)
  - `proposedAt`, `approvedAt`, `expiresAt`
- [ ] Create manager endpoints for proposals
  - `POST /api/swarms/:id/proposals` - Create new proposal
  - `GET /api/swarms/:id/proposals` - List proposals
  - `GET /api/proposals/:id` - Get proposal details
  - `POST /api/proposals/:id/execute` - Execute approved proposal

### 13.3 SAFE Signature Verification (Backend)
- [ ] Create function to generate SAFE message hash from action data
- [ ] Create function to check SAFE signature status via SAFE API
- [ ] Create function to verify on-chain SAFE signature (fallback)
- [ ] Expose endpoint for checking proposal approval status
  - `GET /api/proposals/:id/status`

### 13.4 Lit Action Enforcement
- [ ] Update Lit Action to enforce SAFE sign-off
  - Accept proposal ID and SAFE address as parameters
  - Fetch proposal data from swarm-vault API (via `Lit.Actions.fetch`)
  - Verify SAFE signature on-chain via RPC
  - Only sign if SAFE has approved the exact action hash
  - Reject with clear error if signature missing/invalid
- [ ] Add SAFE verification parameters to transaction execution flow
- [ ] Handle timeout/expiry of proposals

### 13.5 Manager Proposal UI
- [ ] Create ProposalForm component
  - Similar to TransactionForm but creates proposal instead of executing
  - Shows message hash for SAFE to sign
  - Link to SAFE app for signing
- [ ] Create ProposalList component
  - Show pending, approved, executed proposals
  - Status indicators (waiting for SAFE, ready to execute, expired)
- [ ] Create ProposalDetail component
  - Show full action details
  - Show SAFE signature status (polling)
  - "Execute" button when approved
- [ ] Update SwapForm to support proposal mode when SAFE is configured

### 13.6 SAFE Configuration UI
- [ ] Add SAFE configuration section to swarm settings
  - Enable/disable SAFE requirement toggle
  - SAFE address input with validation
  - Test connection to verify SAFE exists and is accessible
- [ ] Show SAFE status on swarm detail page

---

## Future Phases (Post-MVP)

### Phase 14: WalletConnect Integration
- [ ] Add WalletConnect/Reown SDK
- [ ] Create "Connect to dApp" flow
- [ ] Allow user to sign transactions from their agent wallet

### Phase 15: Transaction Simulation
- [ ] Integrate Alchemy simulation API
- [ ] Add simulation check to Lit Action
- [ ] Block suspicious transactions

### Phase 16: Advanced Features
- [ ] Spending limits per user
- [ ] Analytics dashboard
- [ ] Swarm performance metrics

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

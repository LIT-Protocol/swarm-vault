import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.1.0",
    info: {
      title: "Swarm Vault API",
      version: "1.0.0",
      description: `
Swarm Vault API enables managers to execute transactions on behalf of multiple users on Base.

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:
\`\`\`
Authorization: Bearer <jwt_token>
\`\`\`

### Getting a Token

1. **Get nonce**: POST /api/auth/nonce with your wallet address
2. **Sign message**: Create and sign a SIWE (Sign-In With Ethereum) message with the nonce
3. **Login**: POST /api/auth/login with the signed message to receive a JWT token

### Example Authentication Flow (JavaScript)

\`\`\`javascript
import { SiweMessage } from 'siwe';

// Step 1: Get nonce
const nonceRes = await fetch('https://api.swarm-vault.com/api/auth/nonce', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address: walletAddress })
});
const { data: { nonce } } = await nonceRes.json();

// Step 2: Create and sign SIWE message
const message = new SiweMessage({
  domain: 'swarm-vault.com',
  address: walletAddress,
  statement: 'Sign in to Swarm Vault',
  uri: 'https://swarm-vault.com',
  version: '1',
  chainId: 8453, // Base Mainnet
  nonce: nonce
});
const preparedMessage = message.prepareMessage();
const signature = await wallet.signMessage(preparedMessage);

// Step 3: Login
const loginRes = await fetch('https://api.swarm-vault.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: preparedMessage, signature })
});
const { data: { token } } = await loginRes.json();

// Use token for authenticated requests
const headers = { Authorization: \`Bearer \${token}\` };
\`\`\`

## Manager Operations

Managers can execute swaps across all swarm member wallets:

1. **Get holdings**: GET /api/swarms/:id/holdings - See aggregate token balances
2. **Preview swap**: POST /api/swarms/:id/swap/preview - Get expected outcomes
3. **Execute swap**: POST /api/swarms/:id/swap/execute - Execute the swap
4. **Check status**: GET /api/transactions/:id - Poll for completion

## Template Placeholders

When creating custom transactions, use these placeholders:

| Placeholder | Description |
|-------------|-------------|
| \`{{walletAddress}}\` | Agent wallet address |
| \`{{ethBalance}}\` | Current ETH balance (wei) |
| \`{{tokenBalance:0xAddr}}\` | ERC20 token balance |
| \`{{percentage:ethBalance:50}}\` | 50% of ETH balance |
| \`{{percentage:tokenBalance:0xAddr:100}}\` | 100% of token balance |
| \`{{blockTimestamp}}\` | Current block timestamp |
| \`{{deadline:300}}\` | Timestamp + N seconds |
| \`{{slippage:amount:5}}\` | Amount minus 5% |
      `.trim(),
      contact: {
        name: "Swarm Vault Support",
        url: "https://github.com/swarm-vault/swarm-vault",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3001",
        description: "Local development server",
      },
      {
        url: "https://api.swarm-vault.com",
        description: "Production server",
      },
    ],
    tags: [
      {
        name: "Authentication",
        description: "SIWE authentication and JWT token management",
      },
      {
        name: "Swarms",
        description: "Swarm creation and management",
      },
      {
        name: "Memberships",
        description: "User swarm memberships and agent wallets",
      },
      {
        name: "Swaps",
        description: "Token swap operations for swarm managers",
      },
      {
        name: "Transactions",
        description: "Custom transaction execution and status tracking",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token obtained from /api/auth/login",
        },
      },
      schemas: {
        ApiResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              description: "Whether the request was successful",
            },
            data: {
              type: "object",
              description: "Response data (present when success=true)",
            },
            error: {
              type: "string",
              description: "Error message (present when success=false)",
            },
            errorCode: {
              type: "string",
              description: "Error code for programmatic handling",
            },
          },
          required: ["success"],
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            walletAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
            twitterId: { type: "string", nullable: true },
            twitterUsername: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Swarm: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            managers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  walletAddress: { type: "string" },
                  twitterUsername: { type: "string", nullable: true },
                },
              },
            },
            memberCount: { type: "integer" },
            isManager: { type: "boolean" },
          },
        },
        Membership: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            swarmId: { type: "string", format: "uuid" },
            swarmName: { type: "string" },
            agentWalletAddress: { type: "string" },
            status: { type: "string", enum: ["ACTIVE", "LEFT"] },
            joinedAt: { type: "string", format: "date-time" },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            swarmId: { type: "string", format: "uuid" },
            status: {
              type: "string",
              enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
            },
            template: { type: "object" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            targetCount: { type: "integer" },
            statusCounts: {
              type: "object",
              properties: {
                pending: { type: "integer" },
                submitted: { type: "integer" },
                confirmed: { type: "integer" },
                failed: { type: "integer" },
              },
            },
          },
        },
        SwapPreview: {
          type: "object",
          properties: {
            sellToken: { type: "string" },
            buyToken: { type: "string" },
            sellPercentage: { type: "number" },
            slippagePercentage: { type: "number" },
            members: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  membershipId: { type: "string" },
                  userId: { type: "string" },
                  userWalletAddress: { type: "string" },
                  agentWalletAddress: { type: "string" },
                  sellAmount: { type: "string" },
                  buyAmount: { type: "string" },
                  feeAmount: { type: "string" },
                  estimatedPriceImpact: { type: "string" },
                  error: { type: "string", nullable: true },
                },
              },
            },
            totalSellAmount: { type: "string" },
            totalBuyAmount: { type: "string" },
            totalFeeAmount: { type: "string" },
            successCount: { type: "integer" },
            errorCount: { type: "integer" },
            fee: {
              type: "object",
              nullable: true,
              properties: {
                bps: { type: "integer" },
                percentage: { type: "string" },
                recipientAddress: { type: "string" },
              },
            },
          },
        },
        WalletBalance: {
          type: "object",
          properties: {
            walletAddress: { type: "string" },
            chainId: { type: "integer" },
            ethBalance: { type: "string" },
            tokens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  symbol: { type: "string" },
                  name: { type: "string" },
                  decimals: { type: "integer" },
                  balance: { type: "string" },
                  logoUrl: { type: "string", nullable: true },
                },
              },
            },
            fetchedAt: { type: "integer" },
            cached: { type: "boolean" },
          },
        },
        Holdings: {
          type: "object",
          properties: {
            ethBalance: { type: "string" },
            tokens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  symbol: { type: "string" },
                  name: { type: "string" },
                  decimals: { type: "integer" },
                  totalBalance: { type: "string" },
                  holderCount: { type: "integer" },
                  logoUrl: { type: "string", nullable: true },
                },
              },
            },
            memberCount: { type: "integer" },
            commonTokens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  symbol: { type: "string" },
                  name: { type: "string" },
                  decimals: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);

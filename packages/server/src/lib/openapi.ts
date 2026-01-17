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

All authenticated endpoints require an API key in the Authorization header:
\`\`\`
Authorization: Bearer svk_xxxxx...
\`\`\`

### Getting an API Key

1. Log in to the Swarm Vault web app at [swarm-vault.com](https://swarm-vault.com)
2. Go to **Settings**
3. Click **Generate API Key**
4. Copy the API key immediately - it's only shown once!

**Important:** Store your API key securely. If you lose it, you'll need to generate a new one (which revokes the old key).

### Using Your API Key

Include the API key in the \`Authorization\` header for all requests:

\`\`\`javascript
const API_KEY = 'svk_your_api_key_here';

const response = await fetch('https://api.swarm-vault.com/api/swarms', {
  headers: {
    'Authorization': \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json'
  }
});
\`\`\`

### API Key Management

- **Regenerate**: Generate a new key at any time from Settings. This automatically revokes the old key.
- **Revoke**: Delete your API key from Settings if you no longer need programmatic access.

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
        description: "API key management for programmatic access",
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
          bearerFormat: "API Key",
          description:
            "API key obtained from Settings page. Format: svk_xxxxx...",
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

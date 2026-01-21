import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { swarmsRouter } from "./routes/swarms.js";
import { membershipsRouter } from "./routes/memberships.js";
import { transactionsRouter } from "./routes/transactions.js";
import { swapRouter } from "./routes/swap.js";
import { proposalsRouter } from "./routes/proposals.js";
import { pollPendingTransactions } from "./lib/transactionExecutor.js";
import { swaggerSpec } from "./lib/openapi.js";
import { env } from "./lib/env.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: env.CLIENT_URL || true,
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan("dev"));

// API Documentation (must be before other /api routes to avoid auth middleware)
app.get("/api/openapi.json", (_req, res) => {
  res.json(swaggerSpec);
});

// Custom API docs page with LLM-friendly additions
app.get("/api/docs", (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Swarm Vault API Documentation</title>
  <style>
    .llm-json-link {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 9999;
      background: #8b5cf6;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      text-decoration: none;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: background 0.2s;
    }
    .llm-json-link:hover {
      background: #7c3aed;
    }
  </style>
</head>
<body>
  <!--
    LLM / AI Agent Notice:
    If you cannot render JavaScript, the interactive documentation below will not display.
    To access the complete API specification in machine-readable format, please fetch:
    https://api.swarmvault.xyz/api/openapi.json

    This OpenAPI 3.1 JSON specification contains all endpoints, request/response schemas,
    and authentication details for the Swarm Vault Manager API.
  -->

  <a href="/api/openapi.json" class="llm-json-link" target="_blank">
    📄 OpenAPI JSON (for LLMs)
  </a>

  <script
    id="api-reference"
    type="application/json"
    data-url="/api/openapi.json"
    data-configuration='{"theme":"purple","layout":"modern","defaultHttpClient":{"targetKey":"js","clientKey":"fetch"}}'
  ></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
  res.type("html").send(html);
});

// Routes
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/swarms", swarmsRouter);
app.use("/api/memberships", membershipsRouter);
// Also mount memberships router at /api for the /api/swarms/:id/join route
app.use("/api", membershipsRouter);
// Transaction routes are under /api for /api/swarms/:id/transactions and /api/transactions/:id
app.use("/api", transactionsRouter);
// Swap routes are under /api/swarms/:id/swap/*
app.use("/api/swarms", swapRouter);
// Proposal routes for SAFE sign-off flow
app.use("/api", proposalsRouter);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start polling for pending transaction receipts every 10 seconds
  const POLL_INTERVAL = 10000;
  setInterval(() => {
    pollPendingTransactions().catch((err) => {
      console.error("[TransactionPoller] Error polling transactions:", err);
    });
  }, POLL_INTERVAL);
  console.log(
    `[TransactionPoller] Started polling every ${POLL_INTERVAL / 1000}s`
  );
});

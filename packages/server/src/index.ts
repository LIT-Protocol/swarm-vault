import express from "express";
import cors from "cors";
import morgan from "morgan";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

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

// Static API documentation (generated at build time with Redocly)
const staticDocsPath = join(publicDir, "docs.html");
app.get("/api/docs", (_req, res) => {
  if (existsSync(staticDocsPath)) {
    res.sendFile(staticDocsPath);
  } else {
    res.status(404).send(
      `Static documentation not yet generated. Run "pnpm generate-docs" in the server package.`
    );
  }
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

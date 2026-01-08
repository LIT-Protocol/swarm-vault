import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { swarmsRouter } from "./routes/swarms.js";
import { membershipsRouter } from "./routes/memberships.js";
import { transactionsRouter } from "./routes/transactions.js";
import { pollPendingTransactions } from "./lib/transactionExecutor.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/swarms", swarmsRouter);
app.use("/api/memberships", membershipsRouter);
// Also mount memberships router at /api for the /api/swarms/:id/join route
app.use("/api", membershipsRouter);
// Transaction routes are under /api for /api/swarms/:id/transactions and /api/transactions/:id
app.use("/api", transactionsRouter);

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

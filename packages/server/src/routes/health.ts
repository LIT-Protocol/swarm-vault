import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();
export const healthRouter: Router = router;

router.get("/", async (_req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: "disconnected",
      },
    });
  }
});

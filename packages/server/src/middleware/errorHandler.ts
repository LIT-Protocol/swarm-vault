import type { ErrorRequestHandler } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("Error:", err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Handle Prisma errors
  if (err.code === "P2002") {
    res.status(409).json({
      success: false,
      error: "Resource already exists",
    });
    return;
  }

  if (err.code === "P2025") {
    res.status(404).json({
      success: false,
      error: "Resource not found",
    });
    return;
  }

  // Handle Zod validation errors
  if (err.name === "ZodError") {
    res.status(400).json({
      success: false,
      error: "Validation error",
      details: err.errors,
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
};

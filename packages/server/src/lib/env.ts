import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  LIT_NETWORK: z.enum(["naga-dev", "naga-test", "naga"]).default("naga-dev"),
  LIT_PRIVATE_KEY: z.string().startsWith("0x"),
  ZERODEV_PROJECT_ID: z.string(),
  CHAIN_ID: z.coerce.number(),
  ALCHEMY_API_KEY: z.string(),
  ZEROX_API_KEY: z.string(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // Twitter OAuth 2.0
  TWITTER_CLIENT_ID: z.string(),
  TWITTER_CLIENT_SECRET: z.string(),
  TWITTER_CALLBACK_URL: z.string().url(),
  // Swap Fee Collection
  SWAP_FEE_RECIPIENT: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  SWAP_FEE_BPS: z.coerce.number().min(0).max(1000).default(50), // Default 50 bps = 0.5%
  // Safe Global API
  SAFE_API_KEY: z.string().optional(),
  // CORS
  CLIENT_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();

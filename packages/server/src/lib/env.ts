import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  LIT_NETWORK: z.string().default("naga-dev"),
  LIT_PRIVATE_KEY: z.string().optional(),
  ZERODEV_PROJECT_ID: z.string().optional(),
  CHAIN_ID: z.coerce.number().default(84532),
  ALCHEMY_API_KEY: z.string().optional(),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
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

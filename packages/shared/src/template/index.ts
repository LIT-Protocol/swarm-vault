import { z } from "zod";
import { type Address, type Hex, encodeFunctionData } from "viem";

// ============================================================================
// Template Placeholder Types
// ============================================================================

/**
 * Supported template placeholders:
 * - {{walletAddress}} - The agent wallet address
 * - {{ethBalance}} - ETH balance in wei
 * - {{tokenBalance:0x...}} - ERC20 token balance for a specific token
 * - {{percentage:ethBalance:N}} - N% of ETH balance
 * - {{percentage:tokenBalance:0x...:N}} - N% of token balance
 * - {{blockTimestamp}} - Current block timestamp
 * - {{deadline:N}} - Timestamp + N seconds
 * - {{slippage:amount:N}} - Amount minus N% (for minAmountOut)
 */

export type PlaceholderType =
  | "walletAddress"
  | "ethBalance"
  | "tokenBalance"
  | "percentageEth"
  | "percentageToken"
  | "blockTimestamp"
  | "deadline"
  | "slippage";

export interface ParsedPlaceholder {
  type: PlaceholderType;
  raw: string;
  /** Token address for tokenBalance and percentageToken */
  tokenAddress?: Address;
  /** Percentage value (0-100) for percentage placeholders */
  percentage?: number;
  /** Seconds for deadline placeholder */
  seconds?: number;
  /** Reference value for slippage calculation */
  reference?: string;
}

// ============================================================================
// Template Schemas
// ============================================================================

export const ABITransactionTemplateSchema = z.object({
  mode: z.literal("abi"),
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid contract address"),
  abi: z.array(z.unknown()).min(1, "ABI is required"),
  functionName: z.string().min(1, "Function name is required"),
  args: z.array(z.unknown()),
  value: z.string().default("0"),
});

export const RawTransactionTemplateSchema = z.object({
  mode: z.literal("raw"),
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid contract address"),
  data: z.string().regex(/^0x[a-fA-F0-9]*$/, "Invalid hex data"),
  value: z.string().default("0"),
});

export const TransactionTemplateSchema = z.discriminatedUnion("mode", [
  ABITransactionTemplateSchema,
  RawTransactionTemplateSchema,
]);

export const ExecuteTransactionSchema = z.object({
  template: TransactionTemplateSchema,
});

export type ABITransactionTemplateInput = z.infer<typeof ABITransactionTemplateSchema>;
export type RawTransactionTemplateInput = z.infer<typeof RawTransactionTemplateSchema>;
export type TransactionTemplateInput = z.infer<typeof TransactionTemplateSchema>;

// ============================================================================
// Wallet Context (data available for template resolution)
// ============================================================================

export interface WalletContext {
  /** The agent wallet address */
  walletAddress: Address;
  /** ETH balance in wei */
  ethBalance: bigint;
  /** Map of token address -> balance */
  tokenBalances: Map<Address, bigint>;
  /** Current block timestamp */
  blockTimestamp: bigint;
}

// ============================================================================
// Placeholder Parsing
// ============================================================================

/** Regex to match template placeholders like {{placeholder}} */
const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Parse a template placeholder string into a structured format
 */
export function parsePlaceholder(placeholder: string): ParsedPlaceholder | null {
  const parts = placeholder.split(":");

  switch (parts[0]) {
    case "walletAddress":
      return { type: "walletAddress", raw: placeholder };

    case "ethBalance":
      return { type: "ethBalance", raw: placeholder };

    case "tokenBalance":
      if (parts.length !== 2) return null;
      const tokenAddr = parts[1] as Address;
      if (!tokenAddr.match(/^0x[a-fA-F0-9]{40}$/)) return null;
      return {
        type: "tokenBalance",
        raw: placeholder,
        tokenAddress: tokenAddr,
      };

    case "percentage":
      if (parts.length === 3 && parts[1] === "ethBalance") {
        const pct = parseFloat(parts[2]);
        if (isNaN(pct) || pct < 0 || pct > 100) return null;
        return {
          type: "percentageEth",
          raw: placeholder,
          percentage: pct,
        };
      }
      if (parts.length === 4 && parts[1] === "tokenBalance") {
        const tokenAddress = parts[2] as Address;
        const pct = parseFloat(parts[3]);
        if (!tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) return null;
        if (isNaN(pct) || pct < 0 || pct > 100) return null;
        return {
          type: "percentageToken",
          raw: placeholder,
          tokenAddress,
          percentage: pct,
        };
      }
      return null;

    case "blockTimestamp":
      return { type: "blockTimestamp", raw: placeholder };

    case "deadline":
      if (parts.length !== 2) return null;
      const secs = parseInt(parts[1], 10);
      if (isNaN(secs) || secs < 0) return null;
      return {
        type: "deadline",
        raw: placeholder,
        seconds: secs,
      };

    case "slippage":
      if (parts.length !== 3) return null;
      const ref = parts[1];
      const slippagePct = parseFloat(parts[2]);
      if (isNaN(slippagePct) || slippagePct < 0 || slippagePct > 100) return null;
      return {
        type: "slippage",
        raw: placeholder,
        reference: ref,
        percentage: slippagePct,
      };

    default:
      return null;
  }
}

/**
 * Extract all placeholders from a string or nested object
 */
export function extractPlaceholders(value: unknown): ParsedPlaceholder[] {
  const placeholders: ParsedPlaceholder[] = [];

  function traverse(v: unknown): void {
    if (typeof v === "string") {
      let match;
      while ((match = PLACEHOLDER_REGEX.exec(v)) !== null) {
        const parsed = parsePlaceholder(match[1]);
        if (parsed) {
          placeholders.push(parsed);
        }
      }
    } else if (Array.isArray(v)) {
      for (const item of v) {
        traverse(item);
      }
    } else if (v && typeof v === "object") {
      for (const key of Object.keys(v)) {
        traverse((v as Record<string, unknown>)[key]);
      }
    }
  }

  traverse(value);
  // Reset regex state
  PLACEHOLDER_REGEX.lastIndex = 0;

  return placeholders;
}

/**
 * Get all unique token addresses needed from placeholders
 */
export function getRequiredTokenAddresses(placeholders: ParsedPlaceholder[]): Address[] {
  const addresses = new Set<Address>();
  for (const p of placeholders) {
    if (p.tokenAddress) {
      addresses.add(p.tokenAddress);
    }
  }
  return Array.from(addresses);
}

// ============================================================================
// Placeholder Resolution
// ============================================================================

/**
 * Resolve a single placeholder to its value
 */
export function resolvePlaceholder(
  placeholder: ParsedPlaceholder,
  context: WalletContext,
  resolvedValues: Map<string, bigint> = new Map()
): string {
  switch (placeholder.type) {
    case "walletAddress":
      return context.walletAddress;

    case "ethBalance":
      return context.ethBalance.toString();

    case "tokenBalance":
      const balance = context.tokenBalances.get(placeholder.tokenAddress!) ?? 0n;
      return balance.toString();

    case "percentageEth":
      const ethPct = (context.ethBalance * BigInt(Math.floor(placeholder.percentage! * 100))) / 10000n;
      return ethPct.toString();

    case "percentageToken":
      const tokenBal = context.tokenBalances.get(placeholder.tokenAddress!) ?? 0n;
      const tokenPct = (tokenBal * BigInt(Math.floor(placeholder.percentage! * 100))) / 10000n;
      return tokenPct.toString();

    case "blockTimestamp":
      return context.blockTimestamp.toString();

    case "deadline":
      const deadline = context.blockTimestamp + BigInt(placeholder.seconds!);
      return deadline.toString();

    case "slippage":
      // Get the reference value - it could be a placeholder like "ethBalance" or a resolved value
      let refValue: bigint;
      const ref = placeholder.reference!;

      if (ref === "ethBalance") {
        refValue = context.ethBalance;
      } else if (ref.startsWith("tokenBalance:")) {
        const addr = ref.split(":")[1] as Address;
        refValue = context.tokenBalances.get(addr) ?? 0n;
      } else if (resolvedValues.has(ref)) {
        refValue = resolvedValues.get(ref)!;
      } else {
        // Try to parse as a numeric value
        try {
          refValue = BigInt(ref);
        } catch {
          refValue = 0n;
        }
      }

      // Apply slippage (reduce by N%)
      const slippageAmount = (refValue * BigInt(Math.floor(placeholder.percentage! * 100))) / 10000n;
      return (refValue - slippageAmount).toString();

    default:
      return `{{${placeholder.raw}}}`;
  }
}

/**
 * Resolve all placeholders in a string
 */
export function resolveString(str: string, context: WalletContext): string {
  return str.replace(PLACEHOLDER_REGEX, (match, placeholder) => {
    const parsed = parsePlaceholder(placeholder);
    if (!parsed) return match;
    return resolvePlaceholder(parsed, context);
  });
}

/**
 * Recursively resolve placeholders in an object/array/string
 */
export function resolveValue(value: unknown, context: WalletContext): unknown {
  if (typeof value === "string") {
    // Check if the entire string is a single placeholder that should return a number
    const fullMatch = value.match(/^\{\{([^}]+)\}\}$/);
    if (fullMatch) {
      const parsed = parsePlaceholder(fullMatch[1]);
      if (parsed && [
        "ethBalance",
        "tokenBalance",
        "percentageEth",
        "percentageToken",
        "blockTimestamp",
        "deadline",
        "slippage",
      ].includes(parsed.type)) {
        // Return as string (for BigInt compatibility with ABI encoding)
        return resolvePlaceholder(parsed, context);
      }
    }
    return resolveString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, context));
  }

  if (value && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveValue(val, context);
    }
    return resolved;
  }

  return value;
}

// ============================================================================
// Template Resolution
// ============================================================================

export interface ResolvedTransaction {
  to: Address;
  data: Hex;
  value: bigint;
}

/**
 * Resolve a transaction template to concrete transaction data
 */
export function resolveTemplate(
  template: TransactionTemplateInput,
  context: WalletContext
): ResolvedTransaction {
  const to = template.contractAddress as Address;

  // Resolve the value field
  const valueStr = resolveString(template.value, context);
  const value = BigInt(valueStr);

  if (template.mode === "raw") {
    // For raw mode, resolve placeholders in the hex data
    const data = resolveString(template.data, context) as Hex;
    return { to, data, value };
  }

  // For ABI mode, resolve placeholders in args and encode
  const resolvedArgs = resolveValue(template.args, context) as unknown[];

  try {
    const data = encodeFunctionData({
      abi: template.abi as readonly unknown[],
      functionName: template.functionName,
      args: resolvedArgs,
    });
    return { to, data, value };
  } catch (error) {
    throw new Error(
      `Failed to encode function data: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Validate a transaction template structure
 */
export function validateTemplate(template: unknown): {
  valid: boolean;
  error?: string;
  placeholders?: ParsedPlaceholder[];
} {
  // Parse with Zod
  const result = TransactionTemplateSchema.safeParse(template);
  if (!result.success) {
    return {
      valid: false,
      error: result.error.errors[0].message,
    };
  }

  // Extract and validate placeholders
  const placeholders = extractPlaceholders(result.data);

  // Check for invalid placeholders in the original template string
  const templateStr = JSON.stringify(template);
  const allMatches = [...templateStr.matchAll(PLACEHOLDER_REGEX)];
  for (const match of allMatches) {
    const parsed = parsePlaceholder(match[1]);
    if (!parsed) {
      return {
        valid: false,
        error: `Invalid placeholder: {{${match[1]}}}`,
      };
    }
  }

  return {
    valid: true,
    placeholders,
  };
}

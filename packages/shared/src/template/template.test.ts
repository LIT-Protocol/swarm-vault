import { describe, it, expect } from "vitest";
import {
  parsePlaceholder,
  extractPlaceholders,
  getRequiredTokenAddresses,
  resolvePlaceholder,
  resolveString,
  resolveValue,
  resolveTemplate,
  validateTemplate,
  type WalletContext,
} from "./index";
import type { Address } from "viem";

const TEST_WALLET = "0x1234567890123456789012345678901234567890" as Address;
const TEST_TOKEN = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;

const createContext = (overrides: Partial<WalletContext> = {}): WalletContext => ({
  walletAddress: TEST_WALLET,
  ethBalance: 1000000000000000000n, // 1 ETH
  tokenBalances: new Map([[TEST_TOKEN, 500000000n]]), // 500 tokens (6 decimals)
  blockTimestamp: 1700000000n,
  ...overrides,
});

describe("parsePlaceholder", () => {
  it("parses walletAddress placeholder", () => {
    const result = parsePlaceholder("walletAddress");
    expect(result).toEqual({ type: "walletAddress", raw: "walletAddress" });
  });

  it("parses ethBalance placeholder", () => {
    const result = parsePlaceholder("ethBalance");
    expect(result).toEqual({ type: "ethBalance", raw: "ethBalance" });
  });

  it("parses tokenBalance placeholder", () => {
    const result = parsePlaceholder(`tokenBalance:${TEST_TOKEN}`);
    expect(result).toEqual({
      type: "tokenBalance",
      raw: `tokenBalance:${TEST_TOKEN}`,
      tokenAddress: TEST_TOKEN,
    });
  });

  it("returns null for invalid tokenBalance (missing address)", () => {
    expect(parsePlaceholder("tokenBalance")).toBeNull();
  });

  it("returns null for invalid tokenBalance (invalid address)", () => {
    expect(parsePlaceholder("tokenBalance:0xinvalid")).toBeNull();
  });

  it("parses percentageEth placeholder", () => {
    const result = parsePlaceholder("percentage:ethBalance:50");
    expect(result).toEqual({
      type: "percentageEth",
      raw: "percentage:ethBalance:50",
      percentage: 50,
    });
  });

  it("parses percentageToken placeholder", () => {
    const result = parsePlaceholder(`percentage:tokenBalance:${TEST_TOKEN}:100`);
    expect(result).toEqual({
      type: "percentageToken",
      raw: `percentage:tokenBalance:${TEST_TOKEN}:100`,
      tokenAddress: TEST_TOKEN,
      percentage: 100,
    });
  });

  it("returns null for invalid percentage (out of range)", () => {
    expect(parsePlaceholder("percentage:ethBalance:150")).toBeNull();
    expect(parsePlaceholder("percentage:ethBalance:-10")).toBeNull();
  });

  it("parses blockTimestamp placeholder", () => {
    const result = parsePlaceholder("blockTimestamp");
    expect(result).toEqual({ type: "blockTimestamp", raw: "blockTimestamp" });
  });

  it("parses deadline placeholder", () => {
    const result = parsePlaceholder("deadline:300");
    expect(result).toEqual({
      type: "deadline",
      raw: "deadline:300",
      seconds: 300,
    });
  });

  it("returns null for invalid deadline (negative)", () => {
    expect(parsePlaceholder("deadline:-100")).toBeNull();
  });

  it("parses slippage placeholder", () => {
    const result = parsePlaceholder("slippage:ethBalance:5");
    expect(result).toEqual({
      type: "slippage",
      raw: "slippage:ethBalance:5",
      reference: "ethBalance",
      percentage: 5,
    });
  });

  it("returns null for unknown placeholder type", () => {
    expect(parsePlaceholder("unknown:value")).toBeNull();
  });
});

describe("extractPlaceholders", () => {
  it("extracts placeholders from a string", () => {
    const placeholders = extractPlaceholders("Send {{ethBalance}} to {{walletAddress}}");
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0].type).toBe("ethBalance");
    expect(placeholders[1].type).toBe("walletAddress");
  });

  it("extracts placeholders from nested objects", () => {
    const obj = {
      recipient: "{{walletAddress}}",
      amount: "{{percentage:ethBalance:50}}",
      args: ["{{tokenBalance:" + TEST_TOKEN + "}}"],
    };
    const placeholders = extractPlaceholders(obj);
    expect(placeholders).toHaveLength(3);
  });

  it("extracts placeholders from arrays", () => {
    const arr = ["{{walletAddress}}", "{{ethBalance}}", { nested: "{{blockTimestamp}}" }];
    const placeholders = extractPlaceholders(arr);
    expect(placeholders).toHaveLength(3);
  });

  it("returns empty array when no placeholders", () => {
    const placeholders = extractPlaceholders("No placeholders here");
    expect(placeholders).toHaveLength(0);
  });

  it("ignores invalid placeholders", () => {
    const placeholders = extractPlaceholders("{{invalid:placeholder}} {{walletAddress}}");
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].type).toBe("walletAddress");
  });
});

describe("getRequiredTokenAddresses", () => {
  it("returns unique token addresses from placeholders", () => {
    const placeholders = extractPlaceholders({
      amount1: `{{tokenBalance:${TEST_TOKEN}}}`,
      amount2: `{{percentage:tokenBalance:${TEST_TOKEN}:50}}`,
    });
    const addresses = getRequiredTokenAddresses(placeholders);
    expect(addresses).toEqual([TEST_TOKEN]);
  });

  it("returns empty array when no token placeholders", () => {
    const placeholders = extractPlaceholders("{{walletAddress}} {{ethBalance}}");
    const addresses = getRequiredTokenAddresses(placeholders);
    expect(addresses).toHaveLength(0);
  });
});

describe("resolvePlaceholder", () => {
  const context = createContext();

  it("resolves walletAddress", () => {
    const placeholder = parsePlaceholder("walletAddress")!;
    expect(resolvePlaceholder(placeholder, context)).toBe(TEST_WALLET);
  });

  it("resolves ethBalance", () => {
    const placeholder = parsePlaceholder("ethBalance")!;
    expect(resolvePlaceholder(placeholder, context)).toBe("1000000000000000000");
  });

  it("resolves tokenBalance", () => {
    const placeholder = parsePlaceholder(`tokenBalance:${TEST_TOKEN}`)!;
    expect(resolvePlaceholder(placeholder, context)).toBe("500000000");
  });

  it("resolves tokenBalance to 0 for unknown token", () => {
    const unknownToken = "0x0000000000000000000000000000000000000001" as Address;
    const placeholder = parsePlaceholder(`tokenBalance:${unknownToken}`)!;
    expect(resolvePlaceholder(placeholder, context)).toBe("0");
  });

  it("resolves percentageEth (50%)", () => {
    const placeholder = parsePlaceholder("percentage:ethBalance:50")!;
    expect(resolvePlaceholder(placeholder, context)).toBe("500000000000000000");
  });

  it("resolves percentageEth (100%)", () => {
    const placeholder = parsePlaceholder("percentage:ethBalance:100")!;
    expect(resolvePlaceholder(placeholder, context)).toBe("1000000000000000000");
  });

  it("resolves percentageToken", () => {
    const placeholder = parsePlaceholder(`percentage:tokenBalance:${TEST_TOKEN}:100`)!;
    expect(resolvePlaceholder(placeholder, context)).toBe("500000000");
  });

  it("resolves blockTimestamp", () => {
    const placeholder = parsePlaceholder("blockTimestamp")!;
    expect(resolvePlaceholder(placeholder, context)).toBe("1700000000");
  });

  it("resolves deadline", () => {
    const placeholder = parsePlaceholder("deadline:300")!;
    expect(resolvePlaceholder(placeholder, context)).toBe("1700000300");
  });

  it("resolves slippage (5%)", () => {
    const placeholder = parsePlaceholder("slippage:ethBalance:5")!;
    // 1 ETH - 5% = 0.95 ETH
    expect(resolvePlaceholder(placeholder, context)).toBe("950000000000000000");
  });

  it("resolves slippage for numeric reference", () => {
    const placeholder = parsePlaceholder("slippage:1000000000:10")!;
    // 1000000000 - 10% = 900000000
    expect(resolvePlaceholder(placeholder, context)).toBe("900000000");
  });
});

describe("resolveString", () => {
  const context = createContext();

  it("resolves multiple placeholders in a string", () => {
    const str = "Transfer from {{walletAddress}} with balance {{ethBalance}}";
    const result = resolveString(str, context);
    expect(result).toBe(`Transfer from ${TEST_WALLET} with balance 1000000000000000000`);
  });

  it("preserves string without placeholders", () => {
    const str = "No placeholders here";
    expect(resolveString(str, context)).toBe(str);
  });

  it("preserves invalid placeholders", () => {
    const str = "{{invalid}} {{walletAddress}}";
    const result = resolveString(str, context);
    expect(result).toBe(`{{invalid}} ${TEST_WALLET}`);
  });
});

describe("resolveValue", () => {
  const context = createContext();

  it("resolves string placeholders", () => {
    expect(resolveValue("{{walletAddress}}", context)).toBe(TEST_WALLET);
  });

  it("resolves numeric placeholders to strings (for BigInt compatibility)", () => {
    expect(resolveValue("{{ethBalance}}", context)).toBe("1000000000000000000");
  });

  it("resolves nested objects", () => {
    const obj = {
      to: "{{walletAddress}}",
      amount: "{{ethBalance}}",
    };
    const result = resolveValue(obj, context) as Record<string, unknown>;
    expect(result.to).toBe(TEST_WALLET);
    expect(result.amount).toBe("1000000000000000000");
  });

  it("resolves arrays", () => {
    const arr = ["{{walletAddress}}", "{{ethBalance}}"];
    const result = resolveValue(arr, context) as unknown[];
    expect(result[0]).toBe(TEST_WALLET);
    expect(result[1]).toBe("1000000000000000000");
  });

  it("preserves non-placeholder values", () => {
    expect(resolveValue(123, context)).toBe(123);
    expect(resolveValue(true, context)).toBe(true);
    expect(resolveValue(null, context)).toBe(null);
  });
});

describe("validateTemplate", () => {
  it("validates a correct ABI template", () => {
    const template = {
      mode: "abi",
      contractAddress: TEST_TOKEN,
      abi: [{ type: "function", name: "transfer" }],
      functionName: "transfer",
      args: ["{{walletAddress}}", "{{ethBalance}}"],
      value: "0",
    };
    const result = validateTemplate(template);
    expect(result.valid).toBe(true);
    expect(result.placeholders).toHaveLength(2);
  });

  it("validates a correct raw template", () => {
    const template = {
      mode: "raw",
      contractAddress: TEST_TOKEN,
      data: "0x1234",
      value: "{{ethBalance}}",
    };
    const result = validateTemplate(template);
    expect(result.valid).toBe(true);
    expect(result.placeholders).toHaveLength(1);
  });

  it("rejects invalid contract address", () => {
    const template = {
      mode: "abi",
      contractAddress: "invalid",
      abi: [{ type: "function" }],
      functionName: "test",
      args: [],
      value: "0",
    };
    const result = validateTemplate(template);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid contract address");
  });

  it("rejects invalid placeholders", () => {
    const template = {
      mode: "abi",
      contractAddress: TEST_TOKEN,
      abi: [{ type: "function" }],
      functionName: "test",
      args: ["{{invalidPlaceholder:bad}}"],
      value: "0",
    };
    const result = validateTemplate(template);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid placeholder");
  });

  it("rejects empty ABI", () => {
    const template = {
      mode: "abi",
      contractAddress: TEST_TOKEN,
      abi: [],
      functionName: "test",
      args: [],
      value: "0",
    };
    const result = validateTemplate(template);
    expect(result.valid).toBe(false);
  });
});

describe("resolveTemplate", () => {
  const context = createContext();

  it("resolves an ABI template to transaction data", () => {
    const template = {
      mode: "abi" as const,
      contractAddress: TEST_TOKEN,
      abi: [
        {
          type: "function",
          name: "transfer",
          inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
          ],
        },
      ],
      functionName: "transfer",
      args: ["{{walletAddress}}", "{{percentage:ethBalance:50}}"],
      value: "0",
    };

    const result = resolveTemplate(template, context);
    expect(result.to).toBe(TEST_TOKEN);
    expect(result.value).toBe(0n);
    expect(result.data).toMatch(/^0x/);
    // The function selector for transfer(address,uint256) is 0xa9059cbb
    expect(result.data.startsWith("0xa9059cbb")).toBe(true);
  });

  it("resolves a raw template", () => {
    const template = {
      mode: "raw" as const,
      contractAddress: TEST_TOKEN,
      data: "0x1234",
      value: "{{percentage:ethBalance:100}}",
    };

    const result = resolveTemplate(template, context);
    expect(result.to).toBe(TEST_TOKEN);
    expect(result.data).toBe("0x1234");
    expect(result.value).toBe(1000000000000000000n);
  });

  it("resolves template with value placeholder", () => {
    const template = {
      mode: "raw" as const,
      contractAddress: TEST_TOKEN,
      data: "0x",
      value: "{{slippage:ethBalance:5}}",
    };

    const result = resolveTemplate(template, context);
    expect(result.value).toBe(950000000000000000n);
  });

  it("throws on invalid ABI encoding", () => {
    const template = {
      mode: "abi" as const,
      contractAddress: TEST_TOKEN,
      abi: [
        {
          type: "function",
          name: "nonexistent",
          inputs: [],
        },
      ],
      functionName: "different",
      args: [],
      value: "0",
    };

    expect(() => resolveTemplate(template, context)).toThrow("Failed to encode function data");
  });
});

describe("edge cases", () => {
  it("handles zero balances correctly", () => {
    const context = createContext({
      ethBalance: 0n,
      tokenBalances: new Map(),
    });

    const placeholder = parsePlaceholder("percentage:ethBalance:50")!;
    expect(resolvePlaceholder(placeholder, context)).toBe("0");
  });

  it("handles very large numbers", () => {
    const context = createContext({
      ethBalance: 1000000000000000000000000n, // 1 million ETH
    });

    const placeholder = parsePlaceholder("ethBalance")!;
    expect(resolvePlaceholder(placeholder, context)).toBe("1000000000000000000000000");
  });

  it("handles decimal percentages correctly", () => {
    const context = createContext({
      ethBalance: 1000000000000000000n,
    });

    // 33.33% of 1 ETH
    const placeholder = parsePlaceholder("percentage:ethBalance:33.33")!;
    const result = resolvePlaceholder(placeholder, context);
    // 33.33% = 3333/10000, so 1e18 * 3333 / 10000 = 333300000000000000
    expect(result).toBe("333300000000000000");
  });
});

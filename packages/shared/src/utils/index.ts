import { type Address, isAddress } from "viem";

/**
 * Validates an Ethereum address
 */
export function validateAddress(address: string): address is Address {
  return isAddress(address);
}

/**
 * Truncates an Ethereum address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Formats wei to ETH with specified decimal places
 */
export function formatEth(wei: bigint, decimals = 4): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(decimals);
}

/**
 * Parses ETH to wei
 */
export function parseEth(eth: string): bigint {
  const value = parseFloat(eth);
  if (isNaN(value)) return 0n;
  return BigInt(Math.floor(value * 1e18));
}

/**
 * Formats token amount based on decimals
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  displayDecimals = 4
): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  return `${integerPart}.${fractionalStr.slice(0, displayDecimals)}`;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

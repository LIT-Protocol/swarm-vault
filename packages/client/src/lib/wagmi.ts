import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia, base } from "wagmi/chains";

const chainId = Number(import.meta.env.VITE_CHAIN_ID || 84532);

const chain = chainId === 8453 ? base : baseSepolia;

export const wagmiConfig = getDefaultConfig({
  appName: "Swarm Vault",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [chain],
  ssr: false,
});

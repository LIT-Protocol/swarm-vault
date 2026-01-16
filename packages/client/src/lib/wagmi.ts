import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia, base } from "wagmi/chains";

const chainId = Number(import.meta.env.VITE_CHAIN_ID || 84532);

// Primary chain based on env, but include both for smoother switching
const primaryChain = chainId === 8453 ? base : baseSepolia;
const secondaryChain = chainId === 8453 ? baseSepolia : base;

export const wagmiConfig = getDefaultConfig({
  appName: "Swarm Vault",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [primaryChain, secondaryChain],
  ssr: false,
});

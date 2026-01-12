import { http, createConfig } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const chainId = Number(import.meta.env.VITE_CHAIN_ID || 84532);

// Primary chain based on env, but include both for smoother switching
const primaryChain = chainId === 8453 ? base : baseSepolia;
const secondaryChain = chainId === 8453 ? baseSepolia : base;

export const wagmiConfig = createConfig({
  // Primary chain first, secondary available for switching
  chains: [primaryChain, secondaryChain],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
  },
});

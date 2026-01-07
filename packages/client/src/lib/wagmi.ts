import { http, createConfig } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const chainId = Number(import.meta.env.VITE_CHAIN_ID || 84532);

export const wagmiConfig = createConfig({
  chains: chainId === 8453 ? [base] : [baseSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
  },
});

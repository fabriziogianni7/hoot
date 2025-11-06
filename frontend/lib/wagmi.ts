import { farcasterMiniApp as miniAppConnector } from "@farcaster/miniapp-wagmi-connector";
import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { baseAccount, injected } from "wagmi/connectors";
import { base, baseSepolia } from "viem/chains";


// Configure all available chains
const chains = [base, baseSepolia] as const;

// Create transport configuration for all chains
const transports = {
  [base.id]: http('https://mainnet.base.org'),
  [baseSepolia.id]: http('https://sepolia.base.org'),
};

export const wagmiConfig = createConfig({
  chains,
  transports,
  connectors: [
    miniAppConnector(),
    baseAccount({
      appName: "Hoot!",
      
    }),
    injected()    
  ]
});

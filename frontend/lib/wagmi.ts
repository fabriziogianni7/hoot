import { farcasterMiniApp as miniAppConnector } from "@farcaster/miniapp-wagmi-connector";
import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { base, basePreconf, baseSepolia } from "viem/chains";


// Configure all available chains
const chains = [basePreconf, baseSepolia] as const;

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
    coinbaseWallet({
      appName: "Hoot!",
    }),
    injected()    
  ],
});

import { farcasterMiniApp as miniAppConnector } from "@farcaster/miniapp-wagmi-connector";
import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { getCurrentChain, getRpcUrl } from "./env-config";


// Get the current chain configuration
const currentChain = getCurrentChain();
const rpcUrl = getRpcUrl();

// Configure chains based on environment
const chains = [currentChain] as const;

// Create transport configuration
const transports = {
  [currentChain.id]: http(rpcUrl),
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

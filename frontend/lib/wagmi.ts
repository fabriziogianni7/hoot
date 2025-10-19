import { farcasterMiniApp as miniAppConnector } from "@farcaster/miniapp-wagmi-connector";
import { basePreconf, baseSepolia } from "viem/chains";
import { createConfig, http } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";

const chains = [ basePreconf,baseSepolia] as const;

export const wagmiConfig = createConfig({
  chains,
  transports: {
    [basePreconf.id]: http(),
    [baseSepolia.id]: http(),
  },
  connectors: [
    miniAppConnector(),
    coinbaseWallet({
      appName: "Hoot",
    }),
  ],
});

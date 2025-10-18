import { farcasterMiniApp as miniAppConnector } from "@farcaster/miniapp-wagmi-connector";
import { basePreconf } from "viem/chains";
import { createConfig, http } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import { getDefaultConfig } from "@wagmi/core";

const chains = [basePreconf] as const;

export const wagmiConfig = createConfig(
  getDefaultConfig({
    ssr: true,
    chains: chains,
    transports: {
      [basePreconf.id]: http(),
    },
    connectors: [
      miniAppConnector(),
      coinbaseWallet({
        appName: "Hoot",
      }),
    ],
  }),
);

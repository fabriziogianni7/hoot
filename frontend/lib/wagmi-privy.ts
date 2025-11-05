import { base, baseSepolia } from 'viem/chains';
import { http } from 'wagmi';
import { createConfig } from '@privy-io/wagmi';
import { farcasterMiniApp as miniAppConnector } from "@farcaster/miniapp-wagmi-connector";
import { injected } from "wagmi/connectors";

export const wagmiPrivyConfig = createConfig({
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
  connectors: [
    miniAppConnector(),
    injected(),
  ],
});

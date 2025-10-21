"use client";
import { ReactNode } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
// Rimuoviamo temporaneamente questo import per risolvere il conflitto con Tailwind
// import "@coinbase/onchainkit/styles.css";
import '@farcaster/auth-kit/styles.css';
import { QuizProvider } from "@/lib/quiz-context";
import { SupabaseProvider } from "@/lib/supabase-context";
import { NetworkProvider } from "@/lib/network-context";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { AuthKitProvider } from '@farcaster/auth-kit';

const queryClient = new QueryClient();

// Farcaster Auth Kit configuration for miniapp
// For miniapps, we can use minimal configuration as Farcaster handles most of the auth
const authKitConfig = {
  // Use defaults for miniapp - Farcaster will handle the domain and URI
  rpcUrl: 'https://mainnet.optimism.io',
  relay: 'https://relay.farcaster.xyz',
};

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={base}
      config={{
        appearance: {
          mode: "auto",
        },
        wallet: {
          display: "modal",
          preference: "all",
        },
      }}
      miniKit={{
        enabled: true,
        autoConnect: true,
        notificationProxyUrl: undefined,
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <NetworkProvider>
            <SupabaseProvider>
              <QuizProvider>
                {children}
              </QuizProvider>
            </SupabaseProvider>
          </NetworkProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </OnchainKitProvider>
  );
}
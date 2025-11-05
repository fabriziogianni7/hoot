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
import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiPrivyConfig } from "@/lib/wagmi-privy";
import { privyConfig } from "@/lib/privy";

const queryClient = new QueryClient();

// Farcaster Auth Kit configuration for miniapp
// For miniapps, we can use minimal configuration as Farcaster handles most of the auth


export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={privyConfig}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiPrivyConfig}>
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
            <NetworkProvider>
              <SupabaseProvider>
                <QuizProvider>
                  {children}
                </QuizProvider>
              </SupabaseProvider>
            </NetworkProvider>
          </OnchainKitProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
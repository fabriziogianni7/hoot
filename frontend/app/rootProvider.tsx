"use client";
import { ReactNode } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
// Rimuoviamo temporaneamente questo import per risolvere il conflitto con Tailwind
// import "@coinbase/onchainkit/styles.css";
import { QuizProvider } from "@/lib/quiz-context";
import { SupabaseProvider } from "@/lib/supabase-context";
import { NetworkProvider } from "@/lib/network-context";

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
      <NetworkProvider>
        <SupabaseProvider>
          <QuizProvider>
            {children}
          </QuizProvider>
        </SupabaseProvider>
      </NetworkProvider>
    </OnchainKitProvider>
  );
}
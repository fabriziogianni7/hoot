"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import dynamic from "next/dynamic";

const queryClient = new QueryClient();

interface CustomWagmiProviderProps {
  children: React.ReactNode;
}

const ErudaProvider = dynamic(
  () => import("@/components/providers/eruda/eruda-provider").then((c) => c.Eruda),
  { ssr: false }
);

export const CustomWagmiProvider = ({ children }: CustomWagmiProviderProps) => {
  return (
    <ErudaProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
        {children}
        </QueryClientProvider>
      </WagmiProvider>
    </ErudaProvider>
  );
};

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CustomWagmiProvider>
      {children}
    </CustomWagmiProvider>
  );
}

"use client";

import { ReactNode } from "react";
import { useQuickAuth, useMiniKit } from "@coinbase/onchainkit/minikit";
import { Button } from "@/components/ui/button";

interface AuthResponse {
  success: boolean;
  user?: {
    fid: number;
    issuedAt?: number;
    expiresAt?: number;
  };
  message?: string;
}

export function AuthWrapper({ children }: { children: ReactNode }) {
  const { context } = useMiniKit();
  const { data: authData, isLoading, error } = useQuickAuth<AuthResponse>("/api/auth", { method: "GET" });

  // DEVELOPMENT MODE: Skip authentication for testing
  // Remove this line in production
  return <>{children}</>;

  // PRODUCTION MODE: Uncomment the code below for real authentication
  /*
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="animate-pulse text-2xl font-bold mb-4">Verifying your identity...</div>
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !authData?.success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
        <h1 className="text-3xl font-bold mb-4">Authentication Required</h1>
        <p className="text-xl mb-8">
          Please authenticate with your Farcaster account to use the Quiz App.
        </p>
        <div className="max-w-md mb-8">
          <p className="text-muted-foreground">
            The Quiz App requires authentication to track your quiz participation and scores.
          </p>
        </div>
        <Button onClick={() => window.location.reload()} size="lg">
          Try Again
        </Button>
      </div>
    );
  }

  // User is authenticated
  return <>{children}</>;
  */
}
"use client";

import { useState, useEffect, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

import { supabase } from "./supabase-client";
import { useAccount, useConnections, useSignMessage, useEnsName, useConnect, Connector } from "wagmi";
import type { Session, AuthError, User } from "@supabase/supabase-js";
import { base, mainnet } from "viem/chains";
import { toCoinType } from "viem";
import { SiweMessage } from "siwe";

interface LoggedUser {
  address?: string;
  fid?: number;
  username?: string;
  displayName?: string;
  isAuthenticated: boolean;
  session?: Session;
  expiresAt?: number;
}

interface UseAuthReturn {
  loggedUser: LoggedUser | null;
  isAuthLoading: boolean;
  authError: string | null;
  triggerAuth: (chainId?: number) => Promise<void>;
  connectWallet: (chainId?: number) => Promise<void>;
}

/**
 * Custom hook for Farcaster authentication with Supabase integration
 *
 * This hook handles:
 * - Farcaster mini-app authentication
 * - Automatic session management
 *
 * @returns Authentication state and error handling
 */
export function useAuth(): UseAuthReturn {
  const [loggedUser, setLoggedUser] = useState<LoggedUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Wagmi hooks
  const { signMessageAsync } = useSignMessage();
  const { address } = useAccount();
  const connections = useConnections();
  const { connectAsync, connectors } = useConnect();

  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
    coinType: toCoinType(base.id),
  });

  const [sessionData, setSessionData] = useState<{
    session: Session;
    user: User;
  } | null>(null);
  const [sessionError, setSessionError] = useState<AuthError | null>(null);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);


  // Function to create logged user with all metadata
  const createLoggedUser = useCallback(
    async (session: Session): Promise<LoggedUser> => {
      const context = await sdk.context;
      const isMiniapp = await sdk.isInMiniApp();

      const user: LoggedUser = {
        address: address,
        isAuthenticated: true,
        session: session,
        expiresAt: session.expires_at,
      };

      // Add Farcaster data if in miniapp
      if (isMiniapp && context?.user) {
        user.fid = context.user.fid;
        user.username = context.user.username;
        user.displayName = context.user.displayName;
      } else if (ensName) {
        user.username = ensName;
        user.displayName = ensName;
      } else if (session.user?.user_metadata) {
        user.username = session.user.user_metadata.username;
        user.displayName = session.user.user_metadata.display_name;
        user.fid = session.user.user_metadata.fid;
      }

      return user;
    },
    [address, ensName]
  );

  // Function to connect wallet
  const connectWallet = useCallback(async (chainId: number = 8453) => {
    if (connections.length > 0) {
      console.log("✅ Wallet already connected");
      return;
    }

    try {
      setAuthError(null);
      console.log(`🔌 Connecting wallet to chain ${chainId}...`);
      

      const isMiniapp = await sdk.isInMiniApp();
      const context = await sdk.context;
      let connector: Connector | undefined;
      // const connector = isMiniapp ? context?.client?.clientFid === 9152 ? connectors
      if (isMiniapp && context?.client?.clientFid === 9152) {
        connector = connectors.find(connector => connector.id === "farcaster");
      } else if (isMiniapp) {
        connector = connectors.find(connector => connector.id === "baseAccount");
      } else {
        connector = connectors.find(connector => connector.id === "injected");
      }
      
      if (!connector) {
        throw new Error("No wallet connector available");
      }

      await connectAsync({ connector, chainId });
      console.log("✅ Wallet connected");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect wallet";
      console.error("❌ Wallet connection error:", error);
      setAuthError(errorMessage);
      throw error;
    }
  }, [connectAsync, connectors, connections.length]);

  // Sign message and sign in with Web3
  const signMsgAndSignInWithWeb3 = useCallback(async (): Promise<void> => {
    if (!address || connections.length <= 0) {
      console.log("⚠️ Cannot sign in: no address or connections");
      return;
    }

    try {
      const domain = window.location.host;
      const origin = window.location.origin;
      const nonce = Math.random().toString(36).substring(2, 15);
      const issuedAt = new Date().toISOString();

      const message = new SiweMessage({
        domain,
        address,
        statement: "Sign in Hoot!",
        uri: origin,
        version: "1",
        chainId: 8453,
        nonce: nonce,
        issuedAt: issuedAt,
      }).prepareMessage();

      const context = await sdk.context;
      
      // Generate signature
      const signature = await signMessageAsync({ message });

      // Send to SIWE verification API route
      const apiResponse = await fetch("/api/auth/siwe-verify", {
        method: "POST",
        body: JSON.stringify({
          message,
          signature,
          address,
          fid: context?.user?.fid ? context.user.fid : null,
          username: context?.user?.username ? context.user.username : null,
        }),
        headers: { "Content-Type": "application/json" },
      });

      const apiData = await apiResponse.json();

      if (!apiResponse.ok || apiData.error) {
        throw new Error(apiData.error || "SIWE verification failed");
      }

      const { access_token, refresh_token } = apiData;

      if (!access_token || !refresh_token) {
        throw new Error("Missing tokens in API response");
      }

      // Set Supabase session with the returned tokens
      const { data, error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (sessionError || !data.session || !data.user) {
        throw sessionError || new Error("Failed to create session");
      }

      // Update user metadata in Supabase
      const isMiniapp = await sdk.isInMiniApp();

      if (isMiniapp && context?.user) {
        // Update with Farcaster data
        await supabase.auth.updateUser({
          data: {
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
          },
        });
      } else if (ensName) {
        // Update with ENS name
        await supabase.auth.updateUser({
          data: {
            username: ensName,
            display_name: ensName,
          },
        });
      }
      
      setSessionData({ session: data.session, user: data.user });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to sign in";
      console.error("❌ Sign in error:", error);
      setAuthError(errorMessage);
      setSessionError(error as AuthError);
      setIsAuthLoading(false);
    }
  }, [address, signMessageAsync, connections.length, ensName]);

  const triggerAuth = useCallback(async (chainId: number = 8453) => {
    if (connections.length === 0) {
      console.log("⚠️ No wallet connected. Attempting to connect...");
      try {
        await connectWallet(chainId);
        // After successful connection, the useEffect will handle sign in
      } catch {
        setAuthError("Failed to connect wallet. Please try again.");
        return;
      }
    }

    if (!sessionData) {
      await signMsgAndSignInWithWeb3();
    }
  }, [connections.length, sessionData, signMsgAndSignInWithWeb3, connectWallet]);

  // Effect: Detect wallet switch and re-authenticate
  useEffect(() => {
    // If we have an authenticated user but the address has changed
    if (
      loggedUser && 
      address && 
      address.toLowerCase() !== loggedUser?.address?.toLowerCase()
    ) {
      console.log("🔄 Wallet switch detected!");
      console.log(`  Previous: ${loggedUser.address}`);
      console.log(`  Current: ${address}`);
      
      // Clear current session
      setLoggedUser(null);
      setSessionData(null);
      setHasCheckedSession(false); // This will trigger Effect 1 to re-run
      setIsAuthLoading(true);
      
      // Sign out from Supabase
      supabase.auth.signOut().then(() => {
        console.log("🔐 Signed out. Effects will handle re-authentication...");
      });
    }
  }, [address, loggedUser]); // Remove triggerAuth and authenticatedAddress from dependencies

  // Effect 1: Check for existing session when wallet connects
  useEffect(() => {
    if (connections.length === 0) {
      setIsAuthLoading(false);
      setHasCheckedSession(false);
      return;
    }

    if (hasCheckedSession) {
      return;
    }

    const checkSession = async () => {
      console.log("🔍 Checking for existing session...");
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("❌ Session check error:", error);
          setSessionError(error);
          setHasCheckedSession(true);
          return;
        }

        if (data?.session) {
          console.log("✅ Found existing session");
          const user = data.session.user;
          setSessionData({ session: data.session, user });
        } else {
          console.log("ℹ️ No existing session found");
        }

        setHasCheckedSession(true);
      } catch (error: unknown) {
        console.error("❌ Session check failed:", error);
        setHasCheckedSession(true);
      }
    };

    checkSession();
  }, [connections.length, hasCheckedSession]);

  // Effect 2: If no session after check, initiate sign in
  useEffect(() => {
    // Early return if basic conditions not met
    if (!hasCheckedSession || connections.length === 0) {
      return;
    }

    // Don't return early if we have a logged user with a DIFFERENT address (wallet switch)
    const isAddressMismatch = loggedUser && address && 
      loggedUser.address?.toLowerCase() !== address.toLowerCase();

    // Return early only if logged user exists AND address matches (already authenticated)
    if (loggedUser && !isAddressMismatch) {
      return;
    }

    // Trigger sign in if no session or if address changed
    if ((!sessionData || isAddressMismatch) && !authError && !sessionError) {
      console.log("🔐 No session found, initiating sign in...");
      signMsgAndSignInWithWeb3();
    }
  }, [
    hasCheckedSession,
    sessionData,
    authError,
    sessionError,
    connections.length,
    signMsgAndSignInWithWeb3,
    loggedUser,
    address
  ]);

  // Effect 3: When we have session data, create logged user
  useEffect(() => {
    if (!sessionData?.session || connections.length === 0) {
      return;
    }

    const setupUser = async () => {
      try {
        console.log("👤 Setting up user...");

        const user = await createLoggedUser(sessionData.session);
        setLoggedUser(user);
        setIsAuthLoading(false);
        console.log("✅ User setup complete");
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Failed to setup user";
        console.error("❌ User setup error:", error);
        setAuthError(errorMessage);
        setIsAuthLoading(false);
      }
    };

    setupUser();
  }, [sessionData, connections.length, createLoggedUser, address]);

  // Effect 4: Handle disconnection
  useEffect(() => {
    if (connections.length === 0 && loggedUser) {
      console.log("🔌 Wallet disconnected");
      setLoggedUser(null);
      setSessionData(null);
      setIsAuthLoading(false);
    }
  }, [connections.length, loggedUser]);

  return {
    loggedUser,
    isAuthLoading,
    authError,
    triggerAuth,
    connectWallet,
  };
}

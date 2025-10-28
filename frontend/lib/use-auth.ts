"use client";

import { useState, useEffect, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";


import { supabase } from "./supabase-client";
import {
  useAccount,
  useConnections,
  useSignMessage,
  useEnsName,
} from "wagmi";
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
  triggerAuth: () => Promise<void>;
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
  const { address, chainId } = useAccount();
  const connections = useConnections();

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
        statement: "Sign in to ib Hoot!",
        uri: origin,
        version: "1",
        chainId: 8453,
        nonce: nonce,
        issuedAt: issuedAt,
      }).prepareMessage();

      // let signature = await signMessageAsync({ message });
      let signature;
      let debugSig;

      console.log("📝 Requesting signature...", signature);

      console.log("✅ Signature received, signing in...");

      let response = null;

      const context = await sdk.context;
      if (context.client.clientFid === 309857) {
        // For this specific client, use SIWE verification API route
        console.log("🔐 Using SIWE verification for FID 309857");
        
        // Generate signature
        signature = await signMessageAsync({ message });
        
        // Send to SIWE verification API route
        const apiResponse = await fetch('/api/auth/siwe-verify', {
          method: 'POST',
          body: JSON.stringify({ 
            message, 
            signature, 
            address 
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const apiData = await apiResponse.json();
        
        if (!apiResponse.ok || apiData.error) {
          throw new Error(apiData.error || 'SIWE verification failed');
        }

        const { access_token, refresh_token } = apiData;
        
        if (!access_token || !refresh_token) {
          throw new Error('Missing tokens in API response');
        }

        // Set Supabase session with the returned tokens
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError || !data.session) {
          throw sessionError || new Error('Failed to create session');
        }

        console.log("✅ SIWE authentication successful");
        
        // Set response to continue with normal flow
        response = { data, error: null };
      } else {
        signature = await signMessageAsync({ message });
      }

      if (!response) {
        response = await supabase.auth.signInWithWeb3({
          chain: "ethereum",
          message,
          signature: signature as `0x${string}`,
          options: {
            signInWithEthereum: {
              address,
              chainId,
            },
          },
        });
      }

      if (response?.error) {
        throw `retSigDebug error: ${debugSig} error:${response.error}`;
      }

      if (response?.data?.session) {
        // Update user metadata in Supabase
        const context = await sdk.context;
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
        setSessionData(response.data);
      }
    } catch (error: any) {
      console.error("❌ Sign in error:", error);
      setAuthError(error.message || "Failed to sign in");
      setSessionError(error as AuthError);
      setIsAuthLoading(false);
    }
  }, [address, chainId, signMessageAsync, connections.length, ensName]);

  const triggerAuth = useCallback(async () => {
    if (connections.length === 0) {
      console.log("⚠️ No wallet connected. Please connect wallet first.");
      setAuthError("Please connect your wallet first");
      return;
    }

    if (!sessionData) {
      await signMsgAndSignInWithWeb3();
    }
  }, [connections.length, sessionData, signMsgAndSignInWithWeb3]);

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
          setSessionData(data);
        } else {
          console.log("ℹ️ No existing session found");
        }

        setHasCheckedSession(true);
      } catch (error: any) {
        console.error("❌ Session check failed:", error);
        setHasCheckedSession(true);
      }
    };

    checkSession();
  }, [connections.length, hasCheckedSession]);

  // Effect 2: If no session after check, initiate sign in
  useEffect(() => {
    if (!hasCheckedSession || connections.length === 0) {
      return;
    }

    if (!sessionData && !authError && !sessionError) {
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
      } catch (error: any) {
        console.error("❌ User setup error:", error);
        setAuthError(error.message || "Failed to setup user");
        setIsAuthLoading(false);
      }
    };

    setupUser();
  }, [sessionData, connections.length, createLoggedUser]);

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
  };
}

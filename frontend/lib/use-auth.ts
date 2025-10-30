"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { supabase } from "./supabase-client";
import { useAccount, useConnections, useSignMessage, useEnsName } from "wagmi";
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
  isInMiniApp: boolean;
  needsWalletConnection: boolean;
}

/**
 * Custom hook for multi-context authentication
 * Supports:
 * - Farcaster miniapp (auto-auth)
 * - Base App with Smart Wallet (auto-auth)
 * - External wallets like MetaMask (manual auth)
 */
export function useAuth(): UseAuthReturn {
  const [loggedUser, setLoggedUser] = useState<LoggedUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isInMiniApp, setIsInMiniApp] = useState(false);
  const [appContext, setAppContext] = useState<"farcaster" | "base" | "web" | null>(null);

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
  
  // Track if user manually rejected signing
  const userRejectedSigning = useRef(false);
  // Track if we've attempted auto-auth
  const hasAttemptedAutoAuth = useRef(false);

  // Determine if wallet connection is needed (for web context only)
  const needsWalletConnection = appContext === "web" && connections.length === 0;

  /**
   * Detect application context on mount
   */
  useEffect(() => {
    const detectContext = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp();
        setIsInMiniApp(inMiniApp);

        if (inMiniApp) {
          const context = await sdk.context;
          if (context?.user) {
            // Farcaster miniapp
            setAppContext("farcaster");
            console.log("🎯 Context: Farcaster Miniapp");
          } else {
            // Could be Base App or other miniapp
            setAppContext("base");
            console.log("🎯 Context: Base App (or similar miniapp)");
          }
        } else {
          // Regular web browser
          setAppContext("web");
          console.log("🎯 Context: Web Browser");
        }
      } catch (error) {
        console.error("Error detecting context:", error);
        setAppContext("web");
      }
    };

    detectContext();
  }, []);

  /**
   * Create logged user with all metadata
   */
  const createLoggedUser = useCallback(
    async (session: Session): Promise<LoggedUser> => {
      const user: LoggedUser = {
        address: address,
        isAuthenticated: true,
        session: session,
        expiresAt: session.expires_at,
      };

      // Add context-specific data
      if (appContext === "farcaster") {
        try {
          const context = await sdk.context;
          if (context?.user) {
            user.fid = context.user.fid;
            user.username = context.user.username;
            user.displayName = context.user.displayName;
          }
        } catch (error) {
          console.warn("Could not get Farcaster context:", error);
        }
      }

      // Fallback to ENS or session metadata
      if (!user.username && ensName) {
        user.username = ensName;
        user.displayName = ensName;
      } else if (!user.username && session.user?.user_metadata) {
        user.username = session.user.user_metadata.username;
        user.displayName = session.user.user_metadata.display_name;
        user.fid = session.user.user_metadata.fid;
      }

      return user;
    },
    [address, ensName, appContext]
  );

  /**
   * Sign SIWE message and authenticate with backend
   */
  const signMsgAndSignInWithWeb3 = useCallback(async (): Promise<boolean> => {
    if (!address || connections.length <= 0) {
      console.log("⚠️ Cannot sign in: no address or connections");
      setAuthError("No wallet connected");
      return false;
    }

    // Don't attempt if user already rejected
    if (userRejectedSigning.current) {
      console.log("⚠️ User previously rejected signing");
      return false;
    }

    try {
      setAuthError(null);
      const domain = window.location.host;
      const origin = window.location.origin;
      const nonce = Math.random().toString(36).substring(2, 15);
      const issuedAt = new Date().toISOString();

      const message = new SiweMessage({
        domain,
        address,
        statement: "Sign in to Hoot!",
        uri: origin,
        version: "1",
        chainId: chainId || 8453,
        nonce: nonce,
        issuedAt: issuedAt,
      }).prepareMessage();

      // Get Farcaster context if available
      const context = await sdk.context;

      // Request signature from wallet
      console.log("📝 Requesting signature from wallet...");
      const signature = await signMessageAsync({ message });
      console.log("✅ Signature obtained");

      // Send to SIWE verification API
      const apiResponse = await fetch("/api/auth/siwe-verify", {
        method: "POST",
        body: JSON.stringify({
          message,
          signature,
          address,
          fid: context?.user?.fid || null,
          username: context?.user?.username || null,
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

      if (sessionError || !data.session) {
        throw sessionError || new Error("Failed to create session");
      }

      console.log("✅ Session created successfully");

      // Update user metadata if needed
      if (appContext === "farcaster" && context?.user) {
        await supabase.auth.updateUser({
          data: {
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
          },
        });
      } else if (ensName) {
        await supabase.auth.updateUser({
          data: {
            username: ensName,
            display_name: ensName,
          },
        });
      }

      if (data.session && data.user) {
        setSessionData({ session: data.session, user: data.user });
      }

      return true;
    } catch (error: any) {
      console.error("❌ Sign in error:", error);

      // Check if user rejected the signature
      if (
        error.message?.includes("User rejected") ||
        error.message?.includes("User denied") ||
        error.code === 4001 ||
        error.code === "ACTION_REJECTED"
      ) {
        console.log("🚫 User rejected signature request");
        userRejectedSigning.current = true;
        setAuthError("Signature request rejected. Click 'Connect Wallet' to try again.");
      } else {
        setAuthError(error.message || "Failed to sign in");
      }

      setSessionError(error as AuthError);
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  }, [address, chainId, signMessageAsync, connections.length, ensName, appContext]);

  /**
   * Trigger authentication (can be called manually or automatically)
   */
  const triggerAuth = useCallback(async () => {
    // Reset rejection flag when user manually triggers
    userRejectedSigning.current = false;
    setAuthError(null);
    setIsAuthLoading(true);

    if (connections.length === 0) {
      console.log("⚠️ No wallet connected. Please connect wallet first.");
      setAuthError("Please connect your wallet first");
      setIsAuthLoading(false);
      return;
    }

    if (!sessionData) {
      await signMsgAndSignInWithWeb3();
    } else {
      console.log("ℹ️ Session already exists");
      setIsAuthLoading(false);
    }
  }, [connections.length, sessionData, signMsgAndSignInWithWeb3]);

  /**
   * Effect 1: Check for existing session when wallet connects
   */
  useEffect(() => {
    if (!appContext) {
      return; // Wait for context detection
    }

    // For web context without wallet, don't check session yet
    if (appContext === "web" && connections.length === 0) {
      setIsAuthLoading(false);
      setHasCheckedSession(true);
      return;
    }

    // For miniapp contexts or web with wallet, check session
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
          setIsAuthLoading(false);
          return;
        }

        if (data?.session) {
          console.log("✅ Found existing session");
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user) {
            setSessionData({ session: data.session, user: userData.user });
          }
        } else {
          console.log("ℹ️ No existing session found");
        }

        setHasCheckedSession(true);
      } catch (error: any) {
        console.error("❌ Session check failed:", error);
        setHasCheckedSession(true);
        setIsAuthLoading(false);
      }
    };

    checkSession();
  }, [appContext, connections.length, hasCheckedSession]);

  /**
   * Effect 2: Auto-authenticate for Farcaster and Base contexts ONLY
   * For web context, wait for manual trigger
   */
  useEffect(() => {
    if (!appContext || !hasCheckedSession) {
      return;
    }

    // Don't auto-auth if already attempted or if session exists
    if (hasAttemptedAutoAuth.current || sessionData || userRejectedSigning.current) {
      return;
    }

    // Only auto-auth for miniapp contexts (Farcaster and Base)
    if ((appContext === "farcaster" || appContext === "base") && connections.length > 0) {
      console.log(`🔐 Auto-authenticating for ${appContext} context...`);
      hasAttemptedAutoAuth.current = true;
      signMsgAndSignInWithWeb3();
    } else if (appContext === "web") {
      // For web context, just set loading to false and wait for user action
      console.log("🌐 Web context: waiting for user to connect wallet and authenticate");
      setIsAuthLoading(false);
    }
  }, [appContext, hasCheckedSession, sessionData, connections.length, signMsgAndSignInWithWeb3]);

  /**
   * Effect 3: Create logged user when session is available
   */
  useEffect(() => {
    if (!sessionData?.session || connections.length === 0) {
      // Exception: Farcaster miniapp might not need wallet connection
      if (appContext === "farcaster" && sessionData?.session) {
        // Allow Farcaster auth without wallet
      } else {
        return;
      }
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
  }, [sessionData, connections.length, createLoggedUser, appContext]);

  /**
   * Effect 4: Handle disconnection
   */
  useEffect(() => {
    if (connections.length === 0 && loggedUser) {
      console.log("🔌 Wallet disconnected, clearing session");
      setLoggedUser(null);
      setSessionData(null);
      setHasCheckedSession(false);
      hasAttemptedAutoAuth.current = false;
      userRejectedSigning.current = false;
      setIsAuthLoading(false);
      
      // For web context, this is expected behavior
      // For miniapp contexts, this might be an error
      if (appContext !== "web") {
        console.warn("⚠️ Unexpected wallet disconnection in miniapp context");
      }
    }
  }, [connections.length, loggedUser, appContext]);

  /**
   * Effect 5: Reset auth attempt flag when context or address changes
   */
  useEffect(() => {
    hasAttemptedAutoAuth.current = false;
    userRejectedSigning.current = false;
  }, [appContext, address]);

  return {
    loggedUser,
    isAuthLoading,
    authError,
    triggerAuth,
    isInMiniApp,
    needsWalletConnection,
  };
}
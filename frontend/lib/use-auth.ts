"use client";

import React, { useState, useEffect, useCallback } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { usePrivy, useWallets, useActiveWallet } from "@privy-io/react-auth";

import { supabase } from "./supabase-client";
import SignatureConfirmationModal from "../components/SignatureConfirmationModal";
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
  logout: () => Promise<void>;
  signatureModal: React.ReactNode;
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
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [isMiniapp, setIsMiniapp] = useState<boolean | null>(null);

  // Privy hooks
  const { ready, authenticated, user: privyUser, login: privyLogin, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useActiveWallet();

  // Wagmi hooks
  const { signMessageAsync } = useSignMessage();
  const { address } = useAccount();
  const connections = useConnections();
  const { connectAsync, connectors } = useConnect();

  // Check if we're in miniapp context
  useEffect(() => {
    const checkMiniapp = async () => {
      try {
        const miniappStatus = await sdk.isInMiniApp();
        setIsMiniapp(miniappStatus);
      } catch {
        setIsMiniapp(false);
      }
    };
    checkMiniapp();
  }, []);

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

      // Determine user address based on context
      let userAddress = address;
      if (!isMiniapp && privyUser?.wallet?.address) {
        userAddress = privyUser.wallet.address as `0x${string}`;
      }

      const user: LoggedUser = {
        address: userAddress,
        isAuthenticated: true,
        session: session,
        expiresAt: session.expires_at,
      };

      // Add user data based on context
      if (isMiniapp && context?.user) {
        // Miniapp user with Farcaster data
        user.fid = context.user.fid;
        user.username = context.user.username;
        user.displayName = context.user.displayName;
      } else if (!isMiniapp && privyUser) {
        // External user with Privy data
        user.username = privyUser.google?.email || privyUser.email?.address || session.user?.user_metadata?.username;
        user.displayName = privyUser.google?.name || privyUser.email?.address || session.user?.user_metadata?.display_name;
      } else if (ensName) {
        // Fallback to ENS name
        user.username = ensName;
        user.displayName = ensName;
      } else if (session.user?.user_metadata) {
        // Fallback to session metadata
        user.username = session.user.user_metadata.username;
        user.displayName = session.user.user_metadata.display_name;
        user.fid = session.user.user_metadata.fid;
      }

      return user;
    },
    [address, ensName, isMiniapp, privyUser]
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

  // Sign message and sign in with Web3 or Privy
  const performSignIn = useCallback(async (): Promise<void> => {
    // Check if we already have a valid Supabase session
    try {
      const { data: existingSession, error } = await supabase.auth.getSession();

      if (!error && existingSession?.session) {
        console.log("✅ Already have valid Supabase session, skipping sign in");
        // Update local state
        setSessionData({ session: existingSession.session, user: existingSession.session.user });
        return;
      }
    } catch (error) {
      console.log("❌ Error checking existing session:", error);
    }

    // Determine which address to use based on context
    let userAddress = address as `0x${string}` | undefined;
    let userFid = null;
    let username = null;

    if (isMiniapp) {
      // Miniapp: use wagmi address and Farcaster context
      if (!address || connections.length <= 0) {
        console.log("⚠️ Cannot sign in: no address or connections");
        return;
      }
    } else {
      // External app: use Privy wallet address
      // For Privy users, wallet should be available after authentication
      if (!privyUser?.wallet?.address) {
        console.log("⚠️ Privy user authenticated but wallet not available yet, waiting...");
        // Wait a bit for Privy to set up the wallet
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check again
        if (!privyUser?.wallet?.address) {
          console.log("❌ Still no Privy wallet available after waiting");
          setAuthError("Wallet connection incomplete. Please refresh and try again.");
          return;
        }
      }
      userAddress = privyUser.wallet.address as `0x${string}`;
      username = privyUser.google?.email || privyUser.email?.address || null;
    }

    try {
      const domain = window.location.host;
      const origin = window.location.origin;
      const nonce = Math.random().toString(36).substring(2, 15);
      const issuedAt = new Date().toISOString();

      const message = new SiweMessage({
        domain,
        address: userAddress! as `0x${string}`,
        statement: "Sign in Hoot!",
        uri: origin,
        version: "1",
        chainId: 8453,
        nonce: nonce,
        issuedAt: issuedAt,
      }).prepareMessage();

      let signature: string;

      if (isMiniapp) {
        // For miniapp, use wagmi signing
        signature = await signMessageAsync({ message });
      } else {
        // For Privy users, ensure the wallet is active in wagmi first
        if (privyUser?.wallet) {
          const privyWallet = wallets.find(wallet => wallet.address === privyUser.wallet!.address);
          if (privyWallet) setActiveWallet(privyWallet);
        }

        // Now try wagmi signing
        try {
          signature = await signMessageAsync({ message });
        } catch (wagmiError) {
          console.log("❌ Wagmi signing failed:", wagmiError);
          throw new Error("Unable to sign message. Please try again.");
        }
      }

      // Get Farcaster context for miniapp users
      const context = isMiniapp ? await sdk.context : null;
      if (isMiniapp && context?.user) {
        userFid = context.user.fid;
        username = context.user.username;
      }

      // Send to SIWE verification API route
      const apiResponse = await fetch("/api/auth/siwe-verify", {
        method: "POST",
        body: JSON.stringify({
          message,
          signature,
          address: userAddress,
          fid: userFid,
          username: username,
          email: privyUser?.google?.email || privyUser?.email?.address || `user_${userAddress!.slice(-6)}@wallet.hoot`,
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
      if (isMiniapp && context?.user) {
        // Update with Farcaster data for miniapp users
        await supabase.auth.updateUser({
          data: {
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
          },
        });
      } else if (!isMiniapp && privyUser) {
        // Update with Privy data for external users
        await supabase.auth.updateUser({
          data: {
            privy_user_id: privyUser.id,
            username: privyUser.google?.email || privyUser.email?.address || `user_${userAddress!.slice(-6)}`,
            display_name: privyUser.google?.name || privyUser.email?.address || `User ${userAddress!.slice(-6)}`,
            email: privyUser.google?.email || privyUser.email?.address || `user_${userAddress!.slice(-6)}@wallet.hoot`,
          },
        });
      } else if (ensName) {
        // Fallback to ENS name
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
  }, [address, signMessageAsync, connections.length, ensName, isMiniapp, privyUser, sessionData, wallets, setActiveWallet]);

  // Handlers for signature confirmation modal
  const handleSignatureConfirm = useCallback(async () => {
    setShowSignatureModal(false);
    await performSignIn();
  }, [performSignIn]);

  const handleSignatureCancel = useCallback(() => {
    setShowSignatureModal(false);
  }, []);

  // Main function that shows modal first
  const signMsgAndSignInWithWeb3 = useCallback(async (): Promise<void> => {
    // Check if we already have a valid Supabase session
    try {
      const { data: sessionData, error } = await supabase.auth.getSession();

      if (error) {
        console.log("❌ Error checking session:", error);
      } else if (sessionData?.session) {
        console.log("✅ Already have valid Supabase session");

        // Check if wallet is still connected for this session
        let walletConnected = false;

        if (isMiniapp) {
          walletConnected = connections.length > 0;
        } else {
          walletConnected = ready && authenticated && !!privyUser?.wallet?.address;
        }

        if (walletConnected) {
          console.log("✅ Wallet still connected, skipping signature modal");
          // Update local sessionData state
          setSessionData({ session: sessionData.session, user: sessionData.session.user });
          return;
        } else {
          console.log("⚠️ Session exists but wallet disconnected, need re-authentication");
        }
      }
    } catch (error) {
      console.log("❌ Error checking Supabase session:", error);
    }

    setShowSignatureModal(true);
  }, [isMiniapp, connections.length, ready, authenticated, privyUser]);

  const triggerAuth = useCallback(async (chainId: number = 8453) => {
    if (isMiniapp === null) {
      // Still checking miniapp status
      return;
    }

    // Check if we already have a valid Supabase session with connected wallet
    try {
      const { data: sessionData, error } = await supabase.auth.getSession();

      if (!error && sessionData?.session) {
        let walletConnected = false;

        if (isMiniapp) {
          walletConnected = connections.length > 0;
        } else {
          walletConnected = ready && authenticated && !!privyUser?.wallet?.address;
        }

        if (walletConnected) {
          console.log("✅ Already authenticated with connected wallet, skipping auth trigger");
          // Update local sessionData state
          setSessionData({ session: sessionData.session, user: sessionData.session.user });
          return;
        }
      }
    } catch (error) {
      console.log("❌ Error checking existing session:", error);
    }

    if (isMiniapp) {
      // Miniapp: use traditional wallet connection flow
      if (connections.length === 0) {
        console.log("🔌 Connecting wallet for miniapp...");
        try {
          await connectWallet(chainId);
          // After successful connection, the useEffect will handle sign in
        } catch {
          setAuthError("Failed to connect wallet. Please try again.");
          return;
        }
      }

      // Only sign if we don't have a session
      if (!sessionData?.session) {
        await signMsgAndSignInWithWeb3();
      }
    } else {
      // External app: use Privy authentication
      if (!ready) {
        console.log("⏳ Privy not ready yet");
        return;
      }

      if (!authenticated) {
        console.log("🔐 Starting Privy authentication...");
        try {
          privyLogin();
          // After Privy login completes, the useEffect will handle SIWE signing
        } catch (error) {
          console.error("❌ Privy login failed:", error);
          setAuthError("Failed to authenticate with Privy");
        }
      } else {
        // Privy authenticated - ensure wallet is connected before signing
        if (!sessionData?.session) {
          // Check if user has a wallet connected
          if (!privyUser?.wallet?.address) {
            console.log("⚠️ Privy authenticated but no wallet available");
            setAuthError("Please connect or create a wallet to continue.");
            return;
          }

          // Wallet is available, proceed with signing
          console.log("✅ Privy wallet ready, proceeding with authentication");
          await signMsgAndSignInWithWeb3();
        }
      }
    }
  }, [isMiniapp, connections.length, sessionData, signMsgAndSignInWithWeb3, connectWallet, ready, authenticated, privyLogin, privyUser]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Sign out from Supabase
      await supabase.auth.signOut();

      if (!isMiniapp) {
        // Also logout from Privy for external users
        await privyLogout();
      }

      // Clear local state
      setLoggedUser(null);
      setSessionData(null);
      setAuthError(null);
      setSessionError(null);
      setHasCheckedSession(false);
      setIsAuthLoading(false);

      console.log("✅ Logged out successfully");
    } catch (error: unknown) {
      console.error("❌ Logout error:", error);
    }
  }, [isMiniapp, privyLogout]);

  // Effect: Detect wallet switch and re-authenticate
  useEffect(() => {
    if (!loggedUser) return;

    // Determine current address based on context
    let currentAddress = address;
    if (!isMiniapp && privyUser?.wallet?.address) {
      currentAddress = privyUser.wallet.address as `0x${string}`;
    }

    // If we have an authenticated user but the address has changed
    if (
      currentAddress &&
      currentAddress.toLowerCase() !== loggedUser?.address?.toLowerCase()
    ) {
      console.log("🔄 Wallet switch detected!");
      console.log(`  Previous: ${loggedUser.address}`);
      console.log(`  Current: ${currentAddress}`);

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
  }, [address, loggedUser, isMiniapp, privyUser]);

  // Effect 1: Check for existing session when wallet connects or Privy authenticates
  useEffect(() => {
    // Determine if we should check for session
    let shouldCheckSession = false;

    if (isMiniapp === null) {
      // Still checking miniapp status
      return;
    }

    if (isMiniapp) {
      // Miniapp: check when wallet is connected
      shouldCheckSession = connections.length > 0;
    } else {
      // External app: check when Privy is ready and authenticated
      shouldCheckSession = ready && authenticated;
    }

    if (!shouldCheckSession || hasCheckedSession) {
      if (!hasCheckedSession) {
        setIsAuthLoading(false);
        setHasCheckedSession(true);
      }
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
  }, [connections.length, hasCheckedSession, isMiniapp, ready, authenticated]);

  // Effect 2: If no session after check, initiate sign in
  useEffect(() => {
    // Early return if basic conditions not met
    if (!hasCheckedSession || isMiniapp === null) {
      return;
    }

    // Check if we should proceed with sign in
    let shouldSignIn = false;
    let currentAddress = address;

    if (isMiniapp) {
      // Miniapp: need wallet connection
      shouldSignIn = connections.length > 0;
    } else {
      // External app: need Privy authentication AND wallet
      shouldSignIn = ready && authenticated && !!privyUser?.wallet?.address;
      if (!isMiniapp && privyUser?.wallet?.address) {
        currentAddress = privyUser.wallet.address as `0x${string}`;
      }
    }

    if (!shouldSignIn) {
      return;
    }

    // Don't return early if we have a logged user with a DIFFERENT address (wallet switch)
    const isAddressMismatch = loggedUser && currentAddress &&
      loggedUser.address?.toLowerCase() !== currentAddress.toLowerCase();

    // Return early only if logged user exists AND address matches (already authenticated)
    if (loggedUser && !isAddressMismatch) {
      return;
    }

    // Trigger sign in if no session or if address changed or if wallet became disconnected
    if ((!sessionData || isAddressMismatch || !shouldSignIn) && !authError && !sessionError) {
      console.log("🔐 No valid session or wallet issue found, initiating sign in...");
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
    address,
    isMiniapp,
    ready,
    authenticated,
    privyUser
  ]);

  // Effect 3: When we have session data, create logged user
  useEffect(() => {
    // Check if we have session data and proper authentication
    let hasValidAuth = false;

    if (isMiniapp === null) {
      // Still checking miniapp status
      return;
    }

    if (isMiniapp) {
      // Miniapp: need wallet connection and session
      hasValidAuth = !!(sessionData?.session && connections.length > 0);
    } else {
      // External app: need Privy authentication, wallet, and session
      hasValidAuth = !!(sessionData?.session && ready && authenticated && !!privyUser?.wallet?.address);
    }

    if (!hasValidAuth) {
      return;
    }

    const setupUser = async () => {
      try {
        console.log("👤 Setting up user...");

        const user = await createLoggedUser(sessionData!.session);
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
  }, [sessionData, connections.length, createLoggedUser, address, isMiniapp, ready, authenticated]);

  // Effect 4: Handle disconnection and Privy logout
  useEffect(() => {
    if (!loggedUser) return;

    let shouldDisconnect = false;

    if (isMiniapp) {
      // Miniapp: disconnect when wallet is disconnected
      shouldDisconnect = connections.length === 0;
    } else {
      // External app: disconnect when Privy is no longer authenticated or wallet is removed
      shouldDisconnect = !authenticated || !privyUser?.wallet?.address;
    }

    if (shouldDisconnect) {
      console.log(isMiniapp ? "🔌 Wallet disconnected" : "🔐 Privy logged out");
      setLoggedUser(null);
      setSessionData(null);
      setIsAuthLoading(false);
    }
  }, [connections.length, loggedUser, isMiniapp, authenticated]);

  return {
    loggedUser,
    isAuthLoading,
    authError,
    triggerAuth,
    connectWallet,
    logout,
    signatureModal: React.createElement(SignatureConfirmationModal, {
      isOpen: showSignatureModal,
      onConfirm: handleSignatureConfirm,
      onCancel: handleSignatureCancel,
    }),
  };
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { sdk } from "@farcaster/miniapp-sdk";

import { supabase } from "./supabase-client";
import { useAccount, useConnections, useSignMessage, useEnsName, useConnect, Connector } from "wagmi";
import { useLogin, usePrivy } from '@privy-io/react-auth';
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
  showSignInPrompt: boolean;
  triggerAuth: (chainId?: number) => Promise<void>;
  connectWallet: (chainId?: number) => Promise<void>;
  handleSignInAccept: () => Promise<void>;
  handleSignInDecline: () => void;
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
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  // Wagmi hooks
  const { signMessageAsync } = useSignMessage();
  const { address } = useAccount();
  const connections = useConnections();
  const { connectAsync, connectors } = useConnect();

  // Privy hooks
  const { login } = useLogin();
  const { ready, authenticated, user: privyUser } = usePrivy();

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
      } else if (privyUser) {
        // Use Privy user data
        user.username = privyUser.email?.address || privyUser.phone?.number || privyUser.wallet?.address;
        user.displayName = privyUser.email?.address || privyUser.phone?.number || privyUser.wallet?.address;
        // Privy doesn't provide FID, so we'll keep it undefined
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
    [address, ensName, privyUser]
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

      if (isMiniapp) {
        // In miniapp, use existing connector logic
        let connector: Connector | undefined;
        if (context?.client?.clientFid === 9152) {
          connector = connectors.find(connector => connector.id === "farcaster");
        } else {
          connector = connectors.find(connector => connector.id === "baseAccount");
        }

        if (!connector) {
          throw new Error("No wallet connector available for miniapp");
        }

        await connectAsync({ connector, chainId });
        console.log("✅ Miniapp wallet connected");
      } else {
        // Outside miniapp, use Privy for wallet connection
        if (!ready) {
          console.log("⏳ Privy is not ready yet, waiting for initialization...");
          // Instead of throwing an error, we'll let the component handle the loading state
          // The useEffect will trigger again when Privy becomes ready
          return;
        }

        if (!authenticated) {
          // Use Privy login to connect/create wallet
          login();
          console.log("🔐 Privy login initiated");
          // Note: The actual connection will happen through Privy's flow
          // wagmi will automatically pick up the connected wallet
        } else {
          console.log("✅ Already authenticated with Privy");
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect wallet";
      console.error("❌ Wallet connection error:", error);
      setAuthError(errorMessage);
      throw error;
    }
  }, [connectAsync, connectors, connections.length, login, ready, authenticated]);

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
      } else if (privyUser) {
        // Update with Privy user data
        await supabase.auth.updateUser({
          data: {
            username: privyUser.email?.address || privyUser.phone?.number || privyUser.wallet?.address,
            display_name: privyUser.email?.address || privyUser.phone?.number || privyUser.wallet?.address,
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
  }, [address, signMessageAsync, connections.length, ensName, privyUser]);

  const isAuthInProgressRef = useRef(false);

  // Handler for when user accepts the sign-in prompt
  const handleSignInAccept = useCallback(async () => {
    console.log("✅ User accepted sign-in prompt, proceeding with wallet connection...");
    setShowSignInPrompt(false);
    setIsAuthLoading(true);

    try {
      await connectWallet();
    } catch (error) {
      setAuthError("Failed to connect wallet. Please try again.");
      setIsAuthLoading(false);
    }
  }, [connectWallet]);

  // Handler for when user declines the sign-in prompt
  const handleSignInDecline = useCallback(() => {
    console.log("❌ User declined sign-in prompt");
    setShowSignInPrompt(false);
    setAuthError(null);
    setIsAuthLoading(false);
  }, []);

  const triggerAuth = useCallback(async (chainId: number = 8453) => {
    // Prevent multiple concurrent auth attempts
    if (isAuthInProgressRef.current) {
      console.log("🔄 Auth already in progress, skipping...");
      return;
    }

    isAuthInProgressRef.current = true;
    setIsAuthLoading(true);
    setAuthError(null);

    try {
      const isMiniapp = await sdk.isInMiniApp();
      const context = await sdk.context;
      console.log("🔍 triggerAuth: isMiniapp =", isMiniapp, "ready =", ready, "authenticated =", authenticated, "connections.length =", connections.length);
      console.log("🔍 Context info:", { context: !!context, user: !!context?.user, client: !!context?.client });

      if (isMiniapp) {
        // In miniapp, use traditional connection flow
        if (connections.length === 0) {
          console.log("⚠️ No wallet connected. Attempting to connect...");
          try {
            await connectWallet(chainId);
            // After successful connection, the useEffect will handle sign in
          } catch {
            setAuthError("Failed to connect wallet. Please try again.");
            setIsAuthLoading(false);
            return;
          }
        }

        if (!sessionData) {
          await signMsgAndSignInWithWeb3();
        }
      } else {
        // Outside miniapp, use Privy flow
        console.log("🌐 External app detected, checking Privy status...");
        if (!ready) {
          console.log("⏳ Privy not ready yet, waiting for initialization...");
          // Keep loading state true - the useEffect will trigger auth when ready
          return;
        }

        if (!authenticated) {
          console.log("🔐 No Privy authentication, showing sign-in prompt...");
          setShowSignInPrompt(true);
          setIsAuthLoading(false); // Stop loading while waiting for user response
          return;
        }

        // If we have Privy authentication but no session, sign in with Web3
        if (authenticated && !sessionData) {
          await signMsgAndSignInWithWeb3();
        } else if (authenticated && sessionData) {
          // Already authenticated and have session, set loading to false
          setIsAuthLoading(false);
        }
      }
    } finally {
      isAuthInProgressRef.current = false;
    }
  }, [connections.length, sessionData, signMsgAndSignInWithWeb3, connectWallet, ready, authenticated]);

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

  // Effect: Handle Privy ready state and authentication changes
  const prevAuthenticatedRef = useRef(authenticated);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const handlePrivyStateChange = async () => {
      const isMiniapp = await sdk.isInMiniApp();
      if (isMiniapp) {
        // In miniapp, we don't use Privy for authentication
        return;
      }

      const prevAuthenticated = prevAuthenticatedRef.current;
      const authStateChanged = prevAuthenticated !== authenticated;

      if (ready && authenticated && authStateChanged) {
        console.log("🔐 Privy authentication detected, proceeding with auth flow...");
        // Only trigger auth when authentication state actually changes to authenticated
        triggerAuth();
      } else if (ready && !authenticated && prevAuthenticated && authStateChanged) {
        // Privy was authenticated but now is not (user logged out)
        console.log("🔌 Privy logout detected...");
        setLoggedUser(null);
        setSessionData(null);
        setIsAuthLoading(false);
      } else if (ready && !authenticated && isAuthLoading) {
        // Privy is ready but not authenticated, and we're still loading
        console.log("🔄 Privy ready but not authenticated, stopping loading and waiting for user action...");
        setIsAuthLoading(false);
      }

      prevAuthenticatedRef.current = authenticated;
    };

    handlePrivyStateChange();
  }, [ready, authenticated]); // Remove triggerAuth from dependencies

  // Effect 1: Check for existing session when wallet connects or Privy authenticates
  useEffect(() => {
    const checkSessionConditions = async () => {
      const isMiniapp = await sdk.isInMiniApp();

      if (isMiniapp) {
        // In miniapp, check when connections exist
        if (connections.length === 0) {
          setIsAuthLoading(false);
          setHasCheckedSession(false);
          return false; // Don't proceed with session check
        }
      } else {
        // Outside miniapp, check when Privy is ready and authenticated
        if (!ready || !authenticated) {
          setIsAuthLoading(false);
          setHasCheckedSession(false);
          return false; // Don't proceed with session check
        }
      }

      return true; // Proceed with session check
    };

    const performSessionCheck = async () => {
      const shouldCheck = await checkSessionConditions();
      if (!shouldCheck || hasCheckedSession) {
        return;
      }

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

    performSessionCheck();
  }, [connections.length, hasCheckedSession, ready, authenticated]);

  // Effect 2: If no session after check, initiate sign in
  useEffect(() => {
    const initializeSignIn = async () => {
      const isMiniapp = await sdk.isInMiniApp();

      if (isMiniapp) {
        // Miniapp flow: requires connections
        if (!hasCheckedSession || connections.length === 0) {
          return;
        }
      } else {
        // External flow: requires Privy readiness and authentication
        if (!hasCheckedSession || !ready || !authenticated) {
          return;
        }
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
    };

    initializeSignIn();
  }, [
    hasCheckedSession,
    sessionData,
    authError,
    sessionError,
    connections.length,
    signMsgAndSignInWithWeb3,
    loggedUser,
    address,
    ready,
    authenticated
  ]);

  // Effect 3: When we have session data, create logged user
  useEffect(() => {
    const setupUserEffect = async () => {
      const isMiniapp = await sdk.isInMiniApp();

      // Check if we should proceed with user setup
      if (!sessionData?.session) {
        return;
      }

      if (isMiniapp && connections.length === 0) {
        return;
      }

      if (!isMiniapp && (!ready || !authenticated)) {
        return;
      }

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

    setupUserEffect();
  }, [sessionData, connections.length, createLoggedUser, address, ready, authenticated]);

  // Effect 4: Handle disconnection
  useEffect(() => {
    const handleDisconnection = async () => {
      const isMiniapp = await sdk.isInMiniApp();

      if (isMiniapp) {
        // In miniapp, check for connection loss
        if (connections.length === 0 && loggedUser) {
          console.log("🔌 Miniapp wallet disconnected");
          setLoggedUser(null);
          setSessionData(null);
          setIsAuthLoading(false);
        }
      } else {
        // Outside miniapp, check for Privy logout
        if (ready && !authenticated && loggedUser) {
          console.log("🔌 Privy user logged out");
          setLoggedUser(null);
          setSessionData(null);
          setIsAuthLoading(false);
        }
      }
    };

    handleDisconnection();
  }, [connections.length, loggedUser, ready, authenticated]);

  return {
    loggedUser,
    isAuthLoading,
    authError,
    showSignInPrompt,
    triggerAuth,
    connectWallet,
    handleSignInAccept,
    handleSignInDecline,
  };
}

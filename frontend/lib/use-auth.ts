"use client";

import { useState, useEffect } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { signInSupabase } from "./supabase-auth";

interface AuthResponse {
  success: boolean;
  user?: {
    fid: number;
    issuedAt?: number;
    expiresAt?: number;
  };
  message?: string;
}

interface UseAuthReturn {
  authData: AuthResponse | null;
  isAuthLoading: boolean;
  authError: string | null;
  isOutsideFarcaster: boolean;
  refetchAuth: () => Promise<void>;
}

/**
 * Custom hook for Farcaster authentication with Supabase integration
 * 
 * This hook handles:
 * - Farcaster mini-app authentication
 * - Supabase anonymous user creation with fid
 * - Automatic session management
 * 
 * @returns Authentication state and error handling
 */
export function useAuth(): UseAuthReturn {
  const [authData, setAuthData] = useState<AuthResponse | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // TEMPORARY: Disable Farcaster check for mobile testing
  // TODO: Set to false before production deployment
  const DISABLE_FARCASTER_CHECK = true;
  const [isOutsideFarcaster, setIsOutsideFarcaster] = useState(false);

  const fetchAuthData = async () => {
    if (authData) return;

    try {
      setIsAuthLoading(true);
      setAuthError(null);

      // Get Farcaster context (includes user profile picture URL)
      const context = await sdk.context;

      // Check if context exists and we're in a valid Farcaster/Base client
      if (!context && !DISABLE_FARCASTER_CHECK) {
        setIsOutsideFarcaster(true);
        setAuthError("App must be opened in Farcaster or Base app");
        return;
      }
      
      // If Farcaster check is disabled, skip authentication
      if (DISABLE_FARCASTER_CHECK) {
        console.log('🚧 Farcaster check disabled for testing');
        setIsAuthLoading(false);
        return;
      }

      // Check if running in authorized Farcaster clients
      if (context.client.clientFid === 9152 || context.client.clientFid === 309857) {
        const res = await sdk.quickAuth.fetch(`${window.location.origin}/api/auth`);
        if (res.ok) {
          const data = await res.json();
          setAuthData(data);
          
          // Attempt Supabase authentication
        await signInSupabase();
        //   const { data: supabaseData, error: supabaseError } = await signInSupabase();
          
        //   if (supabaseError) {
        //     // Check if it's the "user already exists" error
        //     if (typeof supabaseError === 'object' && 'message' in supabaseError) {
        //       setAuthError(`Supabase authentication failed: ${supabaseError.message}`);
        //     } else {
        //       setAuthError(`Supabase authentication failed: ${supabaseError}`);
        //     }
        //   } else {
        //     console.log('✅ Supabase authentication successful:', supabaseData);
        //   }
        } else {
          const errorData = await res.json();
          setAuthError(errorData.message || 'Mini-app authentication failed');
        }
      } 

    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsAuthLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authData]);

  return {
    authData,
    isAuthLoading,
    authError,
    isOutsideFarcaster: DISABLE_FARCASTER_CHECK ? false : isOutsideFarcaster,
    refetchAuth: fetchAuthData
  };
}


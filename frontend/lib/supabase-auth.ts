"use client";

import { supabase } from './supabase-client';
import { sdk } from "@farcaster/miniapp-sdk";
import type { Session, AuthError } from "@supabase/supabase-js";

/**
 * Sign in with Ethereum for mini-apps (Farcaster, etc.)
 * Uses the mini-app SDK to get the Ethereum provider
 */
export async function signInSupabase(): Promise<{
  data: { session: Session | null; user: Session['user'] | null } | null;
  error: AuthError | { message: string; existingUserId: string } | unknown | null;
}> {
  try {
    const context = await sdk.context;
    const user = context.user
    const client = context.client
    console.log("😾user",user)
    console.log("🧨client",client)

    // Check if user with this fid already exists
    debugger
    if (user.fid) {
      // First, check current session
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        const existingFid = sessionData.session.user.user_metadata?.fid;
        if (existingFid === user.fid) {
          console.log("✅ User already logged in with same fid:", user.fid);
          return { 
            data: { 
              session: sessionData.session, 
              user: sessionData.session.user 
            }, 
            error: null 
          };
        }
      }

      // Check if a user with this fid exists in auth.raw_user_meta_data
      try {
        const checkResponse = await fetch('/api/check-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fid: user.fid })
        });

        if (checkResponse.ok) {
          const checkResult = await checkResponse.json();
          
          if (checkResult.exists) {
            console.log("⚠️ User with fid", user.fid, "already exists with userId:", checkResult.userId);
            console.log("Existing user metadata:", checkResult.userMetadata);
            
            // Return error to prevent duplicate account creation
            return {
              data: null,
              error: {
                message: `User with fid ${user.fid} already registered. Please contact support to recover your account.`,
                existingUserId: checkResult.userId
              }
            };
          }
        } else {
          console.warn("Failed to check for existing user, status:", checkResponse.status);
        }
      } catch (err) {
        // If the API call fails, log but continue with anonymous sign-in
        console.log("Note: Could not check for existing user, proceeding with anonymous sign-in", err);
      }
    }

    const { data: signInResp, error : signInError} = await supabase.auth.signInAnonymously({
      options: {
        data: {
          ...user
        },
      },
    });
    // const signResponse = await sdk.actions.signIn({
    //   nonce: Math.random().toString(36).substring(2, 15),
    //   acceptAuthAddress: false,
    // })
    console.log("😂 signResponse", signInResp);
    console.log("😂 data", signInError);
    // const { data, error } = await supabase.auth.signInWithWeb3({
    //   chain: "ethereum",
    //   statement: "I accept the Terms of Service at https://example.com/tos",
    //   signature: signResponse.signature,
    // } as Web3Credentials);
   
    return {data: signInResp, error: signInError};
  } catch (error) {
    console.error('Mini-app SIWE error:', error);
    return { data: null, error };
  }
}


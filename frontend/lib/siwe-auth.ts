"use client";

import { supabase } from './supabase-client';
import { sdk } from "@farcaster/miniapp-sdk";
import type { Web3Credentials } from "@supabase/supabase-js";
import { EIP1193Provider } from "viem";

/**
 * Sign in with Ethereum for mini-apps (Farcaster, etc.)
 * Uses the mini-app SDK to get the Ethereum provider
 */
export async function signInWithEthereumMiniApp(): Promise<{
  data: any;
  error: any;
}> {
  try {
    const { data, error } = await supabase.auth.signInWithWeb3({
      chain: 'ethereum',
      message: 'message to sign',
      signature: '',
    })
    // const { data, error } = await supabase.auth.signInAnonymously();

    return { data, error };
  } catch (error) {
    console.error('Mini-app SIWE error:', error);
    return { data: null, error };
  }
}

/**
 * Sign in with Ethereum for web applications
 * Uses the default browser wallet provider
 */
export async function signInWithEthereumWeb(): Promise<{
  data: any;
  error: any;
}> {
  try {
    const { data, error } = await supabase.auth.signInWithWeb3({
      chain: "ethereum",
      statement: "I accept the Terms of Service at https://example.com/tos"
    });

    return { data, error };
  } catch (error) {
    console.error('Web SIWE error:', error);
    return { data: null, error };
  }
}

/**
 * Universal SIWE function that detects the environment and uses the appropriate method
 */
export async function signInWithEthereum(): Promise<{
  data: any;
  error: any;
}> {
  try {
    // Check if we're in a mini-app environment
    const isMiniApp = await sdk.isInMiniApp();
    
    if (isMiniApp) {
      return await signInWithEthereumMiniApp();
    } else {
      return await signInWithEthereumWeb();
    }
  } catch (error) {
    console.error('Universal SIWE error:', error);
    return { data: null, error };
  }
}

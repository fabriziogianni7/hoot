"use client"

import { useState, useEffect } from 'react'
import { useSupabase } from './supabase-context'
import {  useConnect, useConnections } from 'wagmi'
import type { User, Session,  Web3Credentials } from '@supabase/supabase-js'
import { EIP1193Provider } from 'viem'




interface SIWEData {
  user: User
  session: Session
  provider_token?: string
  provider_refresh_token?: string
}

const SIWE_STORAGE_KEY = 'hoot-siwe-attempted'

export function useSIWE() {
  const { supabase } = useSupabase()

  const connections = useConnections()
  const {  connectors } = useConnect()
  
  // Individual state variables
  const [isSessionChecked, setIsSessionChecked] = useState(false)
  const [data, setData] = useState<SIWEData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [hasAttempted, setHasAttempted] = useState(false)
  const [_, setShouldSignIn] = useState(false)

  // Get the appropriate wallet provider based on context
//   const getWalletProvider = () => {
//     // Check if we're in a Farcaster miniapp context
//     const isFarcasterMiniapp = connector?.id === 'farcasterMiniApp' || 
//                               connections.some(conn => conn.connector.id === 'farcasterMiniApp')
    
//     if (isFarcasterMiniapp) {
//       // In Farcaster miniapp, use the connector's provider
//       const farcasterConnection = connections.find(conn => conn.connector.id === 'farcasterMiniApp')
//       return farcasterConnection?.connector.getProvider()
//     }

//     console.log('🔐 No wallet provider available')
    
//     // Fallback to window.ethereum for regular browser wallets
//     return window.ethereum
//   }

  // Check current session on mount
  useEffect(() => {    
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.error('Error getting session:', error)
          return
        }
        
        if (session) {
          setData({ user: session.user, session })
          setIsAuthenticated(true)
          setError(null)
          console.log('🔐 SIWE Session found:', session)
          console.log('🔐 Access Token:', session.access_token)
          console.log('🔐 Refresh Token:', session.refresh_token)
          console.log('🔐 Token expires at:', new Date(session.expires_at! * 1000))
        }
        setIsSessionChecked(true)
      } catch (error) {
        console.error('Error checking session:', error)
        setIsSessionChecked(true)
      }
    }
    
    checkSession()
  }, [supabase])

  // Sign in with Ethereum effect
  useEffect(() => {
    if (isSessionChecked && !data?.session) {
      const signInWithEthereum = async () => {
        setIsLoading(true)
        setError(null)

        try {
          // Get the appropriate wallet provider
          let walletProvider: EIP1193Provider | undefined;
          
          // Try to get the first available connector
          if (connectors.length > 0) {
            const connector = connectors[0];
            try {
              const provider = await connector.getProvider();
              walletProvider = provider as EIP1193Provider;
            } catch (error) {
              console.warn('Failed to get provider from connector:', error);
            }
          }
          
          // Fallback to window.ethereum if no connector provider available
          if (!walletProvider && typeof window !== 'undefined' && window.ethereum) {
            walletProvider = window.ethereum as EIP1193Provider;
          }
          
          if (!walletProvider) {
            throw new Error('No wallet provider available');
          }
          
          const { data, error } = await supabase.auth.signInWithWeb3({
            chain: 'ethereum',
            statement: 'I accept the Terms of Service at https://example.com/tos',
            wallet: walletProvider    
          } as Web3Credentials)
      
          console.log('🔐 SIWE Response Data:', data)
          console.log('🔐 SIWE Response Error:', error)
      
          if (error) {
              console.error('❌ SIWE Error:', error)
              setError(error.message || 'Failed to sign in with Ethereum')
              setIsLoading(false)
              return
          }        

          if (data) {
            console.log('✅ SIWE Success:', data)
            setData(data)
            setIsAuthenticated(true)
            setError(null)
            setIsLoading(false)
          }

          // Mark as attempted regardless of success/failure
          localStorage.setItem(SIWE_STORAGE_KEY, 'true')
          setHasAttempted(true)

        } catch (error: unknown) {
          setError(error instanceof Error ? error.message : 'Unexpected error during sign in')
          setIsLoading(false)
          
          // Still mark as attempted even on exception
          localStorage.setItem(SIWE_STORAGE_KEY, 'true')
          setHasAttempted(true)
        } finally {
          setShouldSignIn(false)
        }
      }

      signInWithEthereum()
    }
  }, [isSessionChecked, data?.session, supabase, connections, connectors])

  const resetAttempt = () => {
    localStorage.removeItem(SIWE_STORAGE_KEY)
    setHasAttempted(false)
  }

  // Get current access token for API calls
  const getAccessToken = () => {
    return data?.session?.access_token || null
  }

  // Get current user for RLS policies
  const getCurrentUser = () => {
    return data?.user || null
  }

  // Check if session is still valid
  const isSessionValid = () => {
    if (!data?.session) return false
    const now = Math.floor(Date.now() / 1000)
    return data.session.expires_at ? data.session.expires_at > now : false
  }

  // Function to trigger sign in
  const signInWithEthereum = () => {
    setShouldSignIn(true)
  }

  return {
    data,
    error,
    isLoading,
    isAuthenticated,
    hasAttempted,
    signInWithEthereum,
    resetAttempt,
    getAccessToken,
    getCurrentUser,
    isSessionValid
  }
}


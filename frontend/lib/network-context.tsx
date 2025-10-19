"use client"

/**
 * Network Context for managing blockchain network switching
 *
 * This context provides:
 * - Current network state (local, baseSepolia, base)
 * - Network configuration (RPC URLs, chain IDs, etc.)
 * - Automatic wallet network switching
 * - Persistent network selection via localStorage
 *
 * Usage:
 * ```tsx
 * const { currentNetwork, setNetwork, networkConfig } = useNetwork()
 *
 * // Switch to Base Sepolia
 * setNetwork('baseSepolia')
 *
 * // Get current network config
 * console.log(networkConfig.name) // "Base Sepolia"
 * ```
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export interface NetworkConfig {
  name: string
  chainId: number
  rpcUrl: string
  currency: string
  explorerUrl?: string
}

export const NETWORKS: Record<string, NetworkConfig> = {
  local: {
    name: 'Anvil Local',
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
    currency: 'ETH',
    explorerUrl: 'http://127.0.0.1:8545'
  },
  baseSepolia: {
    name: 'Base Sepolia',
    chainId: 84532,
    rpcUrl: 'https://base-sepolia.drpc.org',
    currency: 'ETH',
    explorerUrl: 'https://sepolia.basescan.org'
  },
  base: {
    name: 'Base Mainnet',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    currency: 'ETH',
    explorerUrl: 'https://basescan.org'
  }
}

interface NetworkContextType {
  currentNetwork: string
  setNetwork: (network: string) => void
  networkConfig: NetworkConfig
  availableNetworks: Record<string, NetworkConfig>
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

export const useNetwork = () => {
  const context = useContext(NetworkContext)
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider')
  }
  return context
}

interface NetworkProviderProps {
  children: ReactNode
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [currentNetwork, setCurrentNetwork] = useState<string>('baseSepolia')

  // Load saved network from localStorage on mount
  useEffect(() => {
    const savedNetwork = localStorage.getItem('hoot-network')
    if (savedNetwork && NETWORKS[savedNetwork]) {
      setCurrentNetwork(savedNetwork)
    }
  }, [])

  const setNetwork = (network: string) => {
    if (NETWORKS[network]) {
      setCurrentNetwork(network)
      localStorage.setItem('hoot-network', network)

      // Notify user about network switch
      if (typeof window !== 'undefined' && window.ethereum) {
        // Try to switch network in wallet if available
        switchToNetwork(network)
      }
    }
  }

  const switchToNetwork = async (network: string) => {
    const config = NETWORKS[network]
    if (!config || !window.ethereum) return

    try {
      // Try to switch to the network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${config.chainId.toString(16)}` }]
      })
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${config.chainId.toString(16)}`,
              chainName: config.name,
              rpcUrls: [config.rpcUrl],
              blockExplorerUrls: config.explorerUrl ? [config.explorerUrl] : [],
              nativeCurrency: {
                name: config.currency,
                symbol: config.currency,
                decimals: 18
              }
            }]
          })
        } catch (addError) {
          console.error('Failed to add network:', addError)
        }
      } else {
        console.error('Failed to switch network:', switchError)
      }
    }
  }

  const networkConfig = NETWORKS[currentNetwork] || NETWORKS.baseSepolia

  const value = {
    currentNetwork,
    setNetwork,
    networkConfig,
    availableNetworks: NETWORKS
  }

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  )
}

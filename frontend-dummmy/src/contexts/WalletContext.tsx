import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { ethers } from 'ethers'

interface WalletContextType {
  account: string | null
  provider: ethers.BrowserProvider | null
  signer: ethers.JsonRpcSigner | null
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  isConnected: boolean
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export const useWallet = () => {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

interface WalletProviderProps {
  children: ReactNode
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [account, setAccount] = useState<string | null>(null)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null)

  const connectWallet = async () => {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const accounts = await provider.send('eth_requestAccounts', [])
        
        if (accounts.length > 0) {
          const signer = await provider.getSigner()
          setAccount(accounts[0])
          setProvider(provider)
          setSigner(signer)
        }
      } else {
        alert('Please install MetaMask!')
      }
    } catch (error) {
      console.error('Error connecting wallet:', error)
    }
  }

  const disconnectWallet = () => {
    setAccount(null)
    setProvider(null)
    setSigner(null)
  }

  useEffect(() => {
    const checkConnection = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum)
          const accounts = await provider.listAccounts()
          
          if (accounts.length > 0) {
            const signer = await provider.getSigner()
            setAccount(accounts[0].address)
            setProvider(provider)
            setSigner(signer)
          }
        } catch (error) {
          console.error('Error checking wallet connection:', error)
        }
      }
    }

    checkConnection()

    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet()
        } else {
          connectWallet()
        }
      })
    }
  }, [])

  const value = {
    account,
    provider,
    signer,
    connectWallet,
    disconnectWallet,
    isConnected: !!account
  }

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  )
}

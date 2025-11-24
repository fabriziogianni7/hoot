import { ZERO_ADDRESS } from './contracts'

// Token configuration interface
export interface TokenConfig {
  id: string
  symbol: string
  name: string
  address: `0x${string}`
  decimals: number
  isNative?: boolean // For ETH-like tokens
  logoUrl?: string // Optional logo URL
}

// Network-based token configurations
export const NETWORK_TOKENS: Record<number, TokenConfig[]> = {
  // Base Mainnet (8453)
  8453: [
    {
      id: 'eth',
      symbol: 'ETH',
      name: 'Ethereum',
      address: ZERO_ADDRESS,
      decimals: 18,
      isNative: true,
    },
    {
      id: 'usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
    },
    {
      id: 'jesse',
      symbol: 'JESSE',
      name: '$JESSE',
      address: '0x50F88fe97f72CD3E75b9Eb4f747F59BcEBA80d59',
      decimals: 18,
    },
    {
      id: 'caso',
      symbol: 'CASO',
      name: '$CASO',
      address: '0xb601e731f93bae29909a264472b7b32e4b2988d8', 
      decimals: 18,
    },
  ],
  // Base Sepolia (84532)
  84532: [
    {
      id: 'eth',
      symbol: 'ETH',
      name: 'Ethereum',
      address: ZERO_ADDRESS,
      decimals: 18,
      isNative: true,
    },
    {
      id: 'usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x036CbD53842c5426634e7929541eC231BcE1BDaE0', // Base Sepolia USDC
      decimals: 6,
    },
  ],
  // Arbitrum One (42161) - Ready for future expansion
  42161: [
    {
      id: 'eth',
      symbol: 'ETH',
      name: 'Ethereum',
      address: ZERO_ADDRESS,
      decimals: 18,
      isNative: true,
    },
    {
      id: 'usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum USDC
      decimals: 6,
    },
  ],
  // Celo Mainnet (42220) - Ready for future expansion
  42220: [
    {
      id: 'celo',
      symbol: 'CELO',
      name: 'Celo',
      address: ZERO_ADDRESS,
      decimals: 18,
      isNative: true,
    },
    {
      id: 'cusd',
      symbol: 'cUSD',
      name: 'Celo Dollar',
      address: '0x765DE816845861e75A25fCA122bb6898B8B1282a0',
      decimals: 18,
    },
  ],
}

// Helper functions
export const getTokensForNetwork = (chainId: number): TokenConfig[] => {
  return NETWORK_TOKENS[chainId] || []
}

export const getTokenById = (chainId: number, tokenId: string): TokenConfig | undefined => {
  const tokens = getTokensForNetwork(chainId)
  return tokens.find(token => token.id === tokenId)
}

export const getDefaultTokenForNetwork = (chainId: number): TokenConfig | undefined => {
  const tokens = getTokensForNetwork(chainId)
  // Default to ETH if available, otherwise first token
  return tokens.find(token => token.isNative) || tokens[0]
}

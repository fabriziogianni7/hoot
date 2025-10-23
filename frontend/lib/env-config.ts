import { base, baseSepolia } from 'viem/chains'

// Environment types
export type Environment = 'local' | 'testnet' | 'production'

// Chain configuration interface
export interface ChainConfig {
  id: number
  name: string
  rpcUrl: string
  contractAddress: string
}

// Supabase configuration interface
export interface SupabaseConfig {
  url: string
  anonKey: string
}

// App configuration interface
export interface AppConfig {
  url: string
}

// Main environment configuration interface
export interface EnvConfig {
  environment: Environment
  chain: ChainConfig
  supabase: SupabaseConfig
  app: AppConfig
}

// Environment detection
function getCurrentEnvironment(): Environment {
  console.log('CURRENT ENVIRONMENT:', process.env.NEXT_PUBLIC_ENV)
  // Check for explicit environment variable first
  const explicitEnv = process.env.NEXT_PUBLIC_ENV as Environment
  if (explicitEnv && ['local', 'testnet', 'production'].includes(explicitEnv)) {
    return explicitEnv
  }

  // Fallback to NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    return 'production'
  }

  // Default to local for development
  return 'local'
}

// Environment-specific configurations
const ENVIRONMENT_CONFIGS: Record<Environment, EnvConfig> = {
  local: {
    environment: 'local',
    chain: {
      id: 31337,
      name: 'Anvil Local',
      rpcUrl: 'http://127.0.0.1:8545',
      contractAddress: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
     },
    app: {
      url: 'http://localhost:3000'
    }
  },
  testnet: {
    environment: 'testnet',
    chain: {
      id: 84532,
      name: 'Base Sepolia',
      rpcUrl: 'https://sepolia.base.org',
      contractAddress: '0x2dC5532610Fe67A185bC9199a2d5975a130ec7f8'
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
     },
    app: {
      url: 'http://localhost:3000'
    }
  },
  production: {
    environment: 'production',
    chain: {
      id: 8453,
      name: 'Base',
      rpcUrl: 'https://mainnet.base.org',
      contractAddress: '0xe210C6Ae4a88327Aad8cd52Cb08cAAa90D8b0f27'
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    },
    app: {
      url: 'https://hoot-five.vercel.app'
    }
  }
}

// Get current environment configuration
function getEnvironmentConfig(): EnvConfig {
  const env = getCurrentEnvironment()
  const config = ENVIRONMENT_CONFIGS[env]

  // Override with environment variables if they exist
  const overrides: Partial<EnvConfig> = {}

  // Chain overrides
  if (process.env.NEXT_PUBLIC_CHAIN_ID) {
    overrides.chain = {
      ...config.chain,
      id: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID),
    }
  }
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    overrides.chain = {
      ...config.chain,
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
    }
  }
  if (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS) {
    overrides.chain = {
      ...config.chain,
      contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS,
    }
  }

  // Use custom RPC URL if provided
  if (process.env.NEXT_PUBLIC_CUSTOM_RPC_URL) {
    overrides.chain = {
      ...config.chain,
      rpcUrl: process.env.NEXT_PUBLIC_CUSTOM_RPC_URL,
    }
  }

  // Supabase overrides
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    overrides.supabase = {
      ...config.supabase,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    }
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    overrides.supabase = {
      ...config.supabase,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    }
  }

  // App overrides
  if (process.env.NEXT_PUBLIC_URL) {
    overrides.app = {
      ...config.app,
      url: process.env.NEXT_PUBLIC_URL,
    }
  }

  return {
    ...config,
    ...overrides
  }
}

// Export the main configuration
export const ENV_CONFIG = getEnvironmentConfig()

// Helper functions
export const isProduction = (): boolean => ENV_CONFIG.environment === 'production'
export const isTestnet = (): boolean => ENV_CONFIG.environment === 'testnet'
export const isLocal = (): boolean => ENV_CONFIG.environment === 'local'

// Get current chain for wagmi
export const getCurrentChain = () => {
  const { id } = ENV_CONFIG.chain
  
  if (id === 8453) return base
  if (id === 84532) return baseSepolia
  
  // For local Anvil, return a custom chain object
  return {
    id: 31337,
    name: 'Anvil Local',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [ENV_CONFIG.chain.rpcUrl] },
      public: { http: [ENV_CONFIG.chain.rpcUrl] }
    },
    testnet: true
  }
}

// Get contract address
export const getContractAddress = (): string => ENV_CONFIG.chain.contractAddress

// Get Supabase configuration
export const getSupabaseConfig = (): SupabaseConfig => ENV_CONFIG.supabase

// Get RPC URL
export const getRpcUrl = (): string => ENV_CONFIG.chain.rpcUrl

// Validation function
export const validateEnvironment = (): void => {
  const { supabase, chain, environment } = ENV_CONFIG

  // For production, check if we're in a build environment (Vercel)
  const isVercelBuild = process.env.VERCEL === '1'
  const isProductionBuild = process.env.NODE_ENV === 'production'

  if (!supabase.url) {
    const errorMsg = `Missing NEXT_PUBLIC_SUPABASE_URL for ${environment} environment`
    if (isVercelBuild || isProductionBuild) {
      console.error('🚨 Production deployment error:', errorMsg)
      console.error('Please set NEXT_PUBLIC_SUPABASE_URL in Vercel environment variables')
    }
    throw new Error(errorMsg)
  }

  if (!supabase.anonKey) {
    const errorMsg = `Missing NEXT_PUBLIC_SUPABASE_ANON_KEY for ${environment} environment`
    if (isVercelBuild || isProductionBuild) {
      console.error('🚨 Production deployment error:', errorMsg)
      console.error('Please set NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel environment variables')
    }
    throw new Error(errorMsg)
  }

  if (!chain.contractAddress) {
    throw new Error(`Missing NEXT_PUBLIC_CONTRACT_ADDRESS for ${environment} environment`)
  }

  if (!chain.rpcUrl) {
    throw new Error(`Missing NEXT_PUBLIC_RPC_URL for ${environment} environment`)
  }
}

// Initialize and validate on import
try {
  validateEnvironment()
} catch (error) {
  console.warn('Environment validation failed:', error)
  
  // In production builds, this is a critical error
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL === '1') {
    console.error('🚨 Critical: Missing required environment variables for production deployment')
    console.error('Please check your Vercel environment variables configuration')
  }
}

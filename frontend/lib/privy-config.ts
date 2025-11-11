import type { PrivyClientConfig } from '@privy-io/react-auth';

export const privyConfig: PrivyClientConfig = {
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'users-without-wallets'
    },
  },
  loginMethods: ['email'],
  appearance: {
    showWalletLoginFirst: true,
    theme: 'dark'
  },
  supportedChains: [
    {
      id: 8453, // Base mainnet
      name: 'Base',
      network: 'base',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: ['https://mainnet.base.org'],
        },
      },
      blockExplorers: {
        default: {
          name: 'BaseScan',
          url: 'https://basescan.org',
        },
      },
    },
    {
      id: 84532, // Base Sepolia testnet
      name: 'Base Sepolia',
      network: 'base-sepolia',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: ['https://sepolia.base.org'],
        },
      },
      blockExplorers: {
        default: {
          name: 'BaseScan',
          url: 'https://sepolia.basescan.org',
        },
      },
      testnet: true,
    }
  ],
  defaultChain: {
    id: 8453,
    name: 'Base',
    network: 'base',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: ['https://mainnet.base.org'],
      },
    },
    blockExplorers: {
      default: {
        name: 'BaseScan',
        url: 'https://basescan.org',
      },
    },
  }
};

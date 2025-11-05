import type { PrivyClientConfig } from '@privy-io/react-auth';

export const privyConfig: PrivyClientConfig = {
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },

  loginMethods: ['wallet', 'email', 'sms'],
  appearance: {
    showWalletLoginFirst: true,
  },
  supportedChains: [
    {
      id: 8453, // Base Mainnet
      name: 'Base',
      rpcUrls: {
        default: { http: ['https://mainnet.base.org'] },
      },
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      blockExplorers: {
        default: { name: 'BaseScan', url: 'https://basescan.org' },
      },
    },
    {
      id: 84532, // Base Sepolia
      name: 'Base Sepolia',
      rpcUrls: {
        default: { http: ['https://sepolia.base.org'] },
      },
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      blockExplorers: {
        default: { name: 'BaseScan Sepolia', url: 'https://sepolia.basescan.org' },
      },
    },
  ],
  defaultChain: {
    id: 8453, // Base Mainnet
    name: 'Base',
    rpcUrls: {
      default: { http: ['https://mainnet.base.org'] },
    },
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    blockExplorers: {
      default: { name: 'BaseScan', url: 'https://basescan.org' },
    },
  },
};

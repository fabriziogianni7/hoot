# Environment Setup Guide

This guide explains how to set up and use the three different environments for the Hoot project.

## Environment Overview

The project supports three distinct environments:

1. **Local** - Development with Anvil (localhost:8545) + Local Supabase + Frontend (localhost:3000)
2. **Testnet** - Base Sepolia testnet + Local Supabase + Frontend (localhost:3000 or Vercel preview)
3. **Production** - Base mainnet + Hosted Supabase + Frontend (Vercel production)

## Environment Files Setup

Since .env files are gitignored, you'll need to create them manually. Here are the configurations for each environment:

### Frontend Environment Files

Create these files in `/frontend/`:

#### `.env.local`
```bash
# Environment identifier
NEXT_PUBLIC_ENV=local

# Blockchain Configuration
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CONTRACT_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

# Supabase Configuration (Local)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# App Configuration
NEXT_PUBLIC_URL=http://localhost:3000
```

#### `.env.testnet`
```bash
# Environment identifier
NEXT_PUBLIC_ENV=testnet

# Blockchain Configuration
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_CUSTOM_RPC_URL=
NEXT_PUBLIC_CONTRACT_ADDRESS=0x2dC5532610Fe67A185bC9199a2d5975a130ec7f8

# Supabase Configuration (Local)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# App Configuration
NEXT_PUBLIC_URL=http://localhost:3000
# Or for Vercel preview: https://[preview-url].vercel.app
```

#### `.env.prod`
```bash
# Environment identifier
NEXT_PUBLIC_ENV=production

# Blockchain Configuration
NEXT_PUBLIC_CHAIN_ID=8453
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_CUSTOM_RPC_URL=
NEXT_PUBLIC_CONTRACT_ADDRESS=0xe210C6Ae4a88327Aad8cd52Cb08cAAa90D8b0f27

# Supabase Configuration (Hosted)
NEXT_PUBLIC_SUPABASE_URL=your_hosted_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_hosted_supabase_anon_key

# App Configuration
NEXT_PUBLIC_URL=https://your-production-url.vercel.app
```

### Backend Environment Files

Create these files in `/backend/supabase/functions/`:

#### `.env.local`
```bash
# Local Environment - Anvil + Local Supabase

# Private key for prize distribution wallet (without 0x prefix)
PRIZE_DISTRIBUTOR_PRIVATE_KEY=your_private_key_here

# RPC URL for local Anvil
RPC_URL_LOCAL=http://127.0.0.1:8545

# Treasury address for 10% fee collection
TREASURY_ADDRESS=0x1C9E05B29134233e19fbd0FE27400F5FFFc3737e

# Gas settings
GAS_PRICE_GWEI=20
GAS_LIMIT=300000
```

#### `.env.testnet`
```bash
# Testnet Environment - Base Sepolia + Local Supabase

# Private key for prize distribution wallet (without 0x prefix)
PRIZE_DISTRIBUTOR_PRIVATE_KEY=your_private_key_here

# RPC URL for Base Sepolia testnet
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org

# Treasury address for 10% fee collection
TREASURY_ADDRESS=0x1C9E05B29134233e19fbd0FE27400F5FFFc3737e

# Gas settings
GAS_PRICE_GWEI=20
GAS_LIMIT=300000
```

#### `.env.prod`
```bash
# Production Environment - Base Mainnet + Hosted Supabase

# Private key for prize distribution wallet (without 0x prefix)
PRIZE_DISTRIBUTOR_PRIVATE_KEY=your_private_key_here

# RPC URL for Base mainnet
RPC_URL_BASE=https://mainnet.base.org

# Treasury address for 10% fee collection
TREASURY_ADDRESS=0x1C9E05B29134233e19fbd0FE27400F5FFFc3737e

# Gas settings
GAS_PRICE_GWEI=20
GAS_LIMIT=300000
```

### Contracts Environment Files

Create these files in `/contracts/`:

#### `.env.local`
```bash
# Local Environment - Anvil

# Private key for deployment (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Treasury address for 10% fee
TREASURY_ADDRESS=0x1C9E05B29134233e19fbd0FE27400F5FFFc3737e

# RPC URL for local Anvil
RPC_URL_LOCAL=http://127.0.0.1:8545
```

#### `.env.testnet`
```bash
# Testnet Environment - Base Sepolia

# Private key for deployment (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Treasury address for 10% fee
TREASURY_ADDRESS=0x1C9E05B29134233e19fbd0FE27400F5FFFc3737e

# API keys for verification
BASESCAN_API_KEY=your_basescan_api_key_here

# RPC URL for Base Sepolia
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org
```

#### `.env.prod`
```bash
# Production Environment - Base Mainnet

# Private key for deployment (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Treasury address for 10% fee
TREASURY_ADDRESS=0x1C9E05B29134233e19fbd0FE27400F5FFFc3737e

# API keys for verification
BASESCAN_API_KEY=your_basescan_api_key_here

# RPC URL for Base mainnet
RPC_URL_BASE=https://mainnet.base.org
```

## Usage

### Frontend Development

The frontend now uses a centralized environment configuration system. You can run different environments using:

```bash
# Local development (default)
npm run dev

# Testnet development
npm run dev:testnet

# Production development
npm run dev:prod

# Build for different environments
npm run build:testnet
npm run build:prod
```

### Environment Detection

The system automatically detects the environment based on:

1. `NEXT_PUBLIC_ENV` environment variable (explicit)
2. `NODE_ENV` environment variable (fallback)
3. Default to 'local' for development

### Using the Environment Configuration

In your components, you can use the centralized configuration:

```typescript
import { ENV_CONFIG, getCurrentChain, isProduction, getContractAddress } from '@/lib/env-config'

// Get current environment
const isProd = isProduction()

// Get contract address
const contractAddress = getContractAddress()

// Get chain configuration for wagmi
const chain = getCurrentChain()

// Access full configuration
const { chain: chainConfig, supabase, app } = ENV_CONFIG
```

### Vercel Deployment

For Vercel deployments, set the environment variables in the Vercel dashboard:

1. Go to your project settings
2. Navigate to Environment Variables
3. Add the appropriate variables for each environment:
   - **Production**: Set all production variables
   - **Preview**: Set testnet variables
   - **Development**: Set local variables

### Supabase Setup

#### Local Supabase (for local and testnet)
```bash
cd backend
supabase start
```

#### Hosted Supabase (for production)
1. Create a new Supabase project
2. Get the project URL and anon key
3. Update the `.env.prod` file with the hosted values

### Contract Deployment

#### Local (Anvil)
```bash
cd contracts
# Start Anvil in another terminal
anvil
# Deploy
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key $PRIVATE_KEY --broadcast
```

#### Testnet (Base Sepolia)
```bash
cd contracts
forge script script/DeployBaseSepolia.s.sol --rpc-url $RPC_URL_BASE_SEPOLIA --private-key $PRIVATE_KEY --broadcast --verify
```

#### Production (Base Mainnet)
```bash
cd contracts
forge script script/DeployBase.s.sol --rpc-url $RPC_URL_BASE --private-key $PRIVATE_KEY --broadcast --verify
```

## Environment Variables Reference

### Frontend Variables

| Variable | Local | Testnet | Production |
|----------|-------|---------|------------|
| `NEXT_PUBLIC_ENV` | `local` | `testnet` | `production` |
| `NEXT_PUBLIC_CHAIN_ID` | `31337` | `84532` | `8453` |
| `NEXT_PUBLIC_RPC_URL` | `http://127.0.0.1:8545` | `https://sepolia.base.org` | `https://mainnet.base.org` |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | `0x9fE...` | `0x2dC...` | `0xe21...` |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | `http://127.0.0.1:54321` | `[hosted_url]` |
| `NEXT_PUBLIC_URL` | `http://localhost:3000` | `http://localhost:3000` | `https://[prod].vercel.app` |

### Backend Variables

| Variable | Local | Testnet | Production |
|----------|-------|---------|------------|
| `PRIZE_DISTRIBUTOR_PRIVATE_KEY` | `[your_key]` | `[your_key]` | `[your_key]` |
| `RPC_URL_LOCAL` | `http://127.0.0.1:8545` | - | - |
| `RPC_URL_BASE_SEPOLIA` | - | `https://sepolia.base.org` | - |
| `RPC_URL_BASE` | - | - | `https://mainnet.base.org` |
| `TREASURY_ADDRESS` | `0x1C9...` | `0x1C9...` | `0x1C9...` |

### Contract Variables

| Variable | Local | Testnet | Production |
|----------|-------|---------|------------|
| `PRIVATE_KEY` | `[your_key]` | `[your_key]` | `[your_key]` |
| `TREASURY_ADDRESS` | `0x1C9...` | `0x1C9...` | `0x1C9...` |
| `BASESCAN_API_KEY` | - | `[your_key]` | `[your_key]` |

## Troubleshooting

### Common Issues

1. **Missing environment variables**: Check that all required variables are set in your `.env` files
2. **Wrong contract address**: Ensure you're using the correct contract address for your environment
3. **RPC connection issues**: Verify your RPC URLs are correct and accessible
4. **Supabase connection issues**: Check that your Supabase URL and anon key are correct

### Validation

The environment configuration includes automatic validation. If required variables are missing, you'll see warnings in the console. Check the browser console for any environment-related errors.

### Development Tips

1. Use `npm run dev:testnet` to test with Base Sepolia
2. Use `npm run dev:prod` to test production configuration locally
3. Always test your environment configuration before deploying
4. Keep your private keys secure and never commit them to git

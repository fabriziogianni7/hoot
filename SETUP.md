# 🦉 Hoot Project Manual Setup Guide

This guide provides step-by-step instructions for manually setting up the Hoot project locally. Follow each section carefully to ensure proper configuration.

## 📋 Prerequisites

### Required Tools
- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** or **yarn** package manager
- **Foundry** (for Anvil and Forge) - [Install guide](https://book.getfoundry.sh/getting-started/installation)
- **Supabase CLI** - [Install guide](https://supabase.com/docs/guides/cli/getting-started)
- **ngrok** - [Download here](https://ngrok.com/download)
- **Git** - For cloning repositories

### Optional but Recommended
- **MetaMask** browser extension for wallet testing
- **Docker** (if you prefer containerized Supabase)

## 🚀 Step 1: Project Setup

### 1.1 Clone the Repository
```bash
git clone <repository-url>
cd hoot
```

### 1.2 Install Dependencies

#### Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

#### Backend Dependencies
```bash
cd backend/src
npm install
cd ../..
```

#### Contract Dependencies
```bash
cd contracts
forge install
cd ..
```

## 🛠️ Step 2: Blockchain Setup (Anvil)

### 2.1 Start Local Blockchain
```bash
cd contracts
anvil --port 8545
```

**Keep this terminal window open** - this runs your local Ethereum testnet.

**Expected Output:**
```
Listening on 127.0.0.1:8545
```

### 2.2 Set Up ngrok Tunnel

In a **new terminal window**:

#### Install ngrok (if not already installed)
```bash
# macOS
brew install ngrok/ngrok/ngrok

# Or download from https://ngrok.com/download
```

#### Set up ngrok authentication
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

#### Start ngrok tunnel
```bash
cd contracts
ngrok http 8545 --log=stdout
```

**Keep this terminal open** and note the **public URL** it provides (e.g., `https://abc123.ngrok.io`).

This URL will be used as `RPC_URL_LOCAL` in the next steps.

## 🔧 Step 3: Smart Contract Deployment

### 3.1 Configure Contract Environment
```bash
cd contracts
cp env.example .env
```

Edit the `.env` file with your values:
```bash
# Private key for deployment (anvil account 0)
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Treasury address (anvil account 1)
TREASURY_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# API keys (not needed for local development)
BASESCAN_API_KEY=

# RPC URLs
RPC_URL_LOCAL=http://127.0.0.1:8545
```

### 3.2 Deploy Contract
```bash
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

**Expected Output:**
```
Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3  # <- Note this address!
```

**Important:** Copy the deployed contract address (it will be different each time).

### 3.3 Update Frontend Contract Configuration

Edit `frontend/lib/contracts.ts`:
```typescript
// Contract addresses for different networks
export const CONTRACT_ADDRESSES = {
  local: "0x5FbDB2315678afecb367f032d93F642f64180aa3", // <- Replace with your deployed address
  baseSepolia: "", // Add when deployed
  base: "" // Add when deployed
}
```

## 🗄️ Step 4: Database Setup (Supabase)

### 4.1 Start Supabase

**Option A: Using Supabase CLI (Recommended)**
```bash
cd backend/supabase
supabase start
```

**Option B: Using Docker (if you have Supabase running in Docker)**
```bash
# If you already have Supabase running in Docker, just verify it's accessible
curl http://localhost:54321/health
```

### 4.2 Verify Supabase Status
```bash
supabase status
```

**Expected Output:**
```
supabase local development setup is running.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
```

### 4.3 Set Up Database Schema
```bash
supabase db reset
```

This will:
- Apply all migrations
- Seed the database with sample data
- Set up Row Level Security policies

### 4.4 Configure Environment Variables

#### Backend Environment
Create/edit `backend/supabase/functions/.env`:
```bash
# Private key for prize distribution wallet (without 0x prefix)
PRIZE_DISTRIBUTOR_PRIVATE_KEY=your_private_key_here
# ---- Supabase HTTP Function Hosting ----
# (Required to enable prize distribution API endpoints)

# Start the Supabase function HTTP server:
supabase functions serve --env-file backend/supabase/functions/.env

# This will expose your edge functions (like complete-game) at:
# http://localhost:54321/functions/v1/{function_name}
//
// For example, to test the prize distribution endpoint locally, you can POST to:
// http://localhost:54321/functions/v1/complete-game
//
// The full local stack should be running before calling functions.
//
// In production, functions are deployed to Supabase cloud.
//
# ----------------------------------------

# RPC URL for blockchain interaction (use your ngrok URL)
RPC_URL_LOCAL=https://abc123.ngrok.io

# Treasury address for 10% fee collection
TREASURY_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# Optional: Gas price settings
GAS_PRICE_GWEI=20
GAS_LIMIT=300000
```

#### Supabase Secrets
```bash
cd backend/supabase
supabase secrets set RPC_URL_LOCAL=https://abc123.ngrok.io
```

## ⚛️ Step 5: Frontend Setup

### 5.1 Install Dependencies (if not done already)
```bash
cd frontend
npm install
```

### 5.2 Environment Variables

Create `.env.local` file in the frontend directory:
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_from_supabase_status

# Contract Configuration
NEXT_PUBLIC_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# OnchainKit Configuration (if needed)
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_api_key
```

## 🚀 Step 6: Start All Services

### 6.1 Start Backend Service
```bash
cd backend/src
npm run dev
```

**Keep this terminal open** for the backend API server.

### 6.2 Start Frontend
```bash
cd frontend
npm run dev
```

**Keep this terminal open** - this is your development server.

## ✅ Step 7: Verification

### 7.1 Check All Services
Verify all services are running:

1. **Anvil Blockchain** (Terminal 1): Should show "Listening on 127.0.0.1:8545"
2. **ngrok Tunnel** (Terminal 2): Should show public URL
3. **Supabase** (Terminal 3): Should show "supabase local development setup is running"
4. **Backend API** (Terminal 4): Should show server running
5. **Frontend** (Terminal 5): Should show "Ready - started server on 0.0.0.0:3000"

### 7.2 Access Points
- **Frontend**: http://localhost:3000
- **Supabase Studio**: http://localhost:54323
- **Supabase API**: http://localhost:54321
- **Blockchain RPC**: http://localhost:8545
- **ngrok Public RPC**: https://your-ngrok-url.ngrok.io

## 🧪 Step 8: Testing the Setup

### 8.1 Test Blockchain Connection
```bash
# In a new terminal
cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 "treasury()" --rpc-url http://localhost:8545
```

### 8.2 Test Supabase Connection
```bash
curl http://localhost:54321/health
```

### 8.3 Test Frontend
Open http://localhost:3000 and verify the page loads.

## 🔧 Troubleshooting

### Port Conflicts
If you encounter port conflicts:

```bash
# Kill process on specific port
lsof -ti:8545 | xargs kill -9

# Check what's using a port
lsof -i:8545
```

### Common Issues

#### Anvil Issues
- Ensure no other blockchain processes are running on port 8545
- Check that Foundry is properly installed

#### ngrok Issues
- Verify your auth token: `ngrok config check`
- Check internet connection
- Ensure ngrok can access port 8545

#### Supabase Issues
- Check Docker status if using Docker setup
- Verify PostgreSQL isn't running on conflicting ports
- Try `supabase stop && supabase start` to restart

#### Contract Deployment Issues
- Verify your `.env` file has correct private key
- Ensure Anvil is running on the correct RPC URL
- Check gas fees aren't too high

## 🔄 Restarting Services

### Individual Service Restart
```bash
# Restart Anvil
pkill -f anvil && anvil --port 8545

# Restart Supabase
supabase stop && supabase start

# Restart Frontend
cd frontend && npm run dev

# Restart Backend
cd backend/src && npm run dev
```

### Full Cleanup and Restart
```bash
# Kill all related processes
pkill -f anvil
pkill -f ngrok
pkill -f supabase
pkill -f "next dev"
pkill -f "npm run dev"

# Then restart everything following the setup steps
```

## 📝 Environment Variables Reference

### Contracts (.env)
```bash
PRIVATE_KEY=your_deployment_private_key
TREASURY_ADDRESS=your_treasury_address
RPC_URL_LOCAL=http://127.0.0.1:8545
```

### Backend (.env)
```bash
PRIZE_DISTRIBUTOR_PRIVATE_KEY=your_prize_distribution_key
RPC_URL_LOCAL=https://your-ngrok-url.ngrok.io
TREASURY_ADDRESS=your_treasury_address
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_CONTRACT_ADDRESS=your_deployed_contract_address
```

## 🎯 Next Steps

1. **Create a Quiz**: Use the frontend to create your first quiz
2. **Test Gameplay**: Join with multiple browser windows/tabs
3. **Deploy to Testnet**: Update configurations for Base Sepolia deployment
4. **Customize**: Modify contracts, frontend, or backend as needed

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed correctly
3. Check service logs for error messages
4. Ensure all environment variables are set properly

---

**Happy coding! 🚀**

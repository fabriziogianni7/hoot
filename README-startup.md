# Hoot Project Startup Guide

This guide explains how to start the entire Hoot project locally using the automated startup script.

## Quick Start

```bash
./start-project.sh
```

That's it! The script will handle everything for you.

## What the Script Does

The startup script performs the following steps in order:

1. **Clean Up Ports** - Kills any existing processes on ports 8545, 54321, and 3000
2. **Start Local Anvil Blockchain** - Starts a local Ethereum testnet on port 8545
3. **Setup Ngrok Tunnel** - Creates a public tunnel for external access to the blockchain
4. **Update Environment Files** - Updates RPC URLs in backend configuration
5. **Deploy Smart Contract** - Deploys the HootQuizManager contract to the local blockchain
6. **Update Frontend Configuration** - Updates contract addresses in the frontend
7. **Start Supabase** - Starts the local Supabase development environment
8. **Start Frontend** - Starts the Next.js development server

## Prerequisites

Before running the script, ensure you have the following installed:

### Required Tools
- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Foundry** (for Anvil and Forge)
- **Supabase CLI**
- **ngrok**

### Installation Commands

#### Install Node.js and npm
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install node
nvm use node

# Or using homebrew on macOS
brew install node
```

#### Install Foundry
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

#### Install Supabase CLI
```bash
# Using npm
npm install -g supabase

# Or using homebrew on macOS
brew install supabase/tap/supabase
```

#### Install ngrok
```bash
# Using homebrew on macOS
brew install ngrok/ngrok/ngrok

# Or download from https://ngrok.com/download
```

#### Setup ngrok Auth Token
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

## Manual Setup (if needed)

If you prefer to run components manually or the script fails:

### 1. Start Anvil Blockchain
```bash
cd contracts
anvil --port 8545
```

### 2. Setup Ngrok Tunnel
```bash
# In another terminal
./tunnel-anvil.sh
```

### 3. Deploy Contract
```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

### 4. Start Supabase
```bash
cd backend/supabase
supabase start
```

### 5. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

The script automatically creates and updates the following files:

- `contracts/.env` - Contract deployment configuration
- `backend/supabase/functions/.env` - Backend RPC URL configuration
- `frontend/lib/contracts.ts` - Contract addresses for frontend

## Services Started

After successful startup, you'll have access to:

- **Frontend**: http://localhost:3000
- **Supabase API**: http://localhost:54321
- **Supabase Studio**: http://localhost:54323
- **Local Blockchain**: http://localhost:8545
- **Public Blockchain Access**: https://[random].ngrok.io (via ngrok)

## Troubleshooting

### Port Conflicts
The script automatically handles port conflicts by:
1. **Automatically killing** existing processes on ports 8545, 54321, and 3000
2. **Graceful termination** - tries SIGTERM first, then SIGKILL if needed
3. **Port availability check** - shows which ports were cleaned up

If you still get port conflicts, you can manually kill processes:
```bash
# Kill process on specific port
lsof -ti:8545 | xargs kill -9
```

### Ngrok Issues
- Ensure you have a valid ngrok auth token
- Check your internet connection
- Verify ngrok is properly installed

### Contract Deployment Issues
- Ensure your `.env` file in `contracts/` has valid private keys
- Check that Anvil is running and accessible
- Verify your Foundry installation

### Supabase Issues
- Ensure PostgreSQL is not running on the same ports (54321, 54322)
- Check that you have sufficient disk space
- Verify your Supabase CLI installation

## Stopping Services

To stop all services, press `Ctrl+C` in the terminal running the script, or run:

```bash
pkill -f anvil
pkill -f ngrok
pkill -f supabase
pkill -f "next dev"
```

## Logs

The script creates log files for each service:
- `contracts/anvil.log` - Anvil blockchain logs
- `backend/supabase/supabase.log` - Supabase logs
- `frontend/frontend.log` - Frontend logs

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the log files mentioned above
3. Ensure all prerequisites are properly installed
4. Try running components manually to isolate the issue

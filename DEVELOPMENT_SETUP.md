# Development Setup Guide

This guide helps you set up the complete development environment for testing prize distribution with local Anvil and Supabase Edge Functions.

## Prerequisites

- Node.js and npm installed
- Foundry (forge, anvil) installed
- Supabase CLI installed
- ngrok installed (for tunneling)

## Step-by-Step Setup

### 1. Start Anvil (Local Blockchain)

In one terminal window:

```bash
cd contracts
anvil
```

This will start a local Ethereum node on `http://localhost:8545` with pre-funded test accounts.

### 2. Deploy Smart Contracts

In another terminal window:

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

Note the deployed contract address for `HootQuizManager`.

### 3. Tunnel Anvil with ngrok

Since Supabase Edge Functions run remotely, they need to access your local Anvil. Use ngrok to create a public tunnel:

```bash
cd contracts
./tunnel-anvil.sh
```

This will output a public URL like: `https://xxxx-xxx-xxx-xxx.ngrok.io`

**Keep this terminal running!**

### 4. Configure Supabase Secrets

Set the environment variables for your Supabase Edge Functions:

```bash
# In the backend directory
cd backend

# Set the ngrok URL
supabase secrets set RPC_URL_LOCAL=https://your-ngrok-url.ngrok.io

# Set the prize distributor private key (from Anvil output)
supabase secrets set PRIZE_DISTRIBUTOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Set treasury address (any address from Anvil)
supabase secrets set TREASURY_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# Verify secrets are set
supabase secrets list
```

### 5. Start Supabase Locally

```bash
cd backend
supabase start
```

### 6. Start the Frontend

```bash
cd frontend
npm run dev
```

## Testing Prize Distribution

1. Create a quiz with a prize amount in the frontend
2. Start a game session
3. Have players join and complete the quiz
4. As the creator, go to the results page
5. Click "Distribute Prizes"

## Monitoring

### View Supabase Edge Function Logs

```bash
cd backend
supabase functions logs complete-game --follow
```

### View Anvil Transactions

Anvil will show all transactions in its terminal window.

## Troubleshooting

### "Game session not found"
- Make sure you're using the correct game session ID
- Check the database to verify the game session exists

### "Unauthorized: Only the quiz creator can distribute prizes"
- Ensure the wallet address matches the creator_address in the database
- Check that you're connected with the correct wallet

### "Transaction failed"
- Verify the contract address is correct
- Check that the contract has enough balance
- Ensure the private key has funds (Anvil provides pre-funded accounts)

### "PRIZE_DISTRIBUTOR_PRIVATE_KEY environment variable is required"
- Set the Supabase secret: `supabase secrets set PRIZE_DISTRIBUTOR_PRIVATE_KEY=0x...`
- Restart Supabase functions if needed

### ngrok tunnel disconnected
- Restart the tunnel script: `./tunnel-anvil.sh`
- Update the RPC_URL_LOCAL secret with the new URL
- Restart Supabase functions

## Environment Variables Reference

### Supabase Edge Functions (.env)
```bash
RPC_URL_LOCAL=https://your-ngrok-url.ngrok.io
PRIZE_DISTRIBUTOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
TREASURY_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_CONTRACT_ADDRESS=0x... # From deployment
```

## Useful Commands

```bash
# View Supabase logs
supabase functions logs complete-game

# Reset local Supabase
supabase db reset

# Restart Anvil with same state
anvil --dump-state state.json
anvil --load-state state.json

# Call contract directly with cast
cast call <CONTRACT_ADDRESS> "quizzes(uint256)" 1 --rpc-url http://localhost:8545
```


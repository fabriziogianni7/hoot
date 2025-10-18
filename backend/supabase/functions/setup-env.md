# Supabase Environment Variables Setup

## 🚀 Quick Setup with ngrok

### 1. Start your local blockchain
```bash
# In one terminal, start your local blockchain (e.g., Anvil, Hardhat, etc.)
anvil
# or
npx hardhat node
```

### 2. Start ngrok tunnel
```bash
# In another terminal, expose localhost:8545
ngrok http 8545
```

### 3. Get the ngrok URL
```bash
# Get the public URL
curl -s http://localhost:4040/api/tunnels | python3 -m json.tool
```

### 4. Set Environment Variables in Supabase Dashboard

Go to your Supabase project → Settings → Edge Functions → Environment Variables

Add these variables:

```
PRIZE_DISTRIBUTOR_PRIVATE_KEY=your_private_key_here
RPC_URL_LOCAL=https://your-ngrok-url.ngrok-free.app
TREASURY_ADDRESS=0x1C9E05B29134233e19fbd0FE27400F5FFFc3737e
```

## 🔧 Alternative: Using Supabase CLI

If you have Supabase CLI installed:

```bash
# Set environment variables
supabase secrets set PRIZE_DISTRIBUTOR_PRIVATE_KEY=your_private_key_here
supabase secrets set RPC_URL_LOCAL=https://your-ngrok-url.ngrok-free.app
supabase secrets set TREASURY_ADDRESS=0x1C9E05B29134233e19fbd0FE27400F5FFFc3737e
```

## 🧪 Testing the Connection

Test that your ngrok tunnel is working:

```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  https://your-ngrok-url.ngrok-free.app
```

## ⚠️ Important Notes

1. **Keep ngrok running** while testing
2. **ngrok URLs change** when you restart ngrok (unless you have a paid account)
3. **Update the RPC_URL_LOCAL** in Supabase whenever the ngrok URL changes
4. **Use a test wallet** with test ETH for development

## 🔄 Restart Process

If you need to restart ngrok:

1. Stop ngrok (Ctrl+C)
2. Start ngrok again: `ngrok http 8545`
3. Get the new URL: `curl -s http://localhost:4040/api/tunnels | python3 -m json.tool`
4. Update `RPC_URL_LOCAL` in Supabase dashboard with the new URL

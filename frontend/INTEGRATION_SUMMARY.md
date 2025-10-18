# Frontend Backend & Smart Contract Integration - Summary

## ✅ Completed Tasks

All integration tasks have been successfully completed! The frontend now fully integrates with:
- Supabase backend (database + edge functions)
- Smart contract (HootQuizManager)
- Realtime updates for multiplayer gameplay
- Hybrid wallet support (Farcaster + MetaMask)

## 🔧 Setup Required

### 1. Create Environment Variables File

Create `frontend/.env.local` with the following content:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# Smart Contract Configuration
NEXT_PUBLIC_CONTRACT_ADDRESS=0x851356ae760d987E095750cCeb3bC6014560891C
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545

# Treasury Address (optional - for prize distribution)
NEXT_PUBLIC_TREASURY_ADDRESS=<your_treasury_address>

# OnchainKit Configuration (existing)
NEXT_PUBLIC_PROJECT_NAME="Hoot Quiz"
NEXT_PUBLIC_ONCHAINKIT_API_KEY=
NEXT_PUBLIC_URL=http://localhost:3000
```

### 2. Start Required Services

Make sure these services are running:

```bash
# 1. Start Supabase (from backend/ directory)
cd backend
supabase start

# 2. Start Anvil (local blockchain)
anvil

# 3. Deploy contract (if not already deployed)
cd contracts
forge script script/Deploy.s.sol --rpc-url local --broadcast

# 4. Start Edge Functions
cd backend
supabase functions serve

# 5. Start Frontend (in a new terminal)
cd frontend
npm run dev
```

## 📋 What Was Implemented

### Phase 1: Dependencies & Environment
- ✅ Installed `@supabase/supabase-js` and `ethers` v6
- ✅ Created environment configuration

### Phase 2: Context Providers & Utilities
- ✅ Created `lib/supabase-context.tsx` - Supabase client wrapper
- ✅ Created `lib/wallet-context.tsx` - MetaMask wallet connection
- ✅ Created `lib/contracts.ts` - Contract ABI and addresses
- ✅ Created `lib/contract-helpers.ts` - Smart contract interaction helpers
- ✅ Created `lib/backend-types.ts` - TypeScript types for backend
- ✅ Created `lib/supabase-client.ts` - Supabase singleton instance

### Phase 3: Root Provider
- ✅ Updated `app/rootProvider.tsx` to wrap with Supabase and Wallet providers

### Phase 4: Quiz Context with Backend Integration
- ✅ Updated `lib/quiz-context.tsx` with:
  - Backend API integration (edge functions)
  - Realtime subscriptions for multiplayer
  - Room code based game joining
  - Score synchronization

### Phase 5: Updated Pages

#### Home Page (`app/page.tsx`)
- ✅ Backend room code lookup
- ✅ Navigate to lobby with room code
- ✅ Loading states and error handling

#### Admin Page (`app/quiz/admin/page.tsx`)
- ✅ Hybrid wallet support (Farcaster + MetaMask)
- ✅ Prize amount input
- ✅ ETH balance display
- ✅ On-chain quiz creation with prize pool
- ✅ Backend quiz storage
- ✅ Automatic game session creation
- ✅ Status messages and error handling

#### Lobby Page (`app/quiz/lobby/page.tsx`)
- ✅ Join game via backend edge function
- ✅ Realtime player updates
- ✅ Display room code prominently
- ✅ Start game functionality
- ✅ Wallet address integration (optional)

#### Play Page (`app/quiz/play/page.tsx`)
- ✅ Already working with realtime through quiz context
- ✅ Answer submission to backend
- ✅ Score updates via realtime

#### Results Page (`app/quiz/results/page.tsx`)
- ✅ Leaderboard with top 3 highlighted
- ✅ Prize distribution UI (creator only)
- ✅ Calculate prize splits (10% treasury, 40/30/20 for top 3)
- ✅ On-chain prize distribution
- ✅ Transaction status and explorer link
- ✅ Update quiz status in database

## 🎮 How to Use the Integrated App

### Creating a Quiz with Prizes

1. **Connect Wallet**:
   - In Farcaster: Wallet is automatically detected
   - Outside Farcaster: Click "Connect Wallet" button

2. **Set Prize Amount**:
   - Enter prize amount in ETH (e.g., 0.001)
   - Your balance is shown for reference

3. **Create Questions**:
   - Add quiz title and questions
   - Optionally set a custom PIN

4. **Create & Start**:
   - Click "Create & Start" button
   - Transaction will be sent to blockchain
   - Quiz saved to database
   - Game session created with room code

5. **Share Room Code**:
   - Share the generated room code with players

### Joining a Game

1. **Enter Room Code**:
   - On home page, enter the room code
   - Click "Jump"

2. **Join Lobby**:
   - Enter your name
   - Optionally connect wallet (for prize eligibility)
   - Click "Join Quiz"

3. **Wait for Start**:
   - See other players join in realtime
   - Creator clicks "Start Quiz"

4. **Play**:
   - Answer questions
   - See scores update in realtime

5. **Results**:
   - View final leaderboard
   - Top 3 players highlighted
   - Creator can distribute prizes

### Distributing Prizes

1. **Creator Only**:
   - Prize distribution button visible only to quiz creator

2. **Click "Distribute Prizes"**:
   - Automatically loads top 3 players' wallet addresses
   - Calculates distribution (10/40/30/20)
   - Sends transaction to smart contract

3. **Track Status**:
   - See transaction status messages
   - Get transaction hash
   - View on block explorer

## 🔑 Key Features

### Hybrid Wallet Support
- Works in Farcaster app with embedded wallet
- Works outside Farcaster with MetaMask
- Automatic detection and appropriate UI

### Realtime Multiplayer
- Players join lobby in realtime
- See answers submitted in realtime
- Scores update instantly
- Game state synchronized across all clients

### On-Chain Prize Pools
- Quiz creator deposits ETH for prizes
- Smart contract holds funds securely
- Automatic distribution to top 3 + treasury
- Transaction verification

### Backend Integration
- Edge functions for game logic
- Database persistence
- Room code system
- Score calculation

## 🐛 Troubleshooting

### "No room code available" Error
- Make sure you entered a valid room code on the home page
- Check that the game session exists in Supabase

### "Please connect your wallet first"
- Click "Connect Wallet" in the admin page
- Make sure MetaMask is installed (if outside Farcaster)

### "Insufficient balance" Error
- Check your ETH balance
- Reduce prize amount or add funds to your wallet

### Realtime Not Working
- Verify Supabase is running: `supabase status`
- Check that edge functions are deployed
- Look for WebSocket connections in browser dev tools

### Contract Transactions Failing
- Make sure Anvil is running on localhost:8545
- Verify contract is deployed to the correct address
- Check you have enough ETH in your wallet

## 📝 Notes

- The app uses **localStorage** for player session persistence
- **Realtime subscriptions** are automatically cleaned up on unmount
- **Prize distribution** requires players to have connected wallets
- **Room codes** are automatically generated (6 characters, uppercase)
- **Scores** are calculated server-side with time bonuses

## 🚀 Next Steps

1. Create the `.env.local` file with your configuration
2. Start all required services (Supabase, Anvil, Edge Functions)
3. Run the frontend: `npm run dev`
4. Test the complete flow:
   - Create a quiz with prizes
   - Join with multiple browsers/devices
   - Play the quiz
   - Distribute prizes

## 📚 Architecture Overview

```
Frontend (Next.js)
  ├── Contexts
  │   ├── SupabaseContext (database client)
  │   ├── WalletContext (MetaMask)
  │   ├── QuizContext (game logic + realtime)
  │   └── OnchainKitProvider (Farcaster)
  │
  ├── Pages
  │   ├── Home (room code entry)
  │   ├── Admin (create quiz + on-chain)
  │   ├── Lobby (join + realtime players)
  │   ├── Play (questions + answers)
  │   └── Results (leaderboard + prizes)
  │
  └── Helpers
      ├── contract-helpers.ts (smart contract calls)
      ├── supabase-client.ts (edge function calls)
      └── backend-types.ts (TypeScript types)

Backend (Supabase)
  ├── Database (PostgreSQL)
  │   ├── quizzes
  │   ├── questions
  │   ├── game_sessions
  │   ├── player_sessions
  │   └── answers
  │
  ├── Edge Functions (Deno)
  │   ├── create-quiz
  │   ├── join-game
  │   └── submit-answer
  │
  └── Realtime (WebSocket)
      ├── game_sessions (updates)
      └── player_sessions (inserts/updates)

Smart Contract (Solidity)
  └── HootQuizManager
      ├── createQuiz() (payable)
      ├── distributePrize()
      └── cancelQuiz()
```

Congratulations! The integration is complete! 🎉



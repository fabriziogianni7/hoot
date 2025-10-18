# 🦉 Hoot - Onchain Quiz Platform

An onchain version of Kahoot with web3 dynamics, featuring smart contracts for prize distribution, real-time gameplay, and automatic reward distribution to top players.

## 📋 Table of Contents

- [🚀 Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [🏆 Sponsor: Enclave](#-sponsor-enclave)
- [📋 Prerequisites](#-prerequisites)
- [🛠️ Setup Instructions](#️-setup-instructions)
- [🎮 How to Use](#-how-to-use)
- [🔧 Configuration](#-configuration)
- [🧪 Testing](#-testing)
- [📁 Project Structure](#-project-structure)
- [🔒 Security Features](#-security-features)
- [🚀 Deployment](#-deployment)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [🆘 Troubleshooting](#-troubleshooting)
- [🎯 Future Enhancements](#-future-enhancements)

## 🚀 Features

- **Smart Contract Prize Distribution**: ETH and ERC20 token support with automatic distribution to top 3 players (10% treasury fee)
- **Automatic Prize Distribution**: Backend service monitors game completion and triggers smart contract automatically
- **Real-time Gameplay**: Live updates using Supabase realtime subscriptions
- **Mobile Responsive**: Optimized for both desktop and mobile devices
- **No Authentication Required**: Players only need a room code to join
- **Automatic Scoring**: Real-time point calculation with time bonuses
- **Multi-network Support**: Local development, Base Sepolia, and Base mainnet

## 🏗️ Architecture

### Smart Contracts (Foundry)
- **HootQuizManager**: Single factory contract managing all quizzes
- **Prize Distribution**: 10% to treasury, 40% to 1st, 30% to 2nd, 20% to 3rd place
- **Token Support**: ETH and ERC20 tokens
- **Security**: ReentrancyGuard, access controls, emergency withdrawals

### Backend (Supabase Edge Functions)
- **Database**: PostgreSQL with Row Level Security
- **Edge Functions**: Real-time scoring and game logic
- **Direct Smart Contract Integration**: Edge functions interact directly with blockchain
- **Prize Distribution**: Automated smart contract calls from edge functions
- **Real-time**: Live game updates and player synchronization

### Frontend (React + TypeScript)
- **Wallet Integration**: MetaMask connection
- **Real-time UI**: Live game state updates
- **Mobile First**: Responsive design
- **Game Flow**: Create → Join → Play → Results

## 🏆 Sponsor: Enclave

This project is proudly integrating [Enclave](https://enclave.gg), a cutting-edge protocol that enables E3 encryption on Ethereum. Enclave provides the infrastructure and tools needed to build privacy-preserving smart contracts that can perform computations on encrypted data without revealing sensitive information.

### 🤝 Enclave Integration

The `hoot-enclave/` directory contains a specialized FHE implementation that demonstrates advanced privacy-preserving capabilities:

- **FHE Program**: Computes the difference between two encrypted numbers
- **Risc0 ZKVM Integration**: Provides zero-knowledge proofs for FHE computations
- **Privacy-Preserving Logic**: Players can submit encrypted inputs for secure computation

The FHE component allows for secure, private computations where sensitive game data (like scores or strategic inputs) can be processed without exposing the underlying values to the network or other players.

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- Supabase CLI
- Foundry (for smart contracts)
- MetaMask (for wallet connection)

## 🛠️ Setup Instructions

### Quick Start (Automated)

🎉 **New!** Use the automated startup script for a one-command setup:

```bash
./start-project.sh
```

This script will automatically:
- Start the local Anvil blockchain
- Set up ngrok tunnel for external access
- Deploy smart contracts
- Start Supabase local development
- Launch the Next.js frontend

**Requirements:** Node.js, Foundry, Supabase CLI, and ngrok installed.

For detailed information, see [README-startup.md](README-startup.md).

### Manual Setup

If you prefer manual control or the automated script doesn't work:

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd hoot

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend/src
npm install

# Install contract dependencies
cd ../../contracts
forge install
```

### 2. Database Setup (Supabase)

```bash
# Start local Supabase instance
cd backend
supabase start

# Run migrations and seed data
supabase db reset

supabase functions new create-quiz
supabase functions new finalize-game
supabase functions new join-game
supabase functions new submit-answer

# Deploy edge functions
supabase functions serve

# The database will be seeded with a sample quiz
```

**Alternative migration commands:**
```bash
# Apply migrations only (without resetting)
supabase db push

# Apply specific migration
supabase migration up

# Check migration status
supabase migration list

# Generate new migration (if you make schema changes)
supabase migration new your_migration_name
```

### 2.1. Edge Functions Setup

```bash
# Create edge functions (if not already created)
supabase functions new create-quiz
supabase functions new join-game
supabase functions new submit-answer
supabase functions new finalize-game

# Start edge functions in development mode
supabase functions serve

# Deploy functions to local instance (alternative)
supabase functions deploy --no-verify-jwt

# Deploy specific function (alternative)
supabase functions deploy create-quiz --no-verify-jwt

# Check function status
supabase functions list
```

**Available Edge Functions:**
- `create-quiz` - Create new quiz with questions
- `join-game` - Join a game session with room code
- `submit-answer` - Submit answer and calculate score
- `finalize-game` - Finalize game and get top players

### 3. Smart Contract Setup

```bash
cd contracts

# Copy environment file
cp env.example .env
# Edit .env with your private key

# Test contracts
forge test

# Deploy to local network (Anvil)
forge script script/Deploy.s.sol --rpc-url local --broadcast

# Deploy to Base Sepolia
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify

# Deploy to Base Mainnet
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
```

### 4. Backend Service Setup

```bash
cd backend/src

# Copy environment file
cp env.example .env
# Edit .env with your configuration

# Install dependencies
npm install

# Start the service
npm run dev
```

### 5. Frontend Setup

```bash
cd frontend

# Copy environment file
cp env.example .env
# Edit .env with your Supabase and backend URLs

# Start development server
npm run dev
```

## 🎮 How to Use

### Creating a Quiz

1. **Connect Wallet**: Click "Connect Wallet" on the home page
2. **Create Quiz**: Click "Create Quiz" and fill in:
   - Quiz title and description
   - Prize amount in ETH
   - Questions with multiple choice answers
   - Time limits for each question
3. **Deploy Contract**: The system will create a smart contract with your prize pool
4. **Start Game**: Share the room code with players

### Joining a Quiz

1. **Enter Room Code**: Click "Join Quiz" and enter the room code
2. **Enter Name**: Provide your player name
3. **Wait in Lobby**: See other players joining in real-time
4. **Play**: Answer questions quickly and accurately
5. **Win Prizes**: Top 3 players automatically receive rewards

## 🔧 Configuration

### Environment Variables

#### Frontend (.env)
```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_BACKEND_URL=http://localhost:3001
```

#### Backend (.env)
```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=your_service_key
PRIZE_DISTRIBUTOR_PRIVATE_KEY=your_private_key
NETWORK=local
RPC_URL_LOCAL=http://127.0.0.1:8545
```

#### Contracts (.env)
```env
PRIVATE_KEY=your_deployment_private_key
BASESCAN_API_KEY=your_basescan_api_key
```

### Network Configuration

The system supports three networks:

1. **Local Development**: Anvil/Hardhat local network
2. **Base Sepolia**: Testnet for testing
3. **Base Mainnet**: Production deployment

Switch networks by updating the `NETWORK` environment variable in the backend.

## 🧪 Testing

### Smart Contracts
```bash
cd contracts
forge test
```

### Backend API
```bash
cd backend/src
npm test
```

### Edge Functions
```bash
# View function logs
supabase functions logs complete-game --follow

# Test function locally
curl -X POST http://127.0.0.1:54321/functions/v1/complete-game \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_anon_key" \
  -d '{"game_session_id": "your-game-session-id"}'
```

### Frontend
```bash
cd frontend
npm test
```

## 📁 Project Structure

```
hoot/
├── contracts/                 # Smart contracts (Foundry)
│   ├── src/
│   │   └── HootQuizManager.sol
│   ├── test/
│   ├── script/
│   └── foundry.toml
├── backend/                   # Backend services
│   ├── supabase/             # Database and edge functions
│   │   ├── migrations/
│   │   ├── functions/
│   │   └── seed.sql
│   └── src/                  # Node.js backend service
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── pages/
│   │   ├── contexts/
│   │   └── components/
│   └── package.json
├── hoot-enclave/             # FHE implementation (Enclave Protocol)
│   ├── program/              # Risc0 zkvm FHE computation program
│   │   └── src/lib.rs        # Computes difference between 2 encrypted numbers
│   ├── contracts/            # Smart contracts for FHE operations
│   ├── client/               # Frontend for FHE interactions
│   └── server/               # Coordination server for FHE computations
└── README.md
```

## 🔒 Security Features

- **ReentrancyGuard**: Prevents reentrancy attacks
- **Access Controls**: Only authorized distributors can distribute prizes
- **Input Validation**: All user inputs are validated
- **Emergency Withdrawals**: Quiz creators can cancel and withdraw funds
- **RLS Policies**: Database access is controlled via Row Level Security

## 🚀 Deployment

### Local Development

**Automated (Recommended):**
```bash
./start-project.sh
```

**Manual:**
1. Start Supabase: `supabase start`
2. Deploy contracts: `cd contracts && forge script script/Deploy.s.sol --rpc-url local --broadcast`
3. Update contract address in frontend: `frontend/src/pages/CreateQuiz.tsx` (line 48)
4. Start backend: `cd backend/src && npm run dev`
5. Start frontend: `cd frontend && npm run dev`

### Production (Base Mainnet)
1. Update environment variables for production
2. Deploy contracts: `forge script script/Deploy.s.sol --rpc-url base --broadcast --verify`
3. Deploy backend service to your preferred hosting platform
4. Deploy frontend to Vercel/Netlify

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### Common Issues

1. **Supabase Connection Issues**: 
   - Ensure Supabase is running locally: `supabase status`
   - Check if Docker is running (required for Supabase)
   - Restart Supabase: `supabase stop && supabase start`

2. **Migration Issues**:
   - If migrations fail, try: `supabase db reset`
   - Check migration files in `backend/supabase/migrations/`
   - Verify database is running: `supabase status`

3. **Edge Functions Issues**:
   - If functions don't deploy, try: `supabase functions serve`
   - Check function logs: `supabase functions logs <function-name>`
   - Verify functions are in `backend/supabase/functions/`
   - Restart Supabase: `supabase stop && supabase start`
   - **"Missing authorization header" error**: This is normal in development - functions work but need proper auth headers in production

4. **Wallet Connection**: Make sure MetaMask is installed and unlocked

5. **Contract Deployment**: Check that you have sufficient ETH for gas fees

6. **Backend Service**: Ensure all environment variables are set correctly

### Getting Help

- Check the logs in your browser console
- Verify all services are running
- Ensure environment variables are correctly set
- Check network connectivity

## 🎯 Future Enhancements

- [ ] Multi-language support
- [ ] Custom quiz themes
- [ ] Team-based competitions
- [ ] NFT rewards
- [ ] Mobile app
- [ ] Advanced analytics
- [ ] Social features
- [ ] Tournament brackets
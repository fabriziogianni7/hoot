# How to run project locally

> There is a cursor command to do it. just do /start-locally in your cursor chat.

## Backend
We have a supabase backend that host a DB, edge functions and realtime.

First you need to install [supabase cli](https://supabase.com/docs/guides/local-development/cli/getting-started?queryGroups=platform&platform=macos&queryGroups=access-method&access-method=studio)
then run:
```
supabase start
```

If you want to reset the DB / run the migrations:
```
# Reset database and apply all migrations
supabase db reset

# Or apply migrations without resetting
supabase db push
```

Migrations are SQL queries that add/remove/change your DB schema and functions

Start Edge Functions
```
supabase functions serve
```

Note that when you run supabase locally, you also have the studio (supabase UI) running at `http://127.0.0.1:54323`

### Troubleshooting 

- Docker not running: Supabase requires Docker to be running
- Port conflicts: Make sure ports 54321-54327 are available
- Migration issues: Try supabase db reset to start fresh
- Edge function issues: Check logs with supabase functions logs

### Useful Commands

```
# Check status of all services
supabase status

# View logs for specific service
supabase logs

# Stop all services
supabase stop

# Restart services
supabase stop && supabase start

# View edge function logs
supabase functions logs <function-name> --follow

# Deploy specific function
supabase functions deploy <function-name> --no-verify-jwt
```

## Frontend
The frontend is a Next.js application with TypeScript and Tailwind CSS.

Navigate to the frontend directory and install dependencies (if not installed yet):
```
cd frontend
npm install
```

Start the development server:
```
npm run dev
```

The frontend will be available at `http://localhost:3000`

### Useful Commands

```
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Run type checking
npm run type-check
```

## Anvil (Local Blockchain)
We use Foundry's Anvil for local blockchain development and testing.

Start Anvil in a separate terminal:
```
cd contracts
anvil
```

This will start a local Ethereum node at `http://127.0.0.1:8545` with 10 test accounts.

### Deploy Contracts

To deploy contracts to the local Anvil network:
```
# Deploy to local Anvil
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key <PRIVATE_KEY> --broadcast

```

### Useful Commands

```
# Start Anvil
anvil

# Deploy contracts
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key <PRIVATE_KEY> --broadcast

# Run tests
forge test

# Compile contracts
forge build

# Check contract size
forge build --sizes

# Format code
forge fmt

# Run linter
forge fmt --check
```

## Tunneling (Database ↔ Blockchain Communication)
For the database to communicate with the local blockchain, you need to tunnel the Anvil RPC endpoint so it's accessible from the Supabase edge functions.

### Using ngrok

1. Install ngrok if you haven't already:
   - Download from [ngrok.com](https://ngrok.com/download)
   - Or install via package manager: `brew install ngrok` (macOS) or `choco install ngrok` (Windows)

2. Start Anvil first:
   ```
   cd contracts
   anvil
   ```

3. In a separate terminal, create a tunnel to your local Anvil instance:
   ```
   ngrok http 8545
   ```

4. Copy the HTTPS URL from ngrok output (e.g., `https://abc123.ngrok.io`)

5. Update your environment variables in the Supabase edge functions to use the ngrok URL as the RPC endpoint.

### Important Notes

- Keep both Anvil and ngrok running while developing
- The ngrok URL changes each time you restart ngrok (unless you have a paid account)
- Make sure to update your environment variables when the ngrok URL changes
- The tunnel is only active while ngrok is running


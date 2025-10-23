# Makefile Usage Guide

This Makefile provides convenient commands for building, testing, and deploying the HootQuizManager contract with support for multiple environment configurations.

## Quick Start

```bash
# Display all available commands
make help

# Install dependencies
make install

# Build contracts
make build

# Run tests
make test
```

## Environment Configuration

The Makefile supports multiple environment files for different networks:

### 1. Create Environment Files

```bash
# Create local development environment
make create-env-local

# Create Base Sepolia testnet environment
make create-env-sepolia

# Create Base mainnet environment
make create-env-base
```

### 2. Environment File Format

Create `.env`, `.env.local`, `.env.sepolia`, or `.env.base` with:

```bash
# Private key (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Treasury address
TREASURY_ADDRESS=0x1234567890123456789012345678901234567890

# Treasury fee: 100000 = 10% (with 1M precision)
TREASURY_FEE_PERCENT=100000

# Fee precision: 1000000 = 4 decimal places
FEE_PRECISION=1000000

# BaseScan API key for verification
BASESCAN_API_KEY=your_api_key_here
```

### 3. Using Different Environments

```bash
# Default: uses .env
make deploy-sepolia

# Use specific environment file
make deploy-sepolia ENV=.env.sepolia

# Use local environment
make test ENV=.env.local
```

## Common Commands

### Building & Testing

```bash
# Build contracts
make build

# Clean and rebuild
make rebuild

# Run all tests
make test

# Run tests with verbose output
make test-v
make test-vv

# Run specific test
make test-match TEST=testDistributePrize

# Run tests for specific contract
make test-contract CONTRACT=HootQuizManagerTest

# Generate gas report
make test-gas

# Generate coverage report
make coverage

# Create gas snapshot
make snapshot
```

### Local Development

```bash
# Start local Anvil node
make anvil

# Deploy to local Anvil (in another terminal)
make deploy-local ENV=.env.local
```

### Testnet Deployment (Base Sepolia)

```bash
# Dry run (simulate deployment)
make deploy-sepolia-dry ENV=.env.sepolia

# Deploy to Base Sepolia
make deploy-sepolia ENV=.env.sepolia

# Quick deploy with .env.sepolia
make deploy-sepolia-quick

# Verify contract
make verify-sepolia CONTRACT=0x123...
```

### Mainnet Deployment (Base)

```bash
# Dry run (simulate deployment)
make deploy-base-dry ENV=.env.base

# Deploy to Base mainnet (includes 5 second warning)
make deploy-base ENV=.env.base

# Quick deploy with .env.base
make deploy-base-quick

# Verify contract
make verify-base CONTRACT=0x123...
```

### Code Quality

```bash
# Format code
make format

# Check formatting
make format-check

# Run linter
make lint
```

### Information & Utilities

```bash
# Display current configuration
make info

# Display contract sizes
make sizes

# Generate detailed gas report
make gas-report

# Display storage layout
make storage-layout

# Generate ABI
make abi
```

## Examples

### Example 1: Test and Deploy to Sepolia

```bash
# 1. Create and configure environment
make create-env-sepolia
# Edit .env.sepolia with your credentials

# 2. Run tests
make test ENV=.env.sepolia

# 3. Dry run deployment
make deploy-sepolia-dry ENV=.env.sepolia

# 4. Deploy
make deploy-sepolia ENV=.env.sepolia
```

### Example 2: Local Development

```bash
# Terminal 1: Start Anvil
make anvil

# Terminal 2: Deploy and test
make create-env-local
make deploy-local ENV=.env.local
make test ENV=.env.local
```

### Example 3: Deploy with Custom Fee

```bash
# Edit your .env file to set custom fee
# TREASURY_FEE_PERCENT=50000  # 5%
# FEE_PRECISION=1000000

# Check configuration
make info

# Deploy with custom fee
make deploy-sepolia
```

### Example 4: Run Specific Tests

```bash
# Run all ERC20 tests
make test-match TEST=testERC20

# Run test with very verbose output
make test-match TEST=testDistributePrize
```

## Fee Configuration

The contract uses a configurable precision system:

| Fee % | Fee Percent (1M) | Fee Percent (10K) | Precision |
|-------|------------------|-------------------|-----------|
| 1%    | 10000           | 100              | 1000000   |
| 5%    | 50000           | 500              | 1000000   |
| 10%   | 100000          | 1000             | 1000000   |
| 2.5%  | 25000           | 250              | 1000000   |
| 0.1%  | 1000            | 10               | 1000000   |

**Formula**: `TREASURY_FEE_PERCENT / FEE_PRECISION * 100 = Fee %`

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `PRIVATE_KEY` | Deployer private key (no 0x) | `asasadsdasasasasasasas...` |
| `TREASURY_ADDRESS` | Treasury wallet address | `0x1234...` |
| `TREASURY_FEE_PERCENT` | Fee in basis points | `100000` (10%) |
| `FEE_PRECISION` | Precision denominator | `1000000` |
| `BASESCAN_API_KEY` | BaseScan API key | `ABC123...` |

## Troubleshooting

### Error: PRIVATE_KEY or TREASURY_ADDRESS not set

Make sure your environment file exists and contains the required variables:

```bash
# Check current config
make info

# Verify environment file exists
ls -la .env*
```

### Error: Contract verification failed

```bash
# Manual verification with correct constructor args
make verify-sepolia CONTRACT=0x123... ENV=.env.sepolia
```

### Gas costs too high

```bash
# Generate gas report to identify expensive functions
make test-gas

# Create snapshot for comparison
make snapshot
```

## Tips

1. **Always dry run first**: Use `make deploy-*-dry` before actual deployment
2. **Use separate env files**: Keep different configs for local/testnet/mainnet
3. **Check configuration**: Run `make info` before deploying
4. **Version control**: Add `.env*` to `.gitignore` (except `.env.example`)
5. **Gas snapshots**: Run `make snapshot` after changes to track gas usage

## Additional Resources

- [Foundry Book](https://book.getfoundry.sh/)
- [Base Documentation](https://docs.base.org/)
- [BaseScan](https://basescan.org/)


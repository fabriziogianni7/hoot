# Makefile for HootQuizManager Contract
# Usage: make <target> [ENV=<env_file>]

-include .env
-include .env.local
-include .env.base

.PHONY: help install build test clean deploy-local deploy-sepolia deploy-base verify format lint snapshot gas

# Default environment file
ENV ?= .env

# Load environment variables from specified file
ifneq (,$(wildcard $(ENV)))
    include $(ENV)
    export
endif

# Colors for output
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
NC     := \033[0m # No Color

##@ Help

help: ## Display this help message
	@echo "$(GREEN)HootQuizManager Contract - Makefile Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(YELLOW)<target>$(NC) [ENV=<env_file>]\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(GREEN)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Setup

install: ## Install dependencies
	@echo "$(GREEN)Installing Foundry dependencies...$(NC)"
	forge install

update: ## Update dependencies
	@echo "$(GREEN)Updating dependencies...$(NC)"
	forge update

##@ Build

build: ## Build contracts
	@echo "$(GREEN)Building contracts...$(NC)"
	forge build

clean: ## Clean build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	forge clean

rebuild: clean build ## Clean and rebuild

##@ Test

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	forge test -vv

test-v: ## Run tests with verbose output
	@echo "$(GREEN)Running tests (verbose)...$(NC)"
	forge test -vvv

test-vv: ## Run tests with very verbose output
	@echo "$(GREEN)Running tests (very verbose)...$(NC)"
	forge test -vvvv

test-match: ## Run specific test (usage: make test-match TEST=testName)
	@echo "$(GREEN)Running test: $(TEST)$(NC)"
	forge test --match-test $(TEST) -vvv

test-contract: ## Run tests for specific contract (usage: make test-contract CONTRACT=ContractName)
	@echo "$(GREEN)Running tests for: $(CONTRACT)$(NC)"
	forge test --match-contract $(CONTRACT) -vv

test-gas: ## Run tests with gas report
	@echo "$(GREEN)Running tests with gas report...$(NC)"
	forge test --gas-report

coverage: ## Generate test coverage report
	@echo "$(GREEN)Generating coverage report...$(NC)"
	forge coverage

snapshot: ## Create gas snapshot
	@echo "$(GREEN)Creating gas snapshot...$(NC)"
	forge snapshot

##@ Local Development

anvil: ## Start local Anvil node
	@echo "$(GREEN)Starting Anvil node...$(NC)"
	anvil --host 0.0.0.0

deploy-local: ## Deploy to local Anvil (requires TREASURY_ADDRESS in env)
	@echo "$(GREEN)Deploying to local Anvil...$(NC)"
	@if [ -z "$(TREASURY_ADDRESS)" ]; then \
		echo "$(RED)Error: TREASURY_ADDRESS not set$(NC)"; \
		exit 1; \
	fi
	forge script script/Deploy.s.sol \
		--rpc-url http://localhost:8545 \
		--private-key $(PRIVATE_KEY) \
		--broadcast

##@ Testnet Deployments

deploy-sepolia: ## Deploy to Base Sepolia testnet
	@echo "$(GREEN)Deploying to Base Sepolia...$(NC)"
	@if [ -z "$(PRIVATE_KEY)" ] || [ -z "$(TREASURY_ADDRESS)" ]; then \
		echo "$(RED)Error: PRIVATE_KEY or TREASURY_ADDRESS not set$(NC)"; \
		exit 1; \
	fi
	forge script script/DeployBaseSepolia.s.sol \
		--rpc-url https://base-sepolia.drpc.org \
		--private-key $(PRIVATE_KEY) \
		--broadcast \
		--verify --verifier-url https://api.etherscan.io/v2/api?chainid=84532 --etherscan-api-key $(BASESCAN_API_KEY) 



deploy-sepolia-dry: ## Dry run deployment to Base Sepolia
	@echo "$(YELLOW)Dry run: Base Sepolia deployment$(NC)"
	forge script script/DeployBaseSepolia.s.sol \
		--rpc-url https://base-sepolia.drpc.org \
		--private-key $(PRIVATE_KEY)

##@ Mainnet Deployments

deploy-base: ## Deploy to Base mainnet
	@echo "$(RED)WARNING: Deploying to Base MAINNET$(NC)"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	@if [ -z "$(PRIVATE_KEY)" ] || [ -z "$(TREASURY_ADDRESS)" ]; then \
		echo "$(RED)Error: PRIVATE_KEY or TREASURY_ADDRESS not set$(NC)"; \
		exit 1; \
	fi
	forge script script/DeployBase.s.sol \
		--rpc-url $(RPC_URL_BASE) \
		--private-key $(PRIVATE_KEY) \
		--broadcast \
		--verify --verifier-url https://api.etherscan.io/v2/api?chainid=8453 --etherscan-api-key $(BASESCAN_API_KEY) 
		

deploy-base-dry: ## Dry run deployment to Base mainnet
	@echo "$(YELLOW)Dry run: Base mainnet deployment$(NC)"
	forge script script/DeployBase.s.sol \
		--rpc-url https://mainnet.base.org \
		--private-key $(PRIVATE_KEY)

##@ Verification

verify-sepolia: ## Verify contract on Base Sepolia (usage: make verify-sepolia CONTRACT=0x...)
	@echo "$(GREEN)Verifying contract on Base Sepolia...$(NC)"
	@if [ -z "$(CONTRACT)" ]; then \
		echo "$(RED)Error: CONTRACT address not set. Usage: make verify-sepolia CONTRACT=0x...$(NC)"; \
		exit 1; \
	fi
	forge verify-contract $(CONTRACT) \
		HootQuizManager \
		--chain-id 84532 \
		--verifier-url https://api-sepolia.basescan.org/v2/api \
		--constructor-args $$(cast abi-encode "constructor(address,uint256,uint256)" $(TREASURY_ADDRESS) $(TREASURY_FEE_PERCENT) $(FEE_PRECISION)) \
		--etherscan-api-key $(BASESCAN_API_KEY) \
		--watch

verify-base: ## Verify contract on Base mainnet (usage: make verify-base CONTRACT=0x...)
	@echo "$(GREEN)Verifying contract on Base mainnet...$(NC)"
	@if [ -z "$(CONTRACT)" ]; then \
		echo "$(RED)Error: CONTRACT address not set. Usage: make verify-base CONTRACT=0x...$(NC)"; \
		exit 1; \
	fi
	forge verify-contract $(CONTRACT) \
		HootQuizManager \
		--chain-id 8453 \
		--verifier-url https://api.basescan.org/v2/api \
		--constructor-args $$(cast abi-encode "constructor(address,uint256,uint256)" $(TREASURY_ADDRESS) $(TREASURY_FEE_PERCENT) $(FEE_PRECISION)) \
		--etherscan-api-key $(BASESCAN_API_KEY) \
		--watch

##@ Code Quality

format: ## Format code with forge fmt
	@echo "$(GREEN)Formatting code...$(NC)"
	forge fmt

format-check: ## Check code formatting
	@echo "$(GREEN)Checking code formatting...$(NC)"
	forge fmt --check

lint: ## Run Solhint linter
	@echo "$(GREEN)Running linter...$(NC)"
	@if command -v solhint > /dev/null; then \
		solhint 'src/**/*.sol' 'test/**/*.sol' 'script/**/*.sol'; \
	else \
		echo "$(YELLOW)Solhint not installed. Install with: npm install -g solhint$(NC)"; \
	fi

##@ Information

info: ## Display current configuration
	@echo "$(GREEN)Current Configuration:$(NC)"
	@echo "  ENV file:           $(ENV)"
	@echo "  Treasury Address:   $(TREASURY_ADDRESS)"
	@echo "  Treasury Fee:       $(TREASURY_FEE_PERCENT) ($(shell echo "scale=2; $(TREASURY_FEE_PERCENT) / $(FEE_PRECISION) * 100" | bc)%)"
	@echo "  Fee Precision:      $(FEE_PRECISION)"
	@echo ""
	@echo "$(YELLOW)Available .env files:$(NC)"
	@ls -1 .env* 2>/dev/null || echo "  No .env files found"

sizes: ## Display contract sizes
	@echo "$(GREEN)Contract sizes:$(NC)"
	forge build --sizes

##@ Quick Commands (with different environments)

# Sepolia commands
test-sepolia: ## Run tests with Sepolia config
	@$(MAKE) test ENV=.env.sepolia

deploy-sepolia-quick: ## Quick deploy to Sepolia with .env.sepolia
	@$(MAKE) deploy-sepolia ENV=.env.sepolia

# Base commands
test-base: ## Run tests with Base config
	@$(MAKE) test ENV=.env.base

deploy-base-quick: ## Quick deploy to Base with .env.base
	@$(MAKE) deploy-base ENV=.env.base

# Local commands
test-local: ## Run tests with local config
	@$(MAKE) test ENV=.env.local

##@ Utilities

gas-report: ## Generate detailed gas report
	@echo "$(GREEN)Generating gas report...$(NC)"
	forge test --gas-report > gas-report.txt
	@echo "$(GREEN)Gas report saved to gas-report.txt$(NC)"

storage-layout: ## Display storage layout
	@echo "$(GREEN)Storage layout for HootQuizManager:$(NC)"
	forge inspect HootQuizManager storage-layout

abi: ## Generate ABI
	@echo "$(GREEN)Generating ABI...$(NC)"
	forge inspect HootQuizManager abi > HootQuizManager.abi.json
	@echo "$(GREEN)ABI saved to HootQuizManager.abi.json$(NC)"

##@ Environment Files

create-env-local: ## Create .env.local template
	@echo "$(GREEN)Creating .env.local template...$(NC)"
	@echo "# Local Development Environment" > .env.local
	@echo "PRIVATE_KEY=0x1234123..." >> .env.local
	@echo "TREASURY_ADDRESS=0x123456..." >> .env.local
	@echo "TREASURY_FEE_PERCENT=100000  # 10%" >> .env.local
	@echo "FEE_PRECISION=1000000         # 1M = 4 decimals" >> .env.local
	@echo "$(GREEN).env.local created!$(NC)"

create-env-sepolia: ## Create .env.sepolia template
	@echo "$(GREEN)Creating .env.sepolia template...$(NC)"
	@echo "# Base Sepolia Testnet Environment" > .env.sepolia
	@echo "PRIVATE_KEY=your_private_key_here" >> .env.sepolia
	@echo "TREASURY_ADDRESS=your_treasury_address_here" >> .env.sepolia
	@echo "TREASURY_FEE_PERCENT=100000  # 10%" >> .env.sepolia
	@echo "FEE_PRECISION=1000000         # 1M = 4 decimals" >> .env.sepolia
	@echo "BASESCAN_API_KEY=your_basescan_api_key_here" >> .env.sepolia
	@echo "$(GREEN).env.sepolia created! Remember to fill in your credentials.$(NC)"

create-env-base: ## Create .env.base template
	@echo "$(GREEN)Creating .env.base template...$(NC)"
	@echo "# Base Mainnet Environment" > .env.base
	@echo "PRIVATE_KEY=your_private_key_here" >> .env.base
	@echo "TREASURY_ADDRESS=your_treasury_address_here" >> .env.base
	@echo "TREASURY_FEE_PERCENT=100000  # 10%" >> .env.base
	@echo "FEE_PRECISION=1000000         # 1M = 4 decimals" >> .env.base
	@echo "BASESCAN_API_KEY=your_basescan_api_key_here" >> .env.base
	@echo "$(RED).env.base created! Remember to fill in your MAINNET credentials.$(NC)"


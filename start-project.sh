#!/bin/bash

# ============================================================================
# Hoot Project Orchestrator Script
# ============================================================================
# Orchestrates the startup of all Hoot project components:
# 1. Blockchain (Anvil + ngrok)
# 2. Smart contract deployment
# 3. Database (Supabase)
# 4. Frontend (Next.js)
#
# Follows the manual setup approach from SETUP.md
#
# Usage: ./start-project.sh
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Helper functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Main execution
main() {
    print_header "🚀 Hoot Project Setup Guide"

    echo -e "${BOLD}This script helps you start the Hoot project step by step.${NC}"
    echo ""
    echo -e "${BLUE}📋 Setup Order:${NC}"
    echo "  1. 🛠️  Blockchain (Anvil + ngrok)"
    echo "  2. 📄 Smart Contract Deployment"
    echo "  3. 🗄️  Database (Supabase)"
    echo "  4. ⚛️  Frontend (Next.js)"
    echo ""
    echo -e "${YELLOW}💡 Each service should run in its own terminal window${NC}"
    echo ""

    # Check if modular scripts exist
    if [[ ! -f "start-anvil.sh" ]]; then
        print_error "start-anvil.sh not found"
        echo "Please ensure all modular scripts are present"
        exit 1
    fi

    if [[ ! -f "start-supabase.sh" ]]; then
        print_error "start-supabase.sh not found"
        echo "Please ensure all modular scripts are present"
        exit 1
    fi

    if [[ ! -f "start-frontend.sh" ]]; then
        print_error "start-frontend.sh not found"
        echo "Please ensure all modular scripts are present"
        exit 1
    fi

    if [[ ! -f "deploy-contract.sh" ]]; then
        print_error "deploy-contract.sh not found"
        echo "Please ensure all modular scripts are present"
        exit 1
    fi

    echo -e "${BLUE}🚀 Starting Hoot Project Setup${NC}"
    echo ""

    # Step 1: Blockchain
    print_header "Step 1: Blockchain (Anvil + ngrok)"
    echo -e "${BLUE}📝 Terminal 1 - Start the blockchain:${NC}"
    echo -e "${YELLOW}./start-anvil.sh${NC}"
    echo ""
    echo -e "${BLUE}⏳ Wait for the blockchain and ngrok tunnel to start...${NC}"
    echo -e "${BLUE}💡 Note the ngrok URL (e.g., https://abc123.ngrok.io)${NC}"
    echo ""

    read -p "Press Enter when blockchain is ready..."

    # Step 2: Deploy Contract
    print_header "Step 2: Deploy Smart Contract"
    echo -e "${BLUE}📝 Deploy the contract (will also update environment files):${NC}"
    echo -e "${YELLOW}./deploy-contract.sh <ngrok-url>${NC}"
    echo -e "${BLUE}💡 Replace <ngrok-url> with the URL from step 1${NC}"
    echo ""

    read -p "Press Enter when contract is deployed..."

    # Step 3: Supabase
    print_header "Step 3: Database (Supabase)"
    echo -e "${BLUE}📝 Terminal 2 - Start Supabase:${NC}"
    echo -e "${YELLOW}./start-supabase.sh${NC}"
    echo ""
    echo -e "${BLUE}⏳ Wait for Supabase to initialize...${NC}"
    echo ""

    read -p "Press Enter when Supabase is ready..."

    # Step 4: Frontend
    print_header "Step 4: Frontend (Next.js)"
    echo -e "${BLUE}📝 Terminal 3 - Start the frontend:${NC}"
    echo -e "${YELLOW}./start-frontend.sh${NC}"
    echo ""
    echo -e "${BLUE}⏳ Wait for the frontend to start...${NC}"
    echo ""

    read -p "Press Enter when frontend is ready..."

    # Final summary
    echo ""
    print_header "🎉 Hoot Project Setup Complete!"
    echo ""
    echo -e "${BOLD}All services should now be running:${NC}"
    echo ""
    echo -e "${BLUE}🌐 Access Points:${NC}"
    echo -e "  • Frontend:       ${GREEN}http://localhost:3000${NC}"
    echo -e "  • Supabase API:   ${GREEN}http://localhost:54321${NC}"
    echo -e "  • Supabase Studio: ${GREEN}http://localhost:54323${NC}"
    echo -e "  • Blockchain:     ${GREEN}http://localhost:8545${NC}"
    echo ""
    echo -e "${BLUE}📝 Individual Scripts:${NC}"
    echo -e "  • Blockchain:     ${YELLOW}./start-anvil.sh${NC}"
    echo -e "  • Contract:       ${YELLOW}./deploy-contract.sh${NC}"
    echo -e "  • Database:       ${YELLOW}./start-supabase.sh${NC}"
    echo -e "  • Frontend:       ${YELLOW}./start-frontend.sh${NC}"
    echo ""
    echo -e "${BLUE}💡 Each script runs in its own terminal and can be stopped with Ctrl+C${NC}"
    echo ""
    echo -e "${YELLOW}For detailed manual instructions, see SETUP.md${NC}"
}

# Run main function

main "$@"

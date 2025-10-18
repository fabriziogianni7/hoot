#!/bin/bash

# ============================================================================
# Hoot Blockchain Startup Script
# ============================================================================
# Starts the local Anvil blockchain and ngrok tunnel
#
# Usage: ./start-anvil.sh
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
ANVIL_PORT=8545
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

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed"
        echo "Please install $1 and try again"
        exit 1
    fi
}

# Kill processes on specific ports
kill_port_processes() {
    local port=$1
    if ! command -v lsof &> /dev/null; then
        return
    fi

    local pids=$(lsof -ti:$port 2>/dev/null || echo "")
    if [[ ! -z "$pids" ]]; then
        echo -e "${BLUE}🛑 Killing processes on port $port...${NC}"
        for pid in $pids; do
            kill -TERM $pid 2>/dev/null || true
        done
        sleep 2
    fi
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping blockchain services...${NC}"

    # Kill any existing processes
    pkill -f anvil 2>/dev/null || true
    pkill -f ngrok 2>/dev/null || true

    # Clean up log files
    rm -f "$PROJECT_ROOT/contracts/anvil.log" "$PROJECT_ROOT/contracts/ngrok.log" 2>/dev/null

    echo -e "${GREEN}✅ Blockchain services stopped${NC}"
    exit 0
}

# Set up signal handlers for graceful shutdown
trap cleanup SIGINT SIGTERM

print_header "🚀 Starting Hoot Blockchain Services"

echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
check_command "anvil"
check_command "ngrok"

# Clean up existing processes
echo -e "${BLUE}🧹 Cleaning up existing processes...${NC}"
kill_port_processes $ANVIL_PORT

# Start Anvil blockchain
echo -e "${BLUE}⛓️  Starting Anvil blockchain...${NC}"
cd "$PROJECT_ROOT/contracts"

echo -e "${BLUE}📝 Starting Anvil on port $ANVIL_PORT...${NC}"
anvil --port $ANVIL_PORT > "$PROJECT_ROOT/contracts/anvil.log" 2>&1 &
ANVIL_PID=$!

# Wait for anvil to start
sleep 3

if ! kill -0 $ANVIL_PID 2>/dev/null; then
    print_error "Failed to start Anvil"
    cat "$PROJECT_ROOT/contracts/anvil.log"
    exit 1
fi

print_success "Anvil blockchain started (PID: $ANVIL_PID)"
echo -e "${GREEN}🔗 Blockchain RPC: http://localhost:$ANVIL_PORT${NC}"

# Start ngrok tunnel
echo -e "${BLUE}🚇 Starting ngrok tunnel...${NC}"
ngrok http $ANVIL_PORT --log=stdout > "$PROJECT_ROOT/contracts/ngrok.log" 2>&1 &
NGROK_PID=$!

# Wait for ngrok and extract URL
NGROK_URL=""
retries=0
max_retries=30

echo -e "${BLUE}⏳ Waiting for ngrok tunnel...${NC}"

while [[ $retries -lt $max_retries ]]; do
    if [[ -f "$PROJECT_ROOT/contracts/ngrok.log" ]]; then
        NGROK_URL=$(grep -o 'url=https://[^ ]*' "$PROJECT_ROOT/contracts/ngrok.log" | head -1 | sed 's/url=//')
        if [[ ! -z "$NGROK_URL" ]]; then
            echo -e "${GREEN}✅ Tunnel established!${NC}"
            echo -e "${BLUE}🌐 Public URL: ${YELLOW}$NGROK_URL${NC}"
            break
        fi
    fi
    sleep 1
    ((retries++))
done

if [[ -z "$NGROK_URL" ]]; then
    print_error "Failed to establish ngrok tunnel"
    echo -e "${YELLOW}📋 Check ngrok.log for details${NC}"
    cleanup
fi

print_success "Blockchain services started successfully!"
echo ""
echo -e "${BOLD}Services running:${NC}"
echo -e "  ⛓️  Blockchain: ${GREEN}http://localhost:$ANVIL_PORT${NC}"
echo -e "  🌐 Public RPC: ${YELLOW}$NGROK_URL${NC}"
echo ""
echo -e "${BLUE}💡 Keep this terminal open${NC}"
echo -e "${BLUE}📝 Log files:${NC}"
echo -e "   - contracts/anvil.log${NC}"
echo -e "   - contracts/ngrok.log${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop services${NC}"

# Wait for user interrupt
wait

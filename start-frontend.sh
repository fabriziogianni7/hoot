#!/bin/bash

# ============================================================================
# Hoot Frontend Startup Script
# ============================================================================
# Starts the Next.js frontend development server
#
# Usage: ./start-frontend.sh
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_PORT=3000
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
    echo -e "\n${YELLOW}🛑 Stopping frontend...${NC}"

    # Kill frontend processes
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true

    # Clean up log files
    rm -f "$PROJECT_ROOT/frontend/frontend.log" 2>/dev/null

    echo -e "${GREEN}✅ Frontend stopped${NC}"
    exit 0
}

# Set up signal handlers for graceful shutdown
trap cleanup SIGINT SIGTERM

print_header "🚀 Starting Hoot Frontend"

echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
check_command "npm"

# Clean up existing processes
echo -e "${BLUE}🧹 Cleaning up existing processes...${NC}"
kill_port_processes $FRONTEND_PORT

# Install dependencies if needed
echo -e "${BLUE}📦 Installing dependencies...${NC}"
cd "$PROJECT_ROOT/frontend"

if [[ ! -d "node_modules" ]]; then
    echo -e "${BLUE}📥 Running npm install...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        print_error "Failed to install dependencies"
        exit 1
    fi
fi

# Start frontend in background
echo -e "${BLUE}⚛️  Starting Next.js development server...${NC}"
npm run dev > "$PROJECT_ROOT/frontend/frontend.log" 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
echo -e "${BLUE}⏳ Waiting for frontend to be ready...${NC}"
sleep 5

# Check if frontend is running
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    print_error "Failed to start frontend"
    echo -e "${YELLOW}📋 Frontend log:${NC}"
    cat "$PROJECT_ROOT/frontend/frontend.log"
    exit 1
fi

print_success "Frontend started successfully (PID: $FRONTEND_PID)!"
echo ""
echo -e "${BOLD}Services running:${NC}"
echo -e "  🌐 Frontend: ${GREEN}http://localhost:$FRONTEND_PORT${NC}"
echo ""
echo -e "${BLUE}💡 Keep this terminal open${NC}"
echo -e "${BLUE}📝 Log files:${NC}"
echo -e "   - frontend/frontend.log${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop frontend${NC}"

# Wait for user interrupt
wait

#!/bin/bash

# ============================================================================
# Hoot Supabase Startup Script
# ============================================================================
# Starts the Supabase local development environment
#
# Usage: ./start-supabase.sh
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
SUPABASE_PORT=54321
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
    echo -e "\n${YELLOW}🛑 Stopping Supabase...${NC}"

    # Kill supabase processes
    pkill -f supabase 2>/dev/null || true

    # Clean up log files
    rm -f "$PROJECT_ROOT/backend/supabase/supabase.log" 2>/dev/null

    echo -e "${GREEN}✅ Supabase stopped${NC}"
    exit 0
}

# Set up signal handlers for graceful shutdown
trap cleanup SIGINT SIGTERM

print_header "🚀 Starting Hoot Supabase"

echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
check_command "supabase"

# Clean up existing processes
echo -e "${BLUE}🧹 Cleaning up existing processes...${NC}"
kill_port_processes $SUPABASE_PORT

# Check if Supabase is already running
echo -e "${BLUE}🏗️  Starting Supabase...${NC}"
cd "$PROJECT_ROOT/backend/supabase"

if supabase status > /dev/null 2>&1; then
    print_warning "Supabase is already running"
    echo -e "${GREEN}🔗 Supabase API: http://localhost:$SUPABASE_PORT${NC}"
    echo -e "${GREEN}🎛️  Supabase Studio: http://localhost:54323${NC}"
    exit 0
fi

# Start supabase in background
supabase start > "$PROJECT_ROOT/backend/supabase/supabase.log" 2>&1 &
SUPABASE_PID=$!

# Wait for supabase to start
echo -e "${BLUE}⏳ Waiting for Supabase to be ready...${NC}"
sleep 5

# Check if supabase is running
if ! kill -0 $SUPABASE_PID 2>/dev/null; then
    print_error "Failed to start Supabase"
    echo -e "${YELLOW}📋 Checking if Supabase is already running...${NC}"
    if supabase status > /dev/null 2>&1; then
        print_success "Supabase is already running (external instance)"
        echo -e "${GREEN}🔗 Supabase API: http://localhost:$SUPABASE_PORT${NC}"
        echo -e "${GREEN}🎛️  Supabase Studio: http://localhost:54323${NC}"
        exit 0
    fi
    cat "$PROJECT_ROOT/backend/supabase/supabase.log"
    exit 1
fi

print_success "Supabase started successfully (PID: $SUPABASE_PID)!"
echo ""
echo -e "${BOLD}Services running:${NC}"
echo -e "  🔗 Supabase API:   ${GREEN}http://localhost:$SUPABASE_PORT${NC}"
echo -e "  🎛️  Supabase Studio: ${GREEN}http://localhost:54323${NC}"
echo ""
echo -e "${BLUE}💡 Keep this terminal open${NC}"
echo -e "${BLUE}📝 Log files:${NC}"
echo -e "   - backend/supabase/supabase.log${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop Supabase${NC}"

# Wait for user interrupt
wait

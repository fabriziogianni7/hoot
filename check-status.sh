#!/bin/bash

# Script to check the status of all development services

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Development Environment Status${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check Anvil
echo -n "Anvil (port 8545): "
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    echo -e "  ${YELLOW}Start with: cd contracts && anvil${NC}"
fi

# Check Supabase
echo -n "Supabase (port 54321): "
if lsof -Pi :54321 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    echo -e "  ${YELLOW}Start with: cd backend && supabase start${NC}"
fi

# Check Frontend
echo -n "Frontend (port 3000): "
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not running${NC}"
    echo -e "  ${YELLOW}Start with: cd frontend && npm run dev${NC}"
fi

# Check ngrok
echo -n "ngrok: "
if pgrep -x "ngrok" > /dev/null 2>&1 ; then
    echo -e "${GREEN}✓ Running${NC}"
    # Try to get ngrok URL
    if command -v curl &> /dev/null; then
        NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*' | head -1 | sed 's/"public_url":"//')
        if [ ! -z "$NGROK_URL" ]; then
            echo -e "  ${BLUE}Public URL: ${YELLOW}$NGROK_URL${NC}"
        fi
    fi
else
    echo -e "${RED}✗ Not running${NC}"
    echo -e "  ${YELLOW}Start with: cd contracts && ./tunnel-anvil.sh${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"

# Quick health checks
echo ""
echo -e "${BLUE}Quick Health Checks:${NC}"
echo ""

# Test Anvil RPC
if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -n "Anvil RPC: "
    if command -v curl &> /dev/null; then
        RESPONSE=$(curl -s -X POST http://localhost:8545 \
            -H "Content-Type: application/json" \
            -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Responding${NC}"
        else
            echo -e "${RED}✗ Not responding${NC}"
        fi
    fi
fi

# Test Supabase
if lsof -Pi :54321 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -n "Supabase API: "
    if command -v curl &> /dev/null; then
        RESPONSE=$(curl -s http://127.0.0.1:54321/rest/v1/ 2>/dev/null)
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Responding${NC}"
        else
            echo -e "${RED}✗ Not responding${NC}"
        fi
    fi
fi

echo ""



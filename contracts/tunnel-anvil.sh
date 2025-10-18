#!/bin/bash

# Script to tunnel Anvil network using ngrok
# This allows external services (like Supabase Edge Functions) to access your local blockchain

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default Anvil port
ANVIL_PORT=8545

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Anvil Network Tunnel (ngrok)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}❌ ngrok is not installed${NC}"
    echo ""
    echo "Please install ngrok:"
    echo "  - Visit: https://ngrok.com/download"
    echo "  - Or use brew: brew install ngrok/ngrok/ngrok"
    echo ""
    exit 1
fi

# Check if Anvil is running
if ! lsof -Pi :$ANVIL_PORT -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${YELLOW}⚠️  Warning: Anvil doesn't seem to be running on port $ANVIL_PORT${NC}"
    echo ""
    echo "Start Anvil first with:"
    echo "  cd contracts && anvil"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}🚀 Starting ngrok tunnel for Anvil...${NC}"
echo -e "${BLUE}Local endpoint:${NC} http://localhost:$ANVIL_PORT"
echo ""

# Start ngrok and capture output
ngrok http $ANVIL_PORT --log=stdout | while read line; do
    echo "$line"
    
    # Extract the ngrok URL when it appears
    if [[ $line == *"url="* ]]; then
        URL=$(echo "$line" | grep -o 'url=[^ ]*' | sed 's/url=//')
        if [[ $URL == https://* ]]; then
            echo ""
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}✅ Tunnel established!${NC}"
            echo -e "${GREEN}========================================${NC}"
            echo ""
            echo -e "${BLUE}Public URL:${NC} ${YELLOW}$URL${NC}"
            echo ""
            echo -e "${BLUE}📝 Update your Supabase Edge Function environment:${NC}"
            echo -e "   ${YELLOW}RPC_URL_LOCAL=$URL${NC}"
            echo ""
            echo -e "${BLUE}💡 Tip:${NC} Set this in your Supabase secrets:"
            echo -e "   supabase secrets set RPC_URL_LOCAL=$URL"
            echo ""
            echo -e "${BLUE}Press Ctrl+C to stop the tunnel${NC}"
            echo ""
        fi
    fi
done


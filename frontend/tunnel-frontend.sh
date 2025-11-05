#!/bin/bash

# Script to tunnel Frontend (Next.js dev server) using Cloudflare Tunnel
# This allows Farcaster to access your local frontend for testing MiniApps
# Cloudflare Tunnel is faster and free without usage limits compared to ngrok/localtunnel

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default Frontend port
FRONTEND_PORT=3000

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Frontend Tunnel (Cloudflare)${NC}"
echo -e "${BLUE}  For Farcaster MiniApp Testing${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}❌ cloudflared is not installed${NC}"
    echo ""
    echo "Please install cloudflared:"
    echo "  - macOS: brew install cloudflared"
    echo "  - Linux (without sudo): mkdir -p ~/.local/bin && wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O ~/.local/bin/cloudflared && chmod +x ~/.local/bin/cloudflared"
    echo "  - Linux (with sudo): wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
    echo "  - Or visit: https://github.com/cloudflare/cloudflared/releases"
    echo ""
    exit 1
fi

# Check if Frontend is running
if ! lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null ; then
    echo -e "${YELLOW}⚠️  Warning: Frontend doesn't seem to be running on port $FRONTEND_PORT${NC}"
    echo ""
    echo "Start the frontend first with:"
    echo "  cd frontend && npm run dev"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${GREEN}🚀 Starting Cloudflare Tunnel for Frontend...${NC}"
echo -e "${BLUE}Local endpoint:${NC} http://localhost:$FRONTEND_PORT"
echo ""
echo -e "${YELLOW}💡 Tip:${NC} Once you get the public URL, set it in your .env.local:"
echo -e "   ${YELLOW}NEXT_PUBLIC_NGROK_URL=https://xxxx-xxxx.trycloudflare.com${NC}"
echo ""

# Start cloudflared tunnel
# Use --url flag for quick tunnel (no authentication needed, but URL changes each time)
cloudflared tunnel --url http://localhost:$FRONTEND_PORT 2>&1 | while IFS= read -r line; do
    echo "$line"
    
    # Extract the Cloudflare Tunnel URL when it appears
    # Cloudflare outputs URLs like: "https://xxxx-xxxx-xxxx.trycloudflare.com"
    if echo "$line" | grep -qE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com'; then
        URL=$(echo "$line" | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | head -1)
        if [[ -n "$URL" ]]; then
            echo ""
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}✅ Tunnel established!${NC}"
            echo -e "${GREEN}========================================${NC}"
            echo ""
            echo -e "${BLUE}Public URL:${NC} ${YELLOW}$URL${NC}"
            echo ""
            echo -e "${BLUE}📝 Add this to your frontend/.env.local:${NC}"
            echo -e "   ${YELLOW}NEXT_PUBLIC_NGROK_URL=$URL${NC}"
            echo ""
            echo -e "${BLUE}💡 Or export it in your terminal:${NC}"
            echo -e "   ${YELLOW}export NEXT_PUBLIC_NGROK_URL=$URL${NC}"
            echo ""
            echo -e "${BLUE}🔄 Restart your Next.js dev server after setting the variable${NC}"
            echo ""
            echo -e "${BLUE}Press Ctrl+C to stop the tunnel${NC}"
            echo ""
        fi
    fi
done

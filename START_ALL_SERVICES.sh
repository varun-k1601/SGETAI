#!/bin/bash

# RAG System - Start All Services
# This script launches Backend, Frontend, and Ollama

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  🚀 STARTING RAG SYSTEM SERVICES                       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

# Check if Ollama is installed
echo -e "${BLUE}1️⃣  Checking Ollama installation...${NC}"
if ! command -v ollama &> /dev/null; then
    echo -e "${RED}❌ Ollama not found!${NC}"
    echo "   Download from: https://ollama.ai"
    exit 1
fi
echo -e "${GREEN}✓ Ollama found${NC}"

# Check if required models are downloaded
echo ""
echo -e "${BLUE}2️⃣  Checking Ollama models...${NC}"
ollama list | grep -q "nomic-embed-text" && echo -e "${GREEN}✓ nomic-embed-text${NC}" || echo -e "${YELLOW}⚠ Missing: nomic-embed-text${NC}"
ollama list | grep -q "qwen2.5:7b" && echo -e "${GREEN}✓ qwen2.5:7b${NC}" || echo -e "${YELLOW}⚠ Missing: qwen2.5:7b${NC}"

echo ""
echo -e "${BLUE}3️⃣  Starting Ollama server on port 11434...${NC}"
echo "   Run in Terminal 1:"
echo -e "   ${YELLOW}ollama serve${NC}"
echo ""

echo -e "${BLUE}4️⃣  Starting Backend on port 5000...${NC}"
echo "   Run in Terminal 2:"
echo -e "   ${YELLOW}cd backend && npm run dev${NC}"
echo ""

echo -e "${BLUE}5️⃣  Starting Frontend on port 5173...${NC}"
echo "   Run in Terminal 3:"
echo -e "   ${YELLOW}cd frontend && npm run dev${NC}"
echo ""

echo "╔════════════════════════════════════════════════════════╗"
echo "║  📊 SERVICE PORTS                                      ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║  Backend:  http://localhost:5000/api                  ║"
echo "║  Frontend: http://localhost:5173                      ║"
echo "║  Ollama:   http://localhost:11434/api                 ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

echo -e "${GREEN}Ready to go!${NC}"
echo ""
echo "Next steps:"
echo "1. Open 3 terminals"
echo "2. Run the commands shown above in each terminal"
echo "3. Wait for all services to start"
echo "4. Open http://localhost:5173/ats-checker in your browser"
echo ""

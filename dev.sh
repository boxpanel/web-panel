#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Web Panel Development Mode${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}Warning: .env file not found!${NC}"
    echo "Please run ./install.sh first or copy .env.example to .env"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${RED}Warning: Dependencies not installed!${NC}"
    echo "Please run ./install.sh first"
    exit 1
fi

# Check if client node_modules exists
if [ ! -d "client/node_modules" ]; then
    echo -e "${RED}Warning: Client dependencies not installed!${NC}"
    echo "Please run ./install.sh first"
    exit 1
fi

# Create necessary directories if they don't exist
mkdir -p uploads logs data

# Set proper permissions
chmod 755 uploads logs data

echo -e "${GREEN}Starting Web Panel in Development Mode...${NC}"
echo
echo -e "${BLUE}This will start both:${NC}"
echo "- Backend server on http://localhost:3001"
echo "- Frontend development server on http://localhost:3000"
echo
echo -e "${YELLOW}Default admin credentials:${NC}"
echo "- Username: admin"
echo "- Password: admin123"
echo
echo -e "${BLUE}Press Ctrl+C to stop both servers${NC}"
echo

# Start both servers concurrently
npm run dev
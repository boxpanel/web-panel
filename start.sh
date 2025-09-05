#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Web Panel Startup Script${NC}"
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

# Check if client build exists
if [ ! -d "client/build" ]; then
    echo -e "${YELLOW}Warning: Client build not found!${NC}"
    echo "Building client..."
    cd client
    npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to build client${NC}"
        cd ..
        exit 1
    fi
    cd ..
    echo -e "${GREEN}Client built successfully.${NC}"
    echo
fi

# Create necessary directories if they don't exist
mkdir -p uploads logs data

# Set proper permissions
chmod 755 uploads logs data

echo -e "${GREEN}Starting Web Panel Server...${NC}"
echo
echo -e "${BLUE}The application will be available at:${NC}"
echo "- Web Interface: http://localhost:3001"
echo "- API Endpoint: http://localhost:3001/api"
echo
echo -e "${YELLOW}Default admin credentials:${NC}"
echo "- Username: admin"
echo "- Password: admin123"
echo
echo -e "${BLUE}Press Ctrl+C to stop the server${NC}"
echo

# Start the server
npm start
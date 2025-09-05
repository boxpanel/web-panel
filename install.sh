#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Web Panel Installation Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if Node.js is installed
if ! command_exists node; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    echo "Or use a package manager:"
    echo "  Ubuntu/Debian: sudo apt-get install nodejs npm"
    echo "  CentOS/RHEL: sudo yum install nodejs npm"
    echo "  macOS: brew install node"
    exit 1
fi

# Check if npm is installed
if ! command_exists npm; then
    echo -e "${RED}Error: npm is not installed${NC}"
    echo "Please install npm or reinstall Node.js"
    exit 1
fi

echo -e "${GREEN}Node.js and npm are installed.${NC}"
echo

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo -e "${YELLOW}Warning: Node.js version $NODE_VERSION is below recommended version $REQUIRED_VERSION${NC}"
    echo "Some features may not work properly."
    echo
fi

# Install server dependencies
echo -e "${BLUE}Installing server dependencies...${NC}"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install server dependencies${NC}"
    exit 1
fi

echo -e "${GREEN}Server dependencies installed successfully.${NC}"
echo

# Install client dependencies
echo -e "${BLUE}Installing client dependencies...${NC}"
cd client
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to install client dependencies${NC}"
    cd ..
    exit 1
fi

cd ..
echo -e "${GREEN}Client dependencies installed successfully.${NC}"
echo

# Create necessary directories
echo -e "${BLUE}Creating necessary directories...${NC}"
mkdir -p uploads logs data

echo -e "${GREEN}Directories created successfully.${NC}"
echo

# Copy environment file if it doesn't exist
if [ ! -f ".env" ]; then
    echo -e "${BLUE}Creating environment configuration file...${NC}"
    cp ".env.example" ".env"
    echo -e "${YELLOW}Environment file created. Please edit .env file with your configuration.${NC}"
    echo
fi

# Set proper permissions
echo -e "${BLUE}Setting proper permissions...${NC}"
chmod +x install.sh
chmod 755 uploads logs data

# Build client for production
echo -e "${BLUE}Building client for production...${NC}"
cd client
npm run build
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Warning: Failed to build client for production${NC}"
    echo "You can build it later using: cd client && npm run build"
    cd ..
else
    cd ..
    echo -e "${GREEN}Client built successfully.${NC}"
fi

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Installation completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo -e "${BLUE}Next steps:${NC}"
echo "1. Edit .env file with your configuration"
echo "2. Run 'npm start' to start the server"
echo "3. Or run 'npm run dev' for development mode"
echo
echo -e "${BLUE}The application will be available at:${NC}"
echo "- Frontend: http://localhost:3000 (development)"
echo "- Backend API: http://localhost:3001"
echo
echo -e "${YELLOW}Default admin credentials:${NC}"
echo "- Username: admin"
echo "- Password: admin123"
echo
echo -e "${RED}Please change the default password after first login!${NC}"
echo
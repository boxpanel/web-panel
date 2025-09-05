@echo off
echo ========================================
echo Web Panel Installation Script
echo ========================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: npm is not installed or not in PATH
    echo Please install npm or reinstall Node.js
    pause
    exit /b 1
)

echo Node.js and npm are installed.
echo.

:: Install server dependencies
echo Installing server dependencies...
npm install
if %errorlevel% neq 0 (
    echo Error: Failed to install server dependencies
    pause
    exit /b 1
)

echo Server dependencies installed successfully.
echo.

:: Install client dependencies
echo Installing client dependencies...
cd client
npm install
if %errorlevel% neq 0 (
    echo Error: Failed to install client dependencies
    cd ..
    pause
    exit /b 1
)

cd ..
echo Client dependencies installed successfully.
echo.

:: Create necessary directories
echo Creating necessary directories...
if not exist "uploads" mkdir uploads
if not exist "logs" mkdir logs
if not exist "data" mkdir data

echo Directories created successfully.
echo.

:: Copy environment file if it doesn't exist
if not exist ".env" (
    echo Creating environment configuration file...
    copy ".env.example" ".env"
    echo Environment file created. Please edit .env file with your configuration.
    echo.
)

:: Build client for production
echo Building client for production...
cd client
npm run build
if %errorlevel% neq 0 (
    echo Warning: Failed to build client for production
    echo You can build it later using: cd client && npm run build
    cd ..
) else (
    cd ..
    echo Client built successfully.
)

echo.
echo ========================================
echo Installation completed successfully!
echo ========================================
echo.
echo Next steps:
echo 1. Edit .env file with your configuration
echo 2. Run 'npm start' to start the server
echo 3. Or run 'npm run dev' for development mode
echo.
echo The application will be available at:
echo - Frontend: http://localhost:3000 (development)
echo - Backend API: http://localhost:3001
echo.
echo Default admin credentials:
echo - Username: admin
echo - Password: admin123
echo.
echo Please change the default password after first login!
echo.
pause
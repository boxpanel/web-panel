@echo off
echo ========================================
echo Web Panel Startup Script
echo ========================================
echo.

:: Check if .env file exists
if not exist ".env" (
    echo Warning: .env file not found!
    echo Please run install.bat first or copy .env.example to .env
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist "node_modules" (
    echo Warning: Dependencies not installed!
    echo Please run install.bat first
    pause
    exit /b 1
)

:: Check if client build exists
if not exist "client\build" (
    echo Warning: Client build not found!
    echo Building client...
    cd client
    npm run build
    if %errorlevel% neq 0 (
        echo Error: Failed to build client
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo Client built successfully.
    echo.
)

:: Create necessary directories if they don't exist
if not exist "uploads" mkdir uploads
if not exist "logs" mkdir logs
if not exist "data" mkdir data

echo Starting Web Panel Server...
echo.
echo The application will be available at:
echo - Web Interface: http://localhost:3001
echo - API Endpoint: http://localhost:3001/api
echo.
echo Default admin credentials:
echo - Username: admin
echo - Password: admin123
echo.
echo Press Ctrl+C to stop the server
echo.

:: Start the server
npm start
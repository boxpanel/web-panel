@echo off
echo ========================================
echo Web Panel Development Mode
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

:: Check if client node_modules exists
if not exist "client\node_modules" (
    echo Warning: Client dependencies not installed!
    echo Please run install.bat first
    pause
    exit /b 1
)

:: Create necessary directories if they don't exist
if not exist "uploads" mkdir uploads
if not exist "logs" mkdir logs
if not exist "data" mkdir data

echo Starting Web Panel in Development Mode...
echo.
echo This will start both:
echo - Backend server on http://localhost:3001
echo - Frontend development server on http://localhost:3000
echo.
echo Default admin credentials:
echo - Username: admin
echo - Password: admin123
echo.
echo Press Ctrl+C to stop both servers
echo.

:: Start both servers concurrently
npm run dev
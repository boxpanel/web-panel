@echo off
echo Shell-Init Error Diagnostic Tool
echo ==================================
echo.

echo [INFO] Current working directory:
cd
echo.

echo [INFO] Testing directory access:
dir > nul 2>&1
if %errorlevel% equ 0 (
    echo Directory access: OK
) else (
    echo Directory access: FAILED
)
echo.

echo [INFO] Testing Git Bash with different commands:
echo Testing pwd command...
"C:\Program Files\Git\bin\bash.exe" -c "pwd" 2>&1
echo.

echo Testing cd command...
"C:\Program Files\Git\bin\bash.exe" -c "cd .. && pwd && cd web-panel" 2>&1
echo.

echo Testing getcwd system call...
"C:\Program Files\Git\bin\bash.exe" -c "python3 -c 'import os; print(os.getcwd())' 2>/dev/null || echo 'Python not available'" 2>&1
echo.

echo Testing file operations...
"C:\Program Files\Git\bin\bash.exe" -c "ls -la . | head -5" 2>&1
echo.

echo [INFO] Environment variables:
echo PATH (first 200 chars): %PATH:~0,200%
echo PWD: %PWD%
echo OLDPWD: %OLDPWD%
echo.

echo [INFO] Process information:
tasklist | findstr bash 2>nul
echo.

echo [SOLUTION] If you see shell-init errors:
echo 1. Close all Git Bash terminals
echo 2. Restart your terminal application
echo 3. Navigate to the project directory using 'cd' command
echo 4. Use PowerShell for most operations
echo 5. Only use Git Bash when specifically needed
echo.

echo Diagnostic completed. Press any key to exit...
pause > nul
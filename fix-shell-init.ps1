# Fix Shell-Init Error Script
# Shell-init error fix PowerShell script

Write-Host "Shell-Init Error Fix Tool" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

# Check current directory
Write-Host "[INFO] Checking current working directory..." -ForegroundColor Blue
$currentDir = Get-Location
Write-Host "Current directory: $currentDir" -ForegroundColor Yellow

# Test directory access
Write-Host "[INFO] Testing directory access..." -ForegroundColor Blue
if (Test-Path $currentDir) {
    Write-Host "Directory access OK" -ForegroundColor Green
} else {
    Write-Host "Directory access failed" -ForegroundColor Red
    Write-Host "[INFO] Trying to switch to project root..." -ForegroundColor Blue
    Set-Location "D:\Desktop\web-panel"
}

# Check Git Bash availability
Write-Host "[INFO] Checking Git Bash availability..." -ForegroundColor Blue
$gitBashPath = "C:\Program Files\Git\bin\bash.exe"
if (Test-Path $gitBashPath) {
    Write-Host "Git Bash available" -ForegroundColor Green
    
    # Test Git Bash environment
    Write-Host "[INFO] Testing Git Bash environment..." -ForegroundColor Blue
    try {
        $result = & $gitBashPath -c "pwd && echo 'Git Bash working'"
        Write-Host "Git Bash working normally" -ForegroundColor Green
        Write-Host "Output: $result" -ForegroundColor Yellow
    } catch {
        Write-Host "Git Bash test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "Git Bash not found" -ForegroundColor Red
    Write-Host "[Suggestion] Please install Git for Windows" -ForegroundColor Yellow
}

# Check WSL status
Write-Host "[INFO] Checking WSL status..." -ForegroundColor Blue
try {
    $wslResult = wsl --list --verbose 2>&1
    if ($wslResult -match "WSL_E_WSL_OPTIONAL_COMPONENT_REQUIRED") {
        Write-Host "WSL not installed" -ForegroundColor Red
        Write-Host "[Suggestion] Run: wsl.exe --install --no-distribution" -ForegroundColor Yellow
    } else {
        Write-Host "WSL available" -ForegroundColor Green
    }
} catch {
    Write-Host "WSL check failed" -ForegroundColor Red
}

# Provide solutions
Write-Host "`nSolution suggestions:" -ForegroundColor Cyan
Write-Host "1. Restart terminal" -ForegroundColor White
Write-Host "2. Use PowerShell instead of bash" -ForegroundColor White
Write-Host "3. Use Git Bash if you need bash" -ForegroundColor White
Write-Host "4. Install WSL for full Linux environment" -ForegroundColor White
Write-Host "5. Avoid using terminal sessions after deleting directories" -ForegroundColor White

Write-Host "`nFix script completed" -ForegroundColor Green
Pause
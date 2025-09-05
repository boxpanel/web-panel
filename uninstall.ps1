# Web管理面板卸载程序 (PowerShell版本)
# 设置执行策略以允许脚本运行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

Write-Host "========================================" -ForegroundColor Blue
Write-Host "          Web管理面板卸载程序" -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

Write-Host "[1/5] 停止运行中的服务..." -ForegroundColor Yellow
Write-Host "正在查找并停止Node.js进程..."
try {
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "npm" -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "服务已停止。" -ForegroundColor Green
} catch {
    Write-Host "未找到运行中的服务。" -ForegroundColor Gray
}
Write-Host ""

Write-Host "[2/5] 清理npm缓存和依赖..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "正在删除根目录node_modules..."
    Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
}
if (Test-Path "client\node_modules") {
    Write-Host "正在删除客户端node_modules..."
    Remove-Item -Recurse -Force "client\node_modules" -ErrorAction SilentlyContinue
}
if (Test-Path "package-lock.json") {
    Write-Host "正在删除package-lock.json..."
    Remove-Item -Force "package-lock.json" -ErrorAction SilentlyContinue
}
if (Test-Path "client\package-lock.json") {
    Write-Host "正在删除客户端package-lock.json..."
    Remove-Item -Force "client\package-lock.json" -ErrorAction SilentlyContinue
}
Write-Host "依赖清理完成。" -ForegroundColor Green
Write-Host ""

Write-Host "[3/5] 清理数据文件..." -ForegroundColor Yellow
if (Test-Path "server\data") {
    Write-Host "正在删除数据目录..."
    Remove-Item -Recurse -Force "server\data" -ErrorAction SilentlyContinue
}
if (Test-Path ".env") {
    Write-Host "正在删除环境配置文件..."
    Remove-Item -Force ".env" -ErrorAction SilentlyContinue
}
Write-Host "数据清理完成。" -ForegroundColor Green
Write-Host ""

Write-Host "[4/5] 清理日志和临时文件..." -ForegroundColor Yellow
$logFiles = Get-ChildItem -Filter "*.log" -ErrorAction SilentlyContinue
if ($logFiles) {
    Write-Host "正在删除日志文件..."
    $logFiles | Remove-Item -Force -ErrorAction SilentlyContinue
}
if (Test-Path "client\build") {
    Write-Host "正在删除构建文件..."
    Remove-Item -Recurse -Force "client\build" -ErrorAction SilentlyContinue
}
Write-Host "临时文件清理完成。" -ForegroundColor Green
Write-Host ""

Write-Host "[5/5] 准备删除项目目录..." -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  警告：即将删除整个项目目录！" -ForegroundColor Red
Write-Host "项目路径：$(Get-Location)"
Write-Host ""
$confirm = Read-Host "确定要完全删除此项目吗？(输入 YES 确认)"
if ($confirm -eq "YES") {
    Write-Host ""
    Write-Host "正在删除项目目录..."
    $parentDir = Split-Path -Parent (Get-Location)
    Set-Location $parentDir
    Remove-Item -Recurse -Force "web-panel" -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "✅ Web管理面板已完全卸载！" -ForegroundColor Green
    Write-Host "项目目录已删除。"
} else {
    Write-Host ""
    Write-Host "❌ 卸载已取消。" -ForegroundColor Red
    Write-Host "项目文件保持不变。"
}

Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
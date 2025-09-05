@echo off
chcp 65001 >nul
echo ========================================
echo          Web管理面板卸载程序
echo ========================================
echo.

echo [1/5] 停止运行中的服务...
echo 正在查找并停止Node.js进程...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im npm.exe >nul 2>&1
echo 服务已停止。
echo.

echo [2/5] 清理npm缓存和依赖...
if exist "node_modules" (
    echo 正在删除根目录node_modules...
    rmdir /s /q "node_modules" >nul 2>&1
)
if exist "client\node_modules" (
    echo 正在删除客户端node_modules...
    rmdir /s /q "client\node_modules" >nul 2>&1
)
if exist "package-lock.json" (
    echo 正在删除package-lock.json...
    del /q "package-lock.json" >nul 2>&1
)
if exist "client\package-lock.json" (
    echo 正在删除客户端package-lock.json...
    del /q "client\package-lock.json" >nul 2>&1
)
echo 依赖清理完成。
echo.

echo [3/5] 清理数据文件...
if exist "server\data" (
    echo 正在删除数据目录...
    rmdir /s /q "server\data" >nul 2>&1
)
if exist ".env" (
    echo 正在删除环境配置文件...
    del /q ".env" >nul 2>&1
)
echo 数据清理完成。
echo.

echo [4/5] 清理日志和临时文件...
if exist "*.log" (
    echo 正在删除日志文件...
    del /q "*.log" >nul 2>&1
)
if exist "client\build" (
    echo 正在删除构建文件...
    rmdir /s /q "client\build" >nul 2>&1
)
echo 临时文件清理完成。
echo.

echo [5/5] 准备删除项目目录...
echo.
echo ⚠️  警告：即将删除整个项目目录！
echo 项目路径：%CD%
echo.
set /p confirm="确定要完全删除此项目吗？(输入 YES 确认): "
if /i "%confirm%"=="YES" (
    echo.
    echo 正在删除项目目录...
    cd ..
    rmdir /s /q "web-panel" >nul 2>&1
    echo.
    echo ✅ Web管理面板已完全卸载！
    echo 项目目录已删除。
    pause
) else (
    echo.
    echo ❌ 卸载已取消。
    echo 项目文件保持不变。
    pause
)
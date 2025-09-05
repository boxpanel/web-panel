@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM Web Panel Windows 自动安装脚本
REM 适用于Windows环境的非交互式安装

echo 🚀 Web Panel Windows 自动安装程序
echo ================================

REM 默认配置
if "%WEB_PORT%"=="" set WEB_PORT=8080
if "%ADMIN_USER%"=="" set ADMIN_USER=admin
if "%ADMIN_PASS%"=="" set ADMIN_PASS=admin123
if "%DB_TYPE%"=="" set DB_TYPE=sqlite

REM 生成JWT密钥
for /f %%i in ('powershell -command "Get-Random"') do set RANDOM_NUM=%%i
set JWT_SECRET=web-panel-%RANDOM_NUM%-fallback

echo [INFO] 使用配置:
echo   端口: %WEB_PORT%
echo   管理员: %ADMIN_USER%
echo   数据库: %DB_TYPE%
echo.

REM 检查Go环境
echo [INFO] 检查Go环境...
go version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到Go环境，请先安装Go 1.19或更高版本
    echo [INFO] 下载地址: https://golang.org/doc/install
    pause
    exit /b 1
)

for /f "tokens=3" %%i in ('go version') do (
    echo [SUCCESS] 找到Go版本: %%i
)
echo.

REM 安装依赖
echo [INFO] 安装Go依赖...
if "%1"=="--china" (
    set GOPROXY=https://goproxy.cn,direct
    echo [INFO] 使用中国镜像源
)

go mod tidy
if errorlevel 1 (
    echo [ERROR] 依赖安装失败
    pause
    exit /b 1
)
echo [SUCCESS] 依赖安装完成
echo.

REM 构建应用
echo [INFO] 构建Web Panel...
set CGO_ENABLED=0
go build -ldflags "-s -w" -o web-panel.exe cmd/main.go
if errorlevel 1 (
    echo [ERROR] 构建失败
    pause
    exit /b 1
)
echo [SUCCESS] 构建完成
echo.

REM 创建必要目录
echo [INFO] 创建配置文件...
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "uploads" mkdir uploads

REM 创建配置文件
(
echo # Web Panel 配置文件
echo PORT=%WEB_PORT%
echo HOST=0.0.0.0
echo.
echo # 安全配置
echo JWT_SECRET=%JWT_SECRET%
echo JWT_EXPIRES_IN=24h
echo.
echo # 数据库配置
echo DB_TYPE=%DB_TYPE%
echo DB_PATH=./data/database.sqlite
echo.
echo # 文件上传配置
echo UPLOAD_PATH=./uploads
echo MAX_UPLOAD_SIZE=10485760
echo.
echo # 日志配置
echo LOG_LEVEL=info
echo LOG_PATH=./logs
echo.
echo # 其他配置
echo ENABLE_CORS=true
echo ENABLE_GZIP=true
echo.
echo # 管理员账号（首次启动时创建）
echo ADMIN_USER=%ADMIN_USER%
echo ADMIN_PASS=%ADMIN_PASS%
) > .env

echo [SUCCESS] 配置文件已创建
echo.

REM 创建启动脚本
echo [INFO] 创建启动脚本...
(
echo @echo off
echo chcp 65001 ^>nul
echo echo 🚀 启动Web Panel...
echo web-panel.exe
echo pause
) > start.bat

REM 创建后台启动脚本
(
echo @echo off
echo chcp 65001 ^>nul
echo echo 🚀 后台启动Web Panel...
echo start /b web-panel.exe ^> logs/app.log 2^>^&1
echo echo Web Panel已在后台启动
echo echo 访问地址: http://localhost:%WEB_PORT%
echo echo 日志文件: logs/app.log
echo pause
) > start-background.bat

echo [SUCCESS] 启动脚本已创建
echo.

REM 显示安装信息
echo.
echo 🎉 Web Panel Windows 自动安装完成！
echo.
echo 📍 访问地址: http://localhost:%WEB_PORT%
echo 👤 管理员账号: %ADMIN_USER% / %ADMIN_PASS%
echo 💾 数据库类型: %DB_TYPE%
echo.
echo 🔧 启动方式:
echo   前台启动: start.bat 或 web-panel.exe
echo   后台启动: start-background.bat
echo   直接启动: web-panel.exe
echo.
echo 📁 安装目录: %CD%
echo ⚙️  配置文件: %CD%\.env
echo.
echo 按任意键启动Web Panel...
pause >nul

REM 启动服务
echo [INFO] 启动Web Panel...
start web-panel.exe
echo.
echo Web Panel已启动，请在浏览器中访问: http://localhost:%WEB_PORT%
echo.
pause
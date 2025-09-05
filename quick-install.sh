#!/bin/bash

# Web Panel 快速安装脚本
# 最小化安装，适用于快速部署

set -e

echo "🚀 Web Panel 快速安装开始..."

# 检查Go环境
if ! command -v go >/dev/null 2>&1; then
    echo "❌ 未找到Go环境，请先安装Go 1.19+"
    echo "📥 下载地址: https://golang.org/doc/install"
    exit 1
fi

echo "✅ Go环境检查通过"

# 设置中国镜像源（如果在中国）
if [[ "$1" == "--china" ]]; then
    export GOPROXY=https://goproxy.cn,direct
    echo "🇨🇳 使用中国镜像源"
fi

# 安装依赖
echo "📦 安装Go依赖..."
go mod tidy >/dev/null 2>&1

# 构建后端
echo "🔨 构建后端服务..."
export CGO_ENABLED=0

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    go build -ldflags "-s -w" -o web-panel.exe cmd/main.go
    EXEC_FILE="./web-panel.exe"
else
    go build -ldflags "-s -w" -o web-panel cmd/main.go
    EXEC_FILE="./web-panel"
fi

# 创建必要目录
mkdir -p data logs uploads

# 创建基本配置
if [[ ! -f ".env" ]]; then
    cat > .env << EOF
PORT=8080
JWT_SECRET=web-panel-secret-$(date +%s)
DB_PATH=./data/database.sqlite
UPLOAD_PATH=./uploads
LOG_LEVEL=info
EOF
    echo "⚙️  已创建配置文件"
fi

echo ""
echo "🎉 安装完成！"
echo "📍 访问地址: http://localhost:8080"
echo "👤 默认账号: admin / admin123"
echo ""
echo "🚀 启动服务..."
echo "按 Ctrl+C 停止服务"
echo ""

# 启动服务
"$EXEC_FILE"
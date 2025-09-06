#!/bin/bash

# Web Panel 自动安装脚本（非交互式）
# 适用于自动化部署，无需用户输入

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 默认配置
WEB_PORT=${WEB_PORT:-8080}
ADMIN_USER=${ADMIN_USER:-admin}
ADMIN_PASS=${ADMIN_PASS:-admin123}
DB_TYPE=${DB_TYPE:-sqlite}
JWT_SECRET="web-panel-$(date +%s)-$(openssl rand -hex 16 2>/dev/null || echo 'fallback')"
INSTALL_DIR=${INSTALL_DIR:-/opt/webpanel}
DATA_DIR=${DATA_DIR:-/opt/webpanel_data}
BACKUP_DIR=${BACKUP_DIR:-/opt/webpanel_backup}
SERVICE_NAME=${SERVICE_NAME:-webpanel}
USER_NAME=${USER_NAME:-webpanel}

# 检查系统
check_system() {
    log_info "检查系统环境..."
    
    # 检查操作系统
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="darwin"
    else
        log_error "不支持的操作系统: $OSTYPE"
        exit 1
    fi
    
    # 检查架构
    ARCH=$(uname -m)
    case $ARCH in
        x86_64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *) log_error "不支持的架构: $ARCH"; exit 1 ;;
    esac
    
    log_success "系统: $OS/$ARCH"
}

# 安装Go环境
install_go() {
    log_info "安装Go环境..."
    
    GO_VERSION="1.21.5"
    GO_TAR="go${GO_VERSION}.${OS}-${ARCH}.tar.gz"
    GO_URL="https://golang.org/dl/${GO_TAR}"
    
    # 使用中国镜像源
    if [[ "$1" == "--china" ]]; then
        GO_URL="https://golang.google.cn/dl/${GO_TAR}"
    fi
    
    # 下载并安装Go
    cd /tmp
    log_info "下载Go ${GO_VERSION}..."
    
    if command -v wget >/dev/null 2>&1; then
        wget -q "$GO_URL" || { log_error "下载失败"; exit 1; }
    elif command -v curl >/dev/null 2>&1; then
        curl -sL "$GO_URL" -o "$GO_TAR" || { log_error "下载失败"; exit 1; }
    else
        log_error "需要wget或curl来下载Go"
        exit 1
    fi
    
    # 移除旧版本并安装新版本
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf "$GO_TAR"
    
    # 设置环境变量
    export PATH=/usr/local/go/bin:$PATH
    
    # 添加到profile
    if ! grep -q "/usr/local/go/bin" ~/.bashrc 2>/dev/null; then
        echo 'export PATH=/usr/local/go/bin:$PATH' >> ~/.bashrc
    fi
    
    if ! grep -q "/usr/local/go/bin" ~/.profile 2>/dev/null; then
        echo 'export PATH=/usr/local/go/bin:$PATH' >> ~/.profile
    fi
    
    rm -f "$GO_TAR"
    log_success "Go ${GO_VERSION} 安装完成"
}

# 检查Go环境
check_go() {
    log_info "检查Go环境..."
    
    # 检查Go是否存在且可执行
    if command -v go >/dev/null 2>&1; then
        # 测试Go是否能正常执行
        if go version >/dev/null 2>&1; then
            GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
            log_success "找到Go版本: $GO_VERSION"
            return 0
        else
            log_warning "Go存在但无法执行，可能是架构不匹配"
        fi
    fi
    
    # Go不存在或无法执行，需要安装
    log_info "需要安装Go环境"
    install_go "$1"
    
    # 重新检查
    if ! go version >/dev/null 2>&1; then
        log_error "Go安装失败，请手动安装Go 1.19或更高版本"
        log_info "安装指南: https://golang.org/doc/install"
        exit 1
    fi
    
    GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
    log_success "Go ${GO_VERSION} 已就绪"
}

# 使用当前用户（不创建系统用户）
setup_user() {
    log_info "使用当前用户运行服务..."
    USER_NAME=$(whoami)
    log_success "将使用用户: $USER_NAME"
}

# 安装依赖
install_dependencies() {
    log_info "安装Go依赖..."
    
    # 设置Go代理（中国用户）
    if [[ "$1" == "--china" ]]; then
        export GOPROXY=https://goproxy.cn,direct
        log_info "使用中国镜像源"
    fi
    
    go mod tidy
    log_success "依赖安装完成"
}

# 构建应用
build_app() {
    log_info "构建Web Panel..."
    
    # 构建后端
    export CGO_ENABLED=0
    
    if [[ "$OS" == "linux" ]]; then
        go build -ldflags "-s -w" -o web-panel cmd/main.go
        EXEC_FILE="./web-panel"
    else
        go build -ldflags "-s -w" -o web-panel.exe cmd/main.go
        EXEC_FILE="./web-panel.exe"
    fi
    
    chmod +x $EXEC_FILE
    log_success "构建完成"
}

# 创建配置和目录
setup_config() {
    log_info "创建配置文件..."
    
    # 创建必要目录
    mkdir -p "$DATA_DIR" "$BACKUP_DIR" "$DATA_DIR/logs" "$DATA_DIR/uploads"
    
    # 创建配置文件
    cat > .env << EOF
# Web Panel 配置文件
PORT=$WEB_PORT
HOST=0.0.0.0

# 安全配置
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h

# 数据库配置
DB_TYPE=$DB_TYPE
DB_PATH=$DATA_DIR/database.sqlite

# 文件上传配置
UPLOAD_PATH=$DATA_DIR/uploads
MAX_UPLOAD_SIZE=10485760

# 日志配置
LOG_LEVEL=info
LOG_PATH=$DATA_DIR/logs

# 备份配置
BACKUP_PATH=$BACKUP_DIR

# 其他配置
ENABLE_CORS=true
ENABLE_GZIP=true

# 管理员账号（首次启动时创建）
ADMIN_USER=$ADMIN_USER
ADMIN_PASS=$ADMIN_PASS
EOF
    
    log_success "配置文件已创建"
}

# 创建systemd服务（仅Linux root用户）
create_service() {
    if [[ "$EUID" -eq 0 ]] && [[ "$OS" == "linux" ]] && command -v systemctl >/dev/null 2>&1; then
        log_info "创建系统服务..."
        
        cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Web Panel Service
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/web-panel
Restart=always
RestartSec=5
EnvironmentFile=$INSTALL_DIR/.env

[Install]
WantedBy=multi-user.target
EOF
        
        # 使用当前用户，无需设置权限
        
        # 重载systemd
        systemctl daemon-reload
        systemctl enable "$SERVICE_NAME"
        
        log_success "系统服务已创建"
    else
        log_info "跳过系统服务创建（非root用户或非Linux系统）"
    fi
}

# 启动服务
start_service() {
    if [[ "$EUID" -eq 0 ]] && [[ "$OS" == "linux" ]] && command -v systemctl >/dev/null 2>&1; then
        log_info "启动Web Panel服务..."
        systemctl start "$SERVICE_NAME"
        sleep 2
        
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            log_success "服务启动成功"
        else
            log_warning "服务启动可能失败，请检查日志"
        fi
    else
        log_info "手动启动Web Panel..."
        log_info "请运行: $EXEC_FILE"
    fi
}

# 显示安装信息
show_info() {
    echo ""
    echo "🎉 Web Panel 自动安装完成！"
    echo ""
    echo "📍 访问地址: http://localhost:$WEB_PORT"
    echo "👤 管理员账号: $ADMIN_USER / $ADMIN_PASS"
    echo "💾 数据库类型: $DB_TYPE"
    echo ""
    
    if [[ "$EUID" -eq 0 ]] && [[ "$OS" == "linux" ]]; then
        echo "🔧 管理命令:"
        echo "  启动服务: systemctl start $SERVICE_NAME"
        echo "  停止服务: systemctl stop $SERVICE_NAME"
        echo "  重启服务: systemctl restart $SERVICE_NAME"
        echo "  查看状态: systemctl status $SERVICE_NAME"
        echo "  查看日志: journalctl -u $SERVICE_NAME -f"
    else
        if [[ "$OS" == "linux" ]]; then
            echo "🔧 启动命令:"
            echo "  启动服务: $INSTALL_DIR/web-panel"
            echo "  后台运行: nohup $INSTALL_DIR/web-panel > $DATA_DIR/logs/app.log 2>&1 &"
        else
            echo "🔧 启动命令:"
            echo "  启动服务: $INSTALL_DIR/web-panel.exe"
            echo "  后台运行: nohup $INSTALL_DIR/web-panel.exe > $DATA_DIR/logs/app.log 2>&1 &"
        fi
    fi
    
    echo ""
    echo "📁 安装目录: $INSTALL_DIR"
    echo "📁 数据目录: $DATA_DIR"
    echo "📁 备份目录: $BACKUP_DIR"
    echo "⚙️  配置文件: $INSTALL_DIR/.env"
    echo "📊 数据库文件: $DATA_DIR/database.sqlite"
    echo "📝 日志目录: $DATA_DIR/logs"
    echo "📤 上传目录: $DATA_DIR/uploads"
    echo ""
}

# 安装文件到目标目录
install_files() {
    log_info "安装文件到目标目录..."
    
    # 创建安装目录
    mkdir -p "$INSTALL_DIR"
    
    # 复制可执行文件
    if [[ "$OS" == "linux" ]]; then
        cp web-panel "$INSTALL_DIR/"
        chmod +x "$INSTALL_DIR/web-panel"
    else
        cp web-panel.exe "$INSTALL_DIR/"
        chmod +x "$INSTALL_DIR/web-panel.exe"
    fi
    
    # 复制配置文件
    cp .env "$INSTALL_DIR/"
    
    # 设置目录权限
    chmod 755 "$INSTALL_DIR" 2>/dev/null || true
    chmod 755 "$DATA_DIR" "$BACKUP_DIR" 2>/dev/null || true
    # 使用当前用户，无需chown
    
    log_success "文件安装完成"
}

# 主函数
main() {
    echo "🚀 Web Panel 自动安装程序"
    echo "================================"
    
    # 显示配置信息
    log_info "使用配置:"
    echo "  安装目录: $INSTALL_DIR"
    echo "  数据目录: $DATA_DIR"
    echo "  备份目录: $BACKUP_DIR"
    echo "  端口: $WEB_PORT"
    echo "  管理员: $ADMIN_USER"
    echo "  数据库: $DB_TYPE"
    echo "  服务名称: $SERVICE_NAME"
    
    check_system
    check_go "$1"
    setup_user
    install_dependencies "$1"
    build_app
    setup_config
    install_files
    create_service
    start_service
    show_info
}

# 处理参数
case "$1" in
    --help|-h)
        echo "用法: $0 [选项]"
        echo "选项:"
        echo "  --china      使用中国镜像源"
        echo "  --help, -h   显示帮助信息"
        echo ""
        echo "环境变量:"
        echo "  WEB_PORT     Web服务端口 (默认: 8080)"
        echo "  ADMIN_USER   管理员用户名 (默认: admin)"
        echo "  ADMIN_PASS   管理员密码 (默认: admin123)"
        echo "  DB_TYPE      数据库类型 (默认: sqlite)"
        ;;
    *)
        main "$1"
        ;;
esac
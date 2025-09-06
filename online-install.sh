#!/bin/bash

# Web Panel 在线安装脚本
# 支持从GitHub直接下载和安装

set -e

# 配置
REPO_URL="https://github.com/boxpanel/web-panel"
INSTALL_DIR="/opt/web-panel"
SERVICE_NAME="web-panel"
USER="webpanel"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "此脚本需要root权限运行"
        print_status "请使用: sudo $0"
        exit 1
    fi
}

# 检查系统
check_system() {
    print_status "检查系统环境..."
    
    # 检查操作系统
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="darwin"
    else
        print_error "不支持的操作系统: $OSTYPE"
        exit 1
    fi
    
    # 检查架构
    ARCH=$(uname -m)
    case $ARCH in
        x86_64) ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *) print_error "不支持的架构: $ARCH"; exit 1 ;;
    esac
    
    print_success "系统: $OS/$ARCH"
}

# 安装依赖
install_dependencies() {
    print_status "安装系统依赖..."
    
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y curl wget unzip sudo systemd
    elif command -v yum >/dev/null 2>&1; then
        yum update -y
        yum install -y curl wget unzip sudo systemd
    elif command -v apk >/dev/null 2>&1; then
        apk update
        apk add curl wget unzip sudo openrc
    else
        print_warning "无法自动安装依赖，请手动安装: curl, wget, unzip, sudo"
    fi
}

# 使用当前用户（不创建系统用户）
setup_user() {
    print_status "使用当前用户运行服务..."
    USER=$(whoami)
    print_success "将使用用户: $USER"
}

# 用户配置收集
collect_user_config() {
    print_status "配置Web Panel..."
    
    # 收集端口号
    read -p "请输入Web Panel端口号 [默认: 8080]: " WEB_PORT
    WEB_PORT=${WEB_PORT:-8080}
    
    # 收集管理员账号
    read -p "请输入管理员用户名 [默认: admin]: " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}
    
    # 收集管理员密码
    while true; do
        read -s -p "请输入管理员密码: " ADMIN_PASS
        echo
        read -s -p "请确认管理员密码: " ADMIN_PASS_CONFIRM
        echo
        if [[ "$ADMIN_PASS" == "$ADMIN_PASS_CONFIRM" ]]; then
            break
        else
            print_error "密码不匹配，请重新输入"
        fi
    done
    
    # 使用SQLite数据库（无需额外配置）
    DB_TYPE="sqlite"
    print_status "数据库类型: SQLite (./data/database.sqlite)"
    
    print_success "配置收集完成"
}

# 下载和安装
install_webpanel() {
    print_status "下载Web Panel源码..."
    
    # 安装依赖
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y git golang-go
    elif command -v yum >/dev/null 2>&1; then
        yum install -y git golang
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y git golang
    else
        print_error "不支持的包管理器，请手动安装 git, golang"
        exit 1
    fi
    
    # 创建安装目录
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # 克隆源码
    print_status "克隆源码仓库..."
    if [ -d ".git" ]; then
        print_status "检测到已存在的Git仓库，更新代码..."
        git fetch origin
        git reset --hard origin/main
    else
        if [ "$(ls -A .)" ]; then
            print_status "目录不为空，清理后重新克隆..."
            rm -rf ./*
        fi
        git clone "$REPO_URL" .
    fi
    
    # 构建后端
    print_status "构建Go后端..."
    # 确保在项目根目录
    cd "$INSTALL_DIR"
    go mod tidy
    go build -o web-panel cmd/main.go
    
    # 注意：此脚本专注于Go后端构建，不包含前端构建
    # 如需前端功能，请手动构建或使用完整版安装脚本
    
    # 设置权限
    chmod +x web-panel
    # 使用当前用户，无需chown
    
    print_success "Web Panel构建完成"
}

# 创建配置文件
create_config() {
    print_status "创建配置文件..."
    
    # 生成JWT密钥
    JWT_SECRET="web-panel-$(openssl rand -hex 32)"
    
    # 生成SQLite配置文件
    cat > "$INSTALL_DIR/.env" << EOF
PORT=$WEB_PORT
JWT_SECRET=$JWT_SECRET
DB_TYPE=sqlite
DB_PATH=$INSTALL_DIR/data/database.sqlite
UPLOAD_PATH=$INSTALL_DIR/uploads
LOG_LEVEL=info
ADMIN_USER=$ADMIN_USER
ADMIN_PASS=$ADMIN_PASS
EOF
    
    # 创建必要目录
    mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/logs" "$INSTALL_DIR/uploads"
    # 使用当前用户，无需chown
    
    print_success "配置文件已创建"
}

# 创建systemd服务
create_service() {
    print_status "创建系统服务..."
    
    cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Web Panel Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/web-panel
Restart=always
RestartSec=5
EnvironmentFile=$INSTALL_DIR/.env

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    print_success "系统服务已创建"
}

# 配置防火墙
setup_firewall() {
    print_status "配置防火墙..."
    
    if command -v ufw >/dev/null 2>&1; then
        ufw allow 8080/tcp
        print_success "UFW防火墙规则已添加"
    elif command -v firewall-cmd >/dev/null 2>&1; then
        firewall-cmd --permanent --add-port=8080/tcp
        firewall-cmd --reload
        print_success "Firewalld防火墙规则已添加"
    else
        print_warning "请手动配置防火墙，开放8080端口"
    fi
}

# 启动服务
start_service() {
    print_status "启动Web Panel服务..."
    
    systemctl start "$SERVICE_NAME"
    sleep 3
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Web Panel服务启动成功"
    else
        print_error "Web Panel服务启动失败"
        systemctl status "$SERVICE_NAME"
        exit 1
    fi
}

# 显示安装信息
show_info() {
    echo ""
    echo "🎉 Web Panel 安装完成！"
    echo ""
    echo "📍 访问地址: http://$(hostname -I | awk '{print $1}'):$WEB_PORT"
    echo "👤 管理员账号: $ADMIN_USER / $ADMIN_PASS"
    echo "💾 数据库类型: $DB_TYPE"
    echo ""
    echo "🔧 管理命令:"
    echo "  启动服务: systemctl start $SERVICE_NAME"
    echo "  停止服务: systemctl stop $SERVICE_NAME"
    echo "  重启服务: systemctl restart $SERVICE_NAME"
    echo "  查看状态: systemctl status $SERVICE_NAME"
    echo "  查看日志: journalctl -u $SERVICE_NAME -f"
    echo ""
    echo "📁 安装目录: $INSTALL_DIR"
    echo "⚙️  配置文件: $INSTALL_DIR/.env"
    echo ""
}

# 主函数
main() {
    echo "🚀 Web Panel 在线安装程序"
    echo "================================"
    
    check_root
    check_system
    collect_user_config
    install_dependencies
    setup_user
    install_webpanel
    create_config
    create_service
    setup_firewall
    start_service
    show_info
}

# 处理参数
case "$1" in
    --uninstall)
        print_status "卸载Web Panel..."
        systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        rm -f "/etc/systemd/system/$SERVICE_NAME.service"
        rm -rf "$INSTALL_DIR"
        userdel "$USER" 2>/dev/null || true
        systemctl daemon-reload
        print_success "Web Panel已卸载"
        ;;
    --help|-h)
        echo "用法: $0 [选项]"
        echo "选项:"
        echo "  --uninstall  卸载Web Panel"
        echo "  --help, -h   显示帮助信息"
        ;;
    *)
        main
        ;;
esac
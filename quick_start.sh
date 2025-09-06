#!/bin/bash

# Web Panel 快速安装脚本
# 参考1Panel的安装方式，提供更好的兼容性和用户体验

set -e

# 配置
REPO_URL="https://github.com/boxpanel/web-panel"
INSTALL_DIR="/opt/web-panel"
SERVICE_NAME="web-panel"
USER="webpanel"
MIN_GO_VERSION="1.22.3"

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

# 显示欢迎信息
show_banner() {
    echo -e "${GREEN}"
    echo "================================================="
    echo "         Web Panel 快速安装脚本"
    echo "         现代化的Linux服务器管理面板"
    echo "================================================="
    echo -e "${NC}"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "此脚本需要root权限运行"
        print_status "请使用: sudo bash $0"
        exit 1
    fi
}

# 检查系统环境
check_system() {
    print_status "检查系统环境..."
    
    # 检查操作系统
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
        print_status "检测到系统: $OS $VER"
    else
        print_error "无法检测操作系统版本"
        exit 1
    fi
    
    # 检查架构
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            ARCH="amd64"
            ;;
        aarch64)
            ARCH="arm64"
            ;;
        armv7l)
            ARCH="armv7"
            ;;
        *)
            print_error "不支持的系统架构: $ARCH"
            exit 1
            ;;
    esac
    print_status "系统架构: $ARCH"
    
    # 检查内存
    MEMORY=$(free -m | awk 'NR==2{printf "%.0f", $2/1024}')
    if [ "$MEMORY" -lt 1 ]; then
        print_warning "系统内存不足1GB，可能影响运行性能"
    fi
    print_status "可用内存: ${MEMORY}GB"
}

# 安装系统依赖
install_dependencies() {
    print_status "安装系统依赖..."
    
    if command -v apt-get >/dev/null 2>&1; then
        # Debian/Ubuntu
        apt-get update
        apt-get install -y curl wget git build-essential
    elif command -v yum >/dev/null 2>&1; then
        # CentOS/RHEL
        yum update -y
        yum install -y curl wget git gcc gcc-c++ make
    elif command -v dnf >/dev/null 2>&1; then
        # Fedora
        dnf update -y
        dnf install -y curl wget git gcc gcc-c++ make
    else
        print_error "不支持的包管理器"
        exit 1
    fi
}

# 检查和安装Go
check_install_go() {
    print_status "检查Go环境..."
    
    if command -v go >/dev/null 2>&1; then
        GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
        print_status "检测到Go版本: $GO_VERSION"
        
        # 简单版本比较
        if [[ "$GO_VERSION" < "$MIN_GO_VERSION" ]]; then
            print_warning "Go版本过低，需要升级到 $MIN_GO_VERSION 或更高版本"
            install_go
        else
            print_success "Go版本满足要求"
        fi
    else
        print_status "未检测到Go，开始安装..."
        install_go
    fi
}

# 安装Go
install_go() {
    print_status "安装Go $MIN_GO_VERSION..."
    
    # 下载Go
    GO_TAR="go${MIN_GO_VERSION}.linux-${ARCH}.tar.gz"
    GO_URL="https://golang.org/dl/${GO_TAR}"
    
    cd /tmp
    wget -O "$GO_TAR" "$GO_URL"
    
    # 安装Go
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "$GO_TAR"
    
    # 设置环境变量
    if ! grep -q "/usr/local/go/bin" /etc/profile; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
    fi
    
    export PATH=$PATH:/usr/local/go/bin
    
    # 验证安装
    if command -v go >/dev/null 2>&1; then
        print_success "Go安装成功: $(go version)"
    else
        print_error "Go安装失败"
        exit 1
    fi
    
    # 清理
    rm -f "/tmp/$GO_TAR"
}

# 创建用户
create_user() {
    print_status "创建系统用户..."
    
    if ! id "$USER" &>/dev/null; then
        useradd -r -s /bin/false -d "$INSTALL_DIR" "$USER"
        print_success "用户 $USER 创建成功"
    else
        print_status "用户 $USER 已存在"
    fi
}

# 下载和构建应用
install_application() {
    print_status "下载和构建应用..."
    
    # 创建安装目录
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # 配置Git安全目录
    git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
    
    # 克隆或更新代码
    if [ -d ".git" ]; then
        print_status "更新现有代码..."
        git fetch origin
        git reset --hard origin/main
    else
        if [ "$(ls -A .)" ]; then
            print_status "清理目录..."
            rm -rf ./*
        fi
        print_status "克隆代码仓库..."
        git clone "$REPO_URL" .
    fi
    
    # 构建应用
    print_status "构建Go应用..."
    export PATH=$PATH:/usr/local/go/bin
    go mod tidy
    go build -o web-panel cmd/main.go
    
    # 设置权限
    chmod +x web-panel
    chown -R "$USER:$USER" "$INSTALL_DIR"
    
    print_success "应用构建完成"
}

# 创建配置文件
create_config() {
    print_status "创建配置文件..."
    
    # 创建数据目录
    mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/uploads" "$INSTALL_DIR/logs"
    
    # 生成JWT密钥
    JWT_SECRET="web-panel-$(openssl rand -hex 32)"
    
    # 创建配置文件
    cat > "$INSTALL_DIR/.env" << EOF
PORT=8080
JWT_SECRET=$JWT_SECRET
DB_TYPE=sqlite
DB_PATH=$INSTALL_DIR/data/database.sqlite
UPLOAD_PATH=$INSTALL_DIR/uploads
LOG_LEVEL=info
LOG_PATH=$INSTALL_DIR/logs
EOF
    
    # 设置权限
    chown "$USER:$USER" "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
    
    print_success "配置文件创建完成"
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
Group=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/web-panel
Restart=always
RestartSec=5
EnvironmentFile=$INSTALL_DIR/.env

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF
    
    # 重载systemd并启用服务
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    print_success "系统服务创建完成"
}

# 启动服务
start_service() {
    print_status "启动Web Panel服务..."
    
    systemctl start "$SERVICE_NAME"
    
    # 等待服务启动
    sleep 3
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Web Panel服务启动成功"
    else
        print_error "Web Panel服务启动失败"
        print_status "查看日志: journalctl -u $SERVICE_NAME -f"
        exit 1
    fi
}

# 显示安装结果
show_result() {
    print_success "Web Panel安装完成！"
    echo
    echo -e "${GREEN}访问信息:${NC}"
    echo -e "  URL: ${BLUE}http://$(hostname -I | awk '{print $1}'):8080${NC}"
    echo -e "  默认用户名: ${BLUE}admin${NC}"
    echo -e "  默认密码: ${BLUE}admin123${NC}"
    echo
    echo -e "${GREEN}管理命令:${NC}"
    echo -e "  启动服务: ${BLUE}systemctl start $SERVICE_NAME${NC}"
    echo -e "  停止服务: ${BLUE}systemctl stop $SERVICE_NAME${NC}"
    echo -e "  重启服务: ${BLUE}systemctl restart $SERVICE_NAME${NC}"
    echo -e "  查看状态: ${BLUE}systemctl status $SERVICE_NAME${NC}"
    echo -e "  查看日志: ${BLUE}journalctl -u $SERVICE_NAME -f${NC}"
    echo
    echo -e "${YELLOW}注意事项:${NC}"
    echo -e "  - 请及时修改默认密码"
    echo -e "  - 确保防火墙允许8080端口访问"
    echo -e "  - 配置文件位置: $INSTALL_DIR/.env"
}

# 主函数
main() {
    show_banner
    check_root
    check_system
    install_dependencies
    check_install_go
    create_user
    install_application
    create_config
    create_service
    start_service
    show_result
}

# 执行主函数
main "$@"
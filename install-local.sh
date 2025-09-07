#!/bin/bash

# Web Panel ARM64 本地安装脚本
# 适用于无法访问GitHub releases的情况
# 支持从本地HTTP服务器下载

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
VERSION="v1.0.5"
BINARY_NAME="web-panel-v1.0.4-linux-arm64"
TAR_FILE="web-panel-v1.0.5-linux-arm64.tar.gz"
SERVER_URL="${SERVER_URL:-}"

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

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要root权限运行"
        log_info "请使用: sudo $0"
        exit 1
    fi
}

# 检查系统架构
check_architecture() {
    local arch=$(uname -m)
    case $arch in
        aarch64|arm64)
            log_info "检测到ARM64架构: $arch"
            ;;
        *)
            log_error "不支持的架构: $arch"
            log_error "此脚本仅支持ARM64架构"
            exit 1
            ;;
    esac
}

# 检查操作系统
check_os() {
    if [[ ! -f /etc/os-release ]]; then
        log_error "无法检测操作系统"
        exit 1
    fi
    
    source /etc/os-release
    log_info "操作系统: $PRETTY_NAME"
    
    # 检查是否为支持的Linux发行版
    case $ID in
        ubuntu|debian|centos|rhel|fedora|opensuse*|sles)
            log_info "支持的操作系统: $ID"
            ;;
        *)
            log_warning "未测试的操作系统: $ID，继续安装可能遇到问题"
            ;;
    esac
}

# 安装依赖
install_dependencies() {
    log_info "安装必要依赖..."
    
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y curl wget tar systemd
    elif command -v yum >/dev/null 2>&1; then
        yum install -y curl wget tar systemd
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y curl wget tar systemd
    elif command -v zypper >/dev/null 2>&1; then
        zypper install -y curl wget tar systemd
    else
        log_error "无法检测包管理器，请手动安装: curl, wget, tar, systemd"
        exit 1
    fi
}

# 下载二进制文件
download_binary() {
    local download_url
    
    if [[ -n "$SERVER_URL" ]]; then
        download_url="$SERVER_URL/temp-release/$TAR_FILE"
        log_info "从本地服务器下载: $download_url"
    else
        log_error "未指定服务器URL"
        log_error "请设置环境变量 SERVER_URL，例如:"
        log_error "  export SERVER_URL=http://192.168.1.100:8080"
        log_error "  curl -fsSL http://192.168.1.100:8080/install-local.sh | bash"
        exit 1
    fi
    
    log_info "下载ARM64二进制包..."
    cd "/tmp"
    
    # 尝试下载
    if ! curl -fsSL "$download_url" -o "$TAR_FILE"; then
        log_error "下载失败: $download_url"
        log_error "请检查:"
        log_error "  1. 服务器是否正在运行"
        log_error "  2. URL是否正确"
        log_error "  3. 网络连接是否正常"
        exit 1
    fi
    
    log_success "下载完成: $TAR_FILE"
}

# 下载并安装Web Panel
install_web_panel() {
    log_info "开始安装 Web Panel..."
    
    local install_dir="/opt/web-panel"
    local service_name="web-panel"
    local binary_name="web-panel"
    
    log_info "创建安装目录: $install_dir"
    mkdir -p "$install_dir"
    
    # 检查本地文件或下载
    if [[ -f "./web-panel-v1.0.5-linux-arm64.tar.gz" ]]; then
        log_info "发现本地二进制包，直接使用"
        cp "./web-panel-v1.0.5-linux-arm64.tar.gz" "/tmp/"
    elif [[ -f "./temp-release/web-panel-v1.0.5-linux-arm64.tar.gz" ]]; then
        log_info "发现本地二进制包，直接使用"
        cp "./temp-release/web-panel-v1.0.5-linux-arm64.tar.gz" "/tmp/"
    else
        download_binary
    fi
    
    log_info "解压二进制包..."
    cd "/tmp"
    if ! tar -xzf "$TAR_FILE"; then
        log_error "解压失败，文件可能损坏"
        exit 1
    fi
    
    log_info "安装二进制文件..."
    if [[ ! -f "$BINARY_NAME" ]]; then
        log_error "解压后未找到二进制文件: $BINARY_NAME"
        exit 1
    fi
    
    cp "$BINARY_NAME" "$install_dir/$binary_name"
    chmod +x "$install_dir/$binary_name"
    
    # 创建符号链接
    ln -sf "$install_dir/$binary_name" "/usr/local/bin/$binary_name"
    
    # 创建配置目录
    mkdir -p "/etc/web-panel"
    mkdir -p "/var/log/web-panel"
    mkdir -p "/var/lib/web-panel"
    
    # 创建systemd服务文件
    create_systemd_service "$install_dir" "$service_name" "$binary_name"
    
    log_success "Web Panel 安装完成"
}

# 创建systemd服务
create_systemd_service() {
    local install_dir="$1"
    local service_name="$2"
    local binary_name="$3"
    
    print_info "创建systemd服务..."
    
    sudo tee "/etc/systemd/system/${service_name}.service" > /dev/null <<EOF
[Unit]
Description=Web Panel Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
ExecStart=${install_dir}/${binary_name}
Restart=always
RestartSec=5
Environment=GIN_MODE=release
WorkingDirectory=${install_dir}
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${service_name}

[Install]
WantedBy=multi-user.target
EOF
    
    # 重新加载systemd
    sudo systemctl daemon-reload
    sudo systemctl enable "$service_name"
    
    print_success "systemd服务创建完成"
}

# 配置防火墙
configure_firewall() {
    print_info "配置防火墙..."
    
    local port="8080"
    
    if command -v firewall-cmd >/dev/null 2>&1; then
        print_info "使用firewalld配置防火墙..."
        sudo firewall-cmd --permanent --add-port="$port/tcp"
        sudo firewall-cmd --reload
        print_success "防火墙规则已添加: $port/tcp"
    elif command -v ufw >/dev/null 2>&1; then
        print_info "使用ufw配置防火墙..."
        sudo ufw allow "$port/tcp"
        print_success "防火墙规则已添加: $port/tcp"
    else
        print_warning "未检测到防火墙管理工具"
        print_warning "请手动开放端口 $port/tcp"
    fi
}

# 启动服务
start_service() {
    local service_name="web-panel"
    
    print_info "启动Web Panel服务..."
    
    sudo systemctl start "$service_name"
    
    # 等待服务启动
    sleep 3
    
    if sudo systemctl is-active --quiet "$service_name"; then
        print_success "Web Panel服务启动成功"
        
        # 获取服务器IP
        local server_ip=$(hostname -I | awk '{print $1}')
        if [[ -z "$server_ip" ]]; then
            server_ip="localhost"
        fi
        
        echo
        print_success "=================================="
        print_success "Web Panel 安装完成！"
        print_success "=================================="
        print_info "访问地址: http://$server_ip:8080"
        print_info "默认用户名: admin"
        print_info "默认密码: admin123"
        print_success "=================================="
        echo
        print_info "服务管理命令:"
        print_info "  启动服务: sudo systemctl start web-panel"
        print_info "  停止服务: sudo systemctl stop web-panel"
        print_info "  重启服务: sudo systemctl restart web-panel"
        print_info "  查看状态: sudo systemctl status web-panel"
        print_info "  查看日志: sudo journalctl -u web-panel -f"
        echo
    else
        print_error "Web Panel服务启动失败"
        print_info "查看日志: sudo journalctl -u web-panel -n 50"
        exit 1
    fi
}

# 主函数
main() {
    echo
    log_info "=================================="
    log_info "Web Panel ARM64 本地安装脚本"
    log_info "=================================="
    echo
    
    check_root
    check_architecture
    check_os
    install_dependencies
    install_web_panel
    configure_firewall
    start_service
    
    log_success "安装完成！"
}

# 运行主函数
main "$@"
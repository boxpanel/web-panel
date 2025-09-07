#!/bin/bash

# Web Panel 在线安装脚本
# 支持从GitHub直接下载和安装

set -e

# 配置变量
REPO_URL="https://github.com/boxpanel/web-panel"
INSTALL_DIR="/opt/web-panel"
SERVICE_NAME="web-panel"
USER="web-panel"
PORT=8080
VERSION="latest"
CHINA_MIRROR="false"

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
        print_status "请使用: curl -sSL https://resource.fit2cloud.com/web-panel/installer/install.sh | sudo bash"
        print_status "或者: sudo bash install.sh"
        exit 1
    fi
}

# 解析命令行参数 - 类似1Panel
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --china)
                CHINA_MIRROR="true"
                print_info "使用中国镜像源"
                shift
                ;;
            --skip-firewall)
                SKIP_FIREWALL="true"
                print_info "跳过防火墙配置"
                shift
                ;;
            --port)
                PORT="$2"
                print_info "设置端口: $PORT"
                shift 2
                ;;
            --version)
                VERSION="$2"
                print_info "指定版本: $VERSION"
                shift 2
                ;;
            -h|--help)
                show_install_help
                exit 0
                ;;
            *)
                print_warning "未知参数: $1"
                shift
                ;;
        esac
    done
}

# 显示安装帮助
show_install_help() {
    cat << EOF
Web Panel 安装脚本 - 基于1Panel标准

用法: bash install.sh [选项]

选项:
  --china           使用中国镜像源加速下载
  --skip-firewall   跳过防火墙配置
  --port PORT       指定服务端口 (默认: 8080)
  --version VER     指定安装版本 (默认: latest)
  -h, --help        显示帮助信息

示例:
  # 标准安装
  curl -sSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh | sudo bash
  
  # 使用中国镜像源
  curl -sSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh | sudo bash -s -- --china
  
  # 指定端口和版本
  sudo bash install.sh --port 9999 --version v1.2.0

EOF
}

# 检查系统环境
check_system() {
    print_status "检查系统环境..."
    
    # 检查操作系统 - 与1Panel保持一致
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
        print_status "检测到系统: $OS $VER"
        
        # 检查是否为支持的Linux发行版
        case $ID in
            ubuntu|debian|centos|rhel|fedora|opensuse|sles|kylin|uos|deepin)
                print_success "支持的操作系统: $ID"
                ;;
            *)
                print_warning "未经测试的操作系统: $ID，可能存在兼容性问题"
                ;;
        esac
    else
        print_error "无法检测操作系统版本，仅支持Linux系统"
        exit 1
    fi
    
    # 检查架构 - 与1Panel保持一致
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
        ppc64le)
            ARCH="ppc64le"
            ;;
        s390x)
            ARCH="s390x"
            ;;
        *)
            print_error "不支持的系统架构: $ARCH"
            print_error "支持的架构: x86_64, aarch64, armv7l, ppc64le, s390x"
            exit 1
            ;;
    esac
    print_status "系统架构: $ARCH"
    
    # 检查内存 - 与1Panel保持一致（1GB+）
    MEMORY=$(free -m | awk 'NR==2{printf "%.0f", $2/1024}')
    if [ "$MEMORY" -lt 1 ]; then
        print_error "系统内存不足1GB，无法安装"
        print_error "最低要求: 1GB 内存"
        exit 1
    fi
    print_success "内存检查通过: ${MEMORY}GB"
    
    # 检查磁盘空间
    DISK_SPACE=$(df -BG "$INSTALL_DIR" 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//' || echo "10")
    if [ "$DISK_SPACE" -lt 2 ]; then
        print_error "磁盘空间不足2GB，无法安装"
        exit 1
    fi
    print_success "磁盘空间检查通过: ${DISK_SPACE}GB"
    
    # 检查网络连接
    print_status "检查网络连接..."
    if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        print_warning "网络连接异常，可能影响安装过程"
    else
        print_success "网络连接正常"
    fi
}

# 安装系统依赖
install_dependencies() {
    print_status "检查和安装系统依赖..."
    
    # 检查必要命令（不再需要git和Go相关依赖）
    local missing_deps=()
    
    for cmd in curl wget tar; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [ ${#missing_deps[@]} -eq 0 ]; then
        print_success "所有必要依赖已安装"
        return
    fi
    
    print_status "安装缺失的依赖: ${missing_deps[*]}"
    
    if command -v apt-get >/dev/null 2>&1; then
        # Debian/Ubuntu
        apt-get update
        apt-get install -y "${missing_deps[@]}" systemd
    elif command -v yum >/dev/null 2>&1; then
        # CentOS/RHEL
        yum update -y
        yum install -y "${missing_deps[@]}" systemd
    elif command -v dnf >/dev/null 2>&1; then
        # Fedora
        dnf update -y
        dnf install -y "${missing_deps[@]}" systemd
    else
        print_error "不支持的包管理器，请手动安装: ${missing_deps[*]}"
        exit 1
    fi
    
    print_success "系统依赖安装完成"
}

# 创建用户
create_user() {
    print_status "创建系统用户..."
    
    # 检查用户是否已存在
    if id "$USER" >/dev/null 2>&1; then
        print_status "用户 $USER 已存在"
    else
        # 创建系统用户
        useradd -r -s /bin/false -d "$INSTALL_DIR" "$USER"
        print_success "用户 $USER 创建成功"
    fi
    
    # 设置目录权限
    mkdir -p "$INSTALL_DIR"
    chown -R "$USER":"$USER" "$INSTALL_DIR"
}

# 配置服务
configure_service() {
    print_status "配置Web Panel服务..."
    
    # 创建配置目录
    mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/logs" "$INSTALL_DIR/uploads"
    
    # 生成配置文件
    cat > "$INSTALL_DIR/config.yaml" << EOF
server:
  port: $PORT
  mode: release

database:
  type: sqlite
  path: $INSTALL_DIR/data/database.sqlite

log:
  level: info
  path: $INSTALL_DIR/logs

upload:
  path: $INSTALL_DIR/uploads
  max_size: 100MB

security:
  jwt_secret: $(openssl rand -hex 32)
  session_timeout: 24h
EOF
    
    # 设置权限
    chown -R "$USER":"$USER" "$INSTALL_DIR"
    chmod 755 "$INSTALL_DIR"
    chmod 644 "$INSTALL_DIR/config.yaml"
    
    print_success "服务配置完成"
}

# 继续原有的系统检查
check_legacy_system() {
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

# 设置用户
setup_user() {
    print_status "设置系统用户..."
    
    # 检查用户是否已存在
    if id "$USER" >/dev/null 2>&1; then
        print_status "用户 $USER 已存在"
    else
        # 创建系统用户
        useradd -r -s /bin/false -d "$INSTALL_DIR" "$USER"
        print_success "用户 $USER 创建成功"
    fi
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
    local password_attempts=0
    local max_attempts=3
    
    while [ $password_attempts -lt $max_attempts ]; do
        echo
        print_status "设置管理员密码 (尝试 $((password_attempts + 1))/$max_attempts)"
        
        # 清空变量
        ADMIN_PASS=""
        ADMIN_PASS_CONFIRM=""
        
        # 输入密码
        while [ -z "$ADMIN_PASS" ]; do
            read -s -p "请输入管理员密码 (至少6位): " ADMIN_PASS
            echo
            if [ ${#ADMIN_PASS} -lt 6 ]; then
                print_error "密码长度至少6位，请重新输入"
                ADMIN_PASS=""
            fi
        done
        
        # 确认密码
        read -s -p "请确认管理员密码: " ADMIN_PASS_CONFIRM
        echo
        
        # 验证密码
        if [ "$ADMIN_PASS" = "$ADMIN_PASS_CONFIRM" ] && [ -n "$ADMIN_PASS" ]; then
            print_success "密码设置成功"
            break
        else
            password_attempts=$((password_attempts + 1))
            if [ $password_attempts -lt $max_attempts ]; then
                print_error "密码不匹配或为空，请重新输入 (剩余尝试: $((max_attempts - password_attempts)))"
            else
                print_error "密码设置失败次数过多，使用默认密码: admin123"
                ADMIN_PASS="admin123"
                print_warning "请安装完成后立即修改默认密码！"
            fi
        fi
    done
    
    # 使用SQLite数据库（无需额外配置）
    DB_TYPE="sqlite"
    print_status "数据库类型: SQLite (./data/database.sqlite)"
    
    print_success "配置收集完成"
}

# 下载预编译包
download_and_install() {
    print_status "下载Web Panel预编译包..."
    
    # 检测系统架构
    local arch=$(uname -m)
    case $arch in
        x86_64)
            arch="amd64"
            ;;
        aarch64|arm64)
            arch="arm64"
            ;;
        armv7l)
            arch="arm"
            ;;
        i386|i686)
            arch="386"
            ;;
        *)
            print_error "不支持的系统架构: $arch"
            exit 1
            ;;
    esac
    
    local os="linux"
    
    # 构建下载URL
    local package_name="web-panel-${VERSION}-${os}-${arch}.tar.gz"
    local download_url="${REPO_URL}/releases/latest/download/${package_name}"
    
    if [ "$CHINA_MIRROR" = "true" ]; then
        download_url="https://gitee.com/boxpanel/web-panel/releases/latest/download/${package_name}"
    fi
    
    print_status "下载地址: $download_url"
    print_status "目标架构: $os/$arch"
    
    # 创建临时目录
    local temp_dir="/tmp/web-panel-install"
    rm -rf "$temp_dir"
    mkdir -p "$temp_dir"
    
    # 下载预编译包
    print_status "正在下载预编译包..."
    if command -v wget >/dev/null 2>&1; then
        wget -O "$temp_dir/$package_name" "$download_url"
    elif command -v curl >/dev/null 2>&1; then
        curl -L -o "$temp_dir/$package_name" "$download_url"
    else
        print_error "未找到wget或curl，无法下载文件"
        exit 1
    fi
    
    if [ $? -ne 0 ]; then
        print_error "下载预编译包失败"
        print_error "请检查网络连接或GitHub访问是否正常"
        exit 1
    fi
    
    # 验证下载的文件
    if [ ! -f "$temp_dir/$package_name" ] || [ ! -s "$temp_dir/$package_name" ]; then
        print_error "下载的文件无效或为空"
        exit 1
    fi
    
    print_success "预编译包下载完成"
    
    # 解压到安装目录
    print_status "解压预编译包..."
    cd "$temp_dir"
    
    if ! tar -tzf "$package_name" >/dev/null 2>&1; then
        print_error "预编译包格式无效"
        exit 1
    fi
    
    tar -xzf "$package_name"
    
    if [ $? -ne 0 ]; then
        print_error "解压预编译包失败"
        exit 1
    fi
    
    # 查找解压后的目录
    local extracted_dir=$(find . -maxdepth 1 -type d -name "web-panel-*" | head -n 1)
    if [ -z "$extracted_dir" ]; then
        # 如果没有找到目录，可能文件直接解压到当前目录
        if [ -f "web-panel" ]; then
            extracted_dir="."
        else
            print_error "未找到解压后的程序文件"
            exit 1
        fi
    fi
    
    # 复制文件到安装目录
    print_status "安装文件到 $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    
    if [ "$extracted_dir" = "." ]; then
        cp web-panel "$INSTALL_DIR/"
        [ -f "config.yaml" ] && cp config.yaml "$INSTALL_DIR/"
        [ -d "templates" ] && cp -r templates "$INSTALL_DIR/"
        [ -d "static" ] && cp -r static "$INSTALL_DIR/"
    else
        cp -r "$extracted_dir"/* "$INSTALL_DIR/"
    fi
    
    if [ $? -ne 0 ]; then
        print_error "复制文件失败"
        exit 1
    fi
    
    # 设置执行权限
    chmod +x "$INSTALL_DIR/web-panel"
    
    # 清理临时文件
    cd /
    rm -rf "$temp_dir"
    
    print_success "Web Panel安装完成"
}

# 创建配置文件
create_config() {
    print_status "创建配置文件..."
    
    # 创建数据目录
    mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/logs" "$INSTALL_DIR/uploads"
    
    # 生成配置文件
    cat > "$INSTALL_DIR/config.yaml" << EOF
server:
  port: $PORT
  mode: release

database:
  type: sqlite
  path: $INSTALL_DIR/data/database.sqlite

log:
  level: info
  path: $INSTALL_DIR/logs

upload:
  path: $INSTALL_DIR/uploads
  max_size: 100MB

security:
  jwt_secret: $(openssl rand -hex 32)
  session_timeout: 24h
EOF
    
    # 设置权限
    chown -R "$USER":"$USER" "$INSTALL_DIR"
    chmod 755 "$INSTALL_DIR"
    chmod 644 "$INSTALL_DIR/config.yaml"
    
    print_success "配置文件创建完成"
}

# 创建systemd服务
create_service() {
    print_status "创建systemd服务..."
    
    cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Web Panel Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/web-panel
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=5
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# 安全设置
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$INSTALL_DIR

# 环境变量
Environment=GIN_MODE=release
Environment=CONFIG_PATH=$INSTALL_DIR/config.yaml

[Install]
WantedBy=multi-user.target
EOF
    
    # 重新加载systemd
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    print_success "systemd服务创建完成"
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
    
    # 启动服务
    systemctl start "$SERVICE_NAME"
    
    # 检查服务状态
    sleep 3
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        print_success "Web Panel服务启动成功"
    else
        print_error "Web Panel服务启动失败"
        print_status "查看服务日志:"
        systemctl status "$SERVICE_NAME" --no-pager -l
        exit 1
    fi
}

# 显示安装信息
show_info() {
    echo ""
    echo "🎉 Web Panel 安装完成！"
    echo ""
    echo "📍 访问地址: http://$(hostname -I | awk '{print $1}'):$PORT"
    echo "👤 管理员账号: admin / admin123"
    echo "💾 数据库类型: SQLite"
    echo ""
    echo "🔧 管理命令:"
    echo "  启动服务: systemctl start $SERVICE_NAME"
    echo "  停止服务: systemctl stop $SERVICE_NAME"
    echo "  重启服务: systemctl restart $SERVICE_NAME"
    echo "  查看状态: systemctl status $SERVICE_NAME"
    echo "  查看日志: journalctl -u $SERVICE_NAME -f"
    echo ""
    echo "📁 安装目录: $INSTALL_DIR"
    echo "⚙️  配置文件: $INSTALL_DIR/config.yaml"
    echo ""
}

# 卸载函数
uninstall() {
    print_status "开始卸载Web Panel..."
    
    # 停止服务
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME"
        print_status "服务已停止"
    fi
    
    # 禁用服务
    if systemctl is-enabled --quiet "$SERVICE_NAME"; then
        systemctl disable "$SERVICE_NAME"
        print_status "服务已禁用"
    fi
    
    # 删除服务文件
    if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
        rm -f "/etc/systemd/system/$SERVICE_NAME.service"
        systemctl daemon-reload
        print_status "服务文件已删除"
    fi
    
    # 删除安装目录
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
        print_status "安装目录已删除"
    fi
    
    # 删除用户
    if id "$USER" >/dev/null 2>&1; then
        userdel "$USER" 2>/dev/null || true
        print_status "用户已删除"
    fi
    
    # 删除wpctl工具
    if [ -f "/usr/local/bin/wpctl" ]; then
        rm -f "/usr/local/bin/wpctl"
        print_status "wpctl工具已删除"
    fi
    
    print_success "Web Panel卸载完成！"
}

# 主函数
main() {
    echo "🚀 Web Panel 在线安装程序"
    echo "================================"
    
    check_root
    check_system
    install_dependencies
    create_user
    download_and_install
    configure_service
    create_service
    
    # 配置防火墙
    if [ "${SKIP_FIREWALL:-false}" != "true" ]; then
        setup_firewall
    fi
    
    start_service
    show_info
}

# 处理参数
case "$1" in
    --uninstall)
        uninstall
        exit 0
        ;;
    --help|-h)
        show_install_help
        exit 0
        ;;
    *)
        # 解析命令行参数
        parse_args "$@"
        
        # 执行主安装流程
        main
        
        # 安装wpctl命令行工具
        install_wpctl
        ;;
esac

# 安装wpctl命令行工具
install_wpctl() {
    print_status "安装wpctl命令行工具..."
    
    # 复制wpctl到系统路径
    if [ -f "$INSTALL_DIR/wpctl" ]; then
        cp "$INSTALL_DIR/wpctl" /usr/local/bin/wpctl
        chmod +x /usr/local/bin/wpctl
        print_success "wpctl工具安装完成"
        print_info "使用方法: wpctl --help"
    else
        # 从仓库下载wpctl
        local wpctl_url="$REPO_URL/raw/main/wpctl"
        if [ "$CHINA_MIRROR" = "true" ]; then
            wpctl_url="https://gitee.com/boxpanel/web-panel/raw/main/wpctl"
        fi
        
        curl -fsSL "$wpctl_url" -o /usr/local/bin/wpctl
        chmod +x /usr/local/bin/wpctl
        print_success "wpctl工具安装完成"
    fi
}

# 主安装函数
main() {
    print_info "开始安装 Web Panel..."
    print_info "版本: $VERSION"
    print_info "安装目录: $INSTALL_DIR"
    print_info "服务端口: $PORT"
    
    check_root
    check_system
    install_dependencies
    check_install_go
    
    create_user
    download_and_install
    configure_service
    
    # 配置防火墙
    if [ "$SKIP_FIREWALL" != "true" ]; then
        configure_firewall
    fi
    
    start_service
    
    print_success "Web Panel 安装完成！"
    print_info "访问地址: http://$(hostname -I | awk '{print $1}'):$PORT"
    print_info "默认用户名: admin"
    print_info "默认密码: admin123"
    print_warning "请立即登录并修改默认密码！"
    print_info "管理命令: wpctl --help"
}

# 配置防火墙
configure_firewall() {
    print_status "配置防火墙..."
    
    # 检查防火墙类型并开放端口
    if command -v ufw >/dev/null 2>&1; then
        ufw allow "$PORT"/tcp
        print_success "UFW防火墙规则已添加"
    elif command -v firewall-cmd >/dev/null 2>&1; then
        firewall-cmd --permanent --add-port="$PORT"/tcp
        firewall-cmd --reload
        print_success "Firewalld防火墙规则已添加"
    else
        print_warning "未检测到防火墙，请手动开放端口 $PORT"
    fi
}
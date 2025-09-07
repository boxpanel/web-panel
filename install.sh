#!/bin/bash

# Web Panel 在线安装脚本
# 支持从GitHub直接下载和安装

set -e

# 配置 - 基于1Panel标准
REPO_URL="https://github.com/boxpanel/web-panel"
INSTALL_DIR="/opt/web-panel"
SERVICE_NAME="web-panel"
USER="webpanel"
VERSION="latest"
CHINA_MIRROR="false"
SKIP_FIREWALL="false"
PORT="8080"

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
    
    # 检查必要命令
    local missing_deps=()
    
    for cmd in curl wget git; do
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
        apt-get install -y "${missing_deps[@]}" build-essential
    elif command -v yum >/dev/null 2>&1; then
        # CentOS/RHEL
        yum update -y
        yum install -y "${missing_deps[@]}" gcc gcc-c++ make
    elif command -v dnf >/dev/null 2>&1; then
        # Fedora
        dnf update -y
        dnf install -y "${missing_deps[@]}" gcc gcc-c++ make
    else
        print_error "不支持的包管理器，请手动安装: ${missing_deps[*]}"
        exit 1
    fi
    
    print_success "系统依赖安装完成"
}

# 检查和安装Go
check_install_go() {
    print_status "检查Go环境..."
    
    # 动态检测Go版本兼容性
    local MIN_GO_VERSION="1.18.0"  # 默认最低版本
    local PREFERRED_GO_VERSION="1.23.0"  # 首选版本
    
    # 检测系统Go版本支持情况
    detect_go_compatibility() {
        if command -v go >/dev/null 2>&1; then
            local current_version=$(go version | awk '{print $3}' | sed 's/go//')
            # 如果当前Go版本低于1.19，使用1.18作为目标
            if version_compare "$current_version" "1.19.0"; then
                MIN_GO_VERSION="1.18.0"
                print_status "检测到较旧Go环境，使用兼容版本: $MIN_GO_VERSION"
            else
                MIN_GO_VERSION="$PREFERRED_GO_VERSION"
                print_status "使用推荐Go版本: $MIN_GO_VERSION"
            fi
        else
            # 新安装默认使用推荐版本
            MIN_GO_VERSION="$PREFERRED_GO_VERSION"
        fi
    }
    
    detect_go_compatibility
    
    if command -v go >/dev/null 2>&1; then
        GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
        print_status "检测到Go版本: $GO_VERSION"
        
        # 版本比较函数
        version_compare() {
            local version1=$1
            local version2=$2
            
            # 将版本号转换为数字进行比较
            local v1=$(echo $version1 | sed 's/[^0-9.]//g' | awk -F. '{printf "%d%03d%03d", $1, $2, $3}')
            local v2=$(echo $version2 | sed 's/[^0-9.]//g' | awk -F. '{printf "%d%03d%03d", $1, $2, $3}')
            
            if [ "$v1" -lt "$v2" ]; then
                return 1  # version1 < version2
            else
                return 0  # version1 >= version2
            fi
        }
        
        if version_compare "$GO_VERSION" "$MIN_GO_VERSION"; then
            print_success "Go版本满足要求: $GO_VERSION"
        else
            print_warning "Go版本过低，需要升级到 $MIN_GO_VERSION 或更高版本，当前版本: $GO_VERSION"
            install_go "$MIN_GO_VERSION"
        fi
    else
        print_status "未检测到Go，开始安装..."
        install_go "$MIN_GO_VERSION"
    fi
}

# 安装Go
install_go() {
    local go_version="$1"
    print_status "安装Go $go_version..."
    
    # 下载Go
    local GO_TAR="go${go_version}.linux-${ARCH}.tar.gz"
    local GO_URL="https://golang.org/dl/${GO_TAR}"
    
    cd /tmp
    wget -O "$GO_TAR" "$GO_URL" || {
        print_error "下载Go失败"
        exit 1
    }
    
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

# 下载和安装
install_webpanel() {
    print_status "下载Web Panel源码..."
    
    # 安装Git依赖
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y git
    elif command -v yum >/dev/null 2>&1; then
        yum install -y git
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y git
    else
        print_error "不支持的包管理器，请手动安装 git"
        exit 1
    fi
    
    # 创建安装目录
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # 克隆源码
    print_status "克隆源码仓库..."
    
    # 配置Git安全目录
    git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
    git config --global --add safe.directory "/opt/web-panel" 2>/dev/null || true
    git config --global --add safe.directory "$(pwd)" 2>/dev/null || true
    
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
    
    # 动态调整go.mod版本兼容性
    adjust_go_mod_version() {
        local go_mod_file="$1"
        local target_version="$2"
        
        if [ -f "$go_mod_file" ]; then
            # 检查当前go.mod中的Go版本
            local current_go_version=$(grep "^go " "$go_mod_file" | awk '{print $2}')
            
            if [ "$current_go_version" != "$target_version" ]; then
                print_status "调整go.mod Go版本从 $current_go_version 到 $target_version"
                # 备份原文件
                cp "$go_mod_file" "${go_mod_file}.backup"
                # 更新Go版本
                sed -i "s/^go .*/go $target_version/" "$go_mod_file"
                # 移除可能存在的toolchain指令
                sed -i '/^toolchain /d' "$go_mod_file"
                print_success "go.mod版本已调整为兼容版本: $target_version"
            fi
        fi
    }
    
    # 检查go.mod文件位置
    if [ -f "backend/go.mod" ]; then
        print_status "检测到backend目录结构，切换到backend目录构建..."
        cd backend
        
        # 根据检测到的Go版本调整go.mod
        local detected_go_version="$MIN_GO_VERSION"
        adjust_go_mod_version "go.mod" "$detected_go_version"
        
        go mod tidy
        go build -o ../web-panel cmd/main.go
        cd ..
    elif [ -f "go.mod" ]; then
        print_status "在根目录构建..."
        
        # 根据检测到的Go版本调整go.mod
        local detected_go_version="$MIN_GO_VERSION"
        adjust_go_mod_version "go.mod" "$detected_go_version"
        
        go mod tidy
        go build -o web-panel cmd/main.go
    else
        print_error "未找到go.mod文件，请检查项目结构"
        exit 1
    fi
    
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
    check_install_go
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
        show_install_help
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
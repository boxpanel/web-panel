#!/bin/bash

# Web Panel 一键在线安装脚本
# 使用方法: curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install-online.sh | bash

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检测操作系统
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if command_exists apt-get; then
            DISTRO="ubuntu"
        elif command_exists yum; then
            DISTRO="centos"
        elif command_exists pacman; then
            DISTRO="arch"
        else
            DISTRO="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        DISTRO="macos"
    else
        OS="unknown"
        DISTRO="unknown"
    fi
}

# 安装Node.js
install_nodejs() {
    print_message "检查Node.js安装状态..."
    
    if command_exists node && command_exists npm; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
        
        if [ "$MAJOR_VERSION" -ge "16" ]; then
            print_success "Node.js $NODE_VERSION 已安装"
            return 0
        else
            print_warning "Node.js版本过低 ($NODE_VERSION)，需要升级到16+"
        fi
    fi
    
    print_message "安装Node.js..."
    
    if [ "$OS" = "macos" ]; then
        if command_exists brew; then
            brew install node
        else
            print_error "请先安装Homebrew或手动安装Node.js"
            exit 1
        fi
    elif [ "$DISTRO" = "ubuntu" ]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [ "$DISTRO" = "centos" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs npm
    elif [ "$DISTRO" = "arch" ]; then
        sudo pacman -S nodejs npm
    else
        print_error "不支持的操作系统，请手动安装Node.js 16+"
        exit 1
    fi
    
    print_success "Node.js安装完成"
}

# 安装Git
install_git() {
    if command_exists git; then
        print_success "Git已安装"
        return 0
    fi
    
    print_message "安装Git..."
    
    if [ "$OS" = "macos" ]; then
        if command_exists brew; then
            brew install git
        else
            print_message "请安装Xcode Command Line Tools"
            xcode-select --install
        fi
    elif [ "$DISTRO" = "ubuntu" ]; then
        sudo apt-get update
        sudo apt-get install -y git
    elif [ "$DISTRO" = "centos" ]; then
        sudo yum install -y git
    elif [ "$DISTRO" = "arch" ]; then
        sudo pacman -S git
    else
        print_error "不支持的操作系统，请手动安装Git"
        exit 1
    fi
    
    print_success "Git安装完成"
}

# 安装PM2
install_pm2() {
    if command_exists pm2; then
        print_success "PM2已安装"
        return 0
    fi
    
    print_message "安装PM2..."
    npm install -g pm2
    print_success "PM2安装完成"
}

# 克隆项目
clone_project() {
    PROJECT_DIR="web-panel"
    
    if [ -d "$PROJECT_DIR" ]; then
        print_warning "目录 $PROJECT_DIR 已存在，正在更新..."
        cd "$PROJECT_DIR"
        git pull origin main
    else
        print_message "克隆项目..."
        git clone https://github.com/boxpanel/web-panel.git
        cd "$PROJECT_DIR"
    fi
    
    print_success "项目代码获取完成"
}

# 安装依赖
install_dependencies() {
    print_message "安装服务端依赖..."
    npm install
    
    print_message "安装客户端依赖..."
    cd client
    npm install
    cd ..
    
    print_success "依赖安装完成"
}

# 构建客户端
build_client() {
    print_message "构建客户端..."
    cd client
    npm run build
    cd ..
    print_success "客户端构建完成"
}

# 配置环境变量
setup_environment() {
    print_message "配置环境变量..."
    
    if [ ! -f ".env" ]; then
        cp .env.example .env
        
        # 生成随机密钥
        JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
        SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 32)
        
        # 更新.env文件
        sed -i.bak "s/your-secret-key/$JWT_SECRET/g" .env
        sed -i.bak "s/your-session-secret/$SESSION_SECRET/g" .env
        
        print_success "环境变量配置完成"
    else
        print_warning ".env文件已存在，跳过配置"
    fi
}

# 启动服务
start_services() {
    print_message "启动Web Panel服务..."
    
    # 停止可能存在的服务
    pm2 delete web-panel 2>/dev/null || true
    
    # 启动服务
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup
    
    print_success "服务启动完成"
}

# 显示访问信息
show_access_info() {
    echo
    echo "======================================"
    echo -e "${GREEN}🎉 Web Panel 安装完成！${NC}"
    echo "======================================"
    echo
    echo -e "${BLUE}访问地址:${NC}"
    echo "  http://localhost:3000"
    echo "  http://$(hostname -I | awk '{print $1}'):3000"
    echo
    echo -e "${BLUE}默认账号:${NC}"
    echo "  用户名: admin"
    echo "  密码: admin123"
    echo
    echo -e "${BLUE}管理命令:${NC}"
    echo "  查看状态: pm2 status"
    echo "  查看日志: pm2 logs web-panel"
    echo "  重启服务: pm2 restart web-panel"
    echo "  停止服务: pm2 stop web-panel"
    echo
    echo -e "${YELLOW}注意: 首次登录后请立即修改默认密码！${NC}"
    echo "======================================"
}

# 主函数
main() {
    echo
    echo "======================================"
    echo -e "${BLUE}Web Panel 一键安装脚本${NC}"
    echo "======================================"
    echo
    
    # 检测操作系统
    detect_os
    print_message "检测到操作系统: $OS ($DISTRO)"
    
    # 检查权限
    if [ "$EUID" -eq 0 ]; then
        print_warning "检测到root权限，建议使用普通用户安装"
    fi
    
    # 安装依赖
    install_git
    install_nodejs
    install_pm2
    
    # 安装项目
    clone_project
    install_dependencies
    build_client
    setup_environment
    start_services
    
    # 显示访问信息
    show_access_info
}

# 错误处理
trap 'print_error "安装过程中发生错误，请检查日志"; exit 1' ERR

# 执行主函数
main "$@"
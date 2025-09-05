#!/bin/bash

# Web Panel 一键安装脚本
# 使用方法: curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install-online.sh | bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 进度变量
CURRENT_STEP=0
TOTAL_STEPS=9

# 打印带颜色的消息
print_message() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# 显示进度
show_progress() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    local step_name="$1"
    local percentage=$((CURRENT_STEP * 100 / TOTAL_STEPS))
    
    # 生成进度条
    local filled=$((percentage/2))
    local empty=$((50-filled))
    local filled_bar=""
    local empty_bar=""
    
    # 生成填充部分
    for ((i=0; i<filled; i++)); do
        filled_bar+="="
    done
    
    # 生成空白部分
    for ((i=0; i<empty; i++)); do
        empty_bar+="."
    done
    
    echo ""
    echo -e "${GREEN}[进度 $CURRENT_STEP/$TOTAL_STEPS - $percentage%]${NC} $step_name"
    echo -e "${BLUE}${filled_bar}${NC}${YELLOW}${empty_bar}${NC}"
    echo ""
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
        NPM_VERSION=$(npm --version)
        
        if [ "$MAJOR_VERSION" -ge "16" ]; then
            print_success "✓ Node.js 已安装: v$NODE_VERSION (npm: $NPM_VERSION)"
            return 0
        else
            print_warning "Node.js版本过低 (v$NODE_VERSION)，需要升级到16+"
        fi
    fi
    
    print_message "正在安装 Node.js..."
    
    if [ "$OS" = "macos" ]; then
        if command_exists brew; then
            print_message "  - 使用 Homebrew 安装 Node.js..."
            brew install node >/dev/null 2>&1
        else
            print_error "请先安装Homebrew或手动安装Node.js"
            exit 1
        fi
    elif [ "$DISTRO" = "ubuntu" ]; then
        print_message "  - 添加 NodeSource 仓库..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - >/dev/null 2>&1
        print_message "  - 安装 Node.js 和 npm..."
        sudo apt-get install -y nodejs >/dev/null 2>&1
    elif [ "$DISTRO" = "centos" ]; then
        print_message "  - 添加 NodeSource 仓库..."
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash - >/dev/null 2>&1
        print_message "  - 安装 Node.js 和 npm..."
        sudo yum install -y nodejs npm >/dev/null 2>&1
    elif [ "$DISTRO" = "arch" ]; then
        print_message "  - 使用 Pacman 安装 Node.js..."
        sudo pacman -S nodejs npm >/dev/null 2>&1
    else
        print_error "不支持的操作系统，请手动安装Node.js 16+"
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    print_success "✓ Node.js 安装完成: $NODE_VERSION (npm: $NPM_VERSION)"
}

# 安装Git
install_git() {
    if command_exists git; then
        print_success "✓ Git 已安装 ($(git --version))"
        return 0
    fi
    
    print_message "正在安装 Git..."
    
    if [ "$OS" = "macos" ]; then
        if command_exists brew; then
            print_message "  - 使用 Homebrew 安装 Git..."
            brew install git >/dev/null 2>&1
        else
            print_message "  - 安装 Xcode Command Line Tools..."
            xcode-select --install
        fi
    elif [ "$DISTRO" = "ubuntu" ]; then
        print_message "  - 更新软件包列表..."
        sudo apt-get update >/dev/null 2>&1
        print_message "  - 安装 Git 软件包..."
        sudo apt-get install -y git >/dev/null 2>&1
    elif [ "$DISTRO" = "centos" ]; then
        print_message "  - 使用 YUM 安装 Git..."
        sudo yum install -y git >/dev/null 2>&1
    elif [ "$DISTRO" = "arch" ]; then
        print_message "  - 使用 Pacman 安装 Git..."
        sudo pacman -S git >/dev/null 2>&1
    else
        print_error "不支持的操作系统，请手动安装Git"
        exit 1
    fi
    
    print_success "✓ Git 安装完成 ($(git --version))"
}

# 安装PM2
install_pm2() {
    if command_exists pm2; then
        PM2_VERSION=$(pm2 --version)
        print_success "✓ PM2 已安装: v$PM2_VERSION"
        return 0
    fi
    
    print_message "正在安装 PM2..."
    print_message "  - 使用 npm 全局安装 PM2..."
    npm install -g pm2 >/dev/null 2>&1
    
    PM2_VERSION=$(pm2 --version)
    print_success "✓ PM2 安装完成: v$PM2_VERSION"
}

# 创建安装目录结构
setup_directories() {
    print_message "创建安装目录结构..."
    
    # 定义目录路径
    INSTALL_DIR="/opt/webpanel"
    DATA_DIR="/opt/webpanel_data"
    BACKUP_DIR="/opt/webpanel_backup"
    SERVICE_NAME="webpanel"
    
    # 创建目录
    sudo mkdir -p "$INSTALL_DIR"
    sudo mkdir -p "$DATA_DIR"
    sudo mkdir -p "$BACKUP_DIR"
    
    # 设置目录权限
    sudo chown -R $USER:$USER "$INSTALL_DIR"
    sudo chown -R $USER:$USER "$DATA_DIR"
    sudo chown -R $USER:$USER "$BACKUP_DIR"
    
    print_success "目录结构创建完成"
    
    # 显示安装信息
    echo
    echo "====================================="
    echo -e "${BLUE}安装信息:${NC}"
    echo "  - 安装目录: $INSTALL_DIR"
    echo "  - 数据目录: $DATA_DIR"
    echo "  - 备份目录: $BACKUP_DIR"
    echo "  - 服务名称: $SERVICE_NAME"
    echo "====================================="
    echo
}

# 克隆项目
clone_project() {
    print_message "正在克隆项目到安装目录..."
    
    # 切换到安装目录的父目录
    print_message "  - 切换到安装目录: /opt"
    cd /opt
    
    # 如果目录已存在，先删除
    if [ -d "$INSTALL_DIR" ]; then
        print_message "  - 清理现有安装目录..."
        sudo rm -rf "$INSTALL_DIR"
    fi
    
    # 克隆项目
    print_message "  - 从 GitHub 克隆项目源码..."
    sudo git clone https://github.com/boxpanel/web-panel.git webpanel >/dev/null 2>&1
    
    # 设置目录权限
    print_message "  - 设置目录权限..."
    sudo chown -R $USER:$USER "$INSTALL_DIR"
    
    # 切换到项目目录
    cd "$INSTALL_DIR"
    
    print_success "✓ 项目克隆完成 ($(pwd))"
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
        
        # 配置数据目录
        echo "" >> .env
        echo "# 数据目录配置" >> .env
        echo "DATA_DIR=$DATA_DIR" >> .env
        echo "BACKUP_DIR=$BACKUP_DIR" >> .env
        echo "DATABASE_PATH=$DATA_DIR/database.db" >> .env
        echo "UPLOAD_DIR=$DATA_DIR/uploads" >> .env
        echo "LOG_DIR=$DATA_DIR/logs" >> .env
        
        # 创建数据子目录
        mkdir -p "$DATA_DIR/uploads"
        mkdir -p "$DATA_DIR/logs"
        
        print_success "环境变量配置完成"
    else
        print_warning ".env文件已存在，跳过配置"
    fi
}

# 启动服务
start_services() {
    print_message "启动Web Panel服务..."
    
    # 停止可能存在的服务
    pm2 delete webpanel 2>/dev/null || true
    pm2 delete web-panel 2>/dev/null || true
    
    # 更新PM2配置文件中的服务名称
    if [ -f "ecosystem.config.js" ]; then
        sed -i.bak "s/name: 'web-panel'/name: 'webpanel'/g" ecosystem.config.js
    fi
    
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
    echo -e "${BLUE}安装信息:${NC}"
    echo "  - 安装目录: $INSTALL_DIR"
    echo "  - 数据目录: $DATA_DIR"
    echo "  - 备份目录: $BACKUP_DIR"
    echo "  - 服务名称: $SERVICE_NAME"
    echo
    echo -e "${BLUE}访问地址:${NC}"
    echo "  http://localhost:3001"
    echo "  http://$(hostname -I | awk '{print $1}'):3001"
    echo
    echo -e "${BLUE}默认账号:${NC}"
    echo "  用户名: admin"
    echo "  密码: admin123"
    echo
    echo -e "${BLUE}管理命令:${NC}"
    echo "  查看状态: pm2 status"
    echo "  查看日志: pm2 logs $SERVICE_NAME"
    echo "  重启服务: pm2 restart $SERVICE_NAME"
    echo "  停止服务: pm2 stop $SERVICE_NAME"
    echo "  删除服务: pm2 delete $SERVICE_NAME"
    echo
    echo -e "${BLUE}目录说明:${NC}"
    echo "  程序文件: $INSTALL_DIR"
    echo "  数据文件: $DATA_DIR"
    echo "  备份文件: $BACKUP_DIR"
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
    
    # 步骤1: 检测操作系统
    show_progress "检测操作系统和环境"
    detect_os
    print_message "检测到操作系统: $OS ($DISTRO)"
    
    # 检查权限
    if [ "$EUID" -eq 0 ]; then
        print_warning "检测到root权限，建议使用普通用户安装"
    fi
    
    # 步骤2: 安装系统依赖
    show_progress "安装系统依赖"
    install_git
    install_nodejs
    install_pm2
    
    # 步骤3: 设置安装目录
    show_progress "创建安装目录结构"
    setup_directories
    
    # 步骤4: 下载项目源码
    show_progress "下载项目源码"
    clone_project
    
    # 步骤5: 安装项目依赖
    show_progress "安装项目依赖"
    install_dependencies
    
    # 步骤6: 构建客户端
    show_progress "构建客户端"
    build_client
    
    # 步骤7: 配置环境
    show_progress "配置环境变量"
    setup_environment
    
    # 步骤8: 启动服务
     show_progress "启动Web Panel服务"
     start_services
     
     # 步骤9: 显示访问信息
     show_progress "安装完成，显示访问信息"
     show_access_info
}

# 错误处理
trap 'print_error "安装过程中发生错误，请检查日志"; exit 1' ERR

# 执行主函数
main "$@"
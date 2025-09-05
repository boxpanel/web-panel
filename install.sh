#!/bin/bash

# Web Panel 低配服务器安装脚本
# Low-spec Server Installation Script
# 适用于内存 <= 1GB, CPU <= 2核心的服务器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
INSTALL_DIR="/opt/web-panel"
SERVICE_USER="webpanel"
DATA_DIR="/var/lib/web-panel"
LOG_DIR="/var/log/web-panel"
TOTAL_STEPS=12
CURRENT_STEP=0

# 低配服务器检测
check_system_resources() {
    echo -e "${BLUE}检查系统资源...${NC}"
    
    # 检查内存
    TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    if [ "$TOTAL_MEM" -gt 2048 ]; then
        echo -e "${YELLOW}警告: 检测到${TOTAL_MEM}MB内存，建议使用标准安装脚本${NC}"
        read -p "是否继续低配安装? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # 检查CPU核心数
    CPU_CORES=$(nproc)
    if [ "$CPU_CORES" -gt 4 ]; then
        echo -e "${YELLOW}警告: 检测到${CPU_CORES}个CPU核心，建议使用标准安装脚本${NC}"
    fi
    
    echo -e "${GREEN}系统资源: ${TOTAL_MEM}MB内存, ${CPU_CORES}核CPU${NC}"
}

# 进度显示函数
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

# 安装Node.js (使用NodeSource仓库)
install_nodejs() {
    show_progress "安装Node.js (LTS版本)"
    
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 16 ]; then
            echo -e "${GREEN}Node.js已安装 ($(node --version))${NC}"
            return
        fi
    fi
    
    # 安装Node.js 18 LTS (更轻量)
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # 配置npm以减少内存使用
    npm config set fund false
    npm config set audit false
    npm config set progress false
}

# 创建系统用户
create_system_user() {
    show_progress "创建系统用户"
    
    if ! id "$SERVICE_USER" &>/dev/null; then
        sudo useradd --system --shell /bin/false --home-dir "$INSTALL_DIR" --create-home "$SERVICE_USER"
        echo -e "${GREEN}创建用户: $SERVICE_USER${NC}"
    else
        echo -e "${GREEN}用户已存在: $SERVICE_USER${NC}"
    fi
}

# 创建目录结构
create_directories() {
    show_progress "创建目录结构"
    
    sudo mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
    sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
    sudo chmod 755 "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
}

# 下载项目文件
download_project() {
    show_progress "下载项目文件"
    
    cd "$INSTALL_DIR"
    
    # 使用浅克隆以节省带宽和存储
    if [ -d ".git" ]; then
        echo -e "${BLUE}更新现有项目...${NC}"
        sudo -u "$SERVICE_USER" git pull
    else
        # 检查目录是否为空
        if [ "$(ls -A . 2>/dev/null)" ]; then
            echo -e "${YELLOW}目录不为空，清理现有文件...${NC}"
            # 更彻底的清理方式
            sudo find "$INSTALL_DIR" -mindepth 1 -delete 2>/dev/null || true
            # 备用清理方式
            sudo rm -rf "$INSTALL_DIR"/* "$INSTALL_DIR"/.[!.]* "$INSTALL_DIR"/..?* 2>/dev/null || true
        fi
        echo -e "${BLUE}克隆项目文件...${NC}"
        sudo -u "$SERVICE_USER" git clone --depth 1 https://github.com/boxpanel/web-panel.git .
    fi
}

# 安装依赖 (低配版本)
install_dependencies() {
    show_progress "安装项目依赖 (低配优化)"
    
    cd "$INSTALL_DIR"
    
    # 复制低配配置文件
    sudo -u "$SERVICE_USER" cp package.lowspec.json package.json
    sudo -u "$SERVICE_USER" cp .env.lowspec .env
    
    # 设置npm配置以减少内存使用
    export NODE_OPTIONS="--max-old-space-size=256"
    
    # 安装服务器依赖 (仅生产环境)
    sudo -u "$SERVICE_USER" npm install --production --no-optional --no-audit --no-fund
    
    # 安装客户端依赖并构建
    cd client
    sudo -u "$SERVICE_USER" npm install --production --no-optional --no-audit --no-fund
    sudo -u "$SERVICE_USER" GENERATE_SOURCEMAP=false npm run build
    
    # 清理不必要的文件
    sudo -u "$SERVICE_USER" rm -rf node_modules/.cache
    sudo -u "$SERVICE_USER" npm cache clean --force
}

# 配置数据库
setup_database() {
    show_progress "配置SQLite数据库"
    
    cd "$INSTALL_DIR"
    
    # 创建数据库目录
    sudo -u "$SERVICE_USER" mkdir -p "$DATA_DIR"
    
    # 初始化数据库
    sudo -u "$SERVICE_USER" NODE_OPTIONS="--max-old-space-size=256" node -e "
        const db = require('./server/utils/database');
        console.log('数据库初始化完成');
    "
}

# 配置系统服务
setup_systemd_service() {
    show_progress "配置系统服务"
    
    sudo tee /etc/systemd/system/web-panel.service > /dev/null <<EOF
[Unit]
Description=Web Panel (Low-spec)
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=web-panel

# 资源限制
MemoryMax=300M
MemoryHigh=250M
CPUQuota=150%

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR $LOG_DIR

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable web-panel
}

# 配置防火墙
setup_firewall() {
    show_progress "配置防火墙"
    
    if command_exists ufw; then
        sudo ufw allow 3001/tcp comment "Web Panel"
        echo -e "${GREEN}防火墙规则已添加${NC}"
    elif command_exists firewall-cmd; then
        sudo firewall-cmd --permanent --add-port=3001/tcp
        sudo firewall-cmd --reload
        echo -e "${GREEN}防火墙规则已添加${NC}"
    else
        echo -e "${YELLOW}未检测到防火墙，请手动开放3001端口${NC}"
    fi
}

# 优化系统设置
optimize_system() {
    show_progress "优化系统设置"
    
    # 创建swap文件 (如果内存小于1GB)
    if [ "$TOTAL_MEM" -lt 1024 ]; then
        if [ ! -f /swapfile ]; then
            echo -e "${BLUE}创建512MB swap文件...${NC}"
            sudo fallocate -l 512M /swapfile
            sudo chmod 600 /swapfile
            sudo mkswap /swapfile
            sudo swapon /swapfile
            echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
        fi
    fi
    
    # 优化内核参数
    sudo tee -a /etc/sysctl.conf > /dev/null <<EOF

# Web Panel 低配优化
vm.swappiness=10
vm.vfs_cache_pressure=50
net.core.somaxconn=1024
net.ipv4.tcp_max_syn_backlog=1024
EOF
    
    sudo sysctl -p
}

# 启动服务
start_service() {
    show_progress "启动Web Panel服务"
    
    sudo systemctl start web-panel
    
    # 等待服务启动
    sleep 5
    
    if sudo systemctl is-active --quiet web-panel; then
        echo -e "${GREEN}Web Panel服务启动成功${NC}"
    else
        echo -e "${RED}Web Panel服务启动失败${NC}"
        sudo systemctl status web-panel
        exit 1
    fi
}

# 显示安装完成信息
show_completion_info() {
    show_progress "安装完成"
    
    local SERVER_IP=$(curl -s ifconfig.me || echo "your-server-ip")
    
    echo ""
    echo -e "${GREEN}🎉 Web Panel 低配版本安装完成!${NC}"
    echo ""
    echo -e "${BLUE}访问信息:${NC}"
    echo -e "  URL: http://$SERVER_IP:3001"
    echo -e "  默认用户名: admin"
    echo -e "  默认密码: admin123"
    echo ""
    echo -e "${BLUE}系统优化:${NC}"
    echo -e "  内存限制: 256MB"
    echo -e "  CPU限制: 150%"
    echo -e "  数据库: SQLite"
    echo -e "  日志级别: warn"
    echo ""
    echo -e "${BLUE}服务管理:${NC}"
    echo -e "  启动: sudo systemctl start web-panel"
    echo -e "  停止: sudo systemctl stop web-panel"
    echo -e "  重启: sudo systemctl restart web-panel"
    echo -e "  状态: sudo systemctl status web-panel"
    echo -e "  日志: sudo journalctl -u web-panel -f"
    echo ""
    echo -e "${YELLOW}注意: 首次登录后请立即修改默认密码!${NC}"
    echo ""
}

# 主安装流程
main() {
    echo -e "${BLUE}Web Panel 低配服务器安装程序${NC}"
    echo -e "${BLUE}适用于内存 ≤ 1GB, CPU ≤ 2核心的服务器${NC}"
    echo ""
    
    # 检查sudo权限
    if ! sudo -n true 2>/dev/null; then
        echo -e "${RED}此脚本需要sudo权限来执行系统级操作${NC}"
        echo -e "${YELLOW}请确保当前用户在sudoers组中，或以root用户运行${NC}"
        echo -e "${BLUE}尝试运行: sudo $0${NC}"
        exit 1
    fi
    
    # 检查系统
    if ! command_exists curl; then
        echo -e "${RED}错误: 需要安装curl${NC}"
        exit 1
    fi
    
    check_system_resources
    
    echo -e "${YELLOW}即将开始安装，按Enter继续或Ctrl+C取消...${NC}"
    # 检查是否为交互式终端
    if [ -t 0 ]; then
        read
    else
        echo -e "${BLUE}检测到非交互式环境，自动继续安装...${NC}"
        sleep 2
    fi
    
    # 执行安装步骤
    install_nodejs
    create_system_user
    create_directories
    download_project
    install_dependencies
    setup_database
    setup_systemd_service
    setup_firewall
    optimize_system
    start_service
    show_completion_info
}

# 错误处理
trap 'echo -e "${RED}安装过程中发生错误，请检查日志${NC}"' ERR

# 运行主程序
main "$@"
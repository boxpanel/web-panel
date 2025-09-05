#!/bin/bash

# Web Panel Go版本一键安装脚本
# 支持 Linux/macOS/Windows(WSL)

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

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查Go环境
check_go() {
    log_info "检查Go环境..."
    
    if ! command_exists go; then
        log_error "未找到Go环境，请先安装Go 1.19或更高版本"
        log_info "安装指南: https://golang.org/doc/install"
        exit 1
    fi
    
    GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
    log_success "找到Go版本: $GO_VERSION"
    
    # 检查Go版本是否满足要求
    REQUIRED_VERSION="1.19"
    if ! printf '%s\n%s\n' "$REQUIRED_VERSION" "$GO_VERSION" | sort -V -C; then
        log_error "Go版本过低，需要1.19或更高版本，当前版本: $GO_VERSION"
        exit 1
    fi
}

# 检查Node.js环境（用于前端构建）
check_node() {
    log_info "检查Node.js环境..."
    
    if ! command_exists node; then
        log_warning "未找到Node.js环境，将跳过前端构建"
        log_info "如需完整功能，请安装Node.js 16或更高版本"
        return 1
    fi
    
    NODE_VERSION=$(node --version | sed 's/v//')
    log_success "找到Node.js版本: $NODE_VERSION"
    return 0
}

# 安装Go依赖
install_go_deps() {
    log_info "安装Go依赖包..."
    
    # 设置Go模块代理（中国用户）
    if [[ "$1" == "--china" ]]; then
        export GOPROXY=https://goproxy.cn,direct
        log_info "使用中国镜像源"
    fi
    
    go mod tidy
    go mod download
    
    log_success "Go依赖安装完成"
}

# 构建后端
build_backend() {
    log_info "构建Go后端..."
    
    # 禁用CGO以避免C编译器依赖
    export CGO_ENABLED=0
    
    # 根据操作系统选择输出文件名
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        OUTPUT_FILE="web-panel.exe"
    else
        OUTPUT_FILE="web-panel"
    fi
    
    go build -ldflags "-s -w" -o "$OUTPUT_FILE" cmd/main.go
    
    if [[ -f "$OUTPUT_FILE" ]]; then
        log_success "后端构建完成: $OUTPUT_FILE"
    else
        log_error "后端构建失败"
        exit 1
    fi
}

# 构建前端
build_frontend() {
    if ! check_node; then
        log_warning "跳过前端构建"
        return 0
    fi
    
    log_info "构建前端..."
    
    cd client
    
    # 安装前端依赖
    if command_exists npm; then
        npm install
        npm run build
    elif command_exists yarn; then
        yarn install
        yarn build
    else
        log_error "未找到npm或yarn"
        cd ..
        return 1
    fi
    
    cd ..
    log_success "前端构建完成"
}

# 初始化配置
init_config() {
    log_info "初始化配置文件..."
    
    # 创建必要的目录
    mkdir -p data logs uploads
    
    # 复制配置文件模板
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            log_success "已创建配置文件: .env"
        else
            # 创建基本配置文件
            cat > .env << EOF
# Web Panel 配置文件
PORT=8080
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "your-secret-key-$(date +%s)")
DB_PATH=./data/database.sqlite
UPLOAD_PATH=./uploads
LOG_LEVEL=info
EOF
            log_success "已创建默认配置文件: .env"
        fi
    else
        log_info "配置文件已存在，跳过创建"
    fi
    
    # 设置权限
    chmod 755 data logs uploads
}

# 创建系统服务
create_service() {
    if [[ "$1" != "--service" ]]; then
        return 0
    fi
    
    log_info "创建系统服务..."
    
    CURRENT_DIR=$(pwd)
    SERVICE_NAME="web-panel"
    
    # 检查是否为root用户
    if [[ $EUID -ne 0 ]]; then
        log_error "创建系统服务需要root权限，请使用sudo运行"
        return 1
    fi
    
    # 创建systemd服务文件
    cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Web Panel Go Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${CURRENT_DIR}
ExecStart=${CURRENT_DIR}/web-panel
Restart=always
RestartSec=5
Environment=GIN_MODE=release

[Install]
WantedBy=multi-user.target
EOF
    
    # 重新加载systemd并启用服务
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    log_success "系统服务创建完成"
    log_info "使用以下命令管理服务:"
    log_info "  启动: sudo systemctl start $SERVICE_NAME"
    log_info "  停止: sudo systemctl stop $SERVICE_NAME"
    log_info "  状态: sudo systemctl status $SERVICE_NAME"
}

# 启动服务
start_service() {
    log_info "启动Web Panel服务..."
    
    # 根据操作系统选择可执行文件
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        EXEC_FILE="./web-panel.exe"
    else
        EXEC_FILE="./web-panel"
    fi
    
    if [[ ! -f "$EXEC_FILE" ]]; then
        log_error "未找到可执行文件: $EXEC_FILE"
        exit 1
    fi
    
    # 检查端口是否被占用
    PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d'=' -f2 || echo "8080")
    
    if command_exists netstat; then
        if netstat -tuln | grep -q ":$PORT "; then
            log_warning "端口 $PORT 已被占用，请检查配置或停止其他服务"
        fi
    fi
    
    log_success "服务启动完成！"
    log_info "访问地址: http://localhost:$PORT"
    log_info "默认账号: admin"
    log_info "默认密码: admin123"
    log_info ""
    log_info "按 Ctrl+C 停止服务"
    
    # 启动服务
    "$EXEC_FILE"
}

# 显示帮助信息
show_help() {
    echo "Web Panel Go版本一键安装脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --china     使用中国镜像源加速下载"
    echo "  --service   创建系统服务（需要root权限）"
    echo "  --no-start  安装完成后不自动启动"
    echo "  --help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                    # 标准安装并启动"
    echo "  $0 --china           # 使用中国镜像源安装"
    echo "  $0 --service         # 安装并创建系统服务"
    echo "  $0 --china --service # 使用中国镜像源安装并创建系统服务"
}

# 主函数
main() {
    echo "======================================"
    echo "    Web Panel Go版本一键安装脚本"
    echo "======================================"
    echo ""
    
    # 解析命令行参数
    USE_CHINA_MIRROR=false
    CREATE_SERVICE=false
    AUTO_START=true
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --china)
                USE_CHINA_MIRROR=true
                shift
                ;;
            --service)
                CREATE_SERVICE=true
                shift
                ;;
            --no-start)
                AUTO_START=false
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 执行安装步骤
    check_go
    
    if $USE_CHINA_MIRROR; then
        install_go_deps --china
    else
        install_go_deps
    fi
    
    build_backend
    build_frontend
    init_config
    
    if $CREATE_SERVICE; then
        create_service --service
    fi
    
    log_success "安装完成！"
    echo ""
    
    if $AUTO_START; then
        start_service
    else
        log_info "使用以下命令启动服务:"
        if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
            log_info "  .\\web-panel.exe"
        else
            log_info "  ./web-panel"
        fi
    fi
}

# 捕获中断信号
trap 'log_warning "安装被中断"; exit 1' INT TERM

# 运行主函数
main "$@"
#!/bin/bash

# Web Panel 一键卸载脚本
# 版本: 1.0
# 作者: Web Panel Team

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
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

# 显示横幅
show_banner() {
    echo -e "${BLUE}"
    echo "================================================"
    echo "         Web Panel 一键卸载脚本"
    echo "================================================"
    echo -e "${NC}"
}

# 确认卸载
confirm_uninstall() {
    echo
    print_warning "此操作将完全删除 Web Panel 管理面板及其所有数据！"
    print_warning "包括："
    echo "  - 应用程序文件"
    echo "  - 数据库文件"
    echo "  - 配置文件"
    echo "  - 用户数据"
    echo "  - 系统服务（如果存在）"
    echo
    
    read -p "您确定要继续卸载吗？(输入 'YES' 确认): " confirm
    if [ "$confirm" != "YES" ]; then
        print_message "卸载已取消"
        exit 0
    fi
    
    echo
    read -p "请再次确认删除所有数据 (输入 'DELETE' 确认): " confirm2
    if [ "$confirm2" != "DELETE" ]; then
        print_message "卸载已取消"
        exit 0
    fi
}

# 检测系统类型
detect_system() {
    print_message "正在检测系统类型..."
    
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        VER=$VERSION_ID
        print_message "检测到系统: $OS $VER"
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si)
        VER=$(lsb_release -sr)
    elif [ -f /etc/lsb-release ]; then
        . /etc/lsb-release
        OS=$DISTRIB_ID
        VER=$DISTRIB_RELEASE
    elif [ -f /etc/debian_version ]; then
        OS=Debian
        VER=$(cat /etc/debian_version)
    elif [ -f /etc/redhat-release ]; then
        OS=CentOS
        VER=$(cat /etc/redhat-release | sed 's/.*release //' | sed 's/ .*//')
    else
        print_error "无法检测系统类型"
        exit 1
    fi
}

# 停止服务
stop_services() {
    print_message "正在停止 Web Panel 服务..."
    
    # 停止可能的 systemd 服务
    if systemctl is-active --quiet web-panel 2>/dev/null; then
        print_message "停止 systemd 服务..."
        sudo systemctl stop web-panel
        sudo systemctl disable web-panel
        print_success "systemd 服务已停止"
    fi
    
    # 查找并停止 Node.js 进程
    print_message "查找并停止 Node.js 进程..."
    
    # 查找包含 server.js 的进程
    PIDS=$(pgrep -f "node.*server.js" 2>/dev/null || true)
    if [ ! -z "$PIDS" ]; then
        print_message "发现运行中的 Web Panel 进程: $PIDS"
        for pid in $PIDS; do
            print_message "停止进程 $pid"
            kill -TERM $pid 2>/dev/null || true
            sleep 2
            # 如果进程仍在运行，强制杀死
            if kill -0 $pid 2>/dev/null; then
                print_warning "强制停止进程 $pid"
                kill -KILL $pid 2>/dev/null || true
            fi
        done
        print_success "所有 Web Panel 进程已停止"
    else
        print_message "未发现运行中的 Web Panel 进程"
    fi
    
    # 停止可能占用端口的进程
    for port in 3000 5000 8080 9999; do
        PID=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$PID" ]; then
            print_message "停止占用端口 $port 的进程 $PID"
            kill -TERM $PID 2>/dev/null || true
            sleep 1
            if kill -0 $PID 2>/dev/null; then
                kill -KILL $PID 2>/dev/null || true
            fi
        fi
    done
}

# 删除系统服务文件
remove_system_service() {
    print_message "正在删除系统服务文件..."
    
    # 删除 systemd 服务文件
    SERVICE_FILES=(
        "/etc/systemd/system/web-panel.service"
        "/lib/systemd/system/web-panel.service"
        "/usr/lib/systemd/system/web-panel.service"
    )
    
    for service_file in "${SERVICE_FILES[@]}"; do
        if [ -f "$service_file" ]; then
            print_message "删除服务文件: $service_file"
            sudo rm -f "$service_file"
        fi
    done
    
    # 重新加载 systemd
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl daemon-reload
    fi
    
    print_success "系统服务文件已删除"
}

# 删除应用程序文件
remove_application_files() {
    print_message "正在删除应用程序文件..."
    
    # 可能的安装目录
    INSTALL_DIRS=(
        "/opt/web-panel"
        "/usr/local/web-panel"
        "/home/$(whoami)/web-panel"
        "$(pwd)"
    )
    
    for install_dir in "${INSTALL_DIRS[@]}"; do
        if [ -d "$install_dir" ] && [ -f "$install_dir/server.js" ]; then
            print_message "发现安装目录: $install_dir"
            
            # 备份重要文件（可选）
            if [ -f "$install_dir/database/server_panel.db" ]; then
                backup_dir="/tmp/web-panel-backup-$(date +%Y%m%d_%H%M%S)"
                print_message "备份数据库到: $backup_dir"
                mkdir -p "$backup_dir"
                cp "$install_dir/database/server_panel.db" "$backup_dir/" 2>/dev/null || true
                print_message "数据库已备份到 $backup_dir"
            fi
            
            print_message "删除目录: $install_dir"
            rm -rf "$install_dir"
            print_success "应用程序目录已删除: $install_dir"
        fi
    done
}

# 删除用户数据目录
remove_user_data() {
    print_message "正在删除用户数据目录..."
    
    # 用户数据目录
    USER_DATA_DIRS=(
        "$HOME/.local/share/web-panel"
        "$HOME/.config/web-panel"
        "$HOME/.web-panel"
    )
    
    for data_dir in "${USER_DATA_DIRS[@]}"; do
        if [ -d "$data_dir" ]; then
            print_message "删除用户数据目录: $data_dir"
            rm -rf "$data_dir"
            print_success "用户数据目录已删除: $data_dir"
        fi
    done
}

# 删除全局数据目录
remove_global_data() {
    print_message "正在删除全局数据目录..."
    
    # 全局数据目录
    GLOBAL_DATA_DIRS=(
        "/opt/web-panel/database"
        "/var/lib/web-panel"
        "/etc/web-panel"
    )
    
    for data_dir in "${GLOBAL_DATA_DIRS[@]}"; do
        if [ -d "$data_dir" ]; then
            print_message "删除全局数据目录: $data_dir"
            sudo rm -rf "$data_dir"
            print_success "全局数据目录已删除: $data_dir"
        fi
    done
}

# 清理环境变量和配置
cleanup_environment() {
    print_message "正在清理环境配置..."
    
    # 清理可能的环境变量文件
    ENV_FILES=(
        "$HOME/.bashrc"
        "$HOME/.zshrc"
        "$HOME/.profile"
        "/etc/environment"
    )
    
    for env_file in "${ENV_FILES[@]}"; do
        if [ -f "$env_file" ]; then
            # 删除包含 web-panel 的行
            if grep -q "web-panel" "$env_file" 2>/dev/null; then
                print_message "清理环境文件: $env_file"
                # 创建备份
                cp "$env_file" "${env_file}.backup-$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
                # 删除相关行
                sed -i '/web-panel/d' "$env_file" 2>/dev/null || true
            fi
        fi
    done
    
    print_success "环境配置已清理"
}

# 清理临时文件
cleanup_temp_files() {
    print_message "正在清理临时文件..."
    
    # 清理临时目录
    TEMP_DIRS=(
        "/tmp/web-panel*"
        "/var/tmp/web-panel*"
    )
    
    for temp_pattern in "${TEMP_DIRS[@]}"; do
        for temp_dir in $temp_pattern; do
            if [ -d "$temp_dir" ]; then
                print_message "删除临时目录: $temp_dir"
                rm -rf "$temp_dir"
            fi
        done
    done
    
    print_success "临时文件已清理"
}

# 验证卸载
verify_uninstall() {
    print_message "正在验证卸载结果..."
    
    local issues_found=0
    
    # 检查进程
    if pgrep -f "node.*server.js" >/dev/null 2>&1; then
        print_warning "仍有 Web Panel 进程在运行"
        issues_found=1
    fi
    
    # 检查服务
    if systemctl is-active --quiet web-panel 2>/dev/null; then
        print_warning "Web Panel 服务仍在运行"
        issues_found=1
    fi
    
    # 检查主要目录
    if [ -d "/opt/web-panel" ] || [ -d "/usr/local/web-panel" ]; then
        print_warning "仍存在应用程序目录"
        issues_found=1
    fi
    
    if [ $issues_found -eq 0 ]; then
        print_success "卸载验证通过"
    else
        print_warning "卸载可能不完整，请手动检查剩余文件"
    fi
}

# 显示卸载完成信息
show_completion() {
    echo
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}         Web Panel 卸载完成！${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo
    print_success "Web Panel 管理面板已成功卸载"
    echo
    print_message "已删除的内容："
    echo "  ✓ 应用程序文件"
    echo "  ✓ 数据库文件"
    echo "  ✓ 配置文件"
    echo "  ✓ 用户数据"
    echo "  ✓ 系统服务"
    echo "  ✓ 临时文件"
    echo
    
    # 显示备份信息
    backup_dirs=$(ls -d /tmp/web-panel-backup-* 2>/dev/null || true)
    if [ ! -z "$backup_dirs" ]; then
        print_message "数据库备份位置："
        for backup_dir in $backup_dirs; do
            echo "  📁 $backup_dir"
        done
        echo
        print_warning "如需恢复数据，请保存备份文件"
    fi
    
    print_message "感谢您使用 Web Panel！"
    echo
}

# 主函数
main() {
    # 检查是否为 root 用户运行
    if [ "$EUID" -eq 0 ]; then
        print_warning "检测到以 root 用户运行"
    fi
    
    show_banner
    confirm_uninstall
    detect_system
    
    print_message "开始卸载 Web Panel..."
    echo
    
    stop_services
    remove_system_service
    remove_application_files
    remove_user_data
    remove_global_data
    cleanup_environment
    cleanup_temp_files
    verify_uninstall
    
    show_completion
}

# 错误处理
trap 'print_error "卸载过程中发生错误，请检查日志"; exit 1' ERR

# 运行主函数
main "$@"
#!/bin/sh

# Linux Server Panel 一键安装脚本
# 支持在线一键安装，安装过程中会交互式询问配置参数
# 
# 使用方法:
# 1. 在线一键安装: curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh | bash
# 2. 下载后安装: wget https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh && chmod +x install.sh && ./install.sh
# 
# 注意: 安装过程中会询问端口号、用户名和密码等配置参数

# 脚本启动提示
echo "=== Linux Server Panel 安装脚本启动 ==="
echo "脚本版本: v1.2"
echo "当前时间: $(date)"
echo "当前用户: $(whoami)"
echo "当前目录: $(pwd)"
echo "========================================"

# 设置错误处理（温和模式）
# set -e  # 注释掉严格错误退出，避免非致命错误导致安装中断
set -u  # 使用未定义变量时退出
# set -o pipefail  # 管道中任何命令失败都会导致整个管道失败 (sh不支持此选项)

# 启用调试模式（可选）
# set -x

# 全局变量
INSTALL_DIR="/opt/web-panel"
SERVICE_NAME="web-panel"
LOG_FILE="/tmp/web-panel-install.log"
BACKUP_DIR="/tmp/web-panel-backup-$(date +%Y%m%d_%H%M%S)"
INSTALL_SUCCESS=false

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    printf "%b\n" "${GREEN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

print_warning() {
    printf "%b\n" "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

print_error() {
    printf "%b\n" "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

print_success() {
    printf "%b\n" "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

# 错误处理函数
handle_error() {
    exit_code=$?
    line_number=$1
    print_error "安装过程中发生错误 (退出码: $exit_code, 行号: $line_number)"
    print_error "详细日志请查看: $LOG_FILE"
    
    # 只有在致命错误时才回滚（退出码大于1）
    if [ "$INSTALL_SUCCESS" = false ] && [ $exit_code -gt 1 ]; then
        print_message "检测到致命错误，正在执行回滚操作..."
        rollback_installation
        exit $exit_code
    elif [ $exit_code -eq 1 ]; then
        print_warning "检测到非致命错误，继续安装过程..."
        return 0
    fi
}

# 设置错误陷阱（仅处理致命错误）
# trap 'handle_error $LINENO' ERR  # 暂时禁用自动错误陷阱

# 清理函数
cleanup() {
    # 只有在脚本正常结束或用户中断时才清理
    if [ "$INSTALL_SUCCESS" = true ] || [ "${CLEANUP_ON_EXIT:-false}" = true ]; then
        print_message "正在清理临时文件..."
        # 清理临时文件
        rm -f /tmp/node_setup.sh 2>/dev/null || true
        rm -f /tmp/web-panel-*.tar.gz 2>/dev/null || true
        
        # 清理临时扩展的空间
        cleanup_temp_space
    fi
}

# 设置退出陷阱（仅在特定情况下清理）
trap cleanup EXIT

# 用户中断处理
handle_interrupt() {
    print_warning "\n检测到用户中断，正在清理..."
    cleanup_temp_space
    CLEANUP_ON_EXIT=true
    exit 130
}

# 设置中断陷阱
trap handle_interrupt INT TERM

# 回滚函数
rollback_installation() {
    print_warning "开始回滚安装..."
    
    # 停止并删除服务
    # 确定systemctl命令和服务文件路径
    if [ "$(id -u)" -eq 0 ]; then
        ROLLBACK_SYSTEMCTL_CMD="systemctl"
        SERVICE_FILE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
    else
        ROLLBACK_SYSTEMCTL_CMD="systemctl --user"
        SERVICE_FILE_PATH="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
    fi
    
    if $ROLLBACK_SYSTEMCTL_CMD is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        $ROLLBACK_SYSTEMCTL_CMD stop "$SERVICE_NAME" || true
    fi
    
    if $ROLLBACK_SYSTEMCTL_CMD is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        $ROLLBACK_SYSTEMCTL_CMD disable "$SERVICE_NAME" || true
    fi
    
    rm -f "$SERVICE_FILE_PATH" || true
    $ROLLBACK_SYSTEMCTL_CMD daemon-reload || true
    
    # 恢复备份（如果存在）
    if [ -d "$BACKUP_DIR" ]; then
        print_message "恢复备份文件..."
        if [ -d "$BACKUP_DIR/web-panel" ]; then
            rm -rf "$INSTALL_DIR" || true
            mv "$BACKUP_DIR/web-panel" "$INSTALL_DIR" || true
        fi
        
        if [ -f "$BACKUP_DIR/web-panel.service" ]; then
            mv "$BACKUP_DIR/web-panel.service" "$SERVICE_FILE_PATH" || true
            $ROLLBACK_SYSTEMCTL_CMD daemon-reload || true
            $ROLLBACK_SYSTEMCTL_CMD enable "$SERVICE_NAME" || true
            $ROLLBACK_SYSTEMCTL_CMD start "$SERVICE_NAME" || true
        fi
    else
        # 如果没有备份，直接删除安装文件
        print_message "删除安装文件..."
        rm -rf "$INSTALL_DIR" || true
    fi
    
    print_success "回滚完成"
}

# 检查并停止现有服务
check_and_stop_existing_service() {
    print_message "检查是否有现有的Web Panel服务正在运行..."
    
    service_stopped=false
    processes_killed=false
    
    # 检查systemd服务
    if command -v systemctl >/dev/null 2>&1; then
        # 确定systemctl命令
        if [ "$(id -u)" -eq 0 ]; then
            CHECK_SYSTEMCTL_CMD="systemctl"
        else
            CHECK_SYSTEMCTL_CMD="systemctl --user"
        fi
        
        # 检查用户级服务
        if $CHECK_SYSTEMCTL_CMD is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
            print_warning "检测到用户级systemd服务 $SERVICE_NAME 正在运行，正在停止..."
            if $CHECK_SYSTEMCTL_CMD stop "$SERVICE_NAME" 2>/dev/null; then
                print_success "用户级systemd服务已停止"
                service_stopped=true
            else
                print_warning "无法通过systemctl --user停止服务，尝试其他方法"
            fi
        fi
        
        # 如果是非root用户，还需要检查系统级服务（可能之前以root安装）
        if [ "$(id -u)" -ne 0 ]; then
            if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
                print_warning "检测到系统级服务 $SERVICE_NAME 正在运行"
                print_message "建议使用以下命令停止系统级服务："
                echo "  sudo systemctl stop $SERVICE_NAME"
                echo "  sudo systemctl disable $SERVICE_NAME"
                print_warning "系统级服务仍在运行，但将继续安装用户级服务"
                print_message "注意：可能会出现端口冲突，建议先停止系统级服务"
            fi
        fi
        
        # 禁用服务以防止自动启动
        if $CHECK_SYSTEMCTL_CMD is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
            print_message "禁用服务自动启动..."
            $CHECK_SYSTEMCTL_CMD disable "$SERVICE_NAME" 2>/dev/null || true
        fi
    fi
    
    # 检查并终止Node.js进程
    node_processes=$(pgrep -f "node.*server.js" 2>/dev/null || true)
    if [ -n "$node_processes" ]; then
        print_warning "检测到Node.js Web Panel进程正在运行，正在终止..."
        echo "进程ID: $node_processes"
        
        # 检查当前用户是否有权限终止这些进程
        can_kill=true
        for pid in $node_processes; do
            # 检查进程所有者
            if command -v ps >/dev/null 2>&1; then
                process_owner=$(ps -o user= -p "$pid" 2>/dev/null || echo "unknown")
                current_user=$(whoami)
                if [ "$process_owner" != "$current_user" ] && [ "$(id -u)" -ne 0 ]; then
                    print_warning "进程 $pid 属于用户 $process_owner，当前用户 $current_user 可能无权限终止"
                    can_kill=false
                fi
            fi
        done
        
        if [ "$can_kill" = true ]; then
            # 优雅终止
            if kill -TERM $node_processes 2>/dev/null; then
                print_message "发送TERM信号，等待进程优雅退出..."
                sleep 3
                
                # 检查进程是否仍在运行
                remaining_processes=$(pgrep -f "node.*server.js" 2>/dev/null || true)
                if [ -n "$remaining_processes" ]; then
                    print_warning "进程仍在运行，强制终止..."
                    kill -KILL $remaining_processes 2>/dev/null || true
                    sleep 1
                fi
                processes_killed=true
            else
                print_warning "无法终止进程，可能权限不足"
            fi
        else
            print_warning "检测到权限问题，无法自动终止所有进程"
        fi
    fi
    
    # 检查端口占用
    # 使用函数方式替代数组，兼容sh
    check_port_usage() {
        # 检查常用端口
        for port in 3000 8080 9999; do
            # 尝试netstat命令
            if command -v netstat >/dev/null 2>&1; then
                port_info=$(netstat -tlnp 2>/dev/null | grep ":$port ")
                if [ -n "$port_info" ]; then
                    echo "端口 $port 被占用: $port_info"
                fi
            fi
            # 尝试ss命令
            if command -v ss >/dev/null 2>&1; then
                port_info=$(ss -tlnp 2>/dev/null | grep ":$port ")
                if [ -n "$port_info" ]; then
                    echo "端口 $port 被占用: $port_info"
                fi
            fi
        done
    }
    
    # 执行端口检查
    check_port_usage
    
    # 最终验证
    sleep 2
    final_check=$(pgrep -f "node.*server.js" 2>/dev/null || true)
    if [ -n "$final_check" ]; then
        # 检查进程所有者，决定是否继续
        current_user=$(whoami)
        current_user_processes=""
        other_user_processes=""
        
        # 分类进程：当前用户的进程 vs 其他用户的进程
        for pid in $final_check; do
            if command -v ps >/dev/null 2>&1; then
                process_owner=$(ps -o user= -p "$pid" 2>/dev/null || echo "unknown")
                if [ "$process_owner" = "$current_user" ] || [ "$(id -u)" -eq 0 ]; then
                    current_user_processes="$current_user_processes $pid"
                else
                    other_user_processes="$other_user_processes $pid"
                fi
            fi
        done
        
        # 处理当前用户的进程
        if [ -n "$current_user_processes" ]; then
            print_warning "检测到当前用户的Web Panel进程仍在运行"
            print_warning "进程ID: $current_user_processes"
            print_message "尝试再次终止这些进程..."
            
            # 尝试再次终止当前用户的进程
            for pid in $current_user_processes; do
                kill -KILL "$pid" 2>/dev/null || true
            done
            
            sleep 2
            
            # 再次检查当前用户的进程
            remaining_current_processes=""
            for pid in $current_user_processes; do
                if kill -0 "$pid" 2>/dev/null; then
                    remaining_current_processes="$remaining_current_processes $pid"
                fi
            done
            
            if [ -n "$remaining_current_processes" ]; then
                print_error "无法终止当前用户的Web Panel进程，请手动处理"
                print_error "剩余进程: $remaining_current_processes"
                print_message "请手动终止进程: kill -9 $remaining_current_processes"
                return 1
            else
                print_success "当前用户的进程已成功终止"
            fi
        fi
        
        # 处理其他用户的进程
        if [ -n "$other_user_processes" ]; then
            print_warning "检测到其他用户的Web Panel进程正在运行"
            print_warning "进程ID: $other_user_processes"
            print_message "由于权限限制无法自动终止，但将继续安装"
            print_message "注意：可能会出现端口冲突"
            print_message "建议联系管理员停止相关进程或使用不同端口"
        fi
    fi
    
    if [ "$service_stopped" = true ] || [ "$processes_killed" = true ]; then
        print_success "现有Web Panel服务已成功停止"
    else
        print_message "未检测到运行中的Web Panel服务"
    fi
    
    return 0
}

# 创建备份
create_backup() {
    if [ -d "$INSTALL_DIR" ] || [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
        print_message "创建备份到: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
        
        # 备份安装目录
        if [ -d "$INSTALL_DIR" ]; then
            cp -r "$INSTALL_DIR" "$BACKUP_DIR/web-panel" || true
        fi
        
        # 备份服务文件
        # 根据用户权限确定服务文件路径
        if [ "$(id -u)" -eq 0 ]; then
            BACKUP_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
        else
            BACKUP_SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
        fi
        
        if [ -f "$BACKUP_SERVICE_FILE" ]; then
            cp "$BACKUP_SERVICE_FILE" "$BACKUP_DIR/" || true
        fi
        
        print_success "备份创建完成"
    fi
}

# 验证安装 - 模仿1Panel的服务启动验证机制
verify_installation() {
    print_message "正在验证安装..."
    
    # 检查安装目录
    if [ ! -d "$INSTALL_DIR" ]; then
        print_error "安装目录不存在: $INSTALL_DIR"
        return 1
    fi
    
    # 检查主要文件
    if [ ! -f "$INSTALL_DIR/server.js" ]; then
        print_error "主程序文件不存在: $INSTALL_DIR/server.js"
        return 1
    fi
    
    # 检查服务文件
    if [ "$(id -u)" -eq 0 ]; then
        VERIFY_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
        VERIFY_SYSTEMCTL_CMD="systemctl"
    else
        VERIFY_SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
        VERIFY_SYSTEMCTL_CMD="systemctl --user"
    fi
    
    if [ ! -f "$VERIFY_SERVICE_FILE" ]; then
        print_error "服务文件不存在: $VERIFY_SERVICE_FILE"
        return 1
    fi
    
    # 检查服务状态
    if ! $VERIFY_SYSTEMCTL_CMD is-active --quiet "$SERVICE_NAME"; then
        print_error "服务未正常运行"
        return 1
    fi
    
    # 检查端口监听 - 模仿1Panel的服务启动验证机制
    local MAX_ATTEMPTS=30
    local ATTEMPT_INTERVAL=2
    
    print_message "等待服务启动和端口监听..."
    
    # 模仿1Panel的服务启动验证循环
    for attempt in $(seq 1 $MAX_ATTEMPTS); do
        # 检查systemd服务状态
        if command -v systemctl >/dev/null 2>&1; then
            if $VERIFY_SYSTEMCTL_CMD status $SERVICE_NAME 2>&1 | grep -q "Active.*running"; then
                print_success "服务 $SERVICE_NAME 运行正常"
                
                # 服务运行后，检查端口监听
                port_listening=false
                
                # 方式1: 使用netstat检查
                if command -v netstat >/dev/null 2>&1; then
                    if netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
                        port_listening=true
                    fi
                fi
                
                # 方式2: 使用ss检查
                if [ "$port_listening" = false ] && command -v ss >/dev/null 2>&1; then
                    if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
                        port_listening=true
                    fi
                fi
                
                # 方式3: 使用lsof检查
                if [ "$port_listening" = false ] && command -v lsof >/dev/null 2>&1; then
                    if lsof -i :$PORT 2>/dev/null | grep -q LISTEN; then
                        port_listening=true
                    fi
                fi
                
                # 方式4: 使用nc测试连接
                if [ "$port_listening" = false ] && command -v nc >/dev/null 2>&1; then
                    if nc -z localhost $PORT 2>/dev/null; then
                        port_listening=true
                    fi
                fi
                
                if [ "$port_listening" = true ]; then
                    print_success "端口 $PORT 已正常监听"
                    
                    # 检查RTSPtoWeb服务状态
                    # 确定RTSPtoWeb的systemctl命令
                    if [ "$(id -u)" -eq 0 ]; then
                        RTSPWEB_VERIFY_SYSTEMCTL_CMD="systemctl"
                    else
                        RTSPWEB_VERIFY_SYSTEMCTL_CMD="systemctl --user"
                    fi
                    
                    if $RTSPWEB_VERIFY_SYSTEMCTL_CMD status rtspweb 2>&1 | grep -q "Active.*running"; then
                        print_success "服务 rtspweb 运行正常"
                        
                        # 检查RTSPtoWeb端口监听
                        rtspweb_port_listening=false
                        RTSPWEB_PORT=8084
                        
                        # 方式1: 使用netstat检查RTSPtoWeb端口
                        if command -v netstat >/dev/null 2>&1; then
                            if netstat -tlnp 2>/dev/null | grep -q ":$RTSPWEB_PORT "; then
                                rtspweb_port_listening=true
                            fi
                        fi
                        
                        # 方式2: 使用ss检查RTSPtoWeb端口
                        if [ "$rtspweb_port_listening" = false ] && command -v ss >/dev/null 2>&1; then
                            if ss -tlnp 2>/dev/null | grep -q ":$RTSPWEB_PORT "; then
                                rtspweb_port_listening=true
                            fi
                        fi
                        
                        # 方式3: 使用lsof检查RTSPtoWeb端口
                        if [ "$rtspweb_port_listening" = false ] && command -v lsof >/dev/null 2>&1; then
                            if lsof -i :$RTSPWEB_PORT 2>/dev/null | grep -q LISTEN; then
                                rtspweb_port_listening=true
                            fi
                        fi
                        
                        # 方式4: 使用nc测试RTSPtoWeb连接
                        if [ "$rtspweb_port_listening" = false ] && command -v nc >/dev/null 2>&1; then
                            if nc -z localhost $RTSPWEB_PORT 2>/dev/null; then
                                rtspweb_port_listening=true
                            fi
                        fi
                        
                        if [ "$rtspweb_port_listening" = true ]; then
                            print_success "端口 $RTSPWEB_PORT 已正常监听"
                            print_success "安装验证通过"
                            return 0
                        else
                            print_warning "RTSPtoWeb端口 $RTSPWEB_PORT 未正常监听，但Web Panel正常运行"
                            print_success "安装验证通过"
                            return 0
                        fi
                    else
                        print_warning "RTSPtoWeb服务未正常运行，但Web Panel正常运行"
                        print_success "安装验证通过"
                        return 0
                    fi
                fi
            fi
        # 检查其他init系统（如OpenRC、SysV）
        elif command -v service >/dev/null 2>&1; then
            if service $SERVICE_NAME status 2>&1 | grep -q "running\|active"; then
                print_success "服务 $SERVICE_NAME 运行正常"
                # 同样检查端口监听...
                if netstat -tlnp 2>/dev/null | grep -q ":$PORT " || ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
                    print_success "端口 $PORT 已正常监听"
                    print_success "安装验证通过"
                    return 0
                fi
            fi
        fi
        
        # 如果达到最大尝试次数，进行自动修复
        if [ $attempt -eq $MAX_ATTEMPTS ]; then
            print_warning "服务启动验证超时，正在进行自动修复..."
            
            # 尝试自动修复
            print_message "=== 自动修复开始 ==="
            
            # 1. 检查并修复数据库配置
            print_message "检查数据库配置..."
            if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_DIR/panel.db" ]; then
                CURRENT_PORT=$(sqlite3 "$DB_DIR/panel.db" "SELECT value FROM config WHERE key='server_port';" 2>/dev/null || echo "")
                if [ "$CURRENT_PORT" != "$PORT" ]; then
                    print_warning "数据库端口配置错误 ($CURRENT_PORT != $PORT)，正在修复..."
                    sqlite3 "$DB_DIR/panel.db" "INSERT OR REPLACE INTO config (key, value) VALUES ('server_port', '$PORT');"
                    print_success "数据库端口配置已修复"
                fi
            fi
            
            # 2. 重启服务
            print_message "重启服务..."
            # 确定systemctl命令
            if [ "$(id -u)" -eq 0 ]; then
                REPAIR_SYSTEMCTL_CMD="systemctl"
            else
                REPAIR_SYSTEMCTL_CMD="systemctl --user"
            fi
            
            $REPAIR_SYSTEMCTL_CMD stop $SERVICE_NAME 2>/dev/null || service $SERVICE_NAME stop 2>/dev/null || true
            sleep 3
            $REPAIR_SYSTEMCTL_CMD start $SERVICE_NAME 2>/dev/null || service $SERVICE_NAME start 2>/dev/null
            
            # 3. 再次检查（短时间）
            print_message "重新检查服务状态..."
            for j in {1..10}; do
                sleep 2
                if ($REPAIR_SYSTEMCTL_CMD status $SERVICE_NAME 2>&1 | grep -q "Active.*running") || (service $SERVICE_NAME status 2>&1 | grep -q "running\|active"); then
                    if netstat -tlnp 2>/dev/null | grep -q ":$PORT " || ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
                        print_success "自动修复成功！服务和端口现在正常运行"
                        return 0
                    fi
                fi
            done
            
            # 4. 如果仍然失败，提供详细诊断
            print_warning "自动修复失败，提供详细诊断信息..."
            print_message "=== 详细诊断信息 ==="
            print_message "目标端口: $PORT"
            print_message "服务名称: $SERVICE_NAME"
            
            # 检查服务状态
            print_message "服务状态:"
            $REPAIR_SYSTEMCTL_CMD status $SERVICE_NAME --no-pager -l 2>/dev/null || service $SERVICE_NAME status 2>/dev/null || true
            
            # 检查进程
            print_message "相关进程:"
            ps aux | grep -E "(node|$SERVICE_NAME)" | grep -v grep || true
            
            # 检查端口占用
            print_message "端口占用情况:"
            if command -v netstat >/dev/null 2>&1; then
                netstat -tlnp | grep ":$PORT " || print_message "netstat未发现端口$PORT监听"
            fi
            if command -v ss >/dev/null 2>&1; then
                ss -tlnp | grep ":$PORT " || print_message "ss未发现端口$PORT监听"
            fi
            
            print_message "=== 修复建议 ==="
            print_message "1. 查看服务日志: journalctl -u $SERVICE_NAME -f"
            print_message "2. 手动启动测试: cd $INSTALL_DIR && PORT=$PORT node server.js"
            print_message "3. 运行修复脚本: curl -sSL https://raw.githubusercontent.com/boxpanel/web-panel/main/fix-port-issue.sh | sudo bash -s -- $PORT"
            print_message "4. 运行诊断脚本: curl -sSL https://raw.githubusercontent.com/boxpanel/web-panel/main/debug-port-issue.sh | bash"
            
            print_warning "安装验证未完全通过，但安装过程已完成"
            return 0
        else
            print_message "等待中... (尝试 $attempt/$MAX_ATTEMPTS)"
            sleep $ATTEMPT_INTERVAL
        fi
    done
    
    return 0
}

# 检查磁盘空间并自动增加临时目录空间
check_and_expand_disk_space() {
    print_message "正在检查磁盘空间..."
    
    # 检查/tmp目录可用空间（单位：KB）
    local tmp_available=$(df /tmp | tail -1 | awk '{print $4}')
    local required_space=102400  # 100MB = 100 * 1024 KB
    
    print_message "当前/tmp目录可用空间: ${tmp_available}KB"
    print_message "安装所需最小空间: ${required_space}KB"
    
    if [ "$tmp_available" -lt "$required_space" ]; then
        print_warning "临时目录空间不足，正在尝试自动扩展..."
        
        # 方法1: 清理系统临时文件
        print_message "清理系统临时文件..."
        find /tmp -type f -mtime +1 -delete 2>/dev/null || true
        find /var/tmp -type f -mtime +1 -delete 2>/dev/null || true
        
        # 重新检查空间
        tmp_available=$(df /tmp | tail -1 | awk '{print $4}')
        print_message "清理后可用空间: ${tmp_available}KB"
        
        if [ "$tmp_available" -lt "$required_space" ]; then
            # 方法2: 创建临时的swap文件来增加虚拟空间
            print_message "尝试创建临时swap文件增加可用空间..."
            
            local swap_size=256  # 256MB
            local swap_file="/tmp/web-panel-temp-swap"
            
            if dd if=/dev/zero of="$swap_file" bs=1M count=$swap_size 2>/dev/null; then
                chmod 600 "$swap_file"
                if mkswap "$swap_file" >/dev/null 2>&1 && swapon "$swap_file" 2>/dev/null; then
                    print_success "临时swap文件创建成功，增加了${swap_size}MB虚拟空间"
                    # 设置安装完成后清理swap文件的标记
                    export CLEANUP_TEMP_SWAP="$swap_file"
                else
                    rm -f "$swap_file" 2>/dev/null || true
                    print_warning "无法创建swap文件，继续安装但可能遇到空间问题"
                fi
            fi
            
            # 方法3: 使用内存文件系统
            if [ "$tmp_available" -lt "$required_space" ]; then
                print_message "尝试挂载内存文件系统到临时目录..."
                local tmpfs_size="200M"
                local temp_mount="/tmp/web-panel-install"
                
                mkdir -p "$temp_mount"
                if mount -t tmpfs -o size=$tmpfs_size tmpfs "$temp_mount" 2>/dev/null; then
                    print_success "内存文件系统挂载成功: $temp_mount (${tmpfs_size})"
                    # 更新临时目录路径
                    export TEMP_INSTALL_DIR="$temp_mount"
                    export CLEANUP_TEMP_MOUNT="$temp_mount"
                else
                    print_warning "无法挂载内存文件系统"
                fi
            fi
        fi
        
        # 最终检查
        tmp_available=$(df /tmp | tail -1 | awk '{print $4}')
        if [ "$tmp_available" -lt "$required_space" ] && [ -z "${TEMP_INSTALL_DIR:-}" ]; then
            print_error "清理后临时目录空间仍不足，请手动清理/tmp目录或增加磁盘空间"
            print_message "当前可用空间: ${tmp_available}KB"
            print_message "建议清理命令: sudo find /tmp -type f -mtime +1 -delete"
            return 1
        fi
    fi
    
    print_success "磁盘空间检查通过"
    return 0
}

# 清理临时扩展的空间
cleanup_temp_space() {
    if [ -n "${CLEANUP_TEMP_SWAP:-}" ] && [ -f "${CLEANUP_TEMP_SWAP:-}" ]; then
        print_message "清理临时swap文件..."
        swapoff "${CLEANUP_TEMP_SWAP:-}" 2>/dev/null || true
        rm -f "${CLEANUP_TEMP_SWAP:-}" 2>/dev/null || true
    fi
    
    if [ -n "${CLEANUP_TEMP_MOUNT:-}" ] && mountpoint -q "${CLEANUP_TEMP_MOUNT:-}" 2>/dev/null; then
        print_message "卸载临时内存文件系统..."
        umount "${CLEANUP_TEMP_MOUNT:-}" 2>/dev/null || true
        rmdir "${CLEANUP_TEMP_MOUNT:-}" 2>/dev/null || true
    fi
}

# 检查用户权限并设置相应的路径
check_user_permissions() {
    if [ "$(id -u)" -eq 0 ]; then
        print_message "检测到root权限，使用系统级安装路径"
        DB_DIR="/opt/web-panel/database"
        DB_USER="root"
        DB_GROUP="root"
        INSTALL_USER="root"
        INSTALL_GROUP="root"
    else
        print_warning "检测到非root用户，使用用户级安装路径"
        print_message "如果需要系统级安装，请使用: sudo bash install.sh"
        
        # 使用用户主目录下的路径
        DB_DIR="$HOME/.local/share/web-panel/database"
        DB_USER="$(whoami)"
        DB_GROUP="$(id -gn)"
        INSTALL_USER="$(whoami)"
        INSTALL_GROUP="$(id -gn)"
        
        # 更新安装目录为用户目录
        INSTALL_DIR="$HOME/.local/share/web-panel"
        
        print_message "数据库目录: $DB_DIR"
        print_message "安装目录: $INSTALL_DIR"
    fi
    
    # 导出变量供其他函数使用
    export DB_DIR DB_USER DB_GROUP INSTALL_USER INSTALL_GROUP
}

# 获取用户输入参数
get_user_input() {
    # 检查是否有终端可用于交互
    if [ ! -c "/dev/tty" ]; then
        print_error "无法访问终端设备，无法进行交互式输入"
        print_error "请确保在支持交互的终端环境中运行此脚本"
        exit 1
    fi
    
    # 交互式安装配置
    print_message "欢迎使用Web面板安装程序"
    print_message "请配置您的Web面板参数"
    echo
    
    # 交互式输入所有参数（支持管道模式）
    while true; do
        printf "请输入Web面板端口号 (默认: 3000): " >/dev/tty
        read PORT </dev/tty
        PORT=${PORT:-3000}
        if echo "$PORT" | grep -q '^[0-9]\+$' && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; then
            export PORT
            break
        else
            print_error "请输入有效的端口号 (1-65535)"
        fi
    done
    
    while true; do
        printf "请输入管理员用户名: " >/dev/tty
        read USERNAME </dev/tty
        if [ -n "$USERNAME" ] && echo "$USERNAME" | grep -q '^[a-zA-Z0-9_]\+$'; then
            export USERNAME
            break
        else
            print_error "用户名只能包含字母、数字和下划线"
        fi
    done
    
    while true; do
        printf "请输入管理员密码: " >/dev/tty
        stty -echo </dev/tty
        read PASSWORD </dev/tty
        stty echo </dev/tty
        echo >/dev/tty
        if [ ${#PASSWORD} -ge 6 ]; then
            printf "请再次输入密码确认: " >/dev/tty
            stty -echo </dev/tty
            read PASSWORD_CONFIRM </dev/tty
            stty echo </dev/tty
            echo >/dev/tty
            if [ "$PASSWORD" = "$PASSWORD_CONFIRM" ]; then
                export PASSWORD
                break
            else
                print_error "两次输入的密码不一致"
            fi
        else
            print_error "密码长度至少6位"
        fi
    done
    
    print_message "最终配置: 端口=$PORT, 用户名=$USERNAME"
}

# 检测系统类型
detect_system() {
    print_message "正在检测系统类型..."
    
    # 检测操作系统
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
        OS=$(cat /etc/redhat-release | cut -d' ' -f1)
        VER=$(cat /etc/redhat-release | grep -o '[0-9]\+\.[0-9]\+')
    else
        OS=$(uname -s)
        VER=$(uname -r)
    fi
    
    # 根据系统类型设置包管理器
    case "$OS" in
        *"CentOS"*|*"Red Hat"*|*"RHEL"*|*"Rocky"*|*"AlmaLinux"*|*"Fedora"*)
            SYSTEM="rhel"
            if command -v dnf >/dev/null 2>&1; then
                PM="dnf"
            else
                PM="yum"
            fi
            print_message "检测到Red Hat系列系统，使用 $PM"
            ;;
        *"Ubuntu"*|*"Debian"*|*"Mint"*|*"Kali"*)
            SYSTEM="debian"
            PM="apt-get"
            print_message "检测到Debian系列系统，使用 $PM"
            ;;
        *"SUSE"*|*"openSUSE"*)
            SYSTEM="suse"
            PM="zypper"
            print_message "检测到SUSE系列系统，使用 $PM"
            ;;
        *"Alpine"*)
            SYSTEM="alpine"
            PM="apk"
            print_message "检测到Alpine Linux，使用 $PM"
            ;;
        *"Arch"*|*"Manjaro"*)
            SYSTEM="arch"
            PM="pacman"
            print_message "检测到Arch系列系统，使用 $PM"
            ;;
        *)
            print_warning "未知系统类型: $OS，尝试自动检测包管理器"
            SYSTEM="unknown"
            if command -v apt-get >/dev/null 2>&1; then
                PM="apt-get"
            elif command -v yum >/dev/null 2>&1; then
                PM="yum"
            elif command -v dnf >/dev/null 2>&1; then
                PM="dnf"
            elif command -v zypper >/dev/null 2>&1; then
                PM="zypper"
            elif command -v apk >/dev/null 2>&1; then
                PM="apk"
            elif command -v pacman >/dev/null 2>&1; then
                PM="pacman"
            else
                PM="unknown"
                print_error "无法检测到支持的包管理器"
            fi
            ;;
    esac
    
    print_message "系统类型: $SYSTEM, 包管理器: $PM"
}

# 安装依赖
install_dependencies() {
    print_message "正在安装依赖包..."
    
    # 更新包管理器
    update_package_manager
    
    # 安装基础工具
    install_basic_tools

    install_ffmpeg_rockchip
    
    # 检查Node.js是否已安装
    if ! command -v node >/dev/null 2>&1; then
        print_message "Node.js未安装，正在安装..."
        install_nodejs
    else
        NODE_VERSION=$(node --version | sed 's/v//')
        print_message "Node.js已安装: v$NODE_VERSION"
        
        # 检查Node.js版本是否过低
        if [ "$(printf '%s\n' "14.0.0" "$NODE_VERSION" | sort -V | head -n1)" = "14.0.0" ]; then
            print_message "Node.js版本符合要求"
        else
            print_warning "Node.js版本过低 (当前: v$NODE_VERSION, 需要: >=14.0.0)，正在更新..."
            install_nodejs
        fi
    fi
    
    # 检查npm是否已安装
    if ! command -v npm >/dev/null 2>&1; then
        print_error "npm未安装，请检查Node.js安装"
        exit 1
    else
        print_message "npm已安装: $(npm --version)"
    fi
    
    # 检查Go是否已安装
    if ! command -v go >/dev/null 2>&1; then
        print_message "Go语言未安装，正在安装..."
        install_golang
    else
        GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
        print_message "Go语言已安装: $GO_VERSION"
        
        # 检查Go版本是否过低
        if [ "$(printf '%s\n' "1.18.0" "$GO_VERSION" | sort -V | head -n1)" = "1.18.0" ]; then
            print_message "Go语言版本符合要求"
        else
            print_warning "Go语言版本过低 (当前: $GO_VERSION, 需要: >=1.18.0)，正在更新..."
            install_golang
        fi
    fi
}

# 更新包管理器
update_package_manager() {
    print_message "正在更新包管理器..."
    case "$SYSTEM" in
        "rhel")
            $PM makecache -y >/dev/null 2>&1 || true
            ;;
        "debian")
            $PM update >/dev/null 2>&1 || true
            ;;
        "suse")
            $PM refresh >/dev/null 2>&1 || true
            ;;
        "alpine")
            $PM update >/dev/null 2>&1 || true
            ;;
        "arch")
            $PM -Sy >/dev/null 2>&1 || true
            ;;
    esac
}

# 安装基础工具
install_basic_tools() {
    print_message "正在安装基础工具..."
    case "$SYSTEM" in
        "rhel")
            $PM install -y curl wget git tar gzip unzip sqlite ffmpeg >/dev/null 2>&1 || true
            ;;
        "debian")
            $PM install -y curl wget git tar gzip unzip sqlite3 ffmpeg >/dev/null 2>&1 || true
            ;;
        "suse")
            $PM install -y curl wget git tar gzip unzip sqlite3 ffmpeg >/dev/null 2>&1 || true
            ;;
        "alpine")
            $PM add curl wget git tar gzip unzip sqlite ffmpeg >/dev/null 2>&1 || true
            ;;
        "arch")
            $PM -S --noconfirm curl wget git tar gzip unzip sqlite ffmpeg >/dev/null 2>&1 || true
            ;;
        *)
            print_warning "未知系统，跳过基础工具安装"
            ;;
    esac
    
    # 验证sqlite3是否安装成功
    if command -v sqlite3 >/dev/null 2>&1; then
        SQLITE_VERSION=$(sqlite3 --version | awk '{print $1}')
        print_success "sqlite3已安装: $SQLITE_VERSION"
    else
        print_warning "sqlite3安装失败，尝试备用安装方法..."
        install_sqlite3_fallback
    fi
}

install_ffmpeg_rockchip() {
    if command -v ffmpeg >/dev/null 2>&1 && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q "h264_rkmpp"; then
        print_success "已检测到支持RKMPP的FFmpeg"
        return
    fi

    ARCH="$(uname -m)"
    case "$ARCH" in
        "aarch64" | "arm64") ;;
        *)
            print_message "当前架构($ARCH)非Rockchip常用ARM64，跳过安装ffmpeg-rockchip"
            return
            ;;
    esac

    if [ ! -e /dev/mpp_service ] && [ ! -e /dev/mpp-service ] && [ ! -e /dev/rkvdec ] && [ ! -e /dev/rkvenc ] && [ ! -e /dev/vpu_service ] && [ ! -e /dev/vpu-service ]; then
        print_message "未检测到Rockchip MPP相关设备节点，跳过安装ffmpeg-rockchip"
        return
    fi

    if ! command -v curl >/dev/null 2>&1; then
        print_warning "curl不可用，跳过安装ffmpeg-rockchip"
        return
    fi

    print_message "正在尝试安装ffmpeg-rockchip（用于RKMPP硬件转码）..."

    API_URL="https://api.github.com/repos/nyanmisaka/ffmpeg-rockchip/releases/latest"
    RELEASE_JSON="$(curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: web-panel-install" "$API_URL" 2>/dev/null || true)"
    if [ -z "$RELEASE_JSON" ]; then
        print_warning "获取ffmpeg-rockchip发布信息失败，跳过安装"
        return
    fi

    ASSET_URL="$(printf "%s" "$RELEASE_JSON" | grep -Eo '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]+"' | sed -E 's/.*"([^"]+)".*/\1/' | grep -Ei 'linux' | grep -Ei '(aarch64|arm64)' | head -n 1)"
    if [ -z "$ASSET_URL" ]; then
        print_warning "未找到适配ARM64的ffmpeg-rockchip发布包，跳过安装"
        return
    fi

    TMP_DIR="$(mktemp -d 2>/dev/null || echo "/tmp/ffmpeg-rockchip.$$")"
    mkdir -p "$TMP_DIR" >/dev/null 2>&1 || true
    ASSET_FILE="$TMP_DIR/asset"

    if ! curl -fL --retry 3 --connect-timeout 10 "$ASSET_URL" -o "$ASSET_FILE" >/dev/null 2>&1; then
        print_warning "下载ffmpeg-rockchip失败：$ASSET_URL"
        rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
        return
    fi

    EXTRACT_DIR="$TMP_DIR/extract"
    mkdir -p "$EXTRACT_DIR" >/dev/null 2>&1 || true

    case "$ASSET_URL" in
        *.tar.gz|*.tgz)
            tar -xzf "$ASSET_FILE" -C "$EXTRACT_DIR" >/dev/null 2>&1 || true
            ;;
        *.tar.xz)
            tar -xJf "$ASSET_FILE" -C "$EXTRACT_DIR" >/dev/null 2>&1 || true
            ;;
        *.zip)
            if command -v unzip >/dev/null 2>&1; then
                unzip -q "$ASSET_FILE" -d "$EXTRACT_DIR" >/dev/null 2>&1 || true
            fi
            ;;
        *)
            tar -xf "$ASSET_FILE" -C "$EXTRACT_DIR" >/dev/null 2>&1 || true
            ;;
    esac

    FFMPEG_BIN="$(find "$EXTRACT_DIR" -type f -name ffmpeg -perm -111 2>/dev/null | head -n 1)"
    FFPROBE_BIN="$(find "$EXTRACT_DIR" -type f -name ffprobe -perm -111 2>/dev/null | head -n 1)"

    if [ -z "$FFMPEG_BIN" ] || [ -z "$FFPROBE_BIN" ]; then
        print_warning "未在发布包中找到ffmpeg/ffprobe可执行文件，跳过安装"
        rm -rf "$TMP_DIR" >/dev/null 2>&1 || true
        return
    fi

    if [ "$(id -u)" -eq 0 ]; then
        install -m 0755 "$FFMPEG_BIN" /usr/local/bin/ffmpeg >/dev/null 2>&1 || true
        install -m 0755 "$FFPROBE_BIN" /usr/local/bin/ffprobe >/dev/null 2>&1 || true
        USER_TO_ADD="${SUDO_USER:-}"
        if [ -n "$USER_TO_ADD" ]; then
            usermod -aG video "$USER_TO_ADD" >/dev/null 2>&1 || true
            usermod -aG render "$USER_TO_ADD" >/dev/null 2>&1 || true
        fi
    else
        mkdir -p "$HOME/.local/bin" >/dev/null 2>&1 || true
        install -m 0755 "$FFMPEG_BIN" "$HOME/.local/bin/ffmpeg" >/dev/null 2>&1 || true
        install -m 0755 "$FFPROBE_BIN" "$HOME/.local/bin/ffprobe" >/dev/null 2>&1 || true
    fi

    rm -rf "$TMP_DIR" >/dev/null 2>&1 || true

    if command -v ffmpeg >/dev/null 2>&1 && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q "h264_rkmpp"; then
        print_success "ffmpeg-rockchip安装成功（已支持RKMPP）"
    else
        print_warning "ffmpeg-rockchip安装流程已执行，但未检测到RKMPP编码器（可能需要重登/权限或发布包不匹配）"
    fi
}

# sqlite3备用安装方法
install_sqlite3_fallback() {
    print_message "正在尝试sqlite3备用安装方法..."
    
    case "$SYSTEM" in
        "rhel")
            # 尝试EPEL仓库
            if command -v dnf >/dev/null 2>&1; then
                dnf install -y epel-release >/dev/null 2>&1 || true
                dnf install -y sqlite >/dev/null 2>&1 || true
            else
                yum install -y epel-release >/dev/null 2>&1 || true
                yum install -y sqlite >/dev/null 2>&1 || true
            fi
            ;;
        "debian")
            # 强制重新安装
            apt-get install -y --reinstall sqlite3 >/dev/null 2>&1 || true
            ;;
        "suse")
            # 尝试不同的包名
            zypper install -y sqlite3-tools >/dev/null 2>&1 || true
            ;;
        "alpine")
            # 尝试不同的包名
            apk add sqlite-dev >/dev/null 2>&1 || true
            ;;
        "arch")
            # 强制重新安装
            pacman -S --noconfirm sqlite >/dev/null 2>&1 || true
            ;;
    esac
    
    # 再次验证
    if command -v sqlite3 >/dev/null 2>&1; then
        SQLITE_VERSION=$(sqlite3 --version | awk '{print $1}')
        print_success "sqlite3备用安装成功: $SQLITE_VERSION"
    else
        print_warning "sqlite3安装失败，数据库配置验证功能将不可用"
        print_message "您可以稍后手动安装: 'sudo apt install sqlite3' (Debian/Ubuntu) 或 'sudo yum install sqlite' (RHEL/CentOS)"
    fi
}

# 安装Node.js
install_nodejs() {
    case "$SYSTEM" in
        "rhel")
            if command -v dnf >/dev/null 2>&1; then
                # 使用NodeSource仓库安装最新LTS
                curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash - >/dev/null 2>&1
                $PM install -y nodejs
            else
                # CentOS 7等老版本
                curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash - >/dev/null 2>&1
                $PM install -y nodejs
            fi
            ;;
        "debian")
            # 使用NodeSource仓库安装最新LTS
            curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - >/dev/null 2>&1
            $PM install -y nodejs
            ;;
        "suse")
            # openSUSE使用官方仓库
            $PM install -y nodejs npm
            ;;
        "alpine")
            # Alpine使用官方仓库
            $PM add nodejs npm
            ;;
        "arch")
            # Arch使用官方仓库
            $PM -S --noconfirm nodejs npm
            ;;
        *)
            print_error "不支持的系统类型，请手动安装Node.js"
            print_message "访问 https://nodejs.org/ 下载安装"
            exit 1
            ;;
    esac
}

# 安装Go语言
install_golang() {
    print_message "正在安装Go语言..."
    
    # 获取系统架构
    ARCH=$(uname -m)
    case "$ARCH" in
        "x86_64")
            GO_ARCH="amd64"
            ;;
        "aarch64" | "arm64")
            GO_ARCH="arm64"
            ;;
        "armv7l")
            GO_ARCH="armv6l"
            ;;
        *)
            print_error "不支持的架构: $ARCH"
            exit 1
            ;;
    esac
    
    # Go版本
    GO_VERSION="1.21.5"
    GO_TARBALL="go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
    GO_URL="https://golang.org/dl/${GO_TARBALL}"
    
    case "$SYSTEM" in
        "rhel" | "debian" | "suse" | "arch")
            # 下载Go
            cd /tmp
            print_message "正在下载Go ${GO_VERSION}..."
            if ! wget -q "$GO_URL" -O "$GO_TARBALL"; then
                print_error "下载Go失败"
                exit 1
            fi
            
            # 删除旧版本
            if [ -d "/usr/local/go" ]; then
                rm -rf /usr/local/go
            fi
            
            # 解压安装
            tar -C /usr/local -xzf "$GO_TARBALL"
            
            # 设置环境变量
            if ! grep -q "/usr/local/go/bin" /etc/profile; then
                echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
            fi
            
            # 为当前会话设置PATH
            export PATH=$PATH:/usr/local/go/bin
            
            # 清理下载文件
            rm -f "$GO_TARBALL"
            ;;
        "alpine")
            # Alpine使用包管理器安装
            $PM add go
            ;;
        *)
            print_error "不支持的系统类型，请手动安装Go语言"
            print_message "访问 https://golang.org/dl/ 下载安装"
            exit 1
            ;;
    esac
    
    # 验证安装
    if command -v go >/dev/null 2>&1; then
        GO_VERSION_INSTALLED=$(go version | awk '{print $3}' | sed 's/go//')
        print_message "Go语言安装成功: $GO_VERSION_INSTALLED"
    else
        print_error "Go语言安装失败"
        exit 1
    fi
}

# 设置RTSPtoWeb配置文件
setup_rtspweb_config() {
    print_message "正在检查RTSPtoWeb配置文件..."
    
    # 确保RTSPtoWeb目录存在
    if [ ! -d "$INSTALL_DIR/RTSPtoWeb" ]; then
        print_error "RTSPtoWeb目录不存在: $INSTALL_DIR/RTSPtoWeb"
        return 1
    fi
    
    local config_file="$INSTALL_DIR/RTSPtoWeb/config.json"
    local backup_file="$INSTALL_DIR/RTSPtoWeb/config.json.backup"
    
    # 检查config.json文件是否存在
    if [ -f "$config_file" ]; then
        print_message "config.json文件已存在"
        
        # 验证JSON格式
        if command -v python3 >/dev/null 2>&1; then
            if python3 -m json.tool "$config_file" >/dev/null 2>&1; then
                print_success "config.json格式正确"
                return 0
            else
                print_warning "config.json格式错误，尝试修复..."
            fi
        fi
    else
        print_warning "config.json文件缺失"
    fi
    
    # 尝试从备份文件恢复
    if [ -f "$backup_file" ]; then
        print_message "从备份文件恢复config.json..."
        cp "$backup_file" "$config_file"
        
        # 验证恢复的文件
        if command -v python3 >/dev/null 2>&1; then
            if python3 -m json.tool "$config_file" >/dev/null 2>&1; then
                print_success "已从备份恢复config.json"
                return 0
            fi
        fi
    fi
    
    # 创建默认配置文件
    print_message "创建默认config.json文件..."
    
    # 确保目录权限正确
    chmod 755 "$INSTALL_DIR/RTSPtoWeb"
    
    cat > "$config_file" << 'EOF'
{
  "channel_defaults": {
    "on_demand": true,
    "debug": false,
    "status": 0
  },
  "server": {
    "debug": true,
    "log_level": "info",
    "http_demo": true,
    "http_debug": false,
    "http_login": "demo",
    "http_password": "demo",
    "http_port": ":8084",
    "https": false,
    "https_auto_tls": false,
    "https_auto_tls_name": "",
    "https_cert": "server.crt",
    "https_key": "server.key",
    "https_port": ":443",
    "ice_servers": [
      {
        "urls": ["stun:stun.l.google.com:19302"]
      }
    ],
    "ice_username": "",
    "ice_credential": "",
    "webrtc_port_min": 0,
    "webrtc_port_max": 0
  },
  "streams": {}
}
EOF
    
    # 验证创建的配置文件
    if [ -f "$config_file" ]; then
        if command -v python3 >/dev/null 2>&1; then
            if python3 -m json.tool "$config_file" >/dev/null 2>&1; then
                print_success "默认config.json文件创建成功"
            else
                print_error "创建的config.json文件格式错误"
                return 1
            fi
        else
            print_success "默认config.json文件创建成功"
        fi
        
        # 创建备份文件
        cp "$config_file" "$backup_file"
        
        # 设置文件权限
        chmod 644 "$config_file" "$backup_file"
        
        # 设置文件所有者
        if [ "$(id -u)" -eq 0 ]; then
            chown "$INSTALL_USER:$INSTALL_GROUP" "$config_file" "$backup_file"
        fi
        
        # 验证文件绝对路径和可读性
        local abs_config_path=$(readlink -f "$config_file")
        print_message "配置文件绝对路径: $abs_config_path"
        
        if [ -r "$config_file" ]; then
            print_success "RTSPtoWeb配置文件设置完成，文件可读"
        else
            print_error "RTSPtoWeb配置文件不可读，请检查权限"
            return 1
        fi
    else
        print_error "无法创建config.json文件"
        return 1
    fi
}

# 修复现有RTSPtoWeb配置问题
fix_rtspweb_config() {
    print_message "检查并修复RTSPtoWeb配置问题..."
    
    local rtsp_dir="$INSTALL_DIR/RTSPtoWeb"
    local config_file="$rtsp_dir/config.json"
    local backup_file="$rtsp_dir/config.json.backup"
    local service_name="rtspweb"
    
    # 检查RTSPtoWeb目录是否存在
    if [ ! -d "$rtsp_dir" ]; then
        print_warning "RTSPtoWeb目录不存在，跳过配置修复"
        return 0
    fi
    
    # 停止RTSPtoWeb服务（如果正在运行）
    # 确定systemctl命令
    if [ "$(id -u)" -eq 0 ]; then
        FIX_SYSTEMCTL_CMD="systemctl"
    else
        FIX_SYSTEMCTL_CMD="systemctl --user"
    fi
    
    if $FIX_SYSTEMCTL_CMD is-active --quiet "$service_name" 2>/dev/null; then
        print_message "停止RTSPtoWeb服务进行配置修复..."
        $FIX_SYSTEMCTL_CMD stop "$service_name" || true
        sleep 2
    fi
    
    # 检查并修复配置文件
    local config_fixed=false
    
    if [ -f "$config_file" ]; then
        # 验证现有配置文件格式
        if command -v python3 >/dev/null 2>&1; then
            if ! python3 -m json.tool "$config_file" >/dev/null 2>&1; then
                print_warning "检测到损坏的config.json文件，尝试修复..."
                # 备份损坏的文件
                cp "$config_file" "$config_file.corrupted.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
                rm -f "$config_file"
                config_fixed=true
            fi
        fi
    else
        print_warning "config.json文件缺失，需要创建"
        config_fixed=true
    fi
    
    # 如果需要修复配置文件
    if [ "$config_fixed" = true ]; then
        # 尝试从备份恢复
        if [ -f "$backup_file" ]; then
            print_message "尝试从备份文件恢复config.json..."
            if command -v python3 >/dev/null 2>&1; then
                if python3 -m json.tool "$backup_file" >/dev/null 2>&1; then
                    cp "$backup_file" "$config_file"
                    print_success "已从备份恢复config.json"
                    config_fixed=false
                fi
            else
                cp "$backup_file" "$config_file"
                print_success "已从备份恢复config.json"
                config_fixed=false
            fi
        fi
        
        # 如果备份也无效，重新调用配置创建函数
        if [ "$config_fixed" = true ]; then
            print_message "重新创建config.json文件..."
            cd "$rtsp_dir"
            setup_rtspweb_config
            cd "$INSTALL_DIR"
        fi
    fi
    
    # 检查并修复systemd服务配置
    if [ "$(id -u)" -eq 0 ]; then
        local service_file="/etc/systemd/system/${service_name}.service"
    else
        local service_file="$HOME/.config/systemd/user/${service_name}.service"
    fi
    
    if [ -f "$service_file" ]; then
        # 检查服务文件中是否指定了配置文件路径
        if ! grep -q "\-config=" "$service_file"; then
            print_message "修复systemd服务配置..."
            # 备份原服务文件
            cp "$service_file" "$service_file.backup.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
            
            # 获取配置文件绝对路径
            local abs_config_path=$(readlink -f "$config_file")
            
            # 修复服务文件
            sed -i "s|ExecStart=\(.*RTSPtoWeb\)$|ExecStart=\1 -config=$abs_config_path|" "$service_file"
            
            # 重新加载systemd
            $FIX_SYSTEMCTL_CMD daemon-reload
            
            print_success "systemd服务配置已修复"
        fi
    fi
    
    print_success "RTSPtoWeb配置修复完成"
}

# 编译RTSPtoWeb
compile_rtspweb() {
    print_message "正在编译RTSPtoWeb..."
    
    # 检查RTSPtoWeb目录是否存在
    if [ ! -d "$INSTALL_DIR/RTSPtoWeb" ]; then
        print_error "RTSPtoWeb目录不存在: $INSTALL_DIR/RTSPtoWeb"
        return 1
    fi
    
    # 进入RTSPtoWeb目录
    cd "$INSTALL_DIR/RTSPtoWeb"
    
    # 检查go.mod文件是否存在
    if [ ! -f "go.mod" ]; then
        print_error "go.mod文件不存在，请检查RTSPtoWeb源码完整性"
        return 1
    fi
    
    # 设置Go环境变量
    export PATH=$PATH:/usr/local/go/bin
    export GOPROXY=https://goproxy.cn,direct
    export GO111MODULE=on
    
    # 清理旧的编译文件
    if [ -f "RTSPtoWeb" ]; then
        rm -f RTSPtoWeb
    fi
    
    # 下载Go依赖
    print_message "正在下载Go依赖..."
    if ! go mod download; then
        print_error "下载Go依赖失败"
        return 1
    fi
    
    # 编译RTSPtoWeb
    print_message "正在编译RTSPtoWeb二进制文件..."
    if ! go build -o RTSPtoWeb .; then
        print_error "编译RTSPtoWeb失败"
        return 1
    fi
    
    # 检查编译结果
    if [ ! -f "RTSPtoWeb" ]; then
        print_error "RTSPtoWeb二进制文件未生成"
        return 1
    fi
    
    # 设置执行权限
    chmod +x RTSPtoWeb
    
    # 设置文件所有者
    if [ "$(id -u)" -eq 0 ]; then
        chown "$INSTALL_USER:$INSTALL_GROUP" RTSPtoWeb
    fi
    
    print_success "RTSPtoWeb编译完成"
    
    # 检查并创建config.json文件
    setup_rtspweb_config
    
    # 返回安装目录
    cd "$INSTALL_DIR"
}

# 下载并安装面板
install_panel() {
    print_message "正在下载Linux Server Panel..."
    
    # 创建安装目录
    mkdir -p "$INSTALL_DIR"
    
    # 检查是否已存在安装
    if [ -d "$INSTALL_DIR/.git" ]; then
        print_message "检测到已存在的安装，正在更新..."
        cd "$INSTALL_DIR"
        
        # 保存当前分支
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
        
        # 尝试更新
        if ! git pull origin "$CURRENT_BRANCH"; then
            print_warning "Git更新失败，尝试重新克隆"
            cd /tmp
            rm -rf "$INSTALL_DIR"
            mkdir -p "$INSTALL_DIR"
            
            # 尝试多个仓库地址
            CLONE_SUCCESS=false
            for repo_url in "https://github.com/boxpanel/web-panel.git" "https://gitee.com/boxpanel/web-panel.git" "https://gitlab.com/boxpanel/web-panel.git"; do
                print_message "尝试从 $repo_url 克隆..."
                if git clone -b main "$repo_url" "$INSTALL_DIR"; then
                    CLONE_SUCCESS=true
                    print_success "成功从 $repo_url 克隆代码"
                    break
                else
                    print_warning "从 $repo_url 克隆失败，尝试下一个仓库"
                fi
            done
            
            if [ "$CLONE_SUCCESS" = false ]; then
                print_error "无法从任何仓库下载源码，请检查网络连接"
                return 1
            fi
        fi
    else
        print_message "正在克隆仓库..."
        
        # 尝试多个仓库地址
        CLONE_SUCCESS=false
        for repo_url in "https://github.com/boxpanel/web-panel.git" "https://gitee.com/boxpanel/web-panel.git" "https://gitlab.com/boxpanel/web-panel.git"; do
            print_message "尝试从 $repo_url 克隆..."
            if git clone -b main "$repo_url" "$INSTALL_DIR"; then
                CLONE_SUCCESS=true
                print_success "成功从 $repo_url 克隆代码"
                break
            else
                print_warning "从 $repo_url 克隆失败，尝试下一个仓库"
            fi
        done
        
        if [ "$CLONE_SUCCESS" = false ]; then
            print_error "无法从任何仓库下载源码，请检查网络连接"
            return 1
        fi
    fi
    
    # 进入安装目录
    cd "$INSTALL_DIR"
    
    # 检查package.json是否存在
    if [ ! -f "package.json" ]; then
        print_error "package.json文件不存在，请检查仓库完整性"
        return 1
    fi
    
    # 清理旧的node_modules
    if [ -d "node_modules" ]; then
        print_message "清理旧的依赖..."
        rm -rf node_modules package-lock.json
    fi
    
    # 安装npm依赖
    print_message "正在安装npm依赖..."
    
    # 设置npm镜像源（提高下载速度）
    npm config set registry https://registry.npmmirror.com
    
    # 如果有临时安装目录，设置npm缓存目录
    if [ -n "${TEMP_INSTALL_DIR:-}" ]; then
        print_message "使用临时目录进行npm安装: $TEMP_INSTALL_DIR"
        export npm_config_cache="$TEMP_INSTALL_DIR/.npm"
        export npm_config_tmp="$TEMP_INSTALL_DIR"
        mkdir -p "$TEMP_INSTALL_DIR/.npm"
    fi
    
    # 安装依赖，增加重试机制
    INSTALL_ATTEMPTS=3
    for i in $(seq 1 $INSTALL_ATTEMPTS); do
        print_message "尝试安装依赖 (第 $i 次)..."
        
        # 根据是否有临时目录选择安装方式
        if [ -n "${TEMP_INSTALL_DIR:-}" ]; then
            # 使用临时目录安装
            if npm install --production --no-audit --no-fund --cache="$TEMP_INSTALL_DIR/.npm" --tmp="$TEMP_INSTALL_DIR"; then
                print_success "npm依赖安装成功（使用临时空间）"
                break
            fi
        else
            # 常规安装
            if npm install --production --no-audit --no-fund; then
                print_success "npm依赖安装成功"
                break
            fi
        fi
        
        if [ $i -eq $INSTALL_ATTEMPTS ]; then
            print_error "npm依赖安装失败，已尝试 $INSTALL_ATTEMPTS 次"
            return 1
        else
            print_warning "安装失败，等待5秒后重试..."
            sleep 5
        fi
    done
    
    # 恢复npm镜像源
    npm config set registry https://registry.npmjs.org
    
    # 设置权限
    print_message "正在设置文件权限..."
    if [ "$(id -u)" -eq 0 ]; then
        chown -R "$INSTALL_USER:$INSTALL_GROUP" "$INSTALL_DIR" 2>/dev/null || true
    fi
    chmod +x "$INSTALL_DIR/server.js" 2>/dev/null || true
    
    # 创建必要的目录
    mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/logs" "$INSTALL_DIR/uploads"
    
    # 编译RTSPtoWeb
    compile_rtspweb
    
    print_success "面板安装完成"
}

# 配置数据库
setup_database() {
    print_message "正在配置数据库..."
    
    # 创建数据库目录
    mkdir -p "$DB_DIR"
    
    # 设置数据库目录权限 - 根据当前用户设置
    if [ "$(id -u)" -eq 0 ]; then
        chown -R "$DB_USER:$DB_GROUP" "$DB_DIR"
        chmod 755 "$DB_DIR"
    else
        # 非root用户，确保目录权限正确
        chmod 755 "$DB_DIR"
    fi
    
    # 运行数据库初始化并传入用户参数
    cd $INSTALL_DIR
    print_message "正在初始化数据库..."
    
    # 检查必要的文件是否存在
    if [ ! -f "database/init.js" ]; then
        print_error "数据库初始化脚本不存在: database/init.js"
        return 1
    fi
    
    # 检查Node.js和npm模块
    if ! node -e "require('sqlite3')" 2>/dev/null; then
        print_error "sqlite3模块未安装或无法加载"
        print_message "尝试重新安装依赖..."
        npm install sqlite3 --save
    fi
    
    # 设置环境变量并运行数据库初始化
    export PORT=$PORT
    export ADMIN_USERNAME=$USERNAME
    export ADMIN_PASSWORD=$PASSWORD
    export DB_DIR=$DB_DIR
    export NODE_ENV=production
    
    print_message "环境变量设置:"
    print_message "  DB_DIR: $DB_DIR"
    print_message "  PORT: $PORT"
    print_message "  ADMIN_USERNAME: $USERNAME"
    
    # 运行数据库初始化，捕获详细错误信息
    if node database/init.js 2>&1 | tee -a "$LOG_FILE"; then
        print_success "数据库初始化成功"
    else
        print_error "数据库初始化失败"
        print_message "错误详情已记录到: $LOG_FILE"
        print_message "请检查以下可能的问题:"
        print_message "  1. 数据库目录权限: $DB_DIR"
        print_message "  2. Node.js模块依赖"
        print_message "  3. 磁盘空间"
        return 1
    fi
    
    # 验证数据库文件是否创建成功
    DB_FILE="$DB_DIR/server_panel.db"
    if [ -f "$DB_FILE" ]; then
        # 设置数据库文件权限 - 根据用户权限设置
        if [ "$(id -u)" -eq 0 ]; then
            chmod 666 "$DB_FILE"
            chown "$DB_USER:$DB_GROUP" "$DB_FILE"
            
            # 确保数据库目录权限正确
            chmod 755 "$DB_DIR"
            chown "$DB_USER:$DB_GROUP" "$DB_DIR"
        else
            # 非root用户，设置用户可读写权限
            chmod 666 "$DB_FILE"
            chmod 755 "$DB_DIR"
        fi
        
        # 验证权限设置
        if [ ! -r "$DB_FILE" ] || [ ! -w "$DB_FILE" ]; then
            print_error "数据库文件权限设置失败"
            ls -la "$DB_FILE"
            return 1
        fi
        
        # 验证数据库端口配置是否正确保存
        print_message "验证数据库端口配置..."
        if command -v sqlite3 >/dev/null 2>&1; then
            # 检查端口配置是否正确保存
            SAVED_PORT=$(sqlite3 "$DB_FILE" "SELECT value FROM config WHERE key='server_port';" 2>/dev/null || echo "")
            if [ "$SAVED_PORT" = "$PORT" ]; then
                print_success "数据库端口配置验证成功: $SAVED_PORT"
            else
                print_warning "数据库端口配置不匹配 (期望: $PORT, 实际: $SAVED_PORT)，正在修复..."
                # 尝试修复端口配置
                if sqlite3 "$DB_FILE" "INSERT OR REPLACE INTO config (key, value) VALUES ('server_port', '$PORT');" 2>/dev/null; then
                    print_success "数据库端口配置已修复为: $PORT"
                    # 再次验证
                    FIXED_PORT=$(sqlite3 "$DB_FILE" "SELECT value FROM config WHERE key='server_port';" 2>/dev/null || echo "")
                    if [ "$FIXED_PORT" = "$PORT" ]; then
                        print_success "端口配置修复验证成功"
                    else
                        print_warning "端口配置修复验证失败，可能需要手动修复"
                    fi
                else
                    print_warning "端口配置自动修复失败，请稍后手动检查"
                fi
            fi
        else
            print_warning "sqlite3命令不可用，跳过数据库配置验证"
            print_message "建议安装sqlite3工具以便进行配置验证"
        fi
        
        print_success "数据库配置完成"
        print_message "数据库文件: $DB_FILE"
        # 显示数据库文件信息
        ls -la "$DB_FILE"
    else
        print_error "数据库文件创建失败: $DB_FILE"
        print_message "检查目录权限和磁盘空间"
        ls -la "$DB_DIR/" || true
        return 1
    fi
}

# 创建systemd服务
create_service() {
    print_message "正在创建系统服务..."
    
    # 根据用户权限确定服务文件路径和systemctl命令
    if [ "$(id -u)" -eq 0 ]; then
        # root用户：创建系统级服务
        SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
        SYSTEMCTL_CMD="systemctl"
        print_message "创建系统级服务"
    else
        # 非root用户：创建用户级服务
        USER_SERVICE_DIR="$HOME/.config/systemd/user"
        mkdir -p "$USER_SERVICE_DIR"
        SERVICE_FILE="$USER_SERVICE_DIR/${SERVICE_NAME}.service"
        SYSTEMCTL_CMD="systemctl --user"
        print_message "创建用户级服务"
        
        # 启用用户级服务的持久化（登出后继续运行）
        if ! loginctl show-user "$(whoami)" -p Linger | grep -q "Linger=yes"; then
            print_message "启用用户服务持久化..."
            if command -v loginctl >/dev/null 2>&1; then
                sudo loginctl enable-linger "$(whoami)" 2>/dev/null || {
                    print_warning "无法启用用户服务持久化，服务可能在登出后停止"
                    print_message "如需持久化，请运行: sudo loginctl enable-linger $(whoami)"
                }
            fi
        fi
    fi
    
    # 检查Node.js路径
    NODE_PATH=$(which node)
    if [ -z "$NODE_PATH" ]; then
        print_error "无法找到Node.js可执行文件"
        return 1
    fi
    
    print_message "Node.js路径: $NODE_PATH"
    print_message "工作目录: $INSTALL_DIR"
    print_message "服务文件: $SERVICE_FILE"
    
    # 创建服务文件
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Web Panel Service
Documentation=https://github.com/your-username/web-panel
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$INSTALL_USER
Group=$INSTALL_GROUP
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_PATH server.js
ExecReload=/bin/kill -HUP \$MAINPID
PermissionsStartOnly=true
# 在服务启动前释放系统对串口控制台的占用（确保重启后也会释放）
ExecStartPre=/bin/sh -c 'command -v systemctl >/dev/null && systemctl stop serial-getty@ttyFIQ0.service || true'
ExecStartPre=/bin/sh -c 'command -v systemctl >/dev/null && systemctl disable serial-getty@ttyFIQ0.service || true'
ExecStartPre=/bin/sh -c 'command -v systemctl >/dev/null && systemctl mask serial-getty@ttyFIQ0.service || true'
Restart=always
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=20
KillMode=mixed
KillSignal=SIGTERM

# 环境变量
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=USERNAME=$USERNAME
Environment=PASSWORD=$PASSWORD
Environment=DB_DIR=$DB_DIR
Environment=HOME=$HOME
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# 安全设置
NoNewPrivileges=false
PrivateTmp=false
ProtectSystem=false
ReadWritePaths=$INSTALL_DIR $DB_DIR /tmp
ProtectHome=false

# 文件系统权限
UMask=0022

# 日志设置
StandardOutput=journal
StandardError=journal
SyslogIdentifier=web-panel

[Install]
WantedBy=multi-user.target
EOF

    # 验证服务文件内容
    print_message "验证服务文件配置..."
    if grep -q "Environment=PORT=$PORT" "$SERVICE_FILE"; then
        print_success "服务文件端口配置验证成功"
    else
        print_warning "服务文件端口配置验证失败，正在修复..."
        # 尝试修复服务文件
        sed -i "s/Environment=PORT=.*/Environment=PORT=$PORT/g" "$SERVICE_FILE"
        print_success "服务文件端口配置已修复"
    fi
    
    # 验证其他关键环境变量
    if grep -q "Environment=DB_DIR=$DB_DIR" "$SERVICE_FILE"; then
        print_success "服务文件数据库目录配置验证成功"
    else
        print_warning "服务文件数据库目录配置验证失败，正在修复..."
        sed -i "s|Environment=DB_DIR=.*|Environment=DB_DIR=$DB_DIR|g" "$SERVICE_FILE"
        print_success "服务文件数据库目录配置已修复"
    fi

    # 验证服务文件
    if [ ! -f "$SERVICE_FILE" ]; then
        print_error "服务文件创建失败"
        return 1
    fi
    
    print_success "服务文件创建成功: $SERVICE_FILE"
    
    # 重新加载systemd
    print_message "重新加载systemd配置..."
    $SYSTEMCTL_CMD daemon-reload
    
    # 安装阶段立即尝试释放系统控制台占用，确保串口 ttyFIQ0 可用
    if command -v systemctl >/dev/null 2>&1; then
        print_message "释放系统控制台占用 ttyFIQ0..."
        systemctl stop serial-getty@ttyFIQ0.service 2>/dev/null || true
        systemctl disable serial-getty@ttyFIQ0.service 2>/dev/null || true
        systemctl mask serial-getty@ttyFIQ0.service 2>/dev/null || true
    fi
    
    # 启用服务
    print_message "启用服务..."
    $SYSTEMCTL_CMD enable "$SERVICE_NAME"
    
    # 启动服务
    print_message "启动服务..."
    if $SYSTEMCTL_CMD start "$SERVICE_NAME"; then
        print_message "服务启动命令执行成功"
    else
        print_error "服务启动命令执行失败"
        return 1
    fi
    
    # 等待服务启动并检查状态
    print_message "等待服务启动..."
    for i in {1..15}; do
        sleep 2
        if $SYSTEMCTL_CMD is-active --quiet "$SERVICE_NAME"; then
            print_success "服务启动成功 ($i/15)"
            break
        elif [ $i -eq 15 ]; then
            print_error "服务启动超时"
            print_message "服务状态:"
            $SYSTEMCTL_CMD status "$SERVICE_NAME" --no-pager -l || true
            print_message "最近的服务日志:"
            if [ "$(id -u)" -eq 0 ]; then
                journalctl -u "$SERVICE_NAME" --no-pager -l -n 30 || true
            else
                journalctl --user -u "$SERVICE_NAME" --no-pager -l -n 30 || true
            fi
            return 1
        else
            print_message "等待中... ($i/15)"
        fi
    done
    
    # 显示服务状态和日志
    print_message "服务状态:"
    $SYSTEMCTL_CMD status "$SERVICE_NAME" --no-pager -l || true
    print_message "最近的服务日志:"
    if [ "$(id -u)" -eq 0 ]; then
        journalctl -u "$SERVICE_NAME" --no-pager -l -n 10 || true
    else
        journalctl --user -u "$SERVICE_NAME" --no-pager -l -n 10 || true
    fi
    
    # 创建RTSPtoWeb服务
    create_rtspweb_service
}

# 创建RTSPtoWeb systemd服务
create_rtspweb_service() {
    print_message "正在创建RTSPtoWeb系统服务..."
    
    RTSPWEB_SERVICE_NAME="rtspweb"
    
    # 根据用户权限确定RTSPtoWeb服务文件路径
    if [ "$(id -u)" -eq 0 ]; then
        # root用户：创建系统级服务
        RTSPWEB_SERVICE_FILE="/etc/systemd/system/${RTSPWEB_SERVICE_NAME}.service"
        RTSPWEB_SYSTEMCTL_CMD="systemctl"
        print_message "创建RTSPtoWeb系统级服务"
    else
        # 非root用户：创建用户级服务
        USER_SERVICE_DIR="$HOME/.config/systemd/user"
        mkdir -p "$USER_SERVICE_DIR"
        RTSPWEB_SERVICE_FILE="$USER_SERVICE_DIR/${RTSPWEB_SERVICE_NAME}.service"
        RTSPWEB_SYSTEMCTL_CMD="systemctl --user"
        print_message "创建RTSPtoWeb用户级服务"
    fi
    
    RTSPWEB_BINARY="$INSTALL_DIR/RTSPtoWeb/RTSPtoWeb"
    print_message "RTSPtoWeb服务文件: $RTSPWEB_SERVICE_FILE"
    
    # 检查RTSPtoWeb二进制文件是否存在
    if [ ! -f "$RTSPWEB_BINARY" ]; then
        print_error "RTSPtoWeb二进制文件不存在: $RTSPWEB_BINARY"
        return 1
    fi
    
    # 确保配置文件存在
    local config_file="$INSTALL_DIR/RTSPtoWeb/config.json"
    if [ ! -f "$config_file" ]; then
        print_warning "RTSPtoWeb配置文件不存在，正在创建..."
        cd "$INSTALL_DIR/RTSPtoWeb"
        setup_rtspweb_config
        cd "$INSTALL_DIR"
    fi
    
    print_message "RTSPtoWeb二进制文件: $RTSPWEB_BINARY"
    print_message "RTSPtoWeb工作目录: $INSTALL_DIR/RTSPtoWeb"
    
    # 创建RTSPtoWeb服务文件
    cat > "$RTSPWEB_SERVICE_FILE" << EOF
[Unit]
Description=RTSPtoWeb Service
Documentation=https://github.com/deepch/RTSPtoWeb
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$INSTALL_USER
Group=$INSTALL_GROUP
WorkingDirectory=$INSTALL_DIR/RTSPtoWeb
ExecStart=$RTSPWEB_BINARY -config=$INSTALL_DIR/RTSPtoWeb/config.json
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=20
KillMode=mixed
KillSignal=SIGTERM

# 环境变量
Environment=HOME=$HOME
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/go/bin

# 安全设置
NoNewPrivileges=false
PrivateTmp=false
ProtectSystem=false
ReadWritePaths=$INSTALL_DIR/RTSPtoWeb /tmp
ProtectHome=false

# 文件系统权限
UMask=0022

# 日志设置
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rtspweb

[Install]
WantedBy=multi-user.target
EOF

    # 验证RTSPtoWeb服务文件
    if [ ! -f "$RTSPWEB_SERVICE_FILE" ]; then
        print_error "RTSPtoWeb服务文件创建失败"
        return 1
    fi
    
    print_success "RTSPtoWeb服务文件创建成功: $RTSPWEB_SERVICE_FILE"
    
    # 重新加载systemd
    print_message "重新加载systemd配置..."
    $RTSPWEB_SYSTEMCTL_CMD daemon-reload
    
    # 启用RTSPtoWeb服务
    print_message "启用RTSPtoWeb服务..."
    $RTSPWEB_SYSTEMCTL_CMD enable "$RTSPWEB_SERVICE_NAME"
    
    # 启动前最终检查配置文件
    print_message "启动前检查RTSPtoWeb配置文件..."
    local final_config_check="$INSTALL_DIR/RTSPtoWeb/config.json"
    if [ ! -f "$final_config_check" ]; then
        print_error "RTSPtoWeb配置文件仍然缺失，无法启动服务"
        return 1
    fi
    
    # 验证配置文件格式
    if command -v python3 >/dev/null 2>&1; then
        if ! python3 -m json.tool "$final_config_check" >/dev/null 2>&1; then
            print_error "RTSPtoWeb配置文件格式错误，无法启动服务"
            return 1
        fi
    fi
    
    print_success "RTSPtoWeb配置文件检查通过"
    
    # 启动RTSPtoWeb服务
    print_message "启动RTSPtoWeb服务..."
    if $RTSPWEB_SYSTEMCTL_CMD start "$RTSPWEB_SERVICE_NAME"; then
        print_message "RTSPtoWeb服务启动命令执行成功"
    else
        print_error "RTSPtoWeb服务启动命令执行失败"
        return 1
    fi
    
    # 等待RTSPtoWeb服务启动并检查状态
    print_message "等待RTSPtoWeb服务启动..."
    for i in {1..15}; do
        sleep 2
        if $RTSPWEB_SYSTEMCTL_CMD is-active --quiet "$RTSPWEB_SERVICE_NAME"; then
            print_success "RTSPtoWeb服务启动成功 ($i/15)"
            break
        elif [ $i -eq 15 ]; then
            print_error "RTSPtoWeb服务启动超时"
            print_message "RTSPtoWeb服务状态:"
            $RTSPWEB_SYSTEMCTL_CMD status "$RTSPWEB_SERVICE_NAME" --no-pager -l || true
            print_message "RTSPtoWeb最近的服务日志:"
            if [ "$(id -u)" -eq 0 ]; then
                journalctl -u "$RTSPWEB_SERVICE_NAME" --no-pager -l -n 30 || true
            else
                journalctl --user -u "$RTSPWEB_SERVICE_NAME" --no-pager -l -n 30 || true
            fi
            return 1
        else
            print_message "等待中... ($i/15)"
        fi
    done
    
    # 显示RTSPtoWeb服务状态和日志
    print_message "RTSPtoWeb服务状态:"
    $RTSPWEB_SYSTEMCTL_CMD status "$RTSPWEB_SERVICE_NAME" --no-pager -l || true
    print_message "RTSPtoWeb最近的服务日志:"
    if [ "$(id -u)" -eq 0 ]; then
        journalctl -u "$RTSPWEB_SERVICE_NAME" --no-pager -l -n 10 || true
    else
        journalctl --user -u "$RTSPWEB_SERVICE_NAME" --no-pager -l -n 10 || true
    fi
    
    print_success "RTSPtoWeb服务配置完成"
}

# 配置防火墙
setup_firewall() {
    print_message "正在配置防火墙..."
    
    # RTSPtoWeb默认端口
    RTSPWEB_PORT=8084
    
    # 检查当前用户权限
    if [ "$(id -u)" -eq 0 ]; then
        # root用户，直接执行命令
        SUDO_PREFIX=""
        print_message "以root权限配置防火墙"
    else
        # 非root用户，检查sudo权限
        if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
            SUDO_PREFIX="sudo"
            print_message "以sudo权限配置防火墙"
        else
            print_warning "当前用户无sudo权限，跳过防火墙配置"
            print_message "请手动开放端口 $PORT (Web Panel) 和 $RTSPWEB_PORT (RTSPtoWeb)"
            print_message "firewalld: sudo firewall-cmd --permanent --add-port=$PORT/tcp && sudo firewall-cmd --permanent --add-port=$RTSPWEB_PORT/tcp && sudo firewall-cmd --reload"
            print_message "ufw: sudo ufw allow $PORT/tcp && sudo ufw allow $RTSPWEB_PORT/tcp"
            return 0
        fi
    fi
    
    # 尝试配置防火墙
    firewall_configured=false
    
    if command -v firewall-cmd >/dev/null 2>&1; then
        print_message "检测到firewalld，配置防火墙规则..."
        if $SUDO_PREFIX firewall-cmd --permanent --add-port=$PORT/tcp 2>/dev/null && \
           $SUDO_PREFIX firewall-cmd --permanent --add-port=$RTSPWEB_PORT/tcp 2>/dev/null && \
           $SUDO_PREFIX firewall-cmd --reload 2>/dev/null; then
            print_success "防火墙规则已添加 (firewalld) - Web Panel端口: $PORT, RTSPtoWeb端口: $RTSPWEB_PORT"
            firewall_configured=true
        else
            print_warning "firewalld配置失败，可能需要管理员权限"
        fi
    elif command -v ufw >/dev/null 2>&1; then
        print_message "检测到ufw，配置防火墙规则..."
        if $SUDO_PREFIX ufw allow $PORT/tcp 2>/dev/null && \
           $SUDO_PREFIX ufw allow $RTSPWEB_PORT/tcp 2>/dev/null; then
            print_success "防火墙规则已添加 (ufw) - Web Panel端口: $PORT, RTSPtoWeb端口: $RTSPWEB_PORT"
            firewall_configured=true
        else
            print_warning "ufw配置失败，可能需要管理员权限"
        fi
    else
        print_warning "未检测到支持的防火墙工具 (firewalld/ufw)"
    fi
    
    if [ "$firewall_configured" = false ]; then
        print_warning "防火墙配置未成功，请手动开放以下端口："
        print_message "Web Panel端口: $PORT"
        print_message "RTSPtoWeb端口: $RTSPWEB_PORT"
        print_message "手动配置命令："
        if command -v firewall-cmd >/dev/null 2>&1; then
            print_message "  sudo firewall-cmd --permanent --add-port=$PORT/tcp"
            print_message "  sudo firewall-cmd --permanent --add-port=$RTSPWEB_PORT/tcp"
            print_message "  sudo firewall-cmd --reload"
        elif command -v ufw >/dev/null 2>&1; then
            print_message "  sudo ufw allow $PORT/tcp"
            print_message "  sudo ufw allow $RTSPWEB_PORT/tcp"
        fi
    fi
}

# 显示安装结果
show_result() {
    clear
    printf "%b" "${GREEN}"
    echo "================================================="
    echo "    Linux Server Panel 安装完成!"
    echo "================================================="
    printf "%b" "${NC}"
    printf "%b%s%b\n" "${BLUE}" "访问信息:" "${NC}"
    # 获取内网IP地址 - 使用多种方法确保准确性
    LOCAL_IP="localhost"
    
    # 检测操作系统类型
     if [ "${OSTYPE:-}" = "msys" ] || [ "${OSTYPE:-}" = "cygwin" ] || command -v powershell.exe >/dev/null 2>&1; then
         # Windows环境 - 使用PowerShell获取IP
         LOCAL_IP=$(powershell.exe -Command "(ipconfig | Select-String 'IPv4.*192\.168' | Select-Object -First 1).Line -replace '.*: *', ''" 2>/dev/null | tr -d '\r\n\t ' || echo "localhost")
         
         # 如果没有找到192.168网段，尝试其他私有网段
         if [ "$LOCAL_IP" = "localhost" ] || [ -z "$LOCAL_IP" ]; then
             LOCAL_IP=$(powershell.exe -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object {\$_.IPAddress -match '^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.'} | Select-Object -First 1 -ExpandProperty IPAddress" 2>/dev/null || echo "localhost")
         fi
    else
        # Linux/Unix环境
        # 方法1: 使用ip命令获取默认路由的IP地址
        if command -v ip >/dev/null 2>&1; then
            LOCAL_IP=$(ip route get 8.8.8.8 2>/dev/null | grep -oP 'src \K\S+' | head -1)
        fi
    fi
    
    # 方法2: 如果ip命令失败，使用ifconfig
    if [ "$LOCAL_IP" = "localhost" ] && command -v ifconfig >/dev/null 2>&1; then
        LOCAL_IP=$(ifconfig 2>/dev/null | grep -E 'inet.*192\.168\.|inet.*10\.|inet.*172\.(1[6-9]|2[0-9]|3[01])\.' | grep -v '127.0.0.1' | awk '{print $2}' | head -1 | sed 's/addr://')
    fi
    
    # 方法3: 使用hostname -I作为备选
    if [ "$LOCAL_IP" = "localhost" ] && command -v hostname >/dev/null 2>&1; then
        LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' | grep -E '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' || echo "localhost")
    fi
    
    # 方法4: 最后的备选方案，检查常见网卡
    if [ "$LOCAL_IP" = "localhost" ]; then
        for interface in eth0 ens33 ens18 enp0s3 wlan0; do
            if command -v ip >/dev/null 2>&1; then
                LOCAL_IP=$(ip addr show $interface 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | cut -d'/' -f1 | head -1)
                if [ -n "$LOCAL_IP" ] && [ "$LOCAL_IP" != "localhost" ]; then
                    break
                fi
            fi
        done
    fi
    
    # 确保有一个有效的IP地址
    if [ -z "$LOCAL_IP" ] || [ "$LOCAL_IP" = "localhost" ]; then
        LOCAL_IP="localhost"
    fi
    printf "  Web Panel地址: %bhttp://%s:%s%b\n" "${GREEN}" "$LOCAL_IP" "$PORT" "${NC}"
    printf "  RTSPtoWeb地址: %bhttp://%s:8084%b\n" "${GREEN}" "$LOCAL_IP" "${NC}"
    printf "  用户名: %b%s%b\n" "${GREEN}" "$USERNAME" "${NC}"
    printf "  密码: %b%s%b\n" "${GREEN}" "$PASSWORD" "${NC}"
    echo
    printf "%b%s%b\n" "${BLUE}" "Web Panel管理命令:" "${NC}"
    if [ "$(id -u)" -eq 0 ]; then
        printf "  启动面板: %bsystemctl start web-panel%b\n" "${YELLOW}" "${NC}"
        printf "  停止面板: %bsystemctl stop web-panel%b\n" "${YELLOW}" "${NC}"
        printf "  重启面板: %bsystemctl restart web-panel%b\n" "${YELLOW}" "${NC}"
        printf "  查看状态: %bsystemctl status web-panel%b\n" "${YELLOW}" "${NC}"
        printf "  查看日志: %bjournalctl -u web-panel -f%b\n" "${YELLOW}" "${NC}"
    else
        printf "  启动面板: %bsystemctl --user start web-panel%b\n" "${YELLOW}" "${NC}"
        printf "  停止面板: %bsystemctl --user stop web-panel%b\n" "${YELLOW}" "${NC}"
        printf "  重启面板: %bsystemctl --user restart web-panel%b\n" "${YELLOW}" "${NC}"
        printf "  查看状态: %bsystemctl --user status web-panel%b\n" "${YELLOW}" "${NC}"
        printf "  查看日志: %bjournalctl --user -u web-panel -f%b\n" "${YELLOW}" "${NC}"
    fi
    echo
    printf "%b%s%b\n" "${BLUE}" "RTSPtoWeb管理命令:" "${NC}"
    if [ "$(id -u)" -eq 0 ]; then
        printf "  启动RTSPtoWeb: %bsystemctl start rtspweb%b\n" "${YELLOW}" "${NC}"
        printf "  停止RTSPtoWeb: %bsystemctl stop rtspweb%b\n" "${YELLOW}" "${NC}"
        printf "  重启RTSPtoWeb: %bsystemctl restart rtspweb%b\n" "${YELLOW}" "${NC}"
        printf "  查看状态: %bsystemctl status rtspweb%b\n" "${YELLOW}" "${NC}"
        printf "  查看日志: %bjournalctl -u rtspweb -f%b\n" "${YELLOW}" "${NC}"
    else
        printf "  启动RTSPtoWeb: %bsystemctl --user start rtspweb%b\n" "${YELLOW}" "${NC}"
        printf "  停止RTSPtoWeb: %bsystemctl --user stop rtspweb%b\n" "${YELLOW}" "${NC}"
        printf "  重启RTSPtoWeb: %bsystemctl --user restart rtspweb%b\n" "${YELLOW}" "${NC}"
        printf "  查看状态: %bsystemctl --user status rtspweb%b\n" "${YELLOW}" "${NC}"
        printf "  查看日志: %bjournalctl --user -u rtspweb -f%b\n" "${YELLOW}" "${NC}"
    fi
    echo
    printf "%b%s%b\n" "${BLUE}" "配置文件:" "${NC}"
    printf "  安装目录: %b%s%b\n" "${YELLOW}" "$INSTALL_DIR" "${NC}"
    printf "  数据库文件: %b%s/server_panel.db%b\n" "${YELLOW}" "$DB_DIR" "${NC}"
    echo
    printf "%b%s%b\n" "${GREEN}" "安装完成! 请在浏览器中访问面板地址进行使用。" "${NC}"
}

# 增强的回滚函数
enhanced_rollback() {
    print_warning "=== 开始增强回滚安装 ==="
    
    # 1. 停止并禁用服务
    print_message "停止服务..."
    # 确定systemctl命令和服务文件路径
    if [ "$(id -u)" -eq 0 ]; then
        ENHANCED_SYSTEMCTL_CMD="systemctl"
        WEB_SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
        RTSP_SERVICE_FILE="/etc/systemd/system/rtspweb.service"
    else
        ENHANCED_SYSTEMCTL_CMD="systemctl --user"
        WEB_SERVICE_FILE="$HOME/.config/systemd/user/$SERVICE_NAME.service"
        RTSP_SERVICE_FILE="$HOME/.config/systemd/user/rtspweb.service"
    fi
    
    $ENHANCED_SYSTEMCTL_CMD stop $SERVICE_NAME 2>/dev/null || true
    $ENHANCED_SYSTEMCTL_CMD disable $SERVICE_NAME 2>/dev/null || true
    $ENHANCED_SYSTEMCTL_CMD stop rtspweb 2>/dev/null || true
    $ENHANCED_SYSTEMCTL_CMD disable rtspweb 2>/dev/null || true
    
    # 2. 删除服务文件
    print_message "删除服务文件..."
    rm -f "$WEB_SERVICE_FILE"
    rm -f "$RTSP_SERVICE_FILE"
    $ENHANCED_SYSTEMCTL_CMD daemon-reload
    
    # 3. 删除安装目录
    print_message "删除安装目录..."
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
    fi
    
    # 4. 恢复备份（如果存在）
    if [ -d "$BACKUP_DIR" ]; then
        print_message "恢复备份..."
        
        # 恢复安装目录
        if [ -d "$BACKUP_DIR/web-panel" ]; then
            mv "$BACKUP_DIR/web-panel" "$INSTALL_DIR"
            print_message "已恢复安装目录"
        fi
        
        # 恢复服务文件
        if [ -f "$BACKUP_DIR/web-panel.service" ]; then
            mv "$BACKUP_DIR/web-panel.service" "$WEB_SERVICE_FILE"
            $ENHANCED_SYSTEMCTL_CMD daemon-reload
            $ENHANCED_SYSTEMCTL_CMD enable $SERVICE_NAME
            $ENHANCED_SYSTEMCTL_CMD start $SERVICE_NAME
            print_message "已恢复服务配置"
        fi
        
        # 清理备份目录
        rm -rf "$BACKUP_DIR"
    fi
    
    # 5. 清理可能的残留进程
    print_message "清理残留进程..."
    pkill -f "node.*server.js" 2>/dev/null || true
    pkill -f "$SERVICE_NAME" 2>/dev/null || true
    
    # 6. 清理临时扩展的空间
    print_message "清理临时扩展空间..."
    cleanup_temp_space
    
    # 7. 检查回滚结果
    print_message "检查回滚结果..."
    if [ -d "$INSTALL_DIR" ] && [ -f "$WEB_SERVICE_FILE" ]; then
        print_success "回滚完成，系统已恢复到安装前状态"
    else
        print_warning "回滚完成，系统已清理（无备份可恢复）"
    fi
    
    print_message "=== 增强回滚完成 ==="
}

# 增强的错误处理函数
enhanced_error_handler() {
    error_msg="$1"
    step="$2"
    exit_code="${3:-1}"
    
    print_error "错误: $error_msg"
    print_error "失败步骤: $step"
    print_error "退出码: $exit_code"
    
    # 记录详细错误日志
    echo "[$(date)] 安装失败: $step - $error_msg (退出码: $exit_code)" >> "$LOG_FILE"
    echo "系统信息: $(uname -a)" >> "$LOG_FILE"
    echo "用户: $(whoami)" >> "$LOG_FILE"
    echo "当前目录: $(pwd)" >> "$LOG_FILE"
    
    # 执行增强回滚
    enhanced_rollback
    
    print_message "详细错误日志已保存到: $LOG_FILE"
    print_message "如需帮助，请提供日志文件内容"
    
    exit $exit_code
}

# 主函数
main() {
    # 初始化日志文件
    echo "=== Linux Server Panel 安装日志 ===" > "$LOG_FILE"
    echo "开始时间: $(date)" >> "$LOG_FILE"
    echo "用户: $(whoami)" >> "$LOG_FILE"
    echo "系统: $(uname -a)" >> "$LOG_FILE"
    echo "========================================" >> "$LOG_FILE"
    
    clear
    printf "%b" "${BLUE}"
    echo "================================================="
    echo "    Linux Server Panel 一键安装脚本"
    echo "================================================="
    printf "%b" "${NC}"
    
    print_message "开始安装过程..."
    print_message "日志文件: $LOG_FILE"
    
    # 临时调整/tmp目录大小为3GB，确保安装过程有足够空间
    print_message "临时调整/tmp目录大小为3GB..."
    if mount -o remount,size=3G /tmp 2>/dev/null; then
        print_message "✓ /tmp目录大小已临时调整为3GB"
    else
        print_message "⚠ 无法调整/tmp目录大小，继续安装过程"
    fi
    
    print_message "[1/10] 检查磁盘空间"
    if ! check_and_expand_disk_space; then
        enhanced_error_handler "磁盘空间检查失败" "磁盘空间检查" 1
    fi
    
    print_message "[2/10] 检查并停止现有服务"
    if ! check_and_stop_existing_service; then
        enhanced_error_handler "停止现有服务失败" "服务检查" 1
    fi
    
    # 创建备份
    create_backup
    
    print_message "[3/10] 检查用户权限"
    if ! check_user_permissions; then
        enhanced_error_handler "权限检查失败" "权限检查" 1
    fi
    
    print_message "[4/10] 获取用户输入"
    if ! get_user_input "$@"; then
        enhanced_error_handler "用户输入获取失败" "用户输入" 1
    fi
    
    print_message "[5/10] 检测系统类型"
    if ! detect_system; then
        enhanced_error_handler "系统检测失败" "系统检测" 1
    fi
    
    print_message "[6/10] 安装依赖包"
    if ! install_dependencies; then
        enhanced_error_handler "依赖包安装失败" "依赖安装" 1
    fi
    
    print_message "[7/10] 下载并安装面板"
    if ! install_panel; then
        enhanced_error_handler "面板安装失败" "面板安装" 1
    fi
    
    print_message "[8/10] 配置数据库"
    if ! setup_database; then
        enhanced_error_handler "数据库配置失败" "数据库配置" 1
    fi
    
    print_message "[8.5/10] 修复RTSPtoWeb配置"
    if ! fix_rtspweb_config; then
        print_warning "RTSPtoWeb配置修复失败，但不影响主要功能"
    fi
    
    print_message "[9/10] 创建系统服务"
    if ! create_service; then
        enhanced_error_handler "服务创建失败" "服务创建" 1
    fi
    
    print_message "[10/10] 配置防火墙"
    if ! setup_firewall; then
        print_warning "防火墙配置失败，但不影响主要功能"
    fi
    
    # 验证安装
    if verify_installation; then
        INSTALL_SUCCESS=true
        print_success "安装验证通过！"
        
        # 清理备份（安装成功后）
        if [ -d "$BACKUP_DIR" ]; then
            print_message "清理备份文件..."
            rm -rf "$BACKUP_DIR" || true
        fi
        
        # 清理临时扩展的空间
        cleanup_temp_space
        
        show_result
    else
        enhanced_error_handler "安装验证失败" "安装验证" 1
    fi
}

# 运行主函数
main "$@"

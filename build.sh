#!/bin/bash

# Web Panel 构建脚本
# 支持多平台预编译二进制包构建

set -e

# 版本信息
VERSION=${VERSION:-"latest"}
BUILD_TIME=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# 构建信息
APP_NAME="web-panel"
MAIN_FILE="backend/cmd/main.go"
OUTPUT_DIR="dist"
PACKAGE_DIR="packages"

# 支持的平台
PLATFORMS=(
    "linux/amd64"
    "linux/arm64"
    "linux/386"
    "linux/arm"
    "darwin/amd64"
    "darwin/arm64"
    "windows/amd64"
    "windows/386"
)

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

# 清理函数
cleanup() {
    print_status "清理构建目录..."
    rm -rf "$OUTPUT_DIR"
    rm -rf "$PACKAGE_DIR"
}

# 检查依赖
check_dependencies() {
    print_status "检查构建依赖..."
    
    # 检查Go
    if ! command -v go >/dev/null 2>&1; then
        print_error "Go未安装，请先安装Go"
        exit 1
    fi
    
    local go_version=$(go version | awk '{print $3}' | sed 's/go//')
    print_status "Go版本: $go_version"
    
    # 检查Node.js（如果需要构建前端）
    if [ "$BUILD_FRONTEND" = "true" ]; then
        if ! command -v node >/dev/null 2>&1; then
            print_error "Node.js未安装，请先安装Node.js"
            exit 1
        fi
        
        local node_version=$(node --version)
        print_status "Node.js版本: $node_version"
    fi
    
    # 检查项目结构
    if [ ! -f "$MAIN_FILE" ]; then
        print_error "未找到主文件: $MAIN_FILE"
        exit 1
    fi
    
    if [ ! -f "backend/go.mod" ]; then
        print_error "未找到go.mod文件"
        exit 1
    fi
    
    print_success "依赖检查完成"
}

# 构建前端（可选）
build_frontend() {
    if [ "$BUILD_FRONTEND" != "true" ]; then
        print_status "跳过前端构建"
        return
    fi
    
    print_status "构建前端..."
    
    if [ ! -d "frontend" ]; then
        print_warning "未找到frontend目录，跳过前端构建"
        return
    fi
    
    cd frontend
    
    # 安装依赖
    if [ -f "package.json" ]; then
        print_status "安装前端依赖..."
        npm install
        
        # 构建
        print_status "构建前端资源..."
        npm run build
        
        # 复制构建结果到后端静态目录
        if [ -d "dist" ]; then
            mkdir -p "../backend/static"
            cp -r dist/* "../backend/static/"
            print_success "前端构建完成"
        else
            print_warning "前端构建目录不存在，可能构建失败"
        fi
    else
        print_warning "未找到package.json，跳过前端构建"
    fi
    
    cd ..
}

# 构建单个平台
build_platform() {
    local platform=$1
    local os=$(echo $platform | cut -d'/' -f1)
    local arch=$(echo $platform | cut -d'/' -f2)
    
    print_status "构建 $os/$arch..."
    
    # 设置输出文件名
    local binary_name="$APP_NAME"
    if [ "$os" = "windows" ]; then
        binary_name="${APP_NAME}.exe"
    fi
    
    local output_path="$OUTPUT_DIR/$os-$arch/$binary_name"
    
    # 创建输出目录
    mkdir -p "$(dirname $output_path)"
    
    # 设置环境变量
    export GOOS=$os
    export GOARCH=$arch
    export CGO_ENABLED=0
    
    # 构建标志
    local ldflags="-s -w"
    ldflags="$ldflags -X 'main.Version=$VERSION'"
    ldflags="$ldflags -X 'main.BuildTime=$BUILD_TIME'"
    ldflags="$ldflags -X 'main.GitCommit=$GIT_COMMIT'"
    ldflags="$ldflags -X 'main.GitBranch=$GIT_BRANCH'"
    
    # 执行构建
    cd backend
    if go build -ldflags "$ldflags" -o "../$output_path" cmd/main.go; then
        print_success "$os/$arch 构建完成: $output_path"
    else
        print_error "$os/$arch 构建失败"
        cd ..
        return 1
    fi
    cd ..
    
    # 复制配置文件和其他资源
    local platform_dir="$OUTPUT_DIR/$os-$arch"
    
    # 复制配置文件
    if [ -f "backend/config/app.yaml" ]; then
        mkdir -p "$platform_dir/config"
        cp "backend/config/app.yaml" "$platform_dir/config/"
    fi
    
    # 复制静态文件（如果存在）
    if [ -d "backend/static" ]; then
        cp -r "backend/static" "$platform_dir/"
    fi
    
    # 复制文档
    cp README.md "$platform_dir/" 2>/dev/null || true
    cp LICENSE "$platform_dir/" 2>/dev/null || true
    
    # 创建启动脚本
    if [ "$os" = "windows" ]; then
        cat > "$platform_dir/start.bat" << 'EOF'
@echo off
echo Starting Web Panel...
web-panel.exe
pause
EOF
    else
        cat > "$platform_dir/start.sh" << 'EOF'
#!/bin/bash
echo "Starting Web Panel..."
./web-panel
EOF
        chmod +x "$platform_dir/start.sh"
    fi
    
    return 0
}

# 创建发布包
create_packages() {
    print_status "创建发布包..."
    
    mkdir -p "$PACKAGE_DIR"
    
    for platform in "${PLATFORMS[@]}"; do
        local os=$(echo $platform | cut -d'/' -f1)
        local arch=$(echo $platform | cut -d'/' -f2)
        local platform_dir="$OUTPUT_DIR/$os-$arch"
        
        if [ ! -d "$platform_dir" ]; then
            print_warning "跳过 $os/$arch (构建失败)"
            continue
        fi
        
        local package_name="${APP_NAME}-${VERSION}-${os}-${arch}"
        local package_path="$PACKAGE_DIR/${package_name}.tar.gz"
        
        print_status "打包 $os/$arch..."
        
        # 创建临时目录
        local temp_dir="/tmp/${package_name}"
        rm -rf "$temp_dir"
        mkdir -p "$temp_dir"
        
        # 复制文件到临时目录
        cp -r "$platform_dir"/* "$temp_dir/"
        
        # 创建tar.gz包
        cd "/tmp"
        if tar -czf "$(pwd)/${package_name}.tar.gz" "${package_name}"; then
            mv "${package_name}.tar.gz" "$(pwd)/$package_path"
            print_success "$os/$arch 打包完成: $package_path"
        else
            print_error "$os/$arch 打包失败"
        fi
        
        # 清理临时目录
        rm -rf "$temp_dir"
        cd - >/dev/null
    done
}

# 生成校验和
generate_checksums() {
    print_status "生成校验和文件..."
    
    local checksums_file="$PACKAGE_DIR/checksums.txt"
    
    cd "$PACKAGE_DIR"
    
    # 生成SHA256校验和
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum *.tar.gz > checksums.txt
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 *.tar.gz > checksums.txt
    else
        print_warning "未找到校验和工具，跳过校验和生成"
        cd - >/dev/null
        return
    fi
    
    cd - >/dev/null
    
    print_success "校验和文件已生成: $checksums_file"
}

# 显示构建信息
show_build_info() {
    print_status "构建信息:"
    echo "  应用名称: $APP_NAME"
    echo "  版本: $VERSION"
    echo "  构建时间: $BUILD_TIME"
    echo "  Git提交: $GIT_COMMIT"
    echo "  Git分支: $GIT_BRANCH"
    echo "  支持平台: ${#PLATFORMS[@]}个"
    echo
}

# 显示帮助信息
show_help() {
    echo "Web Panel 构建脚本"
    echo
    echo "用法: $0 [选项]"
    echo
    echo "选项:"
    echo "  -h, --help              显示帮助信息"
    echo "  -c, --clean             清理构建目录"
    echo "  -f, --frontend          构建前端（需要Node.js）"
    echo "  -p, --platform PLATFORM 只构建指定平台（如: linux/amd64）"
    echo "  -v, --version VERSION   设置版本号"
    echo "  --no-package           不创建发布包"
    echo "  --no-checksums         不生成校验和"
    echo
    echo "支持的平台:"
    for platform in "${PLATFORMS[@]}"; do
        echo "  $platform"
    done
    echo
}

# 主函数
main() {
    local clean_only=false
    local build_frontend=false
    local target_platform=""
    local create_packages=true
    local generate_checksums=true
    
    # 解析命令行参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -c|--clean)
                clean_only=true
                shift
                ;;
            -f|--frontend)
                build_frontend=true
                shift
                ;;
            -p|--platform)
                target_platform="$2"
                shift 2
                ;;
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            --no-package)
                create_packages=false
                shift
                ;;
            --no-checksums)
                generate_checksums=false
                shift
                ;;
            *)
                print_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # 设置环境变量
    export BUILD_FRONTEND=$build_frontend
    
    # 如果只是清理，执行清理后退出
    if [ "$clean_only" = true ]; then
        cleanup
        print_success "清理完成"
        exit 0
    fi
    
    # 显示构建信息
    show_build_info
    
    # 检查依赖
    check_dependencies
    
    # 清理旧的构建
    cleanup
    
    # 构建前端
    build_frontend
    
    # 构建后端
    print_status "开始构建后端..."
    
    local build_success=true
    
    if [ -n "$target_platform" ]; then
        # 构建指定平台
        if ! build_platform "$target_platform"; then
            build_success=false
        fi
    else
        # 构建所有平台
        for platform in "${PLATFORMS[@]}"; do
            if ! build_platform "$platform"; then
                build_success=false
            fi
        done
    fi
    
    if [ "$build_success" = false ]; then
        print_error "部分平台构建失败"
    else
        print_success "所有平台构建完成"
    fi
    
    # 创建发布包
    if [ "$create_packages" = true ]; then
        create_packages
    fi
    
    # 生成校验和
    if [ "$generate_checksums" = true ] && [ "$create_packages" = true ]; then
        generate_checksums
    fi
    
    # 显示结果
    print_success "构建完成！"
    echo
    print_status "构建结果:"
    if [ -d "$OUTPUT_DIR" ]; then
        echo "  二进制文件: $OUTPUT_DIR/"
        ls -la "$OUTPUT_DIR"/*/"$APP_NAME"* 2>/dev/null || true
    fi
    
    if [ -d "$PACKAGE_DIR" ] && [ "$create_packages" = true ]; then
        echo "  发布包: $PACKAGE_DIR/"
        ls -la "$PACKAGE_DIR"/*.tar.gz 2>/dev/null || true
    fi
    
    echo
    print_status "使用 './build.sh --help' 查看更多选项"
}

# 执行主函数
main "$@"
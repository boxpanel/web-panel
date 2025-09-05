# Web Panel Go版本一键安装脚本 (PowerShell)
# 支持 Windows 10/11

param(
    [switch]$China,
    [switch]$Service,
    [switch]$NoStart,
    [switch]$Help
)

# 颜色定义
$Colors = @{
    Red = 'Red'
    Green = 'Green'
    Yellow = 'Yellow'
    Blue = 'Blue'
    White = 'White'
}

# 日志函数
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = 'Info'
    )
    
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    switch ($Level) {
        'Info' { Write-Host "[$timestamp] [INFO] $Message" -ForegroundColor $Colors.Blue }
        'Success' { Write-Host "[$timestamp] [SUCCESS] $Message" -ForegroundColor $Colors.Green }
        'Warning' { Write-Host "[$timestamp] [WARNING] $Message" -ForegroundColor $Colors.Yellow }
        'Error' { Write-Host "[$timestamp] [ERROR] $Message" -ForegroundColor $Colors.Red }
    }
}

# 检查命令是否存在
function Test-Command {
    param([string]$Command)
    
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

# 检查Go环境
function Test-GoEnvironment {
    Write-Log "检查Go环境..." -Level Info
    
    if (-not (Test-Command "go")) {
        Write-Log "未找到Go环境，请先安装Go 1.19或更高版本" -Level Error
        Write-Log "下载地址: https://golang.org/dl/" -Level Info
        exit 1
    }
    
    $goVersion = (go version) -replace 'go version go', '' -replace ' .*', ''
    Write-Log "找到Go版本: $goVersion" -Level Success
    
    # 检查Go版本
    $requiredVersion = [Version]"1.19.0"
    $currentVersion = [Version]$goVersion
    
    if ($currentVersion -lt $requiredVersion) {
        Write-Log "Go版本过低，需要1.19或更高版本，当前版本: $goVersion" -Level Error
        exit 1
    }
}

# 检查Node.js环境
function Test-NodeEnvironment {
    Write-Log "检查Node.js环境..." -Level Info
    
    if (-not (Test-Command "node")) {
        Write-Log "未找到Node.js环境，将跳过前端构建" -Level Warning
        Write-Log "如需完整功能，请安装Node.js 16或更高版本" -Level Info
        return $false
    }
    
    $nodeVersion = (node --version) -replace 'v', ''
    Write-Log "找到Node.js版本: $nodeVersion" -Level Success
    return $true
}

# 安装Go依赖
function Install-GoDependencies {
    Write-Log "安装Go依赖包..." -Level Info
    
    # 设置Go模块代理（中国用户）
    if ($China) {
        $env:GOPROXY = "https://goproxy.cn,direct"
        Write-Log "使用中国镜像源" -Level Info
    }
    
    try {
        go mod tidy
        go mod download
        Write-Log "Go依赖安装完成" -Level Success
    }
    catch {
        Write-Log "Go依赖安装失败: $($_.Exception.Message)" -Level Error
        exit 1
    }
}

# 构建后端
function Build-Backend {
    Write-Log "构建Go后端..." -Level Info
    
    # 禁用CGO以避免C编译器依赖
    $env:CGO_ENABLED = "0"
    
    $outputFile = "web-panel.exe"
    
    try {
        go build -ldflags "-s -w" -o $outputFile cmd/main.go
        
        if (Test-Path $outputFile) {
            Write-Log "后端构建完成: $outputFile" -Level Success
        } else {
            Write-Log "后端构建失败" -Level Error
            exit 1
        }
    }
    catch {
        Write-Log "后端构建失败: $($_.Exception.Message)" -Level Error
        exit 1
    }
}

# 构建前端
function Build-Frontend {
    if (-not (Test-NodeEnvironment)) {
        Write-Log "跳过前端构建" -Level Warning
        return
    }
    
    Write-Log "构建前端..." -Level Info
    
    try {
        Set-Location "client"
        
        # 安装前端依赖
        if (Test-Command "npm") {
            npm install
            npm run build
        } elseif (Test-Command "yarn") {
            yarn install
            yarn build
        } else {
            Write-Log "未找到npm或yarn" -Level Error
            Set-Location ".."
            return
        }
        
        Set-Location ".."
        Write-Log "前端构建完成" -Level Success
    }
    catch {
        Set-Location ".."
        Write-Log "前端构建失败: $($_.Exception.Message)" -Level Error
    }
}

# 初始化配置
function Initialize-Config {
    Write-Log "初始化配置文件..." -Level Info
    
    # 创建必要的目录
    $directories = @("data", "logs", "uploads")
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    
    # 创建配置文件
    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Log "已创建配置文件: .env" -Level Success
        } else {
            # 生成随机密钥
            $jwtSecret = "your-secret-key-$(Get-Date -Format 'yyyyMMddHHmmss')"
            
            $configContent = @"
# Web Panel 配置文件
PORT=8080
JWT_SECRET=$jwtSecret
DB_PATH=./data/database.sqlite
UPLOAD_PATH=./uploads
LOG_LEVEL=info
"@
            
            Set-Content -Path ".env" -Value $configContent -Encoding UTF8
            Write-Log "已创建默认配置文件: .env" -Level Success
        }
    } else {
        Write-Log "配置文件已存在，跳过创建" -Level Info
    }
}

# 创建Windows服务
function New-WindowsService {
    if (-not $Service) {
        return
    }
    
    Write-Log "创建Windows服务..." -Level Info
    
    # 检查管理员权限
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Log "创建Windows服务需要管理员权限，请以管理员身份运行PowerShell" -Level Error
        return
    }
    
    $serviceName = "WebPanelGo"
    $serviceDisplayName = "Web Panel Go Service"
    $currentPath = Get-Location
    $executablePath = Join-Path $currentPath "web-panel.exe"
    
    try {
        # 检查服务是否已存在
        $existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if ($existingService) {
            Write-Log "服务已存在，正在删除旧服务..." -Level Warning
            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
            sc.exe delete $serviceName
            Start-Sleep -Seconds 2
        }
        
        # 创建新服务
        New-Service -Name $serviceName -BinaryPathName $executablePath -DisplayName $serviceDisplayName -StartupType Automatic -Description "Web Panel Go后端服务"
        
        Write-Log "Windows服务创建完成" -Level Success
        Write-Log "使用以下命令管理服务:" -Level Info
        Write-Log "  启动: Start-Service -Name $serviceName" -Level Info
        Write-Log "  停止: Stop-Service -Name $serviceName" -Level Info
        Write-Log "  状态: Get-Service -Name $serviceName" -Level Info
    }
    catch {
        Write-Log "创建Windows服务失败: $($_.Exception.Message)" -Level Error
    }
}

# 启动服务
function Start-WebPanelService {
    Write-Log "启动Web Panel服务..." -Level Info
    
    $execFile = "./web-panel.exe"
    
    if (-not (Test-Path $execFile)) {
        Write-Log "未找到可执行文件: $execFile" -Level Error
        exit 1
    }
    
    # 检查端口是否被占用
    $port = "8080"
    if (Test-Path ".env") {
        $envContent = Get-Content ".env"
        $portLine = $envContent | Where-Object { $_ -match "^PORT=" }
        if ($portLine) {
            $port = ($portLine -split "=")[1]
        }
    }
    
    try {
        $portInUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($portInUse) {
            Write-Log "端口 $port 已被占用，请检查配置或停止其他服务" -Level Warning
        }
    }
    catch {
        # 忽略错误，继续执行
    }
    
    Write-Log "服务启动完成！" -Level Success
    Write-Log "访问地址: http://localhost:$port" -Level Info
    Write-Log "默认账号: admin" -Level Info
    Write-Log "默认密码: admin123" -Level Info
    Write-Log "" -Level Info
    Write-Log "按 Ctrl+C 停止服务" -Level Info
    
    # 启动服务
    & $execFile
}

# 显示帮助信息
function Show-Help {
    Write-Host "Web Panel Go版本一键安装脚本 (PowerShell)" -ForegroundColor $Colors.Blue
    Write-Host ""
    Write-Host "用法: .\install.ps1 [选项]" -ForegroundColor $Colors.White
    Write-Host ""
    Write-Host "选项:" -ForegroundColor $Colors.White
    Write-Host "  -China      使用中国镜像源加速下载" -ForegroundColor $Colors.White
    Write-Host "  -Service    创建Windows服务（需要管理员权限）" -ForegroundColor $Colors.White
    Write-Host "  -NoStart    安装完成后不自动启动" -ForegroundColor $Colors.White
    Write-Host "  -Help       显示此帮助信息" -ForegroundColor $Colors.White
    Write-Host ""
    Write-Host "示例:" -ForegroundColor $Colors.White
    Write-Host "  .\install.ps1                    # 标准安装并启动" -ForegroundColor $Colors.White
    Write-Host "  .\install.ps1 -China             # 使用中国镜像源安装" -ForegroundColor $Colors.White
    Write-Host "  .\install.ps1 -Service           # 安装并创建Windows服务" -ForegroundColor $Colors.White
    Write-Host "  .\install.ps1 -China -Service    # 使用中国镜像源安装并创建服务" -ForegroundColor $Colors.White
}

# 主函数
function Main {
    Write-Host "======================================" -ForegroundColor $Colors.Blue
    Write-Host "    Web Panel Go版本一键安装脚本" -ForegroundColor $Colors.Blue
    Write-Host "======================================" -ForegroundColor $Colors.Blue
    Write-Host ""
    
    # 显示帮助信息
    if ($Help) {
        Show-Help
        exit 0
    }
    
    try {
        # 执行安装步骤
        Test-GoEnvironment
        Install-GoDependencies
        Build-Backend
        Build-Frontend
        Initialize-Config
        New-WindowsService
        
        Write-Log "安装完成！" -Level Success
        Write-Host ""
        
        if (-not $NoStart) {
            Start-WebPanelService
        } else {
            Write-Log "使用以下命令启动服务:" -Level Info
            Write-Log "  .\web-panel.exe" -Level Info
        }
    }
    catch {
        Write-Log "安装过程中发生错误: $($_.Exception.Message)" -Level Error
        exit 1
    }
}

# 捕获中断信号
trap {
    Write-Log "安装被中断" -Level Warning
    exit 1
}

# 运行主函数
Main
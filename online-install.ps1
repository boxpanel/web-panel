# Web Panel Windows 在线安装脚本
# PowerShell 版本，支持从GitHub直接下载和安装

param(
    [switch]$Uninstall,
    [switch]$Help,
    [string]$InstallPath = "C:\Program Files\WebPanel",
    [string]$ServiceName = "WebPanel",
    [int]$Port = 8080
)

# 配置
$RepoUrl = "https://github.com/your-username/web-panel"
$ServiceUser = "NT AUTHORITY\LocalService"

# 颜色输出函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Status {
    param([string]$Message)
    Write-ColorOutput "[INFO] $Message" "Cyan"
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput "[SUCCESS] $Message" "Green"
}

function Write-Warning {
    param([string]$Message)
    Write-ColorOutput "[WARNING] $Message" "Yellow"
}

function Write-Error {
    param([string]$Message)
    Write-ColorOutput "[ERROR] $Message" "Red"
}

# 检查管理员权限
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 检查系统要求
function Test-SystemRequirements {
    Write-Status "检查系统要求..."
    
    # 检查Windows版本
    $osVersion = [System.Environment]::OSVersion.Version
    if ($osVersion.Major -lt 10) {
        Write-Error "需要Windows 10或更高版本"
        exit 1
    }
    
    # 检查架构
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($arch -ne "AMD64" -and $arch -ne "ARM64") {
        Write-Error "不支持的处理器架构: $arch"
        exit 1
    }
    
    Write-Success "系统检查通过: Windows $($osVersion.Major).$($osVersion.Minor) $arch"
}

# 下载文件
function Get-LatestRelease {
    Write-Status "获取最新版本信息..."
    
    try {
        $apiUrl = "https://api.github.com/repos/your-username/web-panel/releases/latest"
        $release = Invoke-RestMethod -Uri $apiUrl -Method Get
        
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "amd64" }
        $asset = $release.assets | Where-Object { $_.name -like "*windows_$arch.zip" }
        
        if (-not $asset) {
            Write-Error "未找到适合的安装包"
            exit 1
        }
        
        return $asset.browser_download_url
    }
    catch {
        Write-Error "获取版本信息失败: $($_.Exception.Message)"
        exit 1
    }
}

# 安装Web Panel
function Install-WebPanel {
    Write-Status "开始安装Web Panel..."
    
    # 创建安装目录
    if (-not (Test-Path $InstallPath)) {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
    }
    
    # 下载最新版本
    $downloadUrl = Get-LatestRelease
    $zipPath = Join-Path $env:TEMP "web-panel.zip"
    
    Write-Status "下载安装包: $downloadUrl"
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
    }
    catch {
        Write-Error "下载失败: $($_.Exception.Message)"
        exit 1
    }
    
    # 解压安装包
    Write-Status "解压安装包..."
    try {
        Expand-Archive -Path $zipPath -DestinationPath $InstallPath -Force
        Remove-Item $zipPath -Force
    }
    catch {
        Write-Error "解压失败: $($_.Exception.Message)"
        exit 1
    }
    
    Write-Success "Web Panel安装完成"
}

# 创建配置文件
function New-Configuration {
    Write-Status "创建配置文件..."
    
    $configPath = Join-Path $InstallPath ".env"
    $jwtSecret = [System.Web.Security.Membership]::GeneratePassword(32, 0)
    
    $configContent = @"
PORT=$Port
JWT_SECRET=$jwtSecret
DB_PATH=$InstallPath\data\database.sqlite
UPLOAD_PATH=$InstallPath\uploads
LOG_LEVEL=info
"@
    
    Set-Content -Path $configPath -Value $configContent -Encoding UTF8
    
    # 创建必要目录
    $directories = @("data", "logs", "uploads")
    foreach ($dir in $directories) {
        $dirPath = Join-Path $InstallPath $dir
        if (-not (Test-Path $dirPath)) {
            New-Item -ItemType Directory -Path $dirPath -Force | Out-Null
        }
    }
    
    Write-Success "配置文件已创建"
}

# 创建Windows服务
function New-WindowsService {
    Write-Status "创建Windows服务..."
    
    $exePath = Join-Path $InstallPath "web-panel.exe"
    
    if (-not (Test-Path $exePath)) {
        Write-Error "未找到可执行文件: $exePath"
        exit 1
    }
    
    try {
        # 删除现有服务（如果存在）
        $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($existingService) {
            Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
            & sc.exe delete $ServiceName
            Start-Sleep -Seconds 2
        }
        
        # 创建新服务
        & sc.exe create $ServiceName binPath= "\"$exePath\"" start= auto DisplayName= "Web Panel Service"
        & sc.exe description $ServiceName "Web Panel Management Service"
        
        # 配置服务恢复选项
        & sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/5000
        
        Write-Success "Windows服务已创建"
    }
    catch {
        Write-Error "创建服务失败: $($_.Exception.Message)"
        exit 1
    }
}

# 配置防火墙
function Set-FirewallRule {
    Write-Status "配置Windows防火墙..."
    
    try {
        $ruleName = "Web Panel - Port $Port"
        
        # 删除现有规则
        Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        
        # 创建新规则
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
        
        Write-Success "防火墙规则已添加"
    }
    catch {
        Write-Warning "配置防火墙失败，请手动开放端口 $Port"
    }
}

# 启动服务
function Start-WebPanelService {
    Write-Status "启动Web Panel服务..."
    
    try {
        Start-Service -Name $ServiceName
        Start-Sleep -Seconds 3
        
        $service = Get-Service -Name $ServiceName
        if ($service.Status -eq "Running") {
            Write-Success "Web Panel服务启动成功"
        } else {
            Write-Error "Web Panel服务启动失败"
            exit 1
        }
    }
    catch {
        Write-Error "启动服务失败: $($_.Exception.Message)"
        exit 1
    }
}

# 显示安装信息
function Show-InstallationInfo {
    $ipAddress = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" } | Select-Object -First 1).IPAddress
    
    Write-Host ""
    Write-ColorOutput "🎉 Web Panel 安装完成！" "Green"
    Write-Host ""
    Write-ColorOutput "📍 访问地址: http://$ipAddress`:$Port" "Cyan"
    Write-ColorOutput "👤 默认账号: admin / admin123" "Cyan"
    Write-Host ""
    Write-ColorOutput "🔧 管理命令:" "Yellow"
    Write-Host "  启动服务: Start-Service -Name $ServiceName"
    Write-Host "  停止服务: Stop-Service -Name $ServiceName"
    Write-Host "  重启服务: Restart-Service -Name $ServiceName"
    Write-Host "  查看状态: Get-Service -Name $ServiceName"
    Write-Host ""
    Write-ColorOutput "📁 安装目录: $InstallPath" "Cyan"
    Write-ColorOutput "⚙️  配置文件: $InstallPath\.env" "Cyan"
    Write-Host ""
}

# 卸载函数
function Uninstall-WebPanel {
    Write-Status "卸载Web Panel..."
    
    try {
        # 停止并删除服务
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($service) {
            Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
            & sc.exe delete $ServiceName
        }
        
        # 删除防火墙规则
        Remove-NetFirewallRule -DisplayName "Web Panel - Port $Port" -ErrorAction SilentlyContinue
        
        # 删除安装目录
        if (Test-Path $InstallPath) {
            Remove-Item -Path $InstallPath -Recurse -Force
        }
        
        Write-Success "Web Panel已卸载"
    }
    catch {
        Write-Error "卸载失败: $($_.Exception.Message)"
    }
}

# 显示帮助信息
function Show-Help {
    Write-Host "Web Panel Windows 安装脚本"
    Write-Host ""
    Write-Host "用法: .\online-install.ps1 [参数]"
    Write-Host ""
    Write-Host "参数:"
    Write-Host "  -InstallPath <路径>    安装目录 (默认: C:\Program Files\WebPanel)"
    Write-Host "  -ServiceName <名称>    服务名称 (默认: WebPanel)"
    Write-Host "  -Port <端口>           服务端口 (默认: 8080)"
    Write-Host "  -Uninstall             卸载Web Panel"
    Write-Host "  -Help                  显示帮助信息"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "  .\online-install.ps1"
    Write-Host "  .\online-install.ps1 -Port 9090"
    Write-Host "  .\online-install.ps1 -Uninstall"
}

# 主函数
function Main {
    if ($Help) {
        Show-Help
        return
    }
    
    if ($Uninstall) {
        if (-not (Test-Administrator)) {
            Write-Error "需要管理员权限才能卸载"
            exit 1
        }
        Uninstall-WebPanel
        return
    }
    
    Write-ColorOutput "🚀 Web Panel Windows 在线安装程序" "Green"
    Write-ColorOutput "================================" "Green"
    
    if (-not (Test-Administrator)) {
        Write-Error "需要管理员权限才能安装"
        Write-Status "请以管理员身份运行PowerShell"
        exit 1
    }
    
    Test-SystemRequirements
    Install-WebPanel
    New-Configuration
    New-WindowsService
    Set-FirewallRule
    Start-WebPanelService
    Show-InstallationInfo
}

# 执行主函数
Main
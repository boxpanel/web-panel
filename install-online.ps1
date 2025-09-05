# Web Panel 一键安装脚本
# 支持 Windows PowerShell

# 设置错误处理
$ErrorActionPreference = "Stop"

# 进度变量
$script:CurrentStep = 0
$script:TotalSteps = 9

# 颜色输出函数
function Print-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Print-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Print-Message {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

# 显示进度
function Show-Progress {
    param([string]$StepName)
    
    $script:CurrentStep++
    $percentage = [math]::Round(($script:CurrentStep * 100) / $script:TotalSteps)
    
    Write-Host ""
    Write-Host "[进度 $($script:CurrentStep)/$($script:TotalSteps) - $percentage%] $StepName" -ForegroundColor Green
    
    # 创建进度条
    $progressBar = "=" * [math]::Floor($percentage / 2)
    $remainingBar = "." * (50 - [math]::Floor($percentage / 2))
    Write-Host "$progressBar$remainingBar" -ForegroundColor Blue
    Write-Host ""
}

# 检查命令是否存在
function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# 检查并安装 Node.js
function Install-NodeJS {
    Print-Message "检查 Node.js..."
    
    if (Test-Command "node") {
        $nodeVersion = node --version
        $npmVersion = npm --version
        Print-Success "✓ Node.js 已安装: $nodeVersion (npm: $npmVersion)"
        return
    }
    
    Print-Message "正在安装 Node.js..."
    
    # 下载并安装 Node.js
    $nodeUrl = "https://nodejs.org/dist/v18.18.0/node-v18.18.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    
    try {
        Print-Message "  - 下载 Node.js 安装包..."
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
        
        Print-Message "  - 执行静默安装..."
        Start-Process msiexec.exe -Wait -ArgumentList "/i", $nodeInstaller, "/quiet"
        
        Print-Message "  - 清理安装文件..."
        Remove-Item $nodeInstaller -Force
        
        Print-Message "  - 刷新环境变量..."
        # 刷新环境变量
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        $nodeVersion = node --version
        $npmVersion = npm --version
        Print-Success "✓ Node.js 安装完成: $nodeVersion (npm: $npmVersion)"
    } catch {
        Print-Error "Node.js 安装失败: $($_.Exception.Message)"
        exit 1
    }
}

# 检查并安装 Git
function Install-Git {
    Print-Message "检查 Git..."
    
    if (Test-Command "git") {
        $gitVersion = git --version
        Print-Success "✓ Git 已安装: $gitVersion"
        return
    }
    
    Print-Message "正在安装 Git..."
    
    # 下载并安装 Git
    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.42.0.windows.2/Git-2.42.0.2-64-bit.exe"
    $gitInstaller = "$env:TEMP\git-installer.exe"
    
    try {
        Print-Message "  - 下载 Git 安装包..."
        Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller
        
        Print-Message "  - 执行静默安装..."
        Start-Process $gitInstaller -Wait -ArgumentList "/VERYSILENT", "/NORESTART"
        
        Print-Message "  - 清理安装文件..."
        Remove-Item $gitInstaller -Force
        
        Print-Message "  - 刷新环境变量..."
        # 刷新环境变量
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        $gitVersion = git --version
        Print-Success "✓ Git 安装完成: $gitVersion"
    } catch {
        Print-Error "Git 安装失败: $($_.Exception.Message)"
        exit 1
    }
}

# 安装 PM2
function Install-PM2 {
    Print-Message "检查 PM2..."
    
    if (Test-Command "pm2") {
        $pm2Version = pm2 --version
        Print-Success "✓ PM2 已安装: v$pm2Version"
        return
    }
    
    Print-Message "正在安装 PM2..."
    
    try {
        Print-Message "  - 使用 npm 全局安装 PM2..."
        npm install -g pm2 2>$null
        
        $pm2Version = pm2 --version
        Print-Success "✓ PM2 安装完成: v$pm2Version"
    } catch {
        Print-Error "PM2 安装失败: $($_.Exception.Message)"
        exit 1
    }
}

# 设置安装目录结构
function Setup-Directories {
    Print-Message "创建安装目录结构..."
    
    # 定义目录路径 (Windows 使用 C:\opt 作为标准安装目录)
    $script:INSTALL_DIR = "C:\opt\webpanel"
    $script:DATA_DIR = "C:\opt\webpanel_data"
    $script:BACKUP_DIR = "C:\opt\webpanel_backup"
    $script:SERVICE_NAME = "webpanel"
    
    # 创建目录
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
    New-Item -ItemType Directory -Path $DATA_DIR -Force | Out-Null
    New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
    
    Print-Success "目录结构创建完成"
    
    # 显示安装信息
    Write-Host ""
    Write-Host "====================================="
    Print-Message "安装信息:"
    Write-Host "  - 安装目录: $INSTALL_DIR"
    Write-Host "  - 数据目录: $DATA_DIR"
    Write-Host "  - 备份目录: $BACKUP_DIR"
    Write-Host "  - 服务名称: $SERVICE_NAME"
    Write-Host "====================================="
    Write-Host ""
}

# 获取用户配置
function Get-UserConfig {
    Write-Host ""
    Print-Message "=== Web Panel 配置 ==="
    Write-Host ""
    
    # 获取端口
    do {
        $port = Read-Host "请输入服务端口 (默认: 3001)"
        if ([string]::IsNullOrEmpty($port)) {
            $port = "3001"
        }
        
        if ($port -match "^\d+$" -and [int]$port -ge 1024 -and [int]$port -le 65535) {
            break
        } else {
            Print-Error "请输入有效的端口号 (1024-65535)"
        }
    } while ($true)
    
    # 获取管理员用户名
    do {
        $username = Read-Host "请输入管理员用户名 (默认: admin)"
        if ([string]::IsNullOrEmpty($username)) {
            $username = "admin"
        }
        
        if ($username.Length -ge 3) {
            break
        } else {
            Print-Error "用户名长度至少3个字符"
        }
    } while ($true)
    
    # 获取管理员密码
    do {
        $password = Read-Host "请输入管理员密码 (至少8个字符)" -AsSecureString
        $passwordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))
        if ($passwordText.Length -ge 8) {
            break
        } else {
            Print-Error "密码长度至少8个字符"
        }
    } while ($true)
    
    Write-Host ""
    Print-Success "配置信息收集完成"
    Write-Host "  端口: $port"
    Write-Host "  用户名: $username"
    Write-Host "  密码: ********"
    Write-Host ""
    
    return @{
        Port = $port
        Username = $username
        Password = $passwordText
    }
}

# 配置环境变量
function Setup-Environment {
    param(
        [hashtable]$Config
    )
    
    Print-Message "配置环境变量..."
    
    # 创建数据子目录
    New-Item -ItemType Directory -Path "$DATA_DIR\uploads" -Force | Out-Null
    New-Item -ItemType Directory -Path "$DATA_DIR\logs" -Force | Out-Null
    
    # 创建 .env 文件内容
    $envContent = @()
    $envContent += "# Web Panel 配置"
    $envContent += "PORT=$($Config.Port)"
    $envContent += "NODE_ENV=production"
    $envContent += ""
    $envContent += "# 管理员账户配置"
    $envContent += "ADMIN_USERNAME=$($Config.Username)"
    $envContent += "ADMIN_PASSWORD=$($Config.Password)"
    $envContent += "ADMIN_EMAIL=admin@localhost"
    $envContent += ""
    $envContent += "# JWT 配置"
    $envContent += "JWT_SECRET=$(Get-Random -Minimum 100000000 -Maximum 999999999)"
    $envContent += ""
    $envContent += "# 数据目录配置"
    $envContent += "DATA_DIR=$DATA_DIR"
    $envContent += "BACKUP_DIR=$BACKUP_DIR"
    $envContent += "DATABASE_PATH=$DATA_DIR\database.db"
    $envContent += "UPLOAD_DIR=$DATA_DIR\uploads"
    $envContent += "LOG_DIR=$DATA_DIR\logs"
    $envContent += ""
    $envContent += "# 数据库配置"
    $envContent += "DB_TYPE=sqlite"
    $envContent += "DB_PATH=$DATA_DIR\database.db"
    
    $envContent | Set-Content ".env"
    
    Print-Success "环境变量配置完成"
}

# 克隆项目到安装目录
function Clone-Project {
    Print-Message "正在克隆项目到安装目录..."
    
    # 切换到安装目录的父目录
    Print-Message "  - 切换到安装目录: C:\opt"
    Set-Location "C:\opt"
    
    # 如果目录已存在，先删除
    if (Test-Path $INSTALL_DIR) {
        Print-Message "  - 清理现有安装目录..."
        Remove-Item -Path $INSTALL_DIR -Recurse -Force
    }
    
    # 克隆项目
    Print-Message "  - 从 GitHub 克隆项目源码..."
    git clone https://github.com/boxpanel/web-panel.git webpanel 2>$null
    
    # 切换到项目目录
    Set-Location $INSTALL_DIR
    
    Print-Success "✓ 项目克隆完成 ($(Get-Location))"
}

# 启动服务
function Start-Services {
    param(
        [hashtable]$Config
    )
    
    Print-Message "启动 Web Panel 服务..."
    
    try {
        # 确保在项目目录中
        Set-Location $INSTALL_DIR
        
        # 停止可能存在的服务
        pm2 stop $SERVICE_NAME -ErrorAction SilentlyContinue
        pm2 delete $SERVICE_NAME -ErrorAction SilentlyContinue
        
        # 安装依赖
        Print-Message "  - 安装服务端依赖..."
        Set-Location "server"
        npm install 2>$null
        
        Print-Message "  - 安装客户端依赖..."
        Set-Location "../client"
        npm install 2>$null
        
        Print-Message "  - 构建客户端应用..."
        npm run build 2>$null
        
        Set-Location ".."
        
        # 更新 PM2 配置文件中的服务名称
        Print-Message "  - 更新 PM2 配置文件..."
        if (Test-Path "ecosystem.config.js") {
            $ecosystemContent = Get-Content "ecosystem.config.js" -Raw
            $ecosystemContent = $ecosystemContent -replace '"name"\s*:\s*"[^"]*"', "\"name\": \"$SERVICE_NAME\""
            $ecosystemContent | Set-Content "ecosystem.config.js"
        }
        
        # 使用 PM2 启动服务
        Print-Message "  - 使用 PM2 启动服务..."
        pm2 start ecosystem.config.js 2>$null
        
        Print-Success "服务启动成功!"
        Write-Host ""
        Print-Success "Web Panel 启动成功!"
        Write-Host ""
        Write-Host "====================================="
        Print-Message "安装信息:"
        Write-Host "  - 安装目录: $INSTALL_DIR"
        Write-Host "  - 数据目录: $DATA_DIR"
        Write-Host "  - 备份目录: $BACKUP_DIR"
        Write-Host "  - 服务名称: $SERVICE_NAME"
        Write-Host "====================================="
        Write-Host ""
        Print-Message "访问地址: http://localhost:3001"
        Write-Host "管理员用户名: $($Config.Username)"
        Write-Host "管理员密码: ********"
        Write-Host ""
        Print-Message "管理命令:"
        Write-Host "  - 查看服务状态: pm2 status"
        Write-Host "  - 查看服务日志: pm2 logs $SERVICE_NAME"
        Write-Host "  - 重启服务: pm2 restart $SERVICE_NAME"
        Write-Host "  - 停止服务: pm2 stop $SERVICE_NAME"
        Write-Host "  - 删除服务: pm2 delete $SERVICE_NAME"
        Write-Host ""
        Print-Message "目录说明:"
        Write-Host "  - 程序文件存储在: $INSTALL_DIR"
        Write-Host "  - 数据文件存储在: $DATA_DIR (数据库、上传文件、日志)"
        Write-Host "  - 备份文件存储在: $BACKUP_DIR"
        
    } catch {
        Print-Error "服务启动失败: $($_.Exception.Message)"
        exit 1
    }
}

# 主函数
function Main {
    try {
        Write-Host ""
        Print-Success "=== Web Panel 一键安装脚本 ==="
        Write-Host ""
        
        # 检查管理员权限
        if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
            Print-Error "请以管理员身份运行此脚本"
            exit 1
        }
        
        # 步骤1: 检查管理员权限
        Show-Progress "检查系统权限"
        
        # 步骤2: 安装系统依赖
        Show-Progress "安装系统依赖"
        Install-NodeJS
        Install-Git
        Install-PM2
        
        # 步骤3: 设置安装目录
        Show-Progress "创建安装目录结构"
        Setup-Directories
        
        # 步骤4: 克隆项目
        Show-Progress "下载项目源码"
        Clone-Project
        
        # 步骤5: 获取用户配置
        Show-Progress "获取用户配置信息"
        $config = Get-UserConfig
        
        # 步骤6: 配置环境
        Show-Progress "配置环境变量"
        Setup-Environment -Config $config
        
        # 步骤7: 安装项目依赖
        Show-Progress "安装项目依赖和构建"
        
        # 步骤8: 启动服务
        Show-Progress "启动Web Panel服务"
        Start-Services -Config $config
        
        # 步骤9: 显示访问信息
        Show-Progress "安装完成，显示访问信息"
        
    } catch {
        Print-Error "安装过程中发生错误: $($_.Exception.Message)"
        exit 1
    }
}

# 运行主函数
Main
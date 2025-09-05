# Web Panel 一键安装脚本
# 支持 Windows PowerShell

# 设置错误处理
$ErrorActionPreference = "Stop"

# 颜色输出函数
function Print-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Print-Warning {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Print-Message {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
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
    if (Test-Command "node") {
        $nodeVersion = node --version
        Print-Success "Node.js 已安装: $nodeVersion"
        return
    }
    
    Print-Message "正在安装 Node.js..."
    
    # 下载并安装 Node.js
    $nodeUrl = "https://nodejs.org/dist/v18.18.0/node-v18.18.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
        Start-Process msiexec.exe -Wait -ArgumentList "/i", $nodeInstaller, "/quiet"
        Remove-Item $nodeInstaller -Force
        
        # 刷新环境变量
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        Print-Success "Node.js 安装完成"
    } catch {
        Print-Error "Node.js 安装失败: $($_.Exception.Message)"
        exit 1
    }
}

# 检查并安装 Git
function Install-Git {
    if (Test-Command "git") {
        Print-Success "Git 已安装"
        return
    }
    
    Print-Message "正在安装 Git..."
    
    # 下载并安装 Git
    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.42.0.windows.2/Git-2.42.0.2-64-bit.exe"
    $gitInstaller = "$env:TEMP\git-installer.exe"
    
    try {
        Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller
        Start-Process $gitInstaller -Wait -ArgumentList "/VERYSILENT", "/NORESTART"
        Remove-Item $gitInstaller -Force
        
        # 刷新环境变量
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        Print-Success "Git 安装完成"
    } catch {
        Print-Error "Git 安装失败: $($_.Exception.Message)"
        exit 1
    }
}

# 安装 PM2
function Install-PM2 {
    if (Test-Command "pm2") {
        Print-Success "PM2 已安装"
        return
    }
    
    Print-Message "正在安装 PM2..."
    
    try {
        npm install -g pm2
        Print-Success "PM2 安装完成"
    } catch {
        Print-Error "PM2 安装失败: $($_.Exception.Message)"
        exit 1
    }
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
    $envContent += "# 数据库配置"
    $envContent += "DB_TYPE=sqlite"
    $envContent += "DB_PATH=./data/database.sqlite"
    
    $envContent | Set-Content ".env"
    
    Print-Success "环境变量配置完成"
}

# 启动服务
function Start-Services {
    param(
        [hashtable]$Config
    )
    
    Print-Message "启动 Web Panel 服务..."
    
    try {
        # 安装依赖
        Print-Message "安装服务端依赖..."
        Set-Location "server"
        npm install
        
        Print-Message "安装客户端依赖..."
        Set-Location "../client"
        npm install
        
        Print-Message "构建客户端..."
        npm run build
        
        Set-Location ".."
        
        # 使用 PM2 启动服务
        Print-Message "使用 PM2 启动服务..."
        pm2 start ecosystem.config.js
        
        Print-Success "服务启动成功!"
        Write-Host ""
        Print-Success "=== 安装完成 ==="
        Write-Host "访问地址: http://localhost:$($Config.Port)"
        Write-Host "管理员用户名: $($Config.Username)"
        Write-Host "管理员密码: ********"
        Write-Host ""
        Print-Message "使用 pm2 status 查看服务状态"
        Print-Message "使用 pm2 logs 查看服务日志"
        
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
        
        # 安装依赖
        Install-NodeJS
        Install-Git
        Install-PM2
        
        # 获取用户配置
        $config = Get-UserConfig
        
        # 配置环境
        Setup-Environment -Config $config
        
        # 启动服务
        Start-Services -Config $config
        
    } catch {
        Print-Error "安装过程中发生错误: $($_.Exception.Message)"
        exit 1
    }
}

# 运行主函数
Main
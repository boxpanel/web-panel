# Web Panel 一键在线安装脚本 (PowerShell)
# 使用方法: iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/boxpanel/web-panel/main/install-online.ps1'))

# 设置错误处理
$ErrorActionPreference = "Stop"

# 颜色定义
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    } else {
        $input | Write-Output
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Print-Message($message) {
    Write-ColorOutput Green "[INFO] $message"
}

function Print-Warning($message) {
    Write-ColorOutput Yellow "[WARNING] $message"
}

function Print-Error($message) {
    Write-ColorOutput Red "[ERROR] $message"
}

function Print-Success($message) {
    Write-ColorOutput Green "[SUCCESS] $message"
}

# 检查命令是否存在
function Test-Command($command) {
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

# 检查管理员权限
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 安装Chocolatey
function Install-Chocolatey {
    if (Test-Command "choco") {
        Print-Success "Chocolatey已安装"
        return
    }
    
    Print-Message "安装Chocolatey包管理器..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Print-Success "Chocolatey安装完成"
}

# 安装Node.js
function Install-NodeJS {
    Print-Message "检查Node.js安装状态..."
    
    if (Test-Command "node" -and Test-Command "npm") {
        $nodeVersion = node --version
        $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        
        if ($majorVersion -ge 16) {
            Print-Success "Node.js $nodeVersion 已安装"
            return
        } else {
            Print-Warning "Node.js版本过低 ($nodeVersion)，需要升级到16+"
        }
    }
    
    Print-Message "安装Node.js..."
    
    if (Test-Command "choco") {
        choco install nodejs -y
    } else {
        Print-Message "正在下载Node.js安装程序..."
        $nodeUrl = "https://nodejs.org/dist/v18.19.0/node-v18.19.0-x64.msi"
        $nodeInstaller = "$env:TEMP\nodejs-installer.msi"
        
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
        Print-Message "安装Node.js，请按照向导完成安装..."
        Start-Process msiexec.exe -Wait -ArgumentList "/i $nodeInstaller /quiet"
        Remove-Item $nodeInstaller
    }
    
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Print-Success "Node.js安装完成"
}

# 安装Git
function Install-Git {
    if (Test-Command "git") {
        Print-Success "Git已安装"
        return
    }
    
    Print-Message "安装Git..."
    
    if (Test-Command "choco") {
        choco install git -y
    } else {
        Print-Message "正在下载Git安装程序..."
        $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"
        $gitInstaller = "$env:TEMP\git-installer.exe"
        
        Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller
        Print-Message "安装Git，请按照向导完成安装..."
        Start-Process $gitInstaller -Wait -ArgumentList "/SILENT"
        Remove-Item $gitInstaller
    }
    
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Print-Success "Git安装完成"
}

# 安装PM2
function Install-PM2 {
    if (Test-Command "pm2") {
        Print-Success "PM2已安装"
        return
    }
    
    Print-Message "安装PM2..."
    npm install -g pm2
    npm install -g pm2-windows-startup
    
    Print-Success "PM2安装完成"
}

# 克隆项目
function Clone-Project {
    $projectDir = "web-panel"
    
    if (Test-Path $projectDir) {
        Print-Warning "目录 $projectDir 已存在，正在更新..."
        Set-Location $projectDir
        git pull origin main
    } else {
        Print-Message "克隆项目..."
        git clone https://github.com/boxpanel/web-panel.git
        Set-Location $projectDir
    }
    
    Print-Success "项目代码获取完成"
}

# 安装依赖
function Install-Dependencies {
    Print-Message "安装服务端依赖..."
    npm install
    
    Print-Message "安装客户端依赖..."
    Set-Location client
    npm install
    Set-Location ..
    
    Print-Success "依赖安装完成"
}

# 构建客户端
function Build-Client {
    Print-Message "构建客户端..."
    Set-Location client
    npm run build
    Set-Location ..
    Print-Success "客户端构建完成"
}

# 配置环境变量
function Setup-Environment {
    Print-Message "配置环境变量..."
    
    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        
        # 生成随机密钥
        $jwtSecret = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([System.Guid]::NewGuid().ToString()))
        $sessionSecret = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([System.Guid]::NewGuid().ToString()))
        
        # 更新.env文件
        (Get-Content ".env") -replace "your-secret-key", $jwtSecret -replace "your-session-secret", $sessionSecret | Set-Content ".env"
        
        Print-Success "环境变量配置完成"
    } else {
        Print-Warning ".env文件已存在，跳过配置"
    }
}

# 启动服务
function Start-Services {
    Print-Message "启动Web Panel服务..."
    
    # 停止可能存在的服务
    try {
        pm2 delete web-panel
    } catch {
        # 忽略错误
    }
    
    # 启动服务
    pm2 start ecosystem.config.js
    pm2 save
    
    # 设置开机自启
    try {
        pm2-startup install
    } catch {
        Print-Warning "无法设置开机自启，可能需要管理员权限"
    }
    
    Print-Success "服务启动完成"
}

# 显示访问信息
function Show-AccessInfo {
    Write-Host ""
    Write-Host "======================================"
    Write-ColorOutput Green "🎉 Web Panel 安装完成！"
    Write-Host "======================================"
    Write-Host ""
    Write-ColorOutput Cyan "访问地址:"
    Write-Host "  http://localhost:3000"
    
    # 获取本机IP
    $localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -ne "127.0.0.1"}).IPAddress | Select-Object -First 1
    if ($localIP) {
        Write-Host "  http://$localIP:3000"
    }
    
    Write-Host ""
    Write-ColorOutput Cyan "默认账号:"
    Write-Host "  用户名: admin"
    Write-Host "  密码: admin123"
    Write-Host ""
    Write-ColorOutput Cyan "管理命令:"
    Write-Host "  查看状态: pm2 status"
    Write-Host "  查看日志: pm2 logs web-panel"
    Write-Host "  重启服务: pm2 restart web-panel"
    Write-Host "  停止服务: pm2 stop web-panel"
    Write-Host ""
    Write-ColorOutput Yellow "注意: 首次登录后请立即修改默认密码！"
    Write-Host "======================================"
}

# 主函数
function Main {
    Write-Host ""
    Write-Host "======================================"
    Write-ColorOutput Cyan "Web Panel 一键安装脚本"
    Write-Host "======================================"
    Write-Host ""
    
    # 检查权限
    if (Test-Administrator) {
        Print-Warning "检测到管理员权限"
    } else {
        Print-Message "当前为普通用户权限"
    }
    
    try {
        # 安装依赖
        Install-Chocolatey
        Install-Git
        Install-NodeJS
        Install-PM2
        
        # 安装项目
        Clone-Project
        Install-Dependencies
        Build-Client
        Setup-Environment
        Start-Services
        
        # 显示访问信息
        Show-AccessInfo
        
    } catch {
        Print-Error "安装过程中发生错误: $($_.Exception.Message)"
        Print-Error "请检查网络连接和权限设置"
        exit 1
    }
}

# 执行主函数
Main
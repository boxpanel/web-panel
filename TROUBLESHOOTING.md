# Web Panel 故障排除指南

本文档提供常见问题的解决方案和故障排除步骤。

## 目录

- [Ubuntu系统Node.js依赖冲突](#ubuntu系统nodejs依赖冲突)
- [Go模块问题](#go模块问题)
- [权限问题](#权限问题)
- [网络连接问题](#网络连接问题)
- [服务启动问题](#服务启动问题)

## Ubuntu系统Node.js依赖冲突

### 问题描述

在Ubuntu 22.04等系统上安装时，可能遇到以下错误：

```
The following packages have unmet dependencies:
  node-gyp : Depends: nodejs:any
  node-mkdirp : Depends: nodejs:any
  node-nopt : Depends: nodejs:any
  node-which : Depends: nodejs:any
  nodejs : Conflicts: npm
  npm : Depends: nodejs:any (>= 10)
E: Unable to correct problems, you have held broken packages.
```

### 解决方案

#### 方案1：使用修复后的安装脚本（推荐）

```bash
# 使用最新的在线安装脚本（已修复依赖冲突）
curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/online-install.sh | sudo bash
```

#### 方案2：手动清理并重新安装

```bash
# 1. 清理冲突的包
sudo apt-get remove -y nodejs npm node-gyp node-mkdirp node-nopt node-which
sudo apt-get autoremove -y
sudo apt-get autoclean

# 2. 清理apt缓存
sudo rm -rf /var/lib/apt/lists/*
sudo apt-get update

# 3. 使用NodeSource官方源安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. 验证安装
node --version
npm --version
```

#### 方案3：使用Snap安装Node.js

```bash
# 清理现有安装
sudo apt-get remove -y nodejs npm
sudo apt-get autoremove -y

# 使用Snap安装
sudo snap install node --classic

# 验证安装
node --version
npm --version
```

#### 方案4：使用NVM安装Node.js

```bash
# 安装NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# 安装最新LTS版本的Node.js
nvm install --lts
nvm use --lts

# 验证安装
node --version
npm --version
```

### 预防措施

1. **避免混合安装源**：不要同时使用系统包管理器和其他源安装Node.js
2. **定期更新系统**：保持系统包管理器的索引最新
3. **使用官方源**：优先使用NodeSource等官方维护的源

## Go模块问题

### 问题：go.mod file not found

```bash
go: go.mod file not found in current directory or any parent directory
```

**解决方案**：

```bash
# 确保在项目根目录
cd /path/to/web-panel
ls -la go.mod  # 确认go.mod文件存在

# 如果文件存在但仍报错，重新初始化模块
go mod tidy
```

### 问题：Go版本过低

**解决方案**：

```bash
# 检查Go版本
go version

# 如果版本低于1.18.1，需要升级
sudo rm -rf /usr/local/go
wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
export PATH=/usr/local/go/bin:$PATH
echo 'export PATH=/usr/local/go/bin:$PATH' >> ~/.bashrc
```

## 权限问题

### 问题：Permission denied

**解决方案**：

```bash
# 检查文件权限
ls -la web-panel

# 添加执行权限
chmod +x web-panel

# 如果是目录权限问题
sudo chown -R $USER:$USER /opt/web-panel
chmod -R 755 /opt/web-panel
```

### 问题：端口占用

```bash
# 检查端口占用
sudo netstat -tlnp | grep :8080

# 或使用ss命令
ss -tlnp | grep :8080

# 杀死占用端口的进程
sudo kill -9 <PID>

# 或更改配置文件中的端口
vim .env
# 修改 PORT=8081
```

## 网络连接问题

### 问题：无法下载依赖

**解决方案**：

```bash
# 设置Go代理（中国用户）
export GOPROXY=https://goproxy.cn,direct
go mod download

# 设置npm镜像（中国用户）
npm config set registry https://registry.npmmirror.com
```

### 问题：Git克隆失败

```bash
# 使用HTTPS而不是SSH
git clone https://github.com/boxpanel/web-panel.git

# 或设置Git代理
git config --global http.proxy http://proxy.example.com:8080
```

## 服务启动问题

### 问题：服务无法启动

**检查步骤**：

```bash
# 1. 检查配置文件
cat .env

# 2. 检查日志
tail -f logs/app.log

# 3. 手动启动查看错误
./web-panel

# 4. 检查系统服务状态
sudo systemctl status web-panel
sudo journalctl -u web-panel -f
```

### 问题：数据库连接失败

```bash
# 检查SQLite文件权限
ls -la data/database.sqlite

# 创建数据目录
mkdir -p data logs uploads
chmod 755 data logs uploads

# 检查SQLite数据库文件是否存在
if [ ! -f "data/database.sqlite" ]; then
    echo "数据库文件不存在，程序启动时会自动创建"
fi
```

## 获取帮助

如果以上解决方案都无法解决您的问题，请：

1. **查看日志文件**：`tail -f logs/app.log`
2. **检查系统日志**：`sudo journalctl -u web-panel -f`
3. **提交Issue**：在GitHub仓库提交详细的错误信息
4. **社区支持**：加入我们的社区讨论群

### 提交Bug报告时请包含：

- 操作系统版本：`lsb_release -a`
- Go版本：`go version`
- Node.js版本：`node --version`
- 错误日志：完整的错误信息
- 复现步骤：详细的操作步骤

---

**注意**：本文档会持续更新，建议定期查看最新版本。
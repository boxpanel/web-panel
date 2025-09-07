# Web Panel ARM64 快速安装指南

## 问题描述

用户在ARM64架构的Linux系统上安装Web Panel时遇到下载失败的问题：

```
[WARNING] 下载失败，尝试使用v1.0.4版本... 
[ERROR] 下载预编译包失败 
[ERROR] 请检查: 
[ERROR] 1. 网络连接是否正常 
[ERROR] 2. GitHub访问是否正常 
[ERROR] 3. 版本 22.04.5 LTS (Jammy Jellyfish) 是否存在 
[ERROR] 4. 架构 linux/arm64 是否支持 
```

## 解决方案

我们提供了一个临时的HTTP服务器解决方案，可以绕过GitHub releases的访问问题。

### 🚀 快速安装（推荐方法）

#### 步骤1：启动HTTP服务器

在有网络访问的Windows机器上：

```bash
# 进入项目目录
cd D:\Desktop\web-panel

# 启动HTTP服务器
python serve-binary.py
```

服务器启动后会显示：
```
=== ARM64二进制文件服务器 ===
服务器启动在端口 8080

可用文件：
  - ARM64二进制包: http://localhost:8080/temp-release/web-panel-v1.0.5-linux-arm64.tar.gz
  - 安装脚本: http://localhost:8080/install-local.sh

在ARM64设备上运行以下命令进行安装：
  curl -fsSL http://YOUR_IP:8080/install-local.sh | bash
```

#### 步骤2：在ARM64 Linux服务器上安装

```bash
# 替换 192.168.1.100 为运行HTTP服务器的实际IP地址
export SERVER_URL=http://192.168.1.100:8080
curl -fsSL http://192.168.1.100:8080/install-local.sh | sudo bash
```

### 📁 文件传输方法（备选方案）

如果无法使用HTTP服务器，可以直接传输文件：

#### 使用SCP传输

```bash
# 从Windows机器传输到Linux服务器
scp temp-release/web-panel-v1.0.5-linux-arm64.tar.gz user@server:/tmp/
scp install-local.sh user@server:/tmp/

# 在Linux服务器上安装
ssh user@server
cd /tmp
chmod +x install-local.sh
sudo ./install-local.sh
```

#### 使用USB或其他方式

1. 将以下文件复制到USB设备：
   - `temp-release/web-panel-v1.0.5-linux-arm64.tar.gz`
   - `install-local.sh`

2. 在ARM64服务器上挂载USB并运行安装脚本

## 🔧 安装后操作

### 启动服务

```bash
# 启动Web Panel服务
sudo systemctl start web-panel

# 设置开机自启
sudo systemctl enable web-panel

# 检查服务状态
sudo systemctl status web-panel
```

### 访问面板

打开浏览器访问：`http://your-server-ip:8888`

默认登录信息：
- 用户名：admin
- 密码：admin123

### 服务管理命令

```bash
# 查看服务状态
sudo systemctl status web-panel

# 重启服务
sudo systemctl restart web-panel

# 停止服务
sudo systemctl stop web-panel

# 查看日志
sudo journalctl -u web-panel -f
```

## 🛠️ 故障排除

### 1. 下载失败

**问题**：无法从HTTP服务器下载文件

**解决方案**：
- 检查HTTP服务器是否正在运行
- 确认IP地址是否正确
- 检查防火墙设置（确保8080端口开放）
- 尝试在浏览器中直接访问下载链接

### 2. 权限问题

**问题**：安装脚本提示权限不足

**解决方案**：
```bash
# 确保使用sudo运行安装脚本
sudo ./install-local.sh

# 或者给脚本执行权限
chmod +x install-local.sh
```

### 3. 服务启动失败

**问题**：Web Panel服务无法启动

**解决方案**：
```bash
# 检查二进制文件权限
sudo chmod +x /opt/web-panel/web-panel

# 检查端口是否被占用
sudo netstat -tlnp | grep :8888

# 查看详细错误日志
sudo journalctl -u web-panel -n 50
```

### 4. 网络访问问题

**问题**：无法访问Web Panel界面

**解决方案**：
```bash
# 检查服务是否运行
sudo systemctl status web-panel

# 检查防火墙设置
sudo ufw status
sudo ufw allow 8888

# 或者对于CentOS/RHEL
sudo firewall-cmd --permanent --add-port=8888/tcp
sudo firewall-cmd --reload
```

## 📞 技术支持

如果遇到其他问题，请提供以下信息：

1. 操作系统版本：`cat /etc/os-release`
2. 系统架构：`uname -m`
3. 错误日志：`sudo journalctl -u web-panel -n 20`
4. 服务状态：`sudo systemctl status web-panel`

## 🔄 后续升级

当GitHub releases问题解决后，您可以使用官方安装脚本进行升级：

```bash
curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh | bash
```

---

**注意**：这是一个临时解决方案，用于解决当前GitHub releases访问问题。我们正在努力修复官方构建流程。
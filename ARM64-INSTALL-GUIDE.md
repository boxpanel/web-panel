# Web Panel ARM64 安装指南 (临时解决方案)

由于GitHub Actions构建流程还在进行中，我们提供了一个临时的解决方案来安装Web Panel到ARM64架构的Linux系统。

## 问题说明

您遇到的错误是因为：
1. GitHub Actions工作流还在构建v1.0.5版本的releases
2. ARM64架构的预编译包暂时不可用
3. 安装脚本无法从GitHub releases下载对应的包

## 临时解决方案

由于GitHub Actions构建流程问题，我们提供了以下临时解决方案来安装ARM64版本的Web Panel。

### 文件说明

1. **web-panel-v1.0.5-linux-arm64.tar.gz** - ARM64架构的预编译二进制包
2. **install-local.sh** - 本地安装脚本，支持从本地文件或HTTP服务器安装
3. **serve-binary.py** - 简单的HTTP服务器，用于提供二进制文件下载

### 安装步骤

#### 方法一：使用HTTP服务器（推荐）

1. 在有二进制文件的机器上启动HTTP服务器：
   ```bash
   python3 serve-binary.py
   ```
   
2. 服务器会显示类似以下信息：
   ```
   === ARM64二进制文件服务器 ===
   服务器启动在端口 8080
   
   可用文件：
     - ARM64二进制包: http://localhost:8080/temp-release/web-panel-v1.0.5-linux-arm64.tar.gz
     - 安装脚本: http://localhost:8080/install-local.sh
   
   在ARM64设备上运行以下命令进行安装：
     curl -fsSL http://YOUR_IP:8080/install-local.sh | bash
   ```

3. 在ARM64 Linux服务器上运行安装命令（替换YOUR_IP为实际IP）：
   ```bash
   export SERVER_URL=http://YOUR_IP:8080
   curl -fsSL http://YOUR_IP:8080/install-local.sh | sudo bash
   ```

#### 方法二：直接使用本地文件

1. 将以下文件传输到您的ARM64 Linux服务器：
   ```
   web-panel-v1.0.5-linux-arm64.tar.gz
   install-local.sh
   ```

2. 在服务器上运行安装脚本：
   ```bash
   chmod +x install-local.sh
   sudo ./install-local.sh
   ```

#### 方法三：从temp-release目录安装

1. 将整个 `temp-release` 目录传输到服务器
2. 在包含 `temp-release` 目录的位置运行：
   ```bash
   chmod +x install-local.sh
   sudo ./install-local.sh
   ```

#### 方法2: 手动安装

1. 传输二进制文件到服务器：
   ```bash
   # 复制到系统目录
   sudo cp web-panel-v1.0.4-linux-arm64 /usr/local/bin/web-panel
   sudo chmod +x /usr/local/bin/web-panel
   ```

2. 创建配置目录：
   ```bash
   sudo mkdir -p /etc/web-panel
   sudo mkdir -p /var/log/web-panel
   sudo mkdir -p /var/lib/web-panel
   ```

3. 创建systemd服务文件：
   ```bash
   sudo tee /etc/systemd/system/web-panel.service > /dev/null <<EOF
   [Unit]
   Description=Web Panel Service
   After=network.target
   Wants=network.target
   
   [Service]
   Type=simple
   User=root
   Group=root
   ExecStart=/usr/local/bin/web-panel
   Restart=always
   RestartSec=5
   Environment=GIN_MODE=release
   WorkingDirectory=/opt/web-panel
   StandardOutput=journal
   StandardError=journal
   SyslogIdentifier=web-panel
   
   [Install]
   WantedBy=multi-user.target
   EOF
   ```

4. 启动服务：
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable web-panel
   sudo systemctl start web-panel
   ```

5. 开放防火墙端口：
   ```bash
   # 如果使用firewalld
   sudo firewall-cmd --permanent --add-port=8080/tcp
   sudo firewall-cmd --reload
   
   # 如果使用ufw
   sudo ufw allow 8080/tcp
   ```

### 访问Web Panel

安装完成后，您可以通过以下方式访问：

- **访问地址**: `http://您的服务器IP:8080`
- **默认用户名**: `admin`
- **默认密码**: `admin123`

### 服务管理命令

```bash
# 查看服务状态
sudo systemctl status web-panel

# 启动服务
sudo systemctl start web-panel

# 停止服务
sudo systemctl stop web-panel

# 重启服务
sudo systemctl restart web-panel

# 查看日志
sudo journalctl -u web-panel -f
```

### 文件传输方法

#### 使用scp传输文件

```bash
# 从Windows传输到Linux服务器
scp web-panel-v1.0.4-linux-arm64 install-local.sh user@your-server-ip:/home/user/
```

#### 使用WinSCP (Windows用户)

1. 下载并安装WinSCP
2. 连接到您的Linux服务器
3. 将文件拖拽到服务器的用户目录

### 验证安装

1. 检查服务状态：
   ```bash
   sudo systemctl status web-panel
   ```

2. 检查端口监听：
   ```bash
   sudo netstat -tlnp | grep 8080
   ```

3. 测试Web访问：
   ```bash
   curl -I http://localhost:8080
   ```

### 故障排除

#### 如果服务启动失败

1. 查看详细日志：
   ```bash
   sudo journalctl -u web-panel -n 50
   ```

2. 检查二进制文件权限：
   ```bash
   ls -la /usr/local/bin/web-panel
   ```

3. 手动运行测试：
   ```bash
   /usr/local/bin/web-panel --help
   ```

#### 如果无法访问Web界面

1. 检查防火墙设置
2. 确认服务正在监听8080端口
3. 检查服务器IP地址是否正确

### 后续升级

当GitHub releases中有新版本可用时，您可以：

1. 下载新的预编译包
2. 停止服务：`sudo systemctl stop web-panel`
3. 替换二进制文件
4. 重启服务：`sudo systemctl start web-panel`

或者使用官方的install.sh脚本重新安装。

## 注意事项

- 这是一个临时解决方案，建议在官方releases可用后使用正式版本
- 请确保您的系统是ARM64架构 (aarch64)
- 建议在安装前备份重要数据
- 默认密码请在首次登录后立即修改

## 技术支持

如果遇到问题，请提供以下信息：
- 系统架构：`uname -m`
- 操作系统版本：`cat /etc/os-release`
- 服务状态：`sudo systemctl status web-panel`
- 错误日志：`sudo journalctl -u web-panel -n 20`
# Web Panel - Linux服务器管理面板

一个基于 Node.js 和 Express 的轻量级 Linux 服务器管理面板，提供文件管理、系统监控、用户管理等功能。

## 功能特性

- 🔐 安全的用户认证系统
- 📁 文件管理（上传、下载、编辑、删除）
- 📊 系统信息监控
- ⚙️ 系统设置管理
- 📝 操作日志记录
- 🎨 现代化的响应式界面
- 🔧 一键安装和卸载

## 系统要求

- Node.js 14.0 或更高版本
- npm 6.0 或更高版本
- Linux 操作系统（Ubuntu、CentOS、Debian 等）
- 至少 512MB 内存
- 至少 100MB 磁盘空间

### 自动磁盘空间管理

安装脚本现在包含智能磁盘空间管理功能：

- **自动检测**：安装前自动检查 `/tmp` 目录可用空间
- **智能清理**：自动清理过期的临时文件释放空间
- **动态扩展**：当空间不足时自动创建临时 swap 文件或内存文件系统
- **自动清理**：安装完成后自动清理所有临时扩展的空间

支持的空间扩展方式：
1. 清理系统临时文件（优先级最高）
2. 创建临时 swap 文件增加虚拟内存
3. 挂载内存文件系统作为临时存储

这确保即使在磁盘空间紧张的环境下也能成功完成安装。

## 快速安装

### 方法一：一键安装脚本（推荐）

```bash
# 使用 curl 下载并运行安装脚本（推荐）
curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh | sh

# 或者分步执行（适用于没有bash的系统）
curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh -o install.sh
sh install.sh

# 使用 wget 的方式
wget -qO- https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh | sh
```

### 方法二：手动安装

1. 克隆仓库
```bash
# 主仓库（推荐）
git clone https://github.com/boxpanel/web-panel.git
cd web-panel

# 如果GitHub访问较慢，可以使用镜像仓库
# git clone https://gitee.com/boxpanel/web-panel.git
# git clone https://gitlab.com/boxpanel/web-panel.git
```

2. 安装依赖
```bash
npm install
```

3. 初始化数据库
```bash
node database/init.js
```

4. 启动服务
```bash
node server.js
```

## 配置说明

### 环境变量

- `PORT`: 服务器端口（默认：3000）
- `DB_DIR`: 数据库目录路径
- `NODE_ENV`: 运行环境（development/production）

### 配置文件

系统配置存储在 SQLite 数据库中，包括：
- 服务器端口
- 系统名称
- 会话超时时间
- 用户账户信息

## 使用说明

1. 安装完成后，访问 `http://your-server-ip:port`
2. 使用安装时设置的管理员账户登录
3. 开始管理您的服务器

### 默认账户

如果使用默认设置：
- 用户名：admin
- 密码：123456
- 端口：3000

**⚠️ 强烈建议首次登录后立即修改默认密码！**

## 功能模块

### 文件管理
- 浏览服务器文件系统
- 上传和下载文件
- 创建、重命名、删除文件和文件夹
- 在线编辑文本文件
- 文件权限管理

### 系统监控
- CPU 使用率
- 内存使用情况
- 磁盘空间
- 网络状态
- 系统负载

### 用户管理
- 修改登录密码
- 会话管理
- 操作日志查看

### 系统设置
- 修改服务器端口
- 自定义系统名称
- 会话超时设置
- 网络配置

## 卸载说明

### Linux 系统卸载

使用一键卸载脚本：

```bash
# 下载并运行卸载脚本
curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/uninstall.sh | bash

# 或者如果已下载项目
./uninstall.sh
```

卸载脚本将会：
- 停止所有相关服务和进程
- 删除应用程序文件
- 清理数据库文件
- 删除配置文件
- 清理用户数据目录
- 删除系统服务（如果存在）
- 备份重要数据到 `/tmp/web-panel-backup-*`



### 手动卸载

如果自动卸载失败，可以手动执行以下步骤：

1. 停止服务
```bash
# 停止 Node.js 进程
pkill -f "node.*server.js"

# 停止系统服务（如果存在）
sudo systemctl stop web-panel
sudo systemctl disable web-panel
```

2. 删除文件
```bash
# 删除应用程序目录
sudo rm -rf /opt/web-panel
sudo rm -rf /usr/local/web-panel

# 删除用户数据
rm -rf ~/.local/share/web-panel
rm -rf ~/.config/web-panel

# 删除系统服务文件
sudo rm -f /etc/systemd/system/web-panel.service
sudo systemctl daemon-reload
```

## 安全建议

1. **修改默认密码**：首次登录后立即修改管理员密码
2. **使用 HTTPS**：在生产环境中配置 SSL 证书
3. **防火墙设置**：只开放必要的端口
4. **定期备份**：定期备份数据库和重要文件
5. **更新系统**：保持系统和依赖包的最新版本

## 故障排除

### 常见问题

1. **端口被占用**
```bash
# 查看端口占用
sudo netstat -tlnp | grep :3000

# 修改端口
export PORT=8080
node server.js
```

2. **数据库权限错误**
```bash
# 修复数据库权限
chmod 666 /path/to/database/server_panel.db
chmod 755 /path/to/database/
```

3. **Node.js 版本过低**
```bash
# 更新 Node.js
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 日志查看

```bash
# 查看应用日志
journalctl -u web-panel -f

# 查看 Node.js 进程
ps aux | grep node
```

## 开发说明

### 项目结构

```
web-panel/
├── server.js              # 主服务器文件
├── package.json           # 项目依赖
├── database/              # 数据库相关
│   └── init.js           # 数据库初始化
├── public/               # 静态资源
├── views/                # EJS 模板
├── routes/               # 路由文件
├── upload/               # 文件上传目录
├── install.sh            # Linux 安装脚本
└── uninstall.sh            # Linux 卸载脚本
```

### 开发环境

```bash
# 克隆项目
git clone https://github.com/boxpanel/web-panel.git
cd web-panel

# 安装依赖
npm install

# 开发模式运行
npm run dev
```

### 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 支持

- 📧 邮箱：support@webpanel.com
- 🐛 问题反馈：[GitHub Issues](https://github.com/boxpanel/web-panel/issues)
- 📖 文档：[项目 Wiki](https://github.com/boxpanel/web-panel/wiki)

## 更新日志

### v1.0.0 (2024-01-XX)
- ✨ 初始版本发布
- 🔐 用户认证系统
- 📁 文件管理功能
- 📊 系统监控
- 🔧 一键安装脚本
- 🗑️ 一键卸载脚本

---

**感谢使用 Web Panel！** 🎉
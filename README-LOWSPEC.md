# Web Panel 低配服务器部署指南

本指南专门针对配置较低的服务器（内存 ≤ 2GB，CPU ≤ 2核心）提供优化的部署方案。

## 系统要求

### 最低配置
- **内存**: 512MB 可用内存
- **CPU**: 1核心
- **磁盘**: 1GB 可用空间
- **操作系统**: Linux (Ubuntu 18.04+, CentOS 7+)

### 推荐配置
- **内存**: 1GB 可用内存
- **CPU**: 2核心
- **磁盘**: 2GB 可用空间
- **网络**: 稳定的网络连接

## 快速安装

### Linux 系统

```bash
# 下载并运行安装脚本
wget https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh
chmod +x install.sh
sudo ./install.sh
```

## 手动安装

### 1. 环境准备

```bash
# 安装 Node.js (推荐 LTS 版本)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 2. 下载项目

```bash
# 克隆项目
git clone https://github.com/boxpanel/web-panel.git
cd web-panel

# 或下载压缩包
wget https://github.com/boxpanel/web-panel/archive/main.zip
unzip main.zip
cd web-panel-main
```

### 3. 安装依赖（低配版本）

```bash
# 使用低配版本的 package.json
cp package.lowspec.json package.json

# 安装依赖
npm install --production

# 构建客户端（如果需要）
cd client
npm install --production
npm run build
cd ..
```

### 4. 配置环境

```bash
# 复制低配服务器配置
cp .env.lowspec .env

# 编辑配置文件
nano .env
```

### 5. 初始化数据库

```bash
# 运行数据库初始化脚本
node server/scripts/init-database.js
```

### 6. 启动服务

```bash
# 使用 PM2 启动（推荐）
npm install -g pm2
pm2 start ecosystem.lowspec.config.js

# 或直接启动
node server/app.js
```

## 配置说明

### 环境变量配置 (.env.lowspec)

```env
# 服务器配置
PORT=3000
NODE_ENV=production

# 内存限制
MAX_MEMORY_MB=256
MAX_CPU_PERCENT=80

# 数据库配置
DB_PATH=./data/webpanel.db
DB_POOL_MIN=1
DB_POOL_MAX=2

# 缓存配置
CACHE_MAX_ENTRIES=100
CACHE_MAX_MEMORY_MB=16

# 日志配置
LOG_LEVEL=warn
LOG_MAX_FILES=3
LOG_MAX_SIZE=10m

# 监控配置
ENABLE_MONITORING=true
MONITOR_INTERVAL=30000

# 安全配置
JWT_SECRET=your-secret-key-here
SESSION_SECRET=your-session-secret-here
```

### PM2 配置 (ecosystem.lowspec.config.js)

关键优化配置：
- **单实例模式**: 避免多进程占用过多内存
- **内存限制**: 限制进程最大内存使用
- **自动重启**: 内存使用过高时自动重启
- **日志轮转**: 防止日志文件过大

## 性能优化

### 1. 内存优化

- **启用垃圾回收优化**
  ```bash
  node --expose-gc --max-old-space-size=256 server/app.js
  ```

- **使用资源监控中间件**
  - 自动内存清理
  - 请求限流
  - 缓存优化

### 2. 数据库优化

- **SQLite 优化配置**
  - WAL 模式提高并发性能
  - 适当的缓存大小设置
  - 定期数据库维护

- **查询优化**
  - 启用查询缓存
  - 限制分页大小
  - 索引优化

### 3. 缓存策略

- **内存缓存**
  - API 响应缓存
  - 静态资源缓存
  - 数据库查询缓存

- **文件缓存**
  - 编译后的模板缓存
  - 压缩后的静态资源

### 4. 网络优化

- **启用 Gzip 压缩**
- **静态资源 CDN**
- **HTTP/2 支持**

## 监控和维护

### 系统监控

```bash
# 查看系统资源使用情况
htop

# 查看进程内存使用
ps aux | grep node

# 查看磁盘使用情况
df -h
```

### 应用监控

访问管理面板的监控页面：
- **系统概览**: `/admin/system/overview`
- **性能监控**: `/admin/system/performance`
- **资源使用**: `/admin/system/resources`

### 日志管理

```bash
# 查看应用日志
pm2 logs web-panel

# 查看错误日志
tail -f logs/error.log

# 查看访问日志
tail -f logs/access.log
```

### 数据库维护

```bash
# 数据库优化
node server/scripts/optimize-database.js

# 数据库备份
node server/scripts/backup-database.js

# 清理过期数据
node server/scripts/cleanup-data.js
```

## 故障排除

### 常见问题

#### 1. 内存不足

**症状**: 应用频繁重启，响应缓慢

**解决方案**:
```bash
# 检查内存使用
free -h

# 调整内存限制
export MAX_MEMORY_MB=128

# 启用交换空间
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

#### 2. CPU 使用率过高

**症状**: 系统响应缓慢，负载过高

**解决方案**:
```bash
# 检查 CPU 使用情况
top

# 调整进程优先级
renice -n 10 $(pgrep node)

# 限制 CPU 使用
cpulimit -p $(pgrep node) -l 50
```

#### 3. 磁盘空间不足

**症状**: 无法写入日志，数据库错误

**解决方案**:
```bash
# 检查磁盘使用
df -h

# 清理日志文件
find logs/ -name "*.log" -mtime +7 -delete

# 清理缓存文件
rm -rf cache/*

# 数据库清理
node server/scripts/cleanup-data.js
```

#### 4. 数据库锁定

**症状**: 数据库操作超时

**解决方案**:
```bash
# 检查数据库文件
ls -la data/

# 删除锁定文件
rm -f data/webpanel.db-wal
rm -f data/webpanel.db-shm

# 重启应用
pm2 restart web-panel
```

### 性能调优建议

1. **定期重启**: 每24小时重启一次应用
2. **监控告警**: 设置内存和CPU使用率告警
3. **数据清理**: 定期清理过期日志和数据
4. **备份策略**: 每日自动备份数据库
5. **更新维护**: 定期更新依赖包和系统补丁

## 安全建议

### 1. 网络安全

```bash
# 配置防火墙
sudo ufw enable
sudo ufw allow 22/tcp
sudo ufw allow 3000/tcp

# 禁用不必要的服务
sudo systemctl disable apache2
sudo systemctl disable nginx
```

### 2. 应用安全

- 修改默认端口
- 设置强密码
- 启用 HTTPS
- 定期更新依赖

### 3. 系统安全

- 禁用 root 登录
- 使用密钥认证
- 定期系统更新
- 监控异常访问

## 升级指南

### 从标准版本迁移到低配版本

```bash
# 备份数据
cp -r data/ data_backup/

# 停止服务
pm2 stop web-panel

# 更新配置
cp .env.lowspec .env
cp package.lowspec.json package.json
cp ecosystem.lowspec.config.js ecosystem.config.js

# 重新安装依赖
npm install --production

# 启动服务
pm2 start ecosystem.config.js
```

### 版本更新

```bash
# 备份当前版本
cp -r web-panel web-panel-backup

# 下载新版本
wget https://github.com/boxpanel/web-panel/archive/main.zip
unzip main.zip

# 迁移配置和数据
cp web-panel-backup/.env web-panel-main/
cp -r web-panel-backup/data/ web-panel-main/

# 更新依赖
cd web-panel-main
npm install --production

# 重启服务
pm2 restart web-panel
```

## 技术支持

如果您在使用过程中遇到问题，可以通过以下方式获取帮助：

- **GitHub Issues**: https://github.com/boxpanel/web-panel/issues
- **文档**: https://docs.your-domain.com
- **社区论坛**: https://community.your-domain.com

## 许可证

本项目采用 MIT 许可证，详情请参阅 [LICENSE](LICENSE) 文件。
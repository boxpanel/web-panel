# Web Panel - Go版本

一个现代化的Web管理面板，使用Go语言重写，提供系统监控、文件管理、用户管理等功能。

## ✨ 特性

- 🚀 **高性能**: 使用Go语言开发，性能优异
- 🔒 **安全**: JWT认证，RBAC权限控制
- 📊 **监控**: 实时系统监控和资源使用情况
- 📁 **文件管理**: 完整的文件上传、下载、管理功能
- 👥 **用户管理**: 多用户支持，角色权限管理
- 🎨 **现代UI**: Vue.js前端，响应式设计
- 🐳 **容器化**: 支持Docker部署
- 📦 **一键安装**: 提供多种安装方式

## 🛠️ 技术栈

### 后端
- **Go 1.23.0+**: 主要开发语言（与1Panel保持一致）
- **Gin**: Web框架
- **GORM**: ORM框架
- **SQLite/MySQL/PostgreSQL**: 多数据库支持
- **Docker**: 容器管理和部署
- **JWT**: 身份认证
- **Logrus**: 日志管理
- **Swagger**: API文档生成

### 前端
- **Vue.js 3**: 前端框架
- **Element Plus**: UI组件库（与1Panel保持一致）
- **Vite**: 构建工具
- **Axios**: HTTP客户端

## 📋 环境要求

安装前请确保您的系统符合安装条件：

- **操作系统**: 支持主流 Linux 发行版本（基于 Debian / RedHat，包括国产操作系统）
- **服务器架构**: x86_64、aarch64、armv7l、ppc64le、s390x
- **Go版本**: 1.23.0 或更高版本
- **Node.js**: 20.2.x（前端开发）
- **npm**: 9.6.x（前端包管理）
- **内存要求**: 建议可用内存在 1GB 以上
- **浏览器要求**: 请使用 Chrome、FireFox、IE10+、Edge 等现代浏览器
- **网络要求**: 可访问互联网（安装时需要）

## 🚀 快速开始

### 方式1: 一键安装脚本（推荐）

#### 自动安装（无需交互）
```bash
# Linux/macOS 自动安装
bash auto-install.sh

# 使用中国镜像源
bash auto-install.sh --china

# Windows 自动安装
auto-install.bat

# Windows 使用中国镜像源
auto-install.bat --china
```

#### 传统安装方式
```bash
# 本地安装（Go后端专用，需要交互输入）
bash install.sh

# 快速安装（Go后端专用）
bash quick-install.sh

# 在线安装（Go后端专用）
curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/online-install.sh | sudo bash
```

**注意**：以上脚本专注于Go后端构建，不包含前端构建。如需完整功能，请手动构建前端或使用Docker部署。



### 方式2: Docker部署

```bash
# 克隆项目
git clone https://github.com/boxpanel/web-panel.git
cd web-panel

# 使用Docker Compose
docker-compose up -d

# 或单独构建
docker build -t web-panel .
docker run -d -p 8080:8080 -v ./data:/app/data web-panel
```

### 方式3: 手动安装

1. **克隆项目**
```bash
git clone https://github.com/boxpanel/web-panel.git
cd web-panel
```

2. **安装Go依赖**
```bash
go mod tidy
```

3. **构建前端**（手动）
```bash
cd client
npm install
npm run build
cd ..
```

**说明**：安装脚本已简化为仅构建Go后端，前端需要手动构建。

4. **构建后端**
```bash
# Linux/macOS
CGO_ENABLED=0 go build -ldflags "-s -w" -o web-panel cmd/main.go

# Windows
set CGO_ENABLED=0
go build -ldflags "-s -w" -o web-panel.exe cmd/main.go
```

5. **创建配置文件**
```bash
cp .env.example .env
# 编辑.env文件，修改相关配置
```

6. **启动服务**
```bash
./web-panel        # Linux/macOS
.\web-panel.exe    # Windows
```

## ⚙️ 配置说明

主要配置文件为`.env`，包含以下配置项：

```env
# 服务配置
PORT=8080                                    # 服务端口
HOST=0.0.0.0                               # 监听地址

# 安全配置
JWT_SECRET=your-secret-key                  # JWT密钥
JWT_EXPIRES_IN=24h                          # JWT过期时间

# 数据库配置（使用SQLite）
DB_PATH=./data/database.sqlite              # SQLite数据库路径

# 文件上传配置
UPLOAD_PATH=./uploads                       # 上传文件存储路径
MAX_UPLOAD_SIZE=10485760                    # 最大上传文件大小(10MB)

# 日志配置
LOG_LEVEL=info                              # 日志级别
LOG_PATH=./logs                             # 日志文件路径

# 其他配置
ENABLE_CORS=true                            # 是否启用CORS
ENABLE_GZIP=true                            # 是否启用GZIP压缩
```

## 🔧 API文档

### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/profile` - 获取用户信息
- `PUT /api/auth/profile` - 更新用户信息

### 用户管理
- `GET /api/users` - 获取用户列表
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户

### 系统监控
- `GET /api/system/overview` - 系统概览
- `GET /api/system/stats` - 系统统计
- `GET /api/system/processes` - 进程列表
- `GET /api/system/logs` - 系统日志

### 文件管理
- `GET /api/files` - 获取文件列表
- `POST /api/files/upload` - 上传文件
- `GET /api/files/download/:id` - 下载文件
- `DELETE /api/files/:id` - 删除文件

## 🎯 使用说明

### 默认账号
- **用户名**: `admin`
- **密码**: `admin123`

### 功能模块

1. **仪表板**: 系统概览和实时监控
2. **用户管理**: 用户增删改查，角色权限管理
3. **文件管理**: 文件上传下载，目录浏览
4. **系统监控**: CPU、内存、磁盘使用情况
5. **日志管理**: 系统日志查看和搜索
6. **设置**: 系统配置和个人设置

## 🔒 安全特性

- JWT Token认证
- 密码加密存储
- RBAC权限控制
- 请求频率限制
- 文件类型验证
- XSS防护
- CSRF防护

## 📊 性能优化

- 静态文件缓存
- GZIP压缩
- 数据库连接池
- 异步日志写入
- 内存使用优化

## 🐳 Docker部署

### 基础部署
```bash
docker run -d \
  --name web-panel \
  -p 8080:8080 \
  -v /path/to/data:/app/data \
  -v /path/to/logs:/app/logs \
  -v /path/to/uploads:/app/uploads \
  web-panel:latest
```

### 使用Docker Compose
```bash
# 基础部署
docker-compose up -d

# 包含Nginx反向代理
docker-compose --profile with-nginx up -d
```

## 🔧 开发指南

### 项目结构
```
web-panel/
├── cmd/                    # 应用入口
│   └── main.go
├── internal/               # 内部包
│   ├── api/               # API路由和处理器
│   ├── auth/              # 认证相关
│   ├── config/            # 配置管理
│   ├── database/          # 数据库操作
│   ├── logger/            # 日志管理
│   ├── middleware/        # 中间件
│   ├── models/            # 数据模型
│   └── services/          # 业务逻辑
├── client/                # 前端代码
├── config/                # 配置文件
├── docs/                  # 文档
├── scripts/               # 脚本文件
└── deployments/           # 部署配置
```

### 开发环境搭建
```bash
# 1. 克隆项目
git clone https://github.com/boxpanel/web-panel.git
cd web-panel

# 2. 安装依赖
go mod tidy

# 3. 启动开发服务器
go run cmd/main.go

# 4. 前端开发（另开终端）
cd client
npm install
npm run dev
```

### 代码规范
- 使用`gofmt`格式化代码
- 遵循Go官方编码规范
- 添加必要的注释
- 编写单元测试

## 🧪 测试

```bash
# 运行所有测试
go test ./...

# 运行测试并显示覆盖率
go test -cover ./...

# 生成测试报告
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## 📝 更新日志

### v2.0.0 (Go版本)
- 🔄 完全重写为Go语言版本
- ⚡ 性能大幅提升
- 🛡️ 增强安全特性
- 🐳 支持Docker部署
- 📦 提供一键安装脚本

### v1.x.x (Node.js版本)
- 基于Node.js的原始版本
- 已迁移至Go版本

## 🤝 贡献指南

1. Fork本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 📄 许可证

本项目采用MIT许可证 - 查看[LICENSE](LICENSE)文件了解详情

## 🆘 支持

- 📧 邮箱: support@example.com
- 🐛 问题反馈: [GitHub Issues](https://github.com/boxpanel/web-panel/issues)
- 📖 文档: [项目Wiki](https://github.com/boxpanel/web-panel/wiki)

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

---

**Web Panel** - 让服务器管理变得简单高效！#   T e s t   t r i g g e r   0 9 / 0 7 / 2 0 2 5   1 9 : 3 6 : 1 9  
 
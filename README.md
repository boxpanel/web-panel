# Web Panel - System Administration Dashboard

<div align="center">
  <h3>🖥️ A comprehensive web-based system administration panel</h3>
  <p>Modern, secure, and user-friendly interface for server management</p>
  
  [![GitHub stars](https://img.shields.io/github/stars/boxpanel/web-panel?style=social)](https://github.com/boxpanel/web-panel/stargazers)
   [![GitHub forks](https://img.shields.io/github/forks/boxpanel/web-panel?style=social)](https://github.com/boxpanel/web-panel/network/members)
   [![GitHub issues](https://img.shields.io/github/issues/boxpanel/web-panel)](https://github.com/boxpanel/web-panel/issues)
   [![GitHub license](https://img.shields.io/github/license/boxpanel/web-panel)](https://github.com/boxpanel/web-panel/blob/main/LICENSE)
  
  ## 🚀 One-Click Deploy
  
  [![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/boxpanel/web-panel)
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/boxpanel/web-panel)
   [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/boxpanel/web-panel)
  
</div>

## ✨ Features

### 🔐 Authentication & Security
- **Secure Login System** - JWT-based authentication with bcrypt password hashing
- **Role-Based Access Control** - Admin, User, and Guest roles with granular permissions
- **Session Management** - Automatic token refresh and secure logout
- **Rate Limiting** - Protection against brute force attacks

### 📊 System Monitoring
- **Real-time System Stats** - CPU, Memory, Disk usage with live updates
- **System Information** - Hardware details, OS info, network interfaces
- **Performance Metrics** - Historical data and trend analysis
- **WebSocket Integration** - Live data streaming without page refresh

### 🔧 Process Management
- **Process List** - View all running processes with detailed information
- **Process Control** - Start, stop, and manage system processes
- **Resource Monitoring** - CPU and memory usage per process
- **Process Search & Filter** - Find processes quickly

### 📁 File Management
- **File Browser** - Navigate through the file system
- **File Operations** - Create, edit, delete, rename files and directories
- **File Upload/Download** - Drag-and-drop file uploads
- **Text Editor** - Built-in editor for configuration files
- **Security** - Path traversal protection and file type validation

### 👥 User Management
- **User CRUD Operations** - Create, read, update, delete users
- **Permission Management** - Assign roles and permissions
- **User Statistics** - Track user activity and login history
- **Bulk Operations** - Manage multiple users at once

### 🎨 Modern UI/UX
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Dark/Light Theme** - Automatic theme switching
- **Ant Design Components** - Professional and consistent UI
- **Real-time Updates** - Live data without manual refresh

## 🚀 Quick Start

### Prerequisites

- **Node.js** 16.0.0 or higher
- **npm** 8.0.0 or higher
- **Operating System**: Linux or macOS
- **RAM**: At least 512MB available
- **Disk Space**: 1GB free space

### Installation

#### Option 1: 🌐 一键在线安装 (推荐)

**Linux/Mac:**
```bash
curl -fsSL https://raw.githubusercontent.com/boxpanel/web-panel/main/install.sh | bash
```

#### Option 2: 📦 手动安装

**Linux/macOS:**
```bash
git clone https://github.com/boxpanel/web-panel.git
cd web-panel
chmod +x install.sh
./install.sh
```

#### Option 2: Manual Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/boxpanel/web-panel.git
   cd web-panel
   ```

2. **Install dependencies:**
   ```bash
   npm install
   cd client
   npm install
   cd ..
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. **Build the client:**
   ```bash
   cd client
   npm run build
   cd ..
   ```

### Running the Application

#### Development Mode

**Linux/macOS:**
```bash
chmod +x dev.sh
./dev.sh
```

This starts both the backend server (port 3001) and frontend development server (port 3000).

#### Production Mode

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

This starts the production server on port 3001.

### Access the Application

- **Development**: http://localhost:3000
- **Production**: http://localhost:3001
- **API Endpoint**: http://localhost:3001/api

### Default Credentials

```
Username: admin
Password: admin123
```

**⚠️ Important: Change the default password immediately after first login!**

### 🗑️ Uninstalling the Application

To completely remove the Web Panel from your system, use the provided uninstall script:

**Linux/macOS:**
```bash
chmod +x uninstall.sh
./uninstall.sh
```

The uninstall process will:
1. **Stop all running services** - Terminate Node.js processes
2. **Clean dependencies** - Remove node_modules and package-lock.json files
3. **Clear data files** - Delete user data and configuration files
4. **Remove temporary files** - Clean logs and build artifacts
5. **Delete project directory** - Complete removal (requires confirmation)

**⚠️ Warning: This action is irreversible! Make sure to backup any important data before uninstalling.**

## 📖 Usage Guide

### First Time Setup

1. **Login** with default credentials
2. **Change Password** in user settings
3. **Configure Environment** variables in `.env` file
4. **Create Additional Users** if needed
5. **Set Permissions** for different user roles

### Dashboard Overview

The main dashboard provides:
- **System Overview** - Quick stats and health indicators
- **Recent Activity** - Latest system events and user actions
- **Quick Actions** - Common administrative tasks
- **Alerts** - System warnings and notifications

### System Monitoring

- **CPU Usage** - Real-time CPU utilization with historical graphs
- **Memory Usage** - RAM and swap usage with detailed breakdown
- **Disk Usage** - Storage utilization for all mounted drives
- **Network Activity** - Network interface statistics
- **System Services** - Status of important system services

### Process Management

- **View Processes** - List all running processes with PID, CPU, memory usage
- **Kill Processes** - Terminate processes (with appropriate permissions)
- **Process Details** - Detailed information about specific processes
- **Search & Filter** - Find processes by name, PID, or resource usage

### File Management

- **Navigate Directories** - Browse the file system with breadcrumb navigation
- **File Operations** - Create, edit, delete, rename files and folders
- **Upload Files** - Drag-and-drop or click to upload files
- **Download Files** - Download individual files or folders as ZIP
- **Edit Text Files** - Built-in editor with syntax highlighting

### User Management (Admin Only)

- **User List** - View all registered users
- **Create Users** - Add new users with specific roles
- **Edit Users** - Modify user information and permissions
- **Delete Users** - Remove users from the system
- **Role Management** - Assign and modify user roles

## ⚙️ Configuration

### Environment Variables

Edit the `.env` file to configure the application:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# Security Configuration
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

### Security Settings

- **JWT_SECRET**: Use a strong, random secret key
- **BCRYPT_ROUNDS**: Higher values = more secure but slower
- **RATE_LIMIT_MAX_REQUESTS**: Adjust based on your needs
- **CORS_ORIGIN**: Set to your domain in production

### File Upload Settings

- **MAX_FILE_SIZE**: Maximum file size in bytes (default: 10MB)
- **UPLOAD_PATH**: Directory for uploaded files
- **ALLOWED_FILE_EXTENSIONS**: Comma-separated list of allowed extensions

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- **React 18** - Modern React with hooks
- **Ant Design 5** - Professional UI component library
- **Axios** - HTTP client for API calls
- **React Router** - Client-side routing
- **Recharts** - Data visualization

**Backend:**
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **JWT** - JSON Web Tokens for authentication
- **bcryptjs** - Password hashing
- **WebSocket** - Real-time communication

**Security:**
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Rate Limiting** - Request throttling
- **Input Validation** - Data sanitization

### Project Structure

```
web-panel/
├── client/                 # Frontend React application
│   ├── public/            # Static files
│   ├── src/               # Source code
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   └── ...           # Other frontend files
│   └── package.json       # Frontend dependencies
├── server/                # Backend Node.js application
│   ├── middleware/        # Express middleware
│   ├── models/           # Data models
│   ├── routes/           # API routes
│   ├── utils/            # Utility functions
│   └── index.js          # Server entry point
├── uploads/              # File upload directory
├── logs/                 # Application logs
├── data/                 # Application data
├── .env                  # Environment variables
├── .env.example          # Environment template
├── package.json          # Root dependencies
└── README.md            # This file
```

## 🔧 Development

### Development Setup

1. **Fork the repository**
2. **Clone your fork**
3. **Install dependencies**: `npm run install:all`
4. **Start development servers**: `npm run dev`
5. **Make your changes**
6. **Test thoroughly**
7. **Submit a pull request**

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Start development mode (both servers)
npm run dev

# Start production server
npm start

# Build client for production
npm run build

# Start only backend server
npm run server:dev

# Start only frontend server
npm run client:dev
```

### API Endpoints

#### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Verify token
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/change-password` - Change password

#### System Information
- `GET /api/system/info` - Get system information
- `GET /api/system/stats` - Get system statistics
- `GET /api/system/services` - Get system services

#### Process Management
- `GET /api/process/list` - Get process list
- `DELETE /api/process/:pid` - Kill process
- `GET /api/process/:pid` - Get process details

#### File Management
- `GET /api/files/list` - List directory contents
- `GET /api/files/read` - Read file content
- `POST /api/files/write` - Write file content
- `POST /api/files/upload` - Upload files
- `GET /api/files/download` - Download files
- `DELETE /api/files/delete` - Delete files/directories
- `POST /api/files/create` - Create directory
- `PUT /api/files/rename` - Rename file/directory

#### User Management
- `GET /api/users` - Get all users
- `POST /api/users` - Create user
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `POST /api/users/:id/reset-password` - Reset user password

## 🚀 Deployment

For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

### Quick Production Deployment

1. **Prepare server** with Node.js and npm
2. **Clone repository** and install dependencies
3. **Configure environment** variables
4. **Build application**: `npm run build`
5. **Start with PM2**: `pm2 start ecosystem.config.js`
6. **Setup reverse proxy** (Nginx/Apache)
7. **Configure SSL** certificate

## 🛡️ Security

### Security Features

- **Authentication** - JWT-based with secure password hashing
- **Authorization** - Role-based access control
- **Input Validation** - All inputs are validated and sanitized
- **Rate Limiting** - Protection against brute force attacks
- **CORS Protection** - Configurable cross-origin policies
- **Security Headers** - Helmet.js for security headers
- **File Upload Security** - Type validation and size limits
- **Path Traversal Protection** - Prevents directory traversal attacks

### Security Best Practices

1. **Change default credentials** immediately
2. **Use strong JWT secrets** (at least 32 characters)
3. **Enable HTTPS** in production
4. **Configure firewall** to restrict access
5. **Regular security updates** for dependencies
6. **Monitor access logs** for suspicious activity
7. **Backup user data** regularly
8. **Use environment variables** for sensitive data

## 🐛 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port 3001
netstat -ano | findstr :3001  # Windows
lsof -i :3001                 # Linux/macOS

# Kill the process
taskkill /PID <PID> /F        # Windows
kill -9 <PID>                 # Linux/macOS
```

#### Permission Denied
```bash
# Fix file permissions (Linux/macOS)
sudo chown -R $USER:$USER /path/to/web-panel
chmod +x *.sh

# Run as administrator (Windows)
# Right-click and "Run as administrator"
```

#### Module Not Found
```bash
# Clear cache and reinstall
rm -rf node_modules client/node_modules
npm run install:all
```

#### Build Fails
```bash
# Clear build cache
cd client
npm run build -- --verbose

# Check for syntax errors
npm run test
```

### Getting Help

1. **Check the logs** in `logs/` directory
2. **Review configuration** in `.env` file
3. **Verify system requirements**
4. **Check network connectivity**
5. **Review error messages** carefully
6. **Search existing issues** in the repository
7. **Create a new issue** with detailed information

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation
- Ensure all tests pass
- Keep commits atomic and descriptive

## 📞 Support

If you encounter any issues or have questions:

- **Documentation**: Check this README and DEPLOYMENT.md
- **Issues**: Create an issue in the repository
- **Discussions**: Use GitHub Discussions for questions
- **Security**: Report security issues privately

## 🙏 Acknowledgments

- **Ant Design** - For the beautiful UI components
- **React Team** - For the amazing frontend framework
- **Express.js** - For the robust backend framework
- **Node.js Community** - For the excellent ecosystem
- **Contributors** - For making this project better

---

<div align="center">
  <p>Made with ❤️ by the Web Panel Team</p>
  <p>⭐ Star this repository if you find it helpful!</p>
</div>
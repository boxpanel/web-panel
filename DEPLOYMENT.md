# Web Panel Deployment Guide

This guide covers different deployment scenarios for the Web Panel application.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Docker Deployment](#docker-deployment)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [SSL/HTTPS Configuration](#sslhttps-configuration)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 16.0.0 or higher
- npm 8.0.0 or higher
- Git (for cloning the repository)
- At least 512MB RAM
- 1GB free disk space

## Local Development

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd web-panel
   ```

2. **Run the installation script:**
   
   **Linux/macOS:**
   ```bash
   chmod +x install.sh
   ./install.sh
   ```

3. **Start development mode:**
   
   **Linux/macOS:**
   ```bash
   chmod +x dev.sh
   ./dev.sh
   ```

4. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

### Manual Installation

1. **Install dependencies:**
   ```bash
   npm install
   cd client
   npm install
   cd ..
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

3. **Start development servers:**
   ```bash
   npm run dev
   ```

## Production Deployment

### Option 1: Single Server Deployment

1. **Prepare the server:**
   ```bash
   # Update system packages
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js (Ubuntu/Debian)
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2 for process management
   sudo npm install -g pm2
   ```

2. **Deploy the application:**
   ```bash
   # Clone and setup
   git clone <repository-url>
   cd web-panel
   
   # Install dependencies and build
   npm run install:all
   cd client && npm run build && cd ..
   
   # Configure environment
   cp .env.example .env
   nano .env  # Edit configuration
   ```

3. **Start with PM2:**
   ```bash
   # Create PM2 ecosystem file
   cat > ecosystem.config.js << EOF
   module.exports = {
     apps: [{
       name: 'web-panel',
       script: 'server/index.js',
       instances: 'max',
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'production',
         PORT: 3001
       },
       error_file: './logs/err.log',
       out_file: './logs/out.log',
       log_file: './logs/combined.log',
       time: true
     }]
   };
   EOF
   
   # Start the application
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

### Option 2: Systemd Service (Linux)

1. **Create systemd service file:**
   ```bash
   sudo nano /etc/systemd/system/web-panel.service
   ```

2. **Add service configuration:**
   ```ini
   [Unit]
   Description=Web Panel Application
   After=network.target
   
   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/path/to/web-panel
   ExecStart=/usr/bin/node server/index.js
   Restart=on-failure
   RestartSec=10
   Environment=NODE_ENV=production
   Environment=PORT=3001
   
   [Install]
   WantedBy=multi-user.target
   ```

3. **Enable and start service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable web-panel
   sudo systemctl start web-panel
   sudo systemctl status web-panel
   ```

## Docker Deployment

### Create Dockerfile

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies
RUN npm ci --only=production
RUN cd client && npm ci --only=production

# Copy source code
COPY . .

# Build client
RUN cd client && npm run build

# Production stage
FROM node:18-alpine AS production

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S webpanel -u 1001

# Copy built application
COPY --from=builder --chown=webpanel:nodejs /app .

# Create necessary directories
RUN mkdir -p uploads logs data
RUN chown -R webpanel:nodejs uploads logs data

# Switch to non-root user
USER webpanel

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["node", "server/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  web-panel:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=your-super-secret-jwt-key
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - web-panel
    restart: unless-stopped
```

## Reverse Proxy Setup

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Apache Configuration

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    Redirect permanent / https://your-domain.com/
</VirtualHost>

<VirtualHost *:443>
    ServerName your-domain.com
    
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
    
    ProxyPreserveHost On
    ProxyRequests Off
    
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/
    
    # WebSocket support
    ProxyPass /ws ws://localhost:3001/ws
    ProxyPassReverse /ws ws://localhost:3001/ws
    
    # Headers
    ProxyPassReverse / http://localhost:3001/
    ProxyPassReverseMatch ^/(.*) http://localhost:3001/$1
</VirtualHost>
```

## SSL/HTTPS Configuration

### Using Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Environment Variables

### Production Environment Variables

```bash
# Server Configuration
NODE_ENV=production
PORT=3001

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=24h

# Security
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# CORS
CORS_ORIGIN=https://your-domain.com

# Logging
LOG_LEVEL=warn
LOG_FILE=./logs/app.log
```

## Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   # Find process using port
   sudo netstat -tlnp | grep :3001
   # Kill process
   sudo kill -9 <PID>
   ```

2. **Permission denied:**
   ```bash
   # Fix file permissions
   sudo chown -R $USER:$USER /path/to/web-panel
   chmod +x *.sh
   ```

3. **Module not found:**
   ```bash
   # Reinstall dependencies
   rm -rf node_modules client/node_modules
   npm run install:all
   ```

4. **Build fails:**
   ```bash
   # Clear cache and rebuild
   cd client
   npm run build -- --verbose
   ```

### Monitoring

```bash
# Check application logs
tail -f logs/app.log

# Monitor with PM2
pm2 logs web-panel
pm2 monit

# System resources
htop
df -h
free -h
```

### Performance Optimization

1. **Enable gzip compression** (already included in the app)
2. **Use a CDN** for static assets
3. **Configure caching** headers
4. **Monitor memory usage** and restart if needed
5. **Use clustering** with PM2

### Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT secret
- [ ] Enable HTTPS
- [ ] Configure firewall
- [ ] Regular security updates
- [ ] Monitor access logs
- [ ] Backup user data

## Support

For issues and questions:
- Check the logs first
- Review this deployment guide
- Create an issue in the repository
- Check system requirements
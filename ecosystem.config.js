module.exports = {
  apps: [
    {
      name: 'web-panel',
      script: 'server/index.js',
      cwd: '/path/to/web-panel',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        JWT_SECRET: 'your-super-secret-jwt-key',
        JWT_EXPIRES_IN: '24h',
        BCRYPT_ROUNDS: 12,
        RATE_LIMIT_WINDOW_MS: 900000,
        RATE_LIMIT_MAX_REQUESTS: 100,
        MAX_FILE_SIZE: 10485760
      },
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024'
    }
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'https://github.com/YOUR_USERNAME/web-panel.git',
      path: '/var/www/web-panel',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && cd client && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git nodejs npm -y'
    }
  }
};
module.exports = {
  apps: [{
    name: 'web-panel-lowspec',
    script: './server/index.js',
    
    // 低配服务器优化配置
    instances: 1, // 单实例模式，避免多进程占用资源
    exec_mode: 'fork', // 使用fork模式而非cluster模式
    
    // 内存和CPU限制
    max_memory_restart: '200M', // 内存超过200MB时重启
    node_args: '--max-old-space-size=256', // 限制Node.js堆内存
    
    // 环境配置
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      SERVER_PROFILE: 'lowspec'
    },
    
    // 日志配置 - 减少磁盘I/O
    log_type: 'json',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error-lowspec.log',
    out_file: './logs/out-lowspec.log',
    log_file: './logs/combined-lowspec.log',
    
    // 日志轮转配置
    max_size: '5M',
    retain: 3,
    compress: true,
    
    // 进程管理配置
    autorestart: true,
    watch: false, // 禁用文件监控以节省资源
    max_restarts: 5,
    min_uptime: '10s',
    restart_delay: 4000,
    
    // 性能优化
    kill_timeout: 3000,
    listen_timeout: 3000,
    
    // 监控配置
    monitoring: false, // 禁用PM2监控以节省资源
    
    // 环境变量文件
    env_file: '.env.lowspec',
    
    // 忽略监控的文件/目录
    ignore_watch: [
      'node_modules',
      'logs',
      'data',
      'client/build',
      'client/node_modules',
      '.git'
    ],
    
    // 合并日志
    merge_logs: true,
    
    // 时间戳
    time: true,
    
    // 实例变量
    instance_var: 'INSTANCE_ID',
    
    // 源映射支持（生产环境禁用以节省内存）
    source_map_support: false,
    
    // 进程标题
    name: 'web-panel-lowspec',
    
    // 自动重启条件
    exp_backoff_restart_delay: 100,
    
    // 健康检查
    health_check_grace_period: 3000,
    
    // 低配服务器特定配置
    cron_restart: '0 2 * * *', // 每天凌晨2点重启以清理内存
    
    // 环境变量
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      OPTIMIZATION_MODE: 'memory',
      ENABLE_CLUSTERING: false,
      CACHE_SIZE: 50,
      LOG_LEVEL: 'warn'
    }
  }],
  
  // 部署配置（可选）
  deploy: {
    production: {
      user: 'node',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'https://github.com/your-username/web-panel.git',
      path: '/var/www/web-panel',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && npm run build:client && pm2 reload ecosystem.lowspec.config.js --env production',
      'pre-setup': ''
    }
  }
};
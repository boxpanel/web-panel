/**
 * 资源优化中间件
 * Resource Optimizer Middleware for Low-spec Servers
 */

const os = require('os');
const process = require('process');

class ResourceOptimizer {
    constructor(options = {}) {
        this.options = {
            maxMemoryMB: options.maxMemoryMB || 256,
            maxCpuPercent: options.maxCpuPercent || 80,
            gcInterval: options.gcInterval || 60000, // 1分钟
            monitorInterval: options.monitorInterval || 30000, // 30秒
            enableGC: options.enableGC !== false,
            enableMonitoring: options.enableMonitoring !== false,
            logLevel: options.logLevel || 'warn'
        };
        
        this.stats = {
            memoryUsage: [],
            cpuUsage: [],
            requestCount: 0,
            lastGC: Date.now(),
            startTime: Date.now()
        };
        
        this.init();
    }
    
    init() {
        // 启动资源监控
        if (this.options.enableMonitoring) {
            this.startMonitoring();
        }
        
        // 启动垃圾回收优化
        if (this.options.enableGC) {
            this.startGCOptimization();
        }
        
        // 设置进程事件监听
        this.setupProcessHandlers();
    }
    
    // 中间件函数
    middleware() {
        return (req, res, next) => {
            const startTime = Date.now();
            this.stats.requestCount++;
            
            // 检查内存使用
            const memUsage = process.memoryUsage();
            const memUsageMB = memUsage.heapUsed / 1024 / 1024;
            
            if (memUsageMB > this.options.maxMemoryMB * 0.9) {
                this.log('warn', `内存使用接近限制: ${memUsageMB.toFixed(2)}MB / ${this.options.maxMemoryMB}MB`);
                
                // 触发垃圾回收
                if (global.gc) {
                    global.gc();
                    this.stats.lastGC = Date.now();
                }
            }
            
            // 请求完成后的清理
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                
                // 记录慢请求
                if (duration > 5000) {
                    this.log('warn', `慢请求检测: ${req.method} ${req.path} - ${duration}ms`);
                }
                
                // 定期清理统计数据
                if (this.stats.requestCount % 100 === 0) {
                    this.cleanupStats();
                }
            });
            
            next();
        };
    }
    
    // 启动资源监控
    startMonitoring() {
        setInterval(() => {
            this.collectStats();
            this.checkResourceLimits();
        }, this.options.monitorInterval);
    }
    
    // 收集系统统计信息
    collectStats() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        // 内存统计
        const memStat = {
            timestamp: Date.now(),
            heapUsed: memUsage.heapUsed / 1024 / 1024, // MB
            heapTotal: memUsage.heapTotal / 1024 / 1024, // MB
            external: memUsage.external / 1024 / 1024, // MB
            rss: memUsage.rss / 1024 / 1024 // MB
        };
        
        this.stats.memoryUsage.push(memStat);
        
        // CPU统计
        const cpuStat = {
            timestamp: Date.now(),
            user: cpuUsage.user,
            system: cpuUsage.system
        };
        
        this.stats.cpuUsage.push(cpuStat);
        
        // 保持统计数据在合理范围内
        if (this.stats.memoryUsage.length > 100) {
            this.stats.memoryUsage = this.stats.memoryUsage.slice(-50);
        }
        
        if (this.stats.cpuUsage.length > 100) {
            this.stats.cpuUsage = this.stats.cpuUsage.slice(-50);
        }
    }
    
    // 检查资源限制
    checkResourceLimits() {
        const memUsage = process.memoryUsage();
        const memUsageMB = memUsage.heapUsed / 1024 / 1024;
        
        // 内存检查
        if (memUsageMB > this.options.maxMemoryMB * 0.95) {
            this.log('error', `内存使用超过限制: ${memUsageMB.toFixed(2)}MB / ${this.options.maxMemoryMB}MB`);
            this.emergencyCleanup();
        } else if (memUsageMB > this.options.maxMemoryMB * 0.8) {
            this.log('warn', `内存使用较高: ${memUsageMB.toFixed(2)}MB / ${this.options.maxMemoryMB}MB`);
            this.performCleanup();
        }
        
        // 系统负载检查
        const loadAvg = os.loadavg()[0];
        const cpuCount = os.cpus().length;
        const loadPercent = (loadAvg / cpuCount) * 100;
        
        if (loadPercent > this.options.maxCpuPercent) {
            this.log('warn', `CPU负载较高: ${loadPercent.toFixed(2)}%`);
        }
    }
    
    // 启动垃圾回收优化
    startGCOptimization() {
        setInterval(() => {
            const now = Date.now();
            const timeSinceLastGC = now - this.stats.lastGC;
            
            // 如果距离上次GC超过设定间隔，且内存使用较高，则触发GC
            if (timeSinceLastGC > this.options.gcInterval) {
                const memUsage = process.memoryUsage();
                const memUsageMB = memUsage.heapUsed / 1024 / 1024;
                
                if (memUsageMB > this.options.maxMemoryMB * 0.6) {
                    if (global.gc) {
                        global.gc();
                        this.stats.lastGC = now;
                        this.log('info', `执行垃圾回收，内存使用: ${memUsageMB.toFixed(2)}MB`);
                    }
                }
            }
        }, this.options.gcInterval);
    }
    
    // 执行清理操作
    performCleanup() {
        // 清理统计数据
        this.cleanupStats();
        
        // 触发垃圾回收
        if (global.gc) {
            global.gc();
            this.stats.lastGC = Date.now();
        }
        
        this.log('info', '执行内存清理操作');
    }
    
    // 紧急清理
    emergencyCleanup() {
        this.log('error', '执行紧急内存清理');
        
        // 清空统计数据
        this.stats.memoryUsage = [];
        this.stats.cpuUsage = [];
        
        // 强制垃圾回收
        if (global.gc) {
            global.gc();
            // 多次GC以确保清理彻底
            setTimeout(() => global.gc(), 100);
            setTimeout(() => global.gc(), 200);
            this.stats.lastGC = Date.now();
        }
        
        // 如果内存仍然过高，记录警告
        setTimeout(() => {
            const memUsage = process.memoryUsage();
            const memUsageMB = memUsage.heapUsed / 1024 / 1024;
            
            if (memUsageMB > this.options.maxMemoryMB * 0.9) {
                this.log('error', `紧急清理后内存仍然过高: ${memUsageMB.toFixed(2)}MB`);
            }
        }, 1000);
    }
    
    // 清理统计数据
    cleanupStats() {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10分钟
        
        // 清理过期的内存统计
        this.stats.memoryUsage = this.stats.memoryUsage.filter(
            stat => now - stat.timestamp < maxAge
        );
        
        // 清理过期的CPU统计
        this.stats.cpuUsage = this.stats.cpuUsage.filter(
            stat => now - stat.timestamp < maxAge
        );
    }
    
    // 设置进程事件处理
    setupProcessHandlers() {
        // 监听内存警告
        process.on('warning', (warning) => {
            if (warning.name === 'MaxListenersExceededWarning' || 
                warning.message.includes('memory')) {
                this.log('warn', `进程警告: ${warning.message}`);
                this.performCleanup();
            }
        });
        
        // 监听未捕获异常
        process.on('uncaughtException', (error) => {
            this.log('error', `未捕获异常: ${error.message}`);
            this.emergencyCleanup();
        });
        
        // 监听未处理的Promise拒绝
        process.on('unhandledRejection', (reason, promise) => {
            this.log('error', `未处理的Promise拒绝: ${reason}`);
        });
    }
    
    // 获取资源统计信息
    getStats() {
        const memUsage = process.memoryUsage();
        const uptime = Date.now() - this.stats.startTime;
        
        return {
            memory: {
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
                external: Math.round(memUsage.external / 1024 / 1024), // MB
                rss: Math.round(memUsage.rss / 1024 / 1024), // MB
                limit: this.options.maxMemoryMB
            },
            system: {
                loadAvg: os.loadavg(),
                cpuCount: os.cpus().length,
                freeMemory: Math.round(os.freemem() / 1024 / 1024), // MB
                totalMemory: Math.round(os.totalmem() / 1024 / 1024) // MB
            },
            process: {
                uptime: Math.round(uptime / 1000), // 秒
                requestCount: this.stats.requestCount,
                lastGC: this.stats.lastGC,
                pid: process.pid
            },
            optimization: {
                gcEnabled: this.options.enableGC,
                monitoringEnabled: this.options.enableMonitoring,
                gcInterval: this.options.gcInterval,
                monitorInterval: this.options.monitorInterval
            }
        };
    }
    
    // 日志记录
    log(level, message) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        const currentLevel = levels[this.options.logLevel] || 1;
        
        if (levels[level] <= currentLevel) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level.toUpperCase()}] [ResourceOptimizer] ${message}`);
        }
    }
}

// 创建单例实例
let optimizerInstance = null;

function createOptimizer(options = {}) {
    if (!optimizerInstance) {
        // 从环境变量读取配置
        const config = {
            maxMemoryMB: parseInt(process.env.MAX_MEMORY_MB) || options.maxMemoryMB || 256,
            maxCpuPercent: parseInt(process.env.MAX_CPU_PERCENT) || options.maxCpuPercent || 80,
            gcInterval: parseInt(process.env.GC_INTERVAL) || options.gcInterval || 60000,
            monitorInterval: parseInt(process.env.MONITOR_INTERVAL) || options.monitorInterval || 30000,
            enableGC: process.env.ENABLE_GC !== 'false',
            enableMonitoring: process.env.ENABLE_MONITORING !== 'false',
            logLevel: process.env.LOG_LEVEL || options.logLevel || 'warn'
        };
        
        optimizerInstance = new ResourceOptimizer(config);
    }
    
    return optimizerInstance;
}

module.exports = {
    ResourceOptimizer,
    createOptimizer,
    getOptimizer: () => optimizerInstance
};
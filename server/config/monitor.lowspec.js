/**
 * 低配服务器系统监控配置
 * System Monitor Configuration for Low-spec Servers
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

class SystemMonitor {
    constructor() {
        this.config = {
            // 监控间隔配置
            intervals: {
                // 系统资源监控间隔（毫秒）
                system: 30000, // 30秒
                
                // 进程监控间隔（毫秒）
                process: 60000, // 1分钟
                
                // 磁盘监控间隔（毫秒）
                disk: 300000, // 5分钟
                
                // 网络监控间隔（毫秒）
                network: 60000, // 1分钟
                
                // 数据库监控间隔（毫秒）
                database: 120000 // 2分钟
            },
            
            // 阈值配置
            thresholds: {
                // CPU使用率阈值
                cpu: {
                    warning: 70,
                    critical: 85
                },
                
                // 内存使用率阈值
                memory: {
                    warning: 75,
                    critical: 90
                },
                
                // 磁盘使用率阈值
                disk: {
                    warning: 80,
                    critical: 95
                },
                
                // 负载平均值阈值
                load: {
                    warning: 1.5,
                    critical: 2.0
                },
                
                // 响应时间阈值（毫秒）
                responseTime: {
                    warning: 2000,
                    critical: 5000
                }
            },
            
            // 历史数据保留配置
            retention: {
                // 内存中保留的数据点数量
                memoryPoints: 100,
                
                // 文件中保留的天数
                fileDays: 7,
                
                // 数据聚合间隔（毫秒）
                aggregationInterval: 300000 // 5分钟
            },
            
            // 告警配置
            alerts: {
                // 启用告警
                enabled: true,
                
                // 告警冷却时间（毫秒）
                cooldown: 300000, // 5分钟
                
                // 告警方式
                methods: ['log', 'file'],
                
                // 告警文件路径
                alertFile: './logs/alerts.log'
            }
        };
        
        // 监控数据存储
        this.metrics = {
            system: [],
            process: [],
            disk: [],
            network: [],
            database: [],
            alerts: []
        };
        
        // 告警状态跟踪
        this.alertStates = new Map();
        
        // 监控任务ID
        this.monitoringTasks = new Map();
        
        // 启动时间
        this.startTime = Date.now();
    }
    
    // 启动监控
    start() {
        console.log('启动系统监控...');
        
        // 启动各种监控任务
        this.startSystemMonitoring();
        this.startProcessMonitoring();
        this.startDiskMonitoring();
        this.startNetworkMonitoring();
        this.startDataAggregation();
        
        console.log('系统监控已启动');
    }
    
    // 停止监控
    stop() {
        console.log('停止系统监控...');
        
        // 清除所有监控任务
        for (const [name, taskId] of this.monitoringTasks.entries()) {
            clearInterval(taskId);
            console.log(`停止监控任务: ${name}`);
        }
        
        this.monitoringTasks.clear();
        console.log('系统监控已停止');
    }
    
    // 启动系统资源监控
    startSystemMonitoring() {
        const taskId = setInterval(() => {
            this.collectSystemMetrics();
        }, this.config.intervals.system);
        
        this.monitoringTasks.set('system', taskId);
    }
    
    // 启动进程监控
    startProcessMonitoring() {
        const taskId = setInterval(() => {
            this.collectProcessMetrics();
        }, this.config.intervals.process);
        
        this.monitoringTasks.set('process', taskId);
    }
    
    // 启动磁盘监控
    startDiskMonitoring() {
        const taskId = setInterval(() => {
            this.collectDiskMetrics();
        }, this.config.intervals.disk);
        
        this.monitoringTasks.set('disk', taskId);
    }
    
    // 启动网络监控
    startNetworkMonitoring() {
        const taskId = setInterval(() => {
            this.collectNetworkMetrics();
        }, this.config.intervals.network);
        
        this.monitoringTasks.set('network', taskId);
    }
    
    // 启动数据聚合
    startDataAggregation() {
        const taskId = setInterval(() => {
            this.aggregateData();
            this.cleanupOldData();
        }, this.config.retention.aggregationInterval);
        
        this.monitoringTasks.set('aggregation', taskId);
    }
    
    // 收集系统指标
    collectSystemMetrics() {
        try {
            const timestamp = Date.now();
            
            // CPU信息
            const cpus = os.cpus();
            const loadAvg = os.loadavg();
            
            // 内存信息
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            const usedMemory = totalMemory - freeMemory;
            const memoryUsagePercent = (usedMemory / totalMemory) * 100;
            
            // 系统信息
            const uptime = os.uptime();
            const platform = os.platform();
            const arch = os.arch();
            
            const metrics = {
                timestamp,
                cpu: {
                    count: cpus.length,
                    loadAvg: loadAvg,
                    loadPercent: (loadAvg[0] / cpus.length) * 100
                },
                memory: {
                    total: totalMemory,
                    free: freeMemory,
                    used: usedMemory,
                    usagePercent: memoryUsagePercent
                },
                system: {
                    uptime,
                    platform,
                    arch,
                    hostname: os.hostname()
                }
            };
            
            // 添加到历史数据
            this.addMetric('system', metrics);
            
            // 检查阈值
            this.checkSystemThresholds(metrics);
            
        } catch (error) {
            console.error('收集系统指标失败:', error);
        }
    }
    
    // 收集进程指标
    collectProcessMetrics() {
        try {
            const timestamp = Date.now();
            
            // 进程内存使用
            const memUsage = process.memoryUsage();
            
            // 进程CPU使用
            const cpuUsage = process.cpuUsage();
            
            // 进程信息
            const processInfo = {
                pid: process.pid,
                ppid: process.ppid,
                uptime: Date.now() - this.startTime,
                version: process.version,
                platform: process.platform,
                arch: process.arch
            };
            
            const metrics = {
                timestamp,
                memory: {
                    heapUsed: memUsage.heapUsed,
                    heapTotal: memUsage.heapTotal,
                    external: memUsage.external,
                    rss: memUsage.rss,
                    heapUsedMB: memUsage.heapUsed / 1024 / 1024,
                    rssMB: memUsage.rss / 1024 / 1024
                },
                cpu: {
                    user: cpuUsage.user,
                    system: cpuUsage.system
                },
                process: processInfo
            };
            
            // 添加到历史数据
            this.addMetric('process', metrics);
            
            // 检查进程阈值
            this.checkProcessThresholds(metrics);
            
        } catch (error) {
            console.error('收集进程指标失败:', error);
        }
    }
    
    // 收集磁盘指标
    collectDiskMetrics() {
        try {
            const timestamp = Date.now();
            
            // 获取当前工作目录的磁盘使用情况
            const cwd = process.cwd();
            
            // 在Windows上使用不同的方法
            if (process.platform === 'win32') {
                this.collectWindowsDiskMetrics(timestamp, cwd);
            } else {
                this.collectUnixDiskMetrics(timestamp, cwd);
            }
            
        } catch (error) {
            console.error('收集磁盘指标失败:', error);
        }
    }
    
    // Windows磁盘指标收集
    collectWindowsDiskMetrics(timestamp, cwd) {
        // 简化的磁盘使用情况检查
        const metrics = {
            timestamp,
            disk: {
                path: cwd,
                // Windows下的磁盘使用情况需要通过其他方式获取
                // 这里提供基本的占位符
                available: 'unknown',
                used: 'unknown',
                total: 'unknown',
                usagePercent: 0
            }
        };
        
        this.addMetric('disk', metrics);
    }
    
    // Unix磁盘指标收集
    collectUnixDiskMetrics(timestamp, cwd) {
        const { execSync } = require('child_process');
        
        try {
            const output = execSync(`df -h ${cwd}`, { encoding: 'utf8' });
            const lines = output.trim().split('\n');
            
            if (lines.length >= 2) {
                const parts = lines[1].split(/\s+/);
                const total = parts[1];
                const used = parts[2];
                const available = parts[3];
                const usagePercent = parseInt(parts[4].replace('%', ''));
                
                const metrics = {
                    timestamp,
                    disk: {
                        path: cwd,
                        total,
                        used,
                        available,
                        usagePercent
                    }
                };
                
                this.addMetric('disk', metrics);
                this.checkDiskThresholds(metrics);
            }
        } catch (error) {
            console.error('获取Unix磁盘信息失败:', error);
        }
    }
    
    // 收集网络指标
    collectNetworkMetrics() {
        try {
            const timestamp = Date.now();
            
            // 获取网络接口信息
            const networkInterfaces = os.networkInterfaces();
            const interfaces = [];
            
            for (const [name, addrs] of Object.entries(networkInterfaces)) {
                const ipv4 = addrs.find(addr => addr.family === 'IPv4' && !addr.internal);
                if (ipv4) {
                    interfaces.push({
                        name,
                        address: ipv4.address,
                        netmask: ipv4.netmask,
                        mac: ipv4.mac
                    });
                }
            }
            
            const metrics = {
                timestamp,
                network: {
                    interfaces,
                    activeConnections: interfaces.length
                }
            };
            
            this.addMetric('network', metrics);
            
        } catch (error) {
            console.error('收集网络指标失败:', error);
        }
    }
    
    // 添加指标到历史数据
    addMetric(type, metric) {
        if (!this.metrics[type]) {
            this.metrics[type] = [];
        }
        
        this.metrics[type].push(metric);
        
        // 限制内存中的数据点数量
        const maxPoints = this.config.retention.memoryPoints;
        if (this.metrics[type].length > maxPoints) {
            this.metrics[type] = this.metrics[type].slice(-maxPoints);
        }
    }
    
    // 检查系统阈值
    checkSystemThresholds(metrics) {
        const { cpu, memory } = this.config.thresholds;
        
        // 检查CPU负载
        if (metrics.cpu.loadPercent > cpu.critical) {
            this.triggerAlert('cpu', 'critical', `CPU负载过高: ${metrics.cpu.loadPercent.toFixed(2)}%`);
        } else if (metrics.cpu.loadPercent > cpu.warning) {
            this.triggerAlert('cpu', 'warning', `CPU负载较高: ${metrics.cpu.loadPercent.toFixed(2)}%`);
        }
        
        // 检查内存使用
        if (metrics.memory.usagePercent > memory.critical) {
            this.triggerAlert('memory', 'critical', `内存使用过高: ${metrics.memory.usagePercent.toFixed(2)}%`);
        } else if (metrics.memory.usagePercent > memory.warning) {
            this.triggerAlert('memory', 'warning', `内存使用较高: ${metrics.memory.usagePercent.toFixed(2)}%`);
        }
    }
    
    // 检查进程阈值
    checkProcessThresholds(metrics) {
        const heapUsedMB = metrics.memory.heapUsedMB;
        const rssMB = metrics.memory.rssMB;
        
        // 检查进程内存使用
        if (heapUsedMB > 200) { // 200MB阈值
            this.triggerAlert('process_memory', 'warning', `进程堆内存使用较高: ${heapUsedMB.toFixed(2)}MB`);
        }
        
        if (rssMB > 300) { // 300MB阈值
            this.triggerAlert('process_rss', 'warning', `进程RSS内存使用较高: ${rssMB.toFixed(2)}MB`);
        }
    }
    
    // 检查磁盘阈值
    checkDiskThresholds(metrics) {
        const { disk } = this.config.thresholds;
        const usagePercent = metrics.disk.usagePercent;
        
        if (usagePercent > disk.critical) {
            this.triggerAlert('disk', 'critical', `磁盘使用过高: ${usagePercent}%`);
        } else if (usagePercent > disk.warning) {
            this.triggerAlert('disk', 'warning', `磁盘使用较高: ${usagePercent}%`);
        }
    }
    
    // 触发告警
    triggerAlert(type, level, message) {
        if (!this.config.alerts.enabled) {
            return;
        }
        
        const alertKey = `${type}_${level}`;
        const now = Date.now();
        
        // 检查告警冷却时间
        const lastAlert = this.alertStates.get(alertKey);
        if (lastAlert && (now - lastAlert) < this.config.alerts.cooldown) {
            return; // 在冷却期内，不重复告警
        }
        
        // 记录告警时间
        this.alertStates.set(alertKey, now);
        
        const alert = {
            timestamp: now,
            type,
            level,
            message,
            hostname: os.hostname(),
            pid: process.pid
        };
        
        // 添加到告警历史
        this.addMetric('alerts', alert);
        
        // 执行告警方法
        this.executeAlertMethods(alert);
    }
    
    // 执行告警方法
    executeAlertMethods(alert) {
        const methods = this.config.alerts.methods;
        
        if (methods.includes('log')) {
            console.warn(`[ALERT] [${alert.level.toUpperCase()}] [${alert.type}] ${alert.message}`);
        }
        
        if (methods.includes('file')) {
            this.writeAlertToFile(alert);
        }
    }
    
    // 写入告警到文件
    writeAlertToFile(alert) {
        try {
            const alertFile = this.config.alerts.alertFile;
            const alertDir = path.dirname(alertFile);
            
            // 确保目录存在
            if (!fs.existsSync(alertDir)) {
                fs.mkdirSync(alertDir, { recursive: true });
            }
            
            const alertLine = `${new Date(alert.timestamp).toISOString()} [${alert.level.toUpperCase()}] [${alert.type}] ${alert.message}\n`;
            fs.appendFileSync(alertFile, alertLine);
        } catch (error) {
            console.error('写入告警文件失败:', error);
        }
    }
    
    // 数据聚合
    aggregateData() {
        // 简单的数据聚合逻辑
        // 可以根据需要实现更复杂的聚合算法
        console.log('执行数据聚合...');
    }
    
    // 清理旧数据
    cleanupOldData() {
        const maxAge = this.config.retention.fileDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - maxAge;
        
        for (const [type, metrics] of Object.entries(this.metrics)) {
            const originalLength = metrics.length;
            this.metrics[type] = metrics.filter(metric => metric.timestamp > cutoffTime);
            
            const removedCount = originalLength - this.metrics[type].length;
            if (removedCount > 0) {
                console.log(`清理了 ${removedCount} 个过期的 ${type} 指标`);
            }
        }
    }
    
    // 获取监控统计信息
    getStats() {
        const stats = {};
        
        for (const [type, metrics] of Object.entries(this.metrics)) {
            stats[type] = {
                count: metrics.length,
                latest: metrics.length > 0 ? metrics[metrics.length - 1] : null,
                oldestTimestamp: metrics.length > 0 ? metrics[0].timestamp : null,
                latestTimestamp: metrics.length > 0 ? metrics[metrics.length - 1].timestamp : null
            };
        }
        
        return {
            ...stats,
            uptime: Date.now() - this.startTime,
            alertStates: Object.fromEntries(this.alertStates),
            monitoringTasks: Array.from(this.monitoringTasks.keys())
        };
    }
    
    // 获取最新指标
    getLatestMetrics() {
        const latest = {};
        
        for (const [type, metrics] of Object.entries(this.metrics)) {
            if (metrics.length > 0) {
                latest[type] = metrics[metrics.length - 1];
            }
        }
        
        return latest;
    }
    
    // 获取历史指标
    getHistoricalMetrics(type, limit = 50) {
        if (!this.metrics[type]) {
            return [];
        }
        
        return this.metrics[type].slice(-limit);
    }
}

// 创建单例实例
let systemMonitorInstance = null;

function createSystemMonitor() {
    if (!systemMonitorInstance) {
        systemMonitorInstance = new SystemMonitor();
    }
    return systemMonitorInstance;
}

module.exports = {
    SystemMonitor,
    createSystemMonitor,
    getSystemMonitor: () => systemMonitorInstance
};
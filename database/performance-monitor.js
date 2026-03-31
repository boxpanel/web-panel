const EventEmitter = require('events');

/**
 * 数据库性能监控器
 * 提供实时性能指标监控和报警功能
 */
class PerformanceMonitor extends EventEmitter {
    constructor(database, options = {}) {
        super();
        
        this.database = database;
        this.options = {
            monitorInterval: options.monitorInterval || 30000, // 30秒监控间隔
            alertThresholds: {
                cacheHitRate: options.cacheHitRate || 80, // 缓存命中率阈值
                connectionPoolUsage: options.connectionPoolUsage || 80, // 连接池使用率阈值
                queryResponseTime: options.queryResponseTime || 1000, // 查询响应时间阈值(ms)
                memoryUsage: options.memoryUsage || 80, // 内存使用率阈值
                ...options.alertThresholds
            },
            enableAlerts: options.enableAlerts !== false,
            enableLogging: options.enableLogging !== false
        };
        
        // 性能指标历史记录
        this.metrics = {
            queryCount: 0,
            totalQueryTime: 0,
            slowQueries: [],
            errors: [],
            alerts: []
        };
        
        // 监控状态
        this.isMonitoring = false;
        this.monitorTimer = null;
        
        console.log('数据库性能监控器初始化完成');
    }
    
    /**
     * 开始监控
     */
    start() {
        if (this.isMonitoring) {
            console.log('性能监控已在运行中');
            return;
        }
        
        this.isMonitoring = true;
        this.monitorTimer = setInterval(() => {
            this.collectMetrics();
        }, this.options.monitorInterval);
        
        console.log(`性能监控已启动，监控间隔: ${this.options.monitorInterval}ms`);
        this.emit('monitoringStarted');
    }
    
    /**
     * 停止监控
     */
    stop() {
        if (!this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = false;
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = null;
        }
        
        console.log('性能监控已停止');
        this.emit('monitoringStopped');
    }
    
    /**
     * 收集性能指标
     */
    async collectMetrics() {
        try {
            const stats = this.database.getPerformanceStats();
            const timestamp = Date.now();
            
            const metrics = {
                timestamp,
                cache: {
                    hitRate: parseFloat(stats.cache.hitRate) || 0,
                    size: stats.cache.size || 0,
                    memoryUsage: stats.cache.memoryUsage || 0,
                    hits: stats.cache.hits || 0,
                    misses: stats.cache.misses || 0
                },
                connectionPool: {
                    activeConnections: stats.connectionPool.activeConnections || 0,
                    totalConnections: stats.connectionPool.totalConnections || 0,
                    waitingCount: stats.connectionPool.waitingCount || 0,
                    usage: stats.connectionPool.totalConnections > 0 ? 
                        (stats.connectionPool.activeConnections / stats.connectionPool.totalConnections * 100) : 0
                },
                queries: {
                    preparedStatements: stats.preparedStatements || 0,
                    averageResponseTime: this.metrics.queryCount > 0 ? 
                        (this.metrics.totalQueryTime / this.metrics.queryCount) : 0
                },
                system: await this.getSystemMetrics()
            };
            
            // 检查阈值并发送警报
            this.checkThresholds(metrics);
            
            // 记录指标
            this.recordMetrics(metrics);
            
            // 发送指标更新事件
            this.emit('metricsUpdated', metrics);
            
            if (this.options.enableLogging) {
                this.logMetrics(metrics);
            }
            
        } catch (error) {
            console.error('收集性能指标时发生错误:', error);
            this.recordError('metrics_collection', error);
        }
    }
    
    /**
     * 获取系统指标
     */
    async getSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            memory: {
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                usage: (memUsage.heapUsed / memUsage.heapTotal * 100)
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            uptime: process.uptime()
        };
    }
    
    /**
     * 检查阈值
     */
    checkThresholds(metrics) {
        if (!this.options.enableAlerts) return;
        
        const alerts = [];
        const thresholds = this.options.alertThresholds;
        
        // 检查缓存命中率
        if (metrics.cache.hitRate < thresholds.cacheHitRate) {
            alerts.push({
                type: 'cache_hit_rate_low',
                message: `缓存命中率过低: ${metrics.cache.hitRate.toFixed(2)}% (阈值: ${thresholds.cacheHitRate}%)`,
                value: metrics.cache.hitRate,
                threshold: thresholds.cacheHitRate,
                severity: 'warning'
            });
        }
        
        // 检查连接池使用率
        if (metrics.connectionPool.usage > thresholds.connectionPoolUsage) {
            alerts.push({
                type: 'connection_pool_usage_high',
                message: `连接池使用率过高: ${metrics.connectionPool.usage.toFixed(2)}% (阈值: ${thresholds.connectionPoolUsage}%)`,
                value: metrics.connectionPool.usage,
                threshold: thresholds.connectionPoolUsage,
                severity: 'warning'
            });
        }
        
        // 检查查询响应时间
        if (metrics.queries.averageResponseTime > thresholds.queryResponseTime) {
            alerts.push({
                type: 'query_response_time_high',
                message: `查询响应时间过长: ${metrics.queries.averageResponseTime.toFixed(2)}ms (阈值: ${thresholds.queryResponseTime}ms)`,
                value: metrics.queries.averageResponseTime,
                threshold: thresholds.queryResponseTime,
                severity: 'warning'
            });
        }
        
        // 检查内存使用率
        if (metrics.system.memory.usage > thresholds.memoryUsage) {
            alerts.push({
                type: 'memory_usage_high',
                message: `内存使用率过高: ${metrics.system.memory.usage.toFixed(2)}% (阈值: ${thresholds.memoryUsage}%)`,
                value: metrics.system.memory.usage,
                threshold: thresholds.memoryUsage,
                severity: 'critical'
            });
        }
        
        // 发送警报
        alerts.forEach(alert => {
            this.sendAlert(alert);
        });
    }
    
    /**
     * 发送警报
     */
    sendAlert(alert) {
        alert.timestamp = Date.now();
        this.metrics.alerts.push(alert);
        
        // 保持最近100个警报
        if (this.metrics.alerts.length > 100) {
            this.metrics.alerts = this.metrics.alerts.slice(-100);
        }
        
        console.warn(`[性能警报] ${alert.message}`);
        this.emit('alert', alert);
    }
    
    /**
     * 记录查询性能
     */
    recordQuery(sql, duration, error = null) {
        this.metrics.queryCount++;
        this.metrics.totalQueryTime += duration;
        
        // 记录慢查询
        if (duration > this.options.alertThresholds.queryResponseTime) {
            const slowQuery = {
                sql: sql.substring(0, 100), // 截取前100个字符
                duration,
                timestamp: Date.now()
            };
            
            this.metrics.slowQueries.push(slowQuery);
            
            // 保持最近50个慢查询
            if (this.metrics.slowQueries.length > 50) {
                this.metrics.slowQueries = this.metrics.slowQueries.slice(-50);
            }
            
            console.warn(`[慢查询] ${duration}ms: ${slowQuery.sql}...`);
            this.emit('slowQuery', slowQuery);
        }
        
        // 记录错误
        if (error) {
            this.recordError('query_execution', error, { sql, duration });
        }
    }
    
    /**
     * 记录错误
     */
    recordError(type, error, context = {}) {
        const errorRecord = {
            type,
            message: error.message,
            stack: error.stack,
            context,
            timestamp: Date.now()
        };
        
        this.metrics.errors.push(errorRecord);
        
        // 保持最近100个错误
        if (this.metrics.errors.length > 100) {
            this.metrics.errors = this.metrics.errors.slice(-100);
        }
        
        console.error(`[数据库错误] ${type}: ${error.message}`);
        this.emit('error', errorRecord);
    }
    
    /**
     * 记录指标
     */
    recordMetrics(metrics) {
        // 这里可以将指标保存到文件或发送到监控系统
        // 目前只在内存中保存最新的指标
        this.latestMetrics = metrics;
    }
    
    /**
     * 记录指标日志
     */
    logMetrics(metrics) {
        const summary = {
            时间: new Date(metrics.timestamp).toLocaleString(),
            缓存命中率: `${metrics.cache.hitRate.toFixed(2)}%`,
            缓存大小: metrics.cache.size,
            连接池使用率: `${metrics.connectionPool.usage.toFixed(2)}%`,
            活跃连接: metrics.connectionPool.activeConnections,
            平均响应时间: `${metrics.queries.averageResponseTime.toFixed(2)}ms`,
            内存使用率: `${metrics.system.memory.usage.toFixed(2)}%`
        };
        
        console.log('[性能指标]', summary);
    }
    
    /**
     * 获取性能报告
     */
    getPerformanceReport() {
        return {
            overview: {
                totalQueries: this.metrics.queryCount,
                averageResponseTime: this.metrics.queryCount > 0 ? 
                    (this.metrics.totalQueryTime / this.metrics.queryCount) : 0,
                slowQueriesCount: this.metrics.slowQueries.length,
                errorsCount: this.metrics.errors.length,
                alertsCount: this.metrics.alerts.length
            },
            latest: this.latestMetrics,
            slowQueries: this.metrics.slowQueries.slice(-10), // 最近10个慢查询
            recentErrors: this.metrics.errors.slice(-10), // 最近10个错误
            recentAlerts: this.metrics.alerts.slice(-10), // 最近10个警报
            isMonitoring: this.isMonitoring
        };
    }
    
    /**
     * 重置统计数据
     */
    resetStats() {
        this.metrics = {
            queryCount: 0,
            totalQueryTime: 0,
            slowQueries: [],
            errors: [],
            alerts: []
        };
        
        console.log('性能统计数据已重置');
        this.emit('statsReset');
    }
    
    /**
     * 更新配置
     */
    updateConfig(newOptions) {
        this.options = {
            ...this.options,
            ...newOptions,
            alertThresholds: {
                ...this.options.alertThresholds,
                ...newOptions.alertThresholds
            }
        };
        
        console.log('性能监控配置已更新');
        this.emit('configUpdated', this.options);
    }
    
    /**
     * 销毁监控器
     */
    destroy() {
        this.stop();
        this.removeAllListeners();
        console.log('性能监控器已销毁');
    }
}

module.exports = PerformanceMonitor;
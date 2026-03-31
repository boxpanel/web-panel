const sqlite3 = require('sqlite3').verbose();
const EventEmitter = require('events');
const { performance } = require('perf_hooks'); // Node.js原生性能监控API
const crypto = require('crypto'); // Node.js原生加密模块用于生成唯一ID

/**
 * SQLite 连接池管理器
 * 提供连接复用、并发控制和自动重连功能
 */
class SQLiteConnectionPool extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.dbPath = options.dbPath;
        this.maxConnections = options.maxConnections || 10;
        this.minConnections = options.minConnections || 2;
        this.acquireTimeout = options.acquireTimeout || 30000; // 30秒
        this.idleTimeout = options.idleTimeout || 300000; // 5分钟
        this.retryDelay = options.retryDelay || 1000; // 1秒
        this.maxRetries = options.maxRetries || 3;
        
        // 连接池状态
        this.connections = [];
        this.availableConnections = [];
        this.busyConnections = new Set();
        this.waitingQueue = [];
        this.isInitialized = false;
        this.isDestroyed = false;
        
        // 统计信息
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            waitingRequests: 0,
            totalQueries: 0,
            failedQueries: 0,
            avgQueryTime: 0,
            lastQueryTime: 0
        };
        
        // 定时器
        this.cleanupTimer = null;
        this.statsTimer = null;
        
        console.log(`SQLite连接池初始化: 最大连接数=${this.maxConnections}, 最小连接数=${this.minConnections}`);
    }
    
    /**
     * 初始化连接池
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            // 创建最小连接数
            for (let i = 0; i < this.minConnections; i++) {
                const connection = await this.createConnection();
                this.connections.push(connection);
                this.availableConnections.push(connection);
            }
            
            this.isInitialized = true;
            this.stats.totalConnections = this.connections.length;
            
            // 启动清理定时器
            this.startCleanupTimer();
            this.startStatsTimer();
            
            console.log(`连接池初始化完成，创建了 ${this.connections.length} 个连接`);
            this.emit('initialized');
            
        } catch (error) {
            console.error('连接池初始化失败:', error);
            throw error;
        }
    }
    
    /**
     * 创建新的数据库连接
     */
    createConnection() {
        return new Promise((resolve, reject) => {
            const connection = new sqlite3.Database(
                this.dbPath,
                sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
                (err) => {
                    if (err) {
                        console.error('创建数据库连接失败:', err);
                        reject(err);
                        return;
                    }
                    
                    // 配置连接
                    connection.configure('busyTimeout', 30000);
                    
                    // 优化设置
                    connection.serialize(() => {
                        connection.run("PRAGMA journal_mode = WAL");
                        connection.run("PRAGMA synchronous = NORMAL");
                        connection.run("PRAGMA cache_size = 10000");
                        connection.run("PRAGMA temp_store = MEMORY");
                        connection.run("PRAGMA mmap_size = 268435456"); // 256MB
                    });
                    
                    // 添加连接元数据 - 使用Node.js原生API优化
                    connection._poolId = crypto.randomUUID(); // 使用原生UUID生成器
                    connection._createdAt = performance.now(); // 使用高精度时间戳
                    connection._lastUsed = performance.now();
                    connection._queryCount = 0;
                    connection._isAvailable = true;
                    
                    console.log(`创建新连接: ${connection._poolId}`);
                    resolve(connection);
                }
            );
            
            // 连接错误处理
            connection.on('error', (err) => {
                console.error(`连接错误 (${connection._poolId}):`, err);
                this.removeConnection(connection);
            });
        });
    }
    
    /**
     * 获取连接
     */
    async acquire() {
        if (this.isDestroyed) {
            throw new Error('连接池已销毁');
        }
        
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            // 检查是否有可用连接
            if (this.availableConnections.length > 0) {
                const connection = this.availableConnections.pop();
                this.busyConnections.add(connection);
                connection._isAvailable = false;
                connection._lastUsed = Date.now();
                this.stats.activeConnections++;
                
                console.log(`获取连接: ${connection._poolId}, 可用连接: ${this.availableConnections.length}`);
                resolve(connection);
                return;
            }
            
            // 如果没有可用连接且未达到最大连接数，创建新连接
            if (this.connections.length < this.maxConnections) {
                this.createConnection()
                    .then(connection => {
                        this.connections.push(connection);
                        this.busyConnections.add(connection);
                        connection._isAvailable = false;
                        this.stats.totalConnections++;
                        this.stats.activeConnections++;
                        
                        console.log(`创建并获取新连接: ${connection._poolId}`);
                        resolve(connection);
                    })
                    .catch(reject);
                return;
            }
            
            // 加入等待队列
            const timeout = setTimeout(() => {
                const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.waitingQueue.splice(index, 1);
                    this.stats.waitingRequests--;
                    reject(new Error(`获取连接超时 (${this.acquireTimeout}ms)`));
                }
            }, this.acquireTimeout);
            
            this.waitingQueue.push({
                resolve,
                reject,
                timeout,
                startTime
            });
            this.stats.waitingRequests++;
            
            console.log(`连接池已满，加入等待队列。等待数: ${this.waitingQueue.length}`);
        });
    }
    
    /**
     * 释放连接
     */
    release(connection) {
        if (!connection || this.isDestroyed) {
            return;
        }
        
        // 从忙碌连接中移除
        if (this.busyConnections.has(connection)) {
            this.busyConnections.delete(connection);
            this.stats.activeConnections--;
        }
        
        // 检查连接是否仍然有效
        if (!this.isConnectionValid(connection)) {
            this.removeConnection(connection);
            return;
        }
       // 更新连接状态 - 使用高精度时间戳
        connection._isAvailable = true;
        connection._lastUsed = performance.now();
        
        // 处理等待队列
        if (this.waitingQueue.length > 0) {
            const waiter = this.waitingQueue.shift();
            this.stats.waitingRequests--;
            clearTimeout(waiter.timeout);
            
            this.busyConnections.add(connection);
            connection._isAvailable = false;
            this.stats.activeConnections++;
            
            console.log(`从等待队列分配连接: ${connection._poolId}`);
            waiter.resolve(connection);
        } else {
            // 返回到可用连接池
            this.availableConnections.push(connection);
            console.log(`释放连接: ${connection._poolId}, 可用连接: ${this.availableConnections.length}`);
        }
    }
    
    /**
     * 检查连接是否有效
     */
    isConnectionValid(connection) {
        try {
            // 简单的连接测试
            return connection && !connection._destroyed;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 移除无效连接
     */
    removeConnection(connection) {
        if (!connection) return;
        
        // 从各个集合中移除
        const availableIndex = this.availableConnections.indexOf(connection);
        if (availableIndex !== -1) {
            this.availableConnections.splice(availableIndex, 1);
        }
        
        this.busyConnections.delete(connection);
        
        const connectionIndex = this.connections.indexOf(connection);
        if (connectionIndex !== -1) {
            this.connections.splice(connectionIndex, 1);
            this.stats.totalConnections--;
        }
        
        // 关闭连接
        try {
            connection.close();
        } catch (error) {
            console.error('关闭连接时出错:', error);
        }
        
        console.log(`移除连接: ${connection._poolId}, 剩余连接: ${this.connections.length}`);
        
        // 如果连接数低于最小值，创建新连接
        if (this.connections.length < this.minConnections && !this.isDestroyed) {
            this.createConnection()
                .then(newConnection => {
                    this.connections.push(newConnection);
                    this.availableConnections.push(newConnection);
                    this.stats.totalConnections++;
                    console.log(`补充连接: ${newConnection._poolId}`);
                })
                .catch(error => {
                    console.error('补充连接失败:', error);
                });
        }
    }
    
    /**
     * 启动清理定时器
     */
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, 60000); // 每分钟清理一次
    }
    
    /**
     * 启动统计定时器
     */
    startStatsTimer() {
        this.statsTimer = setInterval(() => {
            this.logStats();
        }, 300000); // 每5分钟记录一次统计
    }
    
    /**
     * 清理空闲连接
     */
    cleanup() {
        const now = Date.now();
        const connectionsToRemove = [];
        
        // 检查空闲连接
        for (const connection of this.availableConnections) {
            if (now - connection._lastUsed > this.idleTimeout && 
                this.connections.length > this.minConnections) {
                connectionsToRemove.push(connection);
            }
        }
        
        // 移除空闲连接
        for (const connection of connectionsToRemove) {
            this.removeConnection(connection);
        }
        
        if (connectionsToRemove.length > 0) {
            console.log(`清理了 ${connectionsToRemove.length} 个空闲连接`);
        }
    }
    
    /**
     * 记录统计信息
     */
    logStats() {
        console.log('连接池统计:', {
            总连接数: this.stats.totalConnections,
            活跃连接数: this.stats.activeConnections,
            可用连接数: this.availableConnections.length,
            等待请求数: this.stats.waitingRequests,
            总查询数: this.stats.totalQueries,
            失败查询数: this.stats.failedQueries,
            平均查询时间: `${this.stats.avgQueryTime.toFixed(2)}ms`
        });
    }
    
    /**
     * 获取连接池状态
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isDestroyed: this.isDestroyed,
            totalConnections: this.connections.length,
            availableConnections: this.availableConnections.length,
            busyConnections: this.busyConnections.size,
            waitingRequests: this.waitingQueue.length,
            stats: { ...this.stats }
        };
    }
    
    /**
     * 销毁连接池
     */
    async destroy() {
        if (this.isDestroyed) {
            return;
        }
        
        this.isDestroyed = true;
        
        // 清理定时器
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
        }
        
        // 拒绝所有等待的请求
        for (const waiter of this.waitingQueue) {
            clearTimeout(waiter.timeout);
            waiter.reject(new Error('连接池已销毁'));
        }
        this.waitingQueue = [];
        
        // 关闭所有连接
        const closePromises = this.connections.map(connection => {
            return new Promise(resolve => {
                connection.close(err => {
                    if (err) {
                        console.error(`关闭连接失败 (${connection._poolId}):`, err);
                    }
                    resolve();
                });
            });
        });
        
        await Promise.all(closePromises);
        
        this.connections = [];
        this.availableConnections = [];
        this.busyConnections.clear();
        
        console.log('连接池已销毁');
        this.emit('destroyed');
    }
}

module.exports = SQLiteConnectionPool;
/**
 * 低配服务器缓存优化配置
 * Cache Configuration for Low-spec Servers
 */

class CacheOptimizer {
    constructor() {
        this.config = {
            // 内存缓存配置
            memory: {
                // 最大缓存条目数
                maxEntries: 100,
                
                // 最大内存使用（MB）
                maxMemoryMB: 16,
                
                // 默认过期时间（毫秒）
                defaultTTL: 300000, // 5分钟
                
                // 清理间隔（毫秒）
                cleanupInterval: 60000, // 1分钟
                
                // 启用LRU淘汰策略
                enableLRU: true,
                
                // 统计信息收集
                enableStats: true
            },
            
            // 文件缓存配置
            file: {
                // 缓存目录
                cacheDir: process.env.CACHE_DIR || './cache',
                
                // 最大文件数量
                maxFiles: 50,
                
                // 最大文件大小（MB）
                maxFileSizeMB: 1,
                
                // 文件过期时间（毫秒）
                fileTTL: 1800000, // 30分钟
                
                // 清理间隔（毫秒）
                cleanupInterval: 300000 // 5分钟
            },
            
            // 缓存策略配置
            strategies: {
                // API响应缓存
                api: {
                    enabled: true,
                    ttl: 60000, // 1分钟
                    maxEntries: 50,
                    excludePaths: ['/api/auth', '/api/upload']
                },
                
                // 静态资源缓存
                static: {
                    enabled: true,
                    ttl: 3600000, // 1小时
                    maxEntries: 30,
                    extensions: ['.css', '.js', '.png', '.jpg', '.svg']
                },
                
                // 数据库查询缓存
                database: {
                    enabled: true,
                    ttl: 300000, // 5分钟
                    maxEntries: 20,
                    excludeTables: ['sessions', 'system_logs']
                },
                
                // 用户会话缓存
                session: {
                    enabled: true,
                    ttl: 1800000, // 30分钟
                    maxEntries: 10
                }
            }
        };
        
        // 缓存存储
        this.memoryCache = new Map();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            memoryUsage: 0
        };
        
        // LRU访问顺序跟踪
        this.accessOrder = [];
        
        // 启动清理任务
        this.startCleanupTasks();
    }
    
    // 设置缓存项
    set(key, value, ttl = null) {
        try {
            const now = Date.now();
            const expireTime = now + (ttl || this.config.memory.defaultTTL);
            
            // 检查内存限制
            if (this.memoryCache.size >= this.config.memory.maxEntries) {
                this.evictLRU();
            }
            
            // 计算值的大小（粗略估算）
            const valueSize = this.estimateSize(value);
            
            // 检查内存使用限制
            if (this.cacheStats.memoryUsage + valueSize > this.config.memory.maxMemoryMB * 1024 * 1024) {
                this.evictBySize(valueSize);
            }
            
            // 存储缓存项
            const cacheItem = {
                value,
                expireTime,
                size: valueSize,
                accessCount: 0,
                createdAt: now,
                lastAccessed: now
            };
            
            this.memoryCache.set(key, cacheItem);
            this.updateAccessOrder(key);
            
            // 更新统计
            this.cacheStats.sets++;
            this.cacheStats.memoryUsage += valueSize;
            
            return true;
        } catch (error) {
            console.error('缓存设置失败:', error);
            return false;
        }
    }
    
    // 获取缓存项
    get(key) {
        try {
            const cacheItem = this.memoryCache.get(key);
            
            if (!cacheItem) {
                this.cacheStats.misses++;
                return null;
            }
            
            // 检查是否过期
            if (Date.now() > cacheItem.expireTime) {
                this.delete(key);
                this.cacheStats.misses++;
                return null;
            }
            
            // 更新访问信息
            cacheItem.accessCount++;
            cacheItem.lastAccessed = Date.now();
            this.updateAccessOrder(key);
            
            // 更新统计
            this.cacheStats.hits++;
            
            return cacheItem.value;
        } catch (error) {
            console.error('缓存获取失败:', error);
            this.cacheStats.misses++;
            return null;
        }
    }
    
    // 删除缓存项
    delete(key) {
        try {
            const cacheItem = this.memoryCache.get(key);
            
            if (cacheItem) {
                this.memoryCache.delete(key);
                this.removeFromAccessOrder(key);
                
                // 更新统计
                this.cacheStats.deletes++;
                this.cacheStats.memoryUsage -= cacheItem.size;
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('缓存删除失败:', error);
            return false;
        }
    }
    
    // 检查缓存项是否存在
    has(key) {
        const cacheItem = this.memoryCache.get(key);
        
        if (!cacheItem) {
            return false;
        }
        
        // 检查是否过期
        if (Date.now() > cacheItem.expireTime) {
            this.delete(key);
            return false;
        }
        
        return true;
    }
    
    // 清空所有缓存
    clear() {
        this.memoryCache.clear();
        this.accessOrder = [];
        this.cacheStats.memoryUsage = 0;
        console.log('缓存已清空');
    }
    
    // LRU淘汰策略
    evictLRU() {
        if (this.accessOrder.length === 0) {
            return;
        }
        
        // 淘汰最久未访问的项
        const lruKey = this.accessOrder[0];
        this.delete(lruKey);
        this.cacheStats.evictions++;
        
        console.log(`LRU淘汰缓存项: ${lruKey}`);
    }
    
    // 按大小淘汰
    evictBySize(requiredSize) {
        let freedSize = 0;
        const targetSize = requiredSize * 1.2; // 多释放20%的空间
        
        while (freedSize < targetSize && this.accessOrder.length > 0) {
            const keyToEvict = this.accessOrder[0];
            const cacheItem = this.memoryCache.get(keyToEvict);
            
            if (cacheItem) {
                freedSize += cacheItem.size;
                this.delete(keyToEvict);
                this.cacheStats.evictions++;
            } else {
                this.removeFromAccessOrder(keyToEvict);
            }
        }
        
        console.log(`按大小淘汰，释放空间: ${freedSize} bytes`);
    }
    
    // 更新访问顺序
    updateAccessOrder(key) {
        // 移除旧位置
        this.removeFromAccessOrder(key);
        
        // 添加到末尾（最近访问）
        this.accessOrder.push(key);
    }
    
    // 从访问顺序中移除
    removeFromAccessOrder(key) {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }
    
    // 估算对象大小
    estimateSize(obj) {
        try {
            if (obj === null || obj === undefined) {
                return 8;
            }
            
            if (typeof obj === 'string') {
                return obj.length * 2; // Unicode字符
            }
            
            if (typeof obj === 'number') {
                return 8;
            }
            
            if (typeof obj === 'boolean') {
                return 4;
            }
            
            if (typeof obj === 'object') {
                // 简单的JSON序列化大小估算
                return JSON.stringify(obj).length * 2;
            }
            
            return 16; // 默认大小
        } catch (error) {
            return 16; // 出错时返回默认大小
        }
    }
    
    // 启动清理任务
    startCleanupTasks() {
        // 过期项清理
        setInterval(() => {
            this.cleanupExpired();
        }, this.config.memory.cleanupInterval);
        
        // 统计信息重置
        setInterval(() => {
            this.resetStats();
        }, 3600000); // 1小时
    }
    
    // 清理过期项
    cleanupExpired() {
        const now = Date.now();
        let expiredCount = 0;
        
        for (const [key, cacheItem] of this.memoryCache.entries()) {
            if (now > cacheItem.expireTime) {
                this.delete(key);
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            console.log(`清理了 ${expiredCount} 个过期缓存项`);
        }
    }
    
    // 重置统计信息
    resetStats() {
        const oldStats = { ...this.cacheStats };
        
        this.cacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            memoryUsage: this.cacheStats.memoryUsage // 保持内存使用统计
        };
        
        console.log('缓存统计信息已重置，上一周期:', oldStats);
    }
    
    // 获取缓存统计信息
    getStats() {
        const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
            ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2)
            : 0;
        
        return {
            ...this.cacheStats,
            hitRate: `${hitRate}%`,
            totalEntries: this.memoryCache.size,
            memoryUsageMB: (this.cacheStats.memoryUsage / 1024 / 1024).toFixed(2),
            maxEntriesLimit: this.config.memory.maxEntries,
            maxMemoryLimitMB: this.config.memory.maxMemoryMB
        };
    }
    
    // 获取缓存详细信息
    getDetails() {
        const details = [];
        
        for (const [key, cacheItem] of this.memoryCache.entries()) {
            details.push({
                key,
                size: cacheItem.size,
                accessCount: cacheItem.accessCount,
                createdAt: new Date(cacheItem.createdAt).toISOString(),
                lastAccessed: new Date(cacheItem.lastAccessed).toISOString(),
                expiresAt: new Date(cacheItem.expireTime).toISOString(),
                isExpired: Date.now() > cacheItem.expireTime
            });
        }
        
        return details.sort((a, b) => b.accessCount - a.accessCount);
    }
    
    // 缓存中间件
    middleware(options = {}) {
        const config = {
            ttl: options.ttl || this.config.strategies.api.ttl,
            keyGenerator: options.keyGenerator || ((req) => `${req.method}:${req.path}`),
            shouldCache: options.shouldCache || (() => true),
            ...options
        };
        
        return (req, res, next) => {
            // 只缓存GET请求
            if (req.method !== 'GET') {
                return next();
            }
            
            // 检查是否应该缓存
            if (!config.shouldCache(req)) {
                return next();
            }
            
            const cacheKey = config.keyGenerator(req);
            const cachedResponse = this.get(cacheKey);
            
            if (cachedResponse) {
                // 返回缓存的响应
                res.set(cachedResponse.headers || {});
                res.status(cachedResponse.status || 200);
                res.send(cachedResponse.body);
                return;
            }
            
            // 拦截响应
            const originalSend = res.send;
            const originalJson = res.json;
            
            res.send = (body) => {
                // 缓存响应
                this.set(cacheKey, {
                    status: res.statusCode,
                    headers: res.getHeaders(),
                    body
                }, config.ttl);
                
                return originalSend.call(res, body);
            };
            
            res.json = (obj) => {
                // 缓存JSON响应
                this.set(cacheKey, {
                    status: res.statusCode,
                    headers: res.getHeaders(),
                    body: obj
                }, config.ttl);
                
                return originalJson.call(res, obj);
            };
            
            next();
        };
    }
}

// 创建单例实例
let cacheOptimizerInstance = null;

function createCacheOptimizer() {
    if (!cacheOptimizerInstance) {
        cacheOptimizerInstance = new CacheOptimizer();
    }
    return cacheOptimizerInstance;
}

module.exports = {
    CacheOptimizer,
    createCacheOptimizer,
    getCacheOptimizer: () => cacheOptimizerInstance
};
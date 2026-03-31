const crypto = require('crypto');

/**
 * 查询缓存管理器
 * 提供智能缓存、自动失效和内存管理功能
 */
class QueryCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.accessOrder = new Map(); // 记录访问顺序，用于LRU
        this.options = {
            maxSize: options.maxSize || 50, // 减少最大缓存条目数
            maxMemory: options.maxMemory || 10 * 1024 * 1024, // 减少最大内存使用到10MB
            defaultTTL: options.defaultTTL || 5 * 60 * 1000, // 减少默认TTL到5分钟
            cleanupInterval: options.cleanupInterval || 2 * 60 * 1000, // 减少清理间隔到2分钟
            enableLRU: options.enableLRU !== false,
            enableMemoryLimit: options.enableMemoryLimit !== false,
            enableStats: options.enableStats !== false
        };
        
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            memoryUsage: 0,
            hitRate: 0
        };
        
        this.cleanupTimer = null;
        
        // 启动清理定时器
        if (this.options.cleanupInterval > 0) {
            this.startCleanupTimer();
        }
        
        console.log('查询缓存已初始化，配置:', this.options);
    }
    
    /**
     * 生成缓存键
     */
    generateKey(query, params = []) {
        const keyData = {
            query: query.trim().toLowerCase(),
            params: params
        };
        return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
    }
    
    /**
     * 获取缓存
     */
    get(query, params = []) {
        const key = this.generateKey(query, params);
        const cached = this.cache.get(key);
        
        if (!cached) {
            this.stats.misses++;
            this.updateHitRate();
            return null;
        }
        
        // 检查是否过期
        if (Date.now() > cached.expiresAt) {
            this.delete(key);
            this.stats.misses++;
            this.updateHitRate();
            return null;
        }
        
        // 更新访问时间
        this.accessOrder.set(key, Date.now());
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        
        this.stats.hits++;
        this.updateHitRate();
        
        console.log(`缓存命中: ${key.substring(0, 8)}...`);
        return cached.data;
    }
    
    /**
     * 设置缓存
     */
    set(query, params = [], data, options = {}) {
        const key = this.generateKey(query, params);
        
        // 获取缓存策略
        const strategy = this.getCacheStrategy(query);
        const ttl = options.ttl || strategy.ttl || this.defaultTTL;
        const priority = options.priority || strategy.priority || 'medium';
        
        // 计算数据大小
        const dataSize = this.calculateSize(data);
        
        // 检查内存限制
        if (this.stats.memoryUsage + dataSize > this.options.maxMemory) {
            this.evictByMemory(dataSize);
        }
        
        // 检查条目数限制
        if (this.cache.size >= this.options.maxSize) {
            this.evictByLRU();
        }
        
        const cacheEntry = {
            data: data,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttl,
            lastAccessed: Date.now(),
            accessCount: 0,
            size: dataSize,
            priority: priority,
            query: query.substring(0, 50) // 保存查询片段用于调试
        };
        
        // 如果已存在，先删除旧的
        if (this.cache.has(key)) {
            this.delete(key);
        }
        
        this.cache.set(key, cacheEntry);
        this.accessOrder.set(key, Date.now());
        this.stats.memoryUsage += dataSize;
        this.stats.sets++;
        this.stats.memoryUsage = this.memoryUsage;
        
        console.log(`缓存设置: ${key.substring(0, 8)}..., 大小=${dataSize}字节, TTL=${ttl}ms`);
    }
    
    /**
     * 删除缓存
     */
    delete(key) {
        const cached = this.cache.get(key);
        if (cached) {
            this.cache.delete(key);
            this.accessOrder.delete(key);
            this.stats.memoryUsage -= cached.size;
            this.stats.deletes++;
            this.stats.memoryUsage = this.memoryUsage;
            
            console.log(`缓存删除: ${key.substring(0, 8)}...`);
            return true;
        }
        return false;
    }
    
    /**
     * 清空特定类型的缓存
     */
    invalidate(pattern) {
        let deletedCount = 0;
        
        for (const [key, cached] of this.cache.entries()) {
            if (cached.query.includes(pattern)) {
                this.delete(key);
                deletedCount++;
            }
        }
        
        console.log(`缓存失效: 模式="${pattern}", 删除${deletedCount}个条目`);
        return deletedCount;
    }
    
    /**
     * 清空所有缓存
     */
    clear() {
        const count = this.cache.size;
        this.cache.clear();
        this.accessOrder.clear();
        this.stats.memoryUsage = 0;
        this.stats.memoryUsage = 0;
        
        console.log(`清空所有缓存: ${count}个条目`);
    }
    
    /**
     * 获取缓存策略
     */
    getCacheStrategy(query) {
        // 缓存策略配置
        const cacheStrategies = {
            // 用户查询 - 长期缓存
            'getUser': { ttl: 600000, priority: 'high' },
            'getUserById': { ttl: 600000, priority: 'high' },
            
            // 配置查询 - 长期缓存
            'getConfig': { ttl: 1800000, priority: 'high' },
            
            // 日志查询 - 短期缓存
            'getLogs': { ttl: 60000, priority: 'low' },
            'getLogsCount': { ttl: 60000, priority: 'low' },
            
            // 系统信息 - 短期缓存
            'getSystemInfo': { ttl: 30000, priority: 'medium' },
            'getPerformanceData': { ttl: 15000, priority: 'medium' }
        };
        
        // 提取查询中的方法名
        const methodMatch = query.match(/(\w+)\s*\(/);
        if (methodMatch) {
            const method = methodMatch[1];
            return cacheStrategies[method] || {};
        }
        
        // 根据SQL关键字判断
        if (query.toLowerCase().includes('select')) {
            if (query.toLowerCase().includes('config')) {
                return cacheStrategies['getConfig'];
            } else if (query.toLowerCase().includes('users')) {
                return cacheStrategies['getUser'];
            } else if (query.toLowerCase().includes('logs')) {
                return cacheStrategies['getLogs'];
            }
        }
        
        return {};
    }
    
    /**
     * 计算数据大小
     */
    calculateSize(data) {
        try {
            return Buffer.byteLength(JSON.stringify(data), 'utf8');
        } catch (error) {
            // 如果无法序列化，估算大小
            return 1024; // 默认1KB
        }
    }
    
    /**
     * 基于内存的淘汰策略
     */
    evictByMemory(requiredSize) {
        const targetSize = this.options.maxMemory * 0.8; // 目标80%内存使用
        const needToFree = this.stats.memoryUsage + requiredSize - targetSize;
        
        if (needToFree <= 0) return;
        
        // 按优先级和访问时间排序
        const entries = Array.from(this.cache.entries()).sort((a, b) => {
            const [keyA, cacheA] = a;
            const [keyB, cacheB] = b;
            
            // 优先级权重
            const priorityWeight = { low: 1, medium: 2, high: 3 };
            const weightA = priorityWeight[cacheA.priority] || 2;
            const weightB = priorityWeight[cacheB.priority] || 2;
            
            if (weightA !== weightB) {
                return weightA - weightB; // 低优先级先淘汰
            }
            
            // 相同优先级按LRU
            return cacheA.lastAccessed - cacheB.lastAccessed;
        });
        
        let freedSize = 0;
        let evictedCount = 0;
        
        for (const [key, cached] of entries) {
            if (freedSize >= needToFree) break;
            
            freedSize += cached.size;
            this.delete(key);
            evictedCount++;
        }
        
        this.stats.evictions += evictedCount;
        console.log(`内存淘汰: 释放${freedSize}字节, 淘汰${evictedCount}个条目`);
    }
    
    /**
     * LRU淘汰策略
     */
    evictByLRU() {
        // 找到最久未访问的条目
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, time] of this.accessOrder.entries()) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.delete(oldestKey);
            this.stats.evictions++;
            console.log(`LRU淘汰: ${oldestKey.substring(0, 8)}...`);
        }
    }
    
    /**
     * 启动清理定时器
     */
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
    }
    
    /**
     * 清理过期缓存
     */
    cleanup() {
        const now = Date.now();
        let expiredCount = 0;
        
        for (const [key, cached] of this.cache.entries()) {
            if (now > cached.expiresAt) {
                this.delete(key);
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            console.log(`清理过期缓存: ${expiredCount}个条目`);
        }
        
        // 记录统计信息
        this.logStats();
    }
    
    /**
     * 更新命中率
     */
    updateHitRate() {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : 0;
    }
    
    /**
     * 记录统计信息
     */
    logStats() {
        if ((this.stats.hits + this.stats.misses) % 100 === 0 && this.stats.hits + this.stats.misses > 0) {
            console.log('缓存统计:', {
                命中次数: this.stats.hits,
                未命中次数: this.stats.misses,
                命中率: `${this.stats.hitRate}%`,
                缓存条目数: this.cache.size,
                内存使用: `${(this.stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`,
                淘汰次数: this.stats.evictions
            });
        }
    }
    
    /**
     * 获取缓存状态
     */
    getStatus() {
        return {
            size: this.cache.size,
            maxSize: this.options.maxSize,
            memoryUsage: this.stats.memoryUsage,
            maxMemory: this.options.maxMemory,
            stats: { ...this.stats }
        };
    }
    
    /**
     * 销毁缓存
     */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.clear();
        console.log('查询缓存已销毁');
    }
}

module.exports = QueryCache;
/**
 * 优化查询模块
 * 提供高性能的数据库操作方法，集成连接池和缓存
 */
class OptimizedQueries {
    constructor(database) {
        this.db = database;
        this.connectionPool = database.connectionPool;
        this.queryCache = database.queryCache;
        
        // 预编译语句缓存
        this.preparedStatements = new Map();
        
        // 批量操作配置
        this.batchConfig = {
            maxBatchSize: 1000,
            batchTimeout: 5000 // 5秒超时
        };
        
        console.log('优化查询模块初始化完成');
    }
    
    /**
     * 执行缓存查询
     */
    async cachedQuery(sql, params = [], options = {}) {
        const cacheKey = this.queryCache.generateKey(sql, params);
        
        // 尝试从缓存获取
        const cached = this.queryCache.get(sql, params);
        if (cached !== null) {
            return cached;
        }
        
        // 从数据库查询
        const connection = await this.connectionPool.acquire();
        try {
            const result = await this.executeQuery(connection, sql, params);
            
            // 缓存结果（只缓存SELECT查询）
            if (sql.trim().toLowerCase().startsWith('select')) {
                this.queryCache.set(sql, params, result, options);
            }
            
            return result;
        } finally {
            this.connectionPool.release(connection);
        }
    }
    
    /**
     * 执行单个查询
     */
    async executeQuery(connection, sql, params = []) {
        return new Promise((resolve, reject) => {
            if (sql.trim().toLowerCase().startsWith('select')) {
                // SELECT查询
                if (params.length > 0) {
                    connection.all(sql, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                } else {
                    connection.all(sql, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                }
            } else {
                // INSERT/UPDATE/DELETE查询
                if (params.length > 0) {
                    connection.run(sql, params, function(err) {
                        if (err) reject(err);
                        else resolve({
                            lastID: this.lastID,
                            changes: this.changes
                        });
                    });
                } else {
                    connection.run(sql, function(err) {
                        if (err) reject(err);
                        else resolve({
                            lastID: this.lastID,
                            changes: this.changes
                        });
                    });
                }
            }
        });
    }
    
    /**
     * 获取单行数据
     */
    async getOne(sql, params = [], options = {}) {
        const rows = await this.cachedQuery(sql, params, options);
        return Array.isArray(rows) ? rows[0] || null : rows;
    }
    
    /**
     * 获取多行数据
     */
    async getMany(sql, params = [], options = {}) {
        const rows = await this.cachedQuery(sql, params, options);
        return Array.isArray(rows) ? rows : [];
    }
    
    /**
     * 执行写操作（INSERT/UPDATE/DELETE）
     */
    async execute(sql, params = []) {
        const connection = await this.connectionPool.acquire();
        try {
            const result = await this.executeQuery(connection, sql, params);
            
            // 清除相关缓存
            this.invalidateRelatedCache(sql);
            
            return result;
        } finally {
            this.connectionPool.release(connection);
        }
    }
    
    /**
     * 批量插入操作
     */
    async batchInsert(tableName, columns, rows, options = {}) {
        if (!rows || rows.length === 0) {
            return { insertedCount: 0 };
        }
        
        const batchSize = options.batchSize || this.batchConfig.maxBatchSize;
        const placeholders = '(' + columns.map(() => '?').join(', ') + ')';
        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders}`;
        
        let insertedCount = 0;
        const connection = await this.connectionPool.acquire();
        
        try {
            // 开始事务
            await this.executeQuery(connection, 'BEGIN TRANSACTION');
            
            // 分批处理
            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);
                const batchSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ` +
                    batch.map(() => placeholders).join(', ');
                
                const batchParams = batch.flat();
                const result = await this.executeQuery(connection, batchSql, batchParams);
                insertedCount += result.changes || batch.length;
            }
            
            // 提交事务
            await this.executeQuery(connection, 'COMMIT');
            
            // 清除相关缓存
            this.queryCache.invalidate(tableName);
            
            console.log(`批量插入完成: ${tableName}, 插入${insertedCount}条记录`);
            return { insertedCount };
            
        } catch (error) {
            // 回滚事务
            try {
                await this.executeQuery(connection, 'ROLLBACK');
            } catch (rollbackError) {
                console.error('事务回滚失败:', rollbackError);
            }
            throw error;
        } finally {
            this.connectionPool.release(connection);
        }
    }
    
    /**
     * 批量更新操作
     */
    async batchUpdate(tableName, updates, whereColumn = 'id', options = {}) {
        if (!updates || updates.length === 0) {
            return { updatedCount: 0 };
        }
        
        const connection = await this.connectionPool.acquire();
        let updatedCount = 0;
        
        try {
            await this.executeQuery(connection, 'BEGIN TRANSACTION');
            
            for (const update of updates) {
                const { data, where } = update;
                const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
                const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereColumn} = ?`;
                const params = [...Object.values(data), where];
                
                const result = await this.executeQuery(connection, sql, params);
                updatedCount += result.changes || 0;
            }
            
            await this.executeQuery(connection, 'COMMIT');
            
            // 清除相关缓存
            this.queryCache.invalidate(tableName);
            
            console.log(`批量更新完成: ${tableName}, 更新${updatedCount}条记录`);
            return { updatedCount };
            
        } catch (error) {
            try {
                await this.executeQuery(connection, 'ROLLBACK');
            } catch (rollbackError) {
                console.error('事务回滚失败:', rollbackError);
            }
            throw error;
        } finally {
            this.connectionPool.release(connection);
        }
    }
    
    /**
     * 分页查询
     */
    async paginate(sql, params = [], page = 1, pageSize = 20, options = {}) {
        const offset = (page - 1) * pageSize;
        
        // 构建计数查询
        const countSql = `SELECT COUNT(*) as total FROM (${sql}) as count_query`;
        
        // 构建分页查询
        const paginatedSql = `${sql} LIMIT ${pageSize} OFFSET ${offset}`;
        
        // 并行执行计数和数据查询
        const [countResult, dataResult] = await Promise.all([
            this.getOne(countSql, params, { ttl: 60000 }), // 计数缓存1分钟
            this.getMany(paginatedSql, params, options)
        ]);
        
        const total = countResult ? countResult.total : 0;
        const totalPages = Math.ceil(total / pageSize);
        
        return {
            data: dataResult,
            pagination: {
                page,
                pageSize,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        };
    }
    
    /**
     * 事务执行
     */
    async transaction(operations) {
        const connection = await this.connectionPool.acquire();
        
        try {
            await this.executeQuery(connection, 'BEGIN TRANSACTION');
            
            const results = [];
            for (const operation of operations) {
                const { sql, params = [] } = operation;
                const result = await this.executeQuery(connection, sql, params);
                results.push(result);
            }
            
            await this.executeQuery(connection, 'COMMIT');
            
            // 清除所有相关缓存
            this.queryCache.clear();
            
            console.log(`事务执行完成: ${operations.length}个操作`);
            return results;
            
        } catch (error) {
            try {
                await this.executeQuery(connection, 'ROLLBACK');
            } catch (rollbackError) {
                console.error('事务回滚失败:', rollbackError);
            }
            throw error;
        } finally {
            this.connectionPool.release(connection);
        }
    }
    
    /**
     * 获取预编译语句
     */
    getPreparedStatement(sql) {
        if (!this.preparedStatements.has(sql)) {
            // 这里可以添加预编译语句的逻辑
            // SQLite的node.js驱动不直接支持预编译，但我们可以缓存SQL
            this.preparedStatements.set(sql, {
                sql: sql,
                createdAt: Date.now()
            });
        }
        
        return this.preparedStatements.get(sql);
    }
    
    /**
     * 清除相关缓存
     */
    invalidateRelatedCache(sql) {
        // 根据SQL语句确定影响的表
        const tableMatch = sql.match(/(?:FROM|INTO|UPDATE|JOIN)\s+(\w+)/gi);
        if (tableMatch) {
            tableMatch.forEach(match => {
                const table = match.split(/\s+/)[1];
                this.queryCache.invalidate(table);
            });
        }
    }
    
    /**
     * 获取查询统计信息
     */
    getStats() {
        return {
            cache: this.queryCache.getStatus(),
            connectionPool: this.connectionPool.getStatus(),
            preparedStatements: this.preparedStatements.size
        };
    }
    
    /**
     * 清理资源
     */
    cleanup() {
        // 清理预编译语句缓存
        const now = Date.now();
        const maxAge = 3600000; // 1小时
        
        for (const [sql, stmt] of this.preparedStatements.entries()) {
            if (now - stmt.createdAt > maxAge) {
                this.preparedStatements.delete(sql);
            }
        }
        
        console.log('优化查询模块清理完成');
    }
}

module.exports = OptimizedQueries;
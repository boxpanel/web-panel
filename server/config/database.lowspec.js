/**
 * 低配服务器数据库优化配置
 * Database Configuration for Low-spec Servers
 */

const path = require('path');
const fs = require('fs');

class DatabaseOptimizer {
    constructor() {
        this.config = {
            // SQLite 优化配置
            sqlite: {
                // 数据库文件路径
                filename: process.env.DB_PATH || path.join(__dirname, '../../data/webpanel.db'),
                
                // 连接选项
                options: {
                    // 启用WAL模式以提高并发性能
                    mode: 'WAL',
                    
                    // 连接池配置
                    pool: {
                        min: 1,
                        max: 2, // 低配服务器限制连接数
                        acquireTimeoutMillis: 30000,
                        createTimeoutMillis: 30000,
                        destroyTimeoutMillis: 5000,
                        idleTimeoutMillis: 30000,
                        reapIntervalMillis: 1000,
                        createRetryIntervalMillis: 200
                    },
                    
                    // 性能优化设置
                    pragma: {
                        // 同步模式 - NORMAL平衡性能和安全性
                        synchronous: 'NORMAL',
                        
                        // 日志模式 - WAL模式提高并发
                        journal_mode: 'WAL',
                        
                        // 缓存大小 - 低配服务器使用较小缓存
                        cache_size: -2000, // 2MB
                        
                        // 临时存储位置
                        temp_store: 'MEMORY',
                        
                        // 内存映射大小
                        mmap_size: 67108864, // 64MB
                        
                        // 页面大小
                        page_size: 4096,
                        
                        // 自动清理
                        auto_vacuum: 'INCREMENTAL',
                        
                        // 外键约束
                        foreign_keys: 'ON',
                        
                        // 忙碌超时
                        busy_timeout: 30000,
                        
                        // 检查点间隔
                        wal_autocheckpoint: 1000
                    }
                }
            },
            
            // 查询优化配置
            query: {
                // 查询超时时间
                timeout: 30000,
                
                // 批量操作大小
                batchSize: 100,
                
                // 分页默认大小
                defaultPageSize: 20,
                
                // 最大分页大小
                maxPageSize: 100,
                
                // 启用查询缓存
                enableCache: true,
                
                // 缓存过期时间（毫秒）
                cacheExpiry: 300000, // 5分钟
                
                // 最大缓存条目数
                maxCacheEntries: 100
            },
            
            // 维护配置
            maintenance: {
                // 自动优化间隔（毫秒）
                optimizeInterval: 3600000, // 1小时
                
                // 自动清理间隔（毫秒）
                cleanupInterval: 1800000, // 30分钟
                
                // 备份间隔（毫秒）
                backupInterval: 86400000, // 24小时
                
                // 保留备份数量
                maxBackups: 3,
                
                // 日志清理天数
                logRetentionDays: 7,
                
                // 统计信息更新间隔
                statsUpdateInterval: 600000 // 10分钟
            }
        };
    }
    
    // 获取SQLite配置
    getSQLiteConfig() {
        return this.config.sqlite;
    }
    
    // 获取查询配置
    getQueryConfig() {
        return this.config.query;
    }
    
    // 获取维护配置
    getMaintenanceConfig() {
        return this.config.maintenance;
    }
    
    // 初始化数据库目录
    initializeDirectories() {
        const dbDir = path.dirname(this.config.sqlite.filename);
        const backupDir = path.join(dbDir, 'backups');
        const logDir = path.join(dbDir, 'logs');
        
        // 创建必要的目录
        [dbDir, backupDir, logDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`创建目录: ${dir}`);
            }
        });
        
        return {
            dbDir,
            backupDir,
            logDir
        };
    }
    
    // 应用SQLite优化设置
    async applySQLiteOptimizations(db) {
        const pragmas = this.config.sqlite.options.pragma;
        
        try {
            // 应用PRAGMA设置
            for (const [key, value] of Object.entries(pragmas)) {
                const sql = `PRAGMA ${key} = ${value}`;
                await db.exec(sql);
                console.log(`应用PRAGMA: ${key} = ${value}`);
            }
            
            // 创建索引以提高查询性能
            await this.createOptimizedIndexes(db);
            
            console.log('SQLite优化设置应用完成');
        } catch (error) {
            console.error('应用SQLite优化设置失败:', error);
            throw error;
        }
    }
    
    // 创建优化索引
    async createOptimizedIndexes(db) {
        const indexes = [
            // 用户表索引
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)',
            
            // 系统日志索引
            'CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)',
            'CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category)',
            
            // 会话表索引
            'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
            
            // 设置表索引
            'CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category)',
            'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)'
        ];
        
        for (const indexSql of indexes) {
            try {
                await db.exec(indexSql);
            } catch (error) {
                // 忽略索引已存在的错误
                if (!error.message.includes('already exists')) {
                    console.warn(`创建索引失败: ${indexSql}`, error.message);
                }
            }
        }
    }
    
    // 执行数据库维护
    async performMaintenance(db) {
        try {
            console.log('开始数据库维护...');
            
            // 1. 分析查询计划
            await db.exec('ANALYZE');
            
            // 2. 增量清理
            await db.exec('PRAGMA incremental_vacuum');
            
            // 3. WAL检查点
            await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            
            // 4. 更新统计信息
            await this.updateDatabaseStats(db);
            
            // 5. 清理过期数据
            await this.cleanupExpiredData(db);
            
            console.log('数据库维护完成');
        } catch (error) {
            console.error('数据库维护失败:', error);
        }
    }
    
    // 更新数据库统计信息
    async updateDatabaseStats(db) {
        try {
            const stats = await db.get(`
                SELECT 
                    (SELECT COUNT(*) FROM users) as user_count,
                    (SELECT COUNT(*) FROM system_logs) as log_count,
                    (SELECT COUNT(*) FROM sessions) as session_count
            `);
            
            // 记录统计信息
            console.log('数据库统计:', stats);
            
            return stats;
        } catch (error) {
            console.error('更新数据库统计信息失败:', error);
        }
    }
    
    // 清理过期数据
    async cleanupExpiredData(db) {
        const retentionDays = this.config.maintenance.logRetentionDays;
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        
        try {
            // 清理过期日志
            const result = await db.run(
                'DELETE FROM system_logs WHERE timestamp < ?',
                [cutoffDate.toISOString()]
            );
            
            if (result.changes > 0) {
                console.log(`清理了 ${result.changes} 条过期日志`);
            }
            
            // 清理过期会话
            const sessionResult = await db.run(
                'DELETE FROM sessions WHERE expires_at < ?',
                [new Date().toISOString()]
            );
            
            if (sessionResult.changes > 0) {
                console.log(`清理了 ${sessionResult.changes} 个过期会话`);
            }
        } catch (error) {
            console.error('清理过期数据失败:', error);
        }
    }
    
    // 创建数据库备份
    async createBackup(db) {
        const { backupDir } = this.initializeDirectories();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `webpanel_${timestamp}.db`);
        
        try {
            // 使用SQLite的备份API
            await db.backup(backupPath);
            
            console.log(`数据库备份创建成功: ${backupPath}`);
            
            // 清理旧备份
            await this.cleanupOldBackups(backupDir);
            
            return backupPath;
        } catch (error) {
            console.error('创建数据库备份失败:', error);
            throw error;
        }
    }
    
    // 清理旧备份
    async cleanupOldBackups(backupDir) {
        try {
            const files = fs.readdirSync(backupDir)
                .filter(file => file.startsWith('webpanel_') && file.endsWith('.db'))
                .map(file => ({
                    name: file,
                    path: path.join(backupDir, file),
                    mtime: fs.statSync(path.join(backupDir, file)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);
            
            // 保留最新的几个备份
            const maxBackups = this.config.maintenance.maxBackups;
            if (files.length > maxBackups) {
                const filesToDelete = files.slice(maxBackups);
                
                for (const file of filesToDelete) {
                    fs.unlinkSync(file.path);
                    console.log(`删除旧备份: ${file.name}`);
                }
            }
        } catch (error) {
            console.error('清理旧备份失败:', error);
        }
    }
    
    // 获取数据库健康状态
    async getDatabaseHealth(db) {
        try {
            const health = {
                status: 'healthy',
                checks: {},
                timestamp: new Date().toISOString()
            };
            
            // 检查数据库连接
            try {
                await db.get('SELECT 1');
                health.checks.connection = 'ok';
            } catch (error) {
                health.checks.connection = 'failed';
                health.status = 'unhealthy';
            }
            
            // 检查数据库大小
            try {
                const stats = fs.statSync(this.config.sqlite.filename);
                const sizeMB = stats.size / 1024 / 1024;
                health.checks.size = {
                    status: sizeMB < 100 ? 'ok' : 'warning',
                    sizeMB: Math.round(sizeMB * 100) / 100
                };
            } catch (error) {
                health.checks.size = 'failed';
            }
            
            // 检查WAL文件大小
            try {
                const walPath = this.config.sqlite.filename + '-wal';
                if (fs.existsSync(walPath)) {
                    const walStats = fs.statSync(walPath);
                    const walSizeMB = walStats.size / 1024 / 1024;
                    health.checks.wal = {
                        status: walSizeMB < 10 ? 'ok' : 'warning',
                        sizeMB: Math.round(walSizeMB * 100) / 100
                    };
                } else {
                    health.checks.wal = 'not_found';
                }
            } catch (error) {
                health.checks.wal = 'failed';
            }
            
            return health;
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// 创建单例实例
let dbOptimizerInstance = null;

function createDatabaseOptimizer() {
    if (!dbOptimizerInstance) {
        dbOptimizerInstance = new DatabaseOptimizer();
    }
    return dbOptimizerInstance;
}

module.exports = {
    DatabaseOptimizer,
    createDatabaseOptimizer,
    getDatabaseOptimizer: () => dbOptimizerInstance
};
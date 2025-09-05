const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = process.env.DB_PATH || './data/database.sqlite';
    }

    // 初始化数据库连接
    async init() {
        try {
            // 确保数据目录存在
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // 创建数据库连接
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('数据库连接失败:', err.message);
                    throw err;
                } else {
                    console.log('SQLite数据库连接成功');
                }
            });

            // 启用外键约束
            await this.run('PRAGMA foreign_keys = ON');
            
            // 创建表结构
            await this.createTables();
            
            // 创建初始管理员账户
            await this.createInitialAdmin();
            
            console.log('数据库初始化完成');
        } catch (error) {
            console.error('数据库初始化失败:', error);
            throw error;
        }
    }

    // 创建表结构
    async createTables() {
        const tables = [
            // 用户表
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                email VARCHAR(100),
                role VARCHAR(20) DEFAULT 'user',
                status VARCHAR(20) DEFAULT 'active',
                last_login DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 会话表
            `CREATE TABLE IF NOT EXISTS sessions (
                id VARCHAR(255) PRIMARY KEY,
                user_id INTEGER NOT NULL,
                data TEXT,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`,
            
            // 系统日志表
            `CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action VARCHAR(100) NOT NULL,
                resource VARCHAR(100),
                details TEXT,
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )`,
            
            // 系统配置表
            `CREATE TABLE IF NOT EXISTS system_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key VARCHAR(100) UNIQUE NOT NULL,
                value TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // 文件操作记录表
            `CREATE TABLE IF NOT EXISTS file_operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                operation VARCHAR(50) NOT NULL,
                file_path TEXT NOT NULL,
                old_path TEXT,
                new_path TEXT,
                file_size INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`
        ];

        for (const sql of tables) {
            await this.run(sql);
        }

        // 创建索引
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON system_logs(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_file_operations_user_id ON file_operations(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key)'
        ];

        for (const sql of indexes) {
            await this.run(sql);
        }
    }

    // 创建初始管理员账户
    async createInitialAdmin() {
        try {
            // 检查是否已有管理员用户
            const adminExists = await this.get('SELECT id FROM users WHERE role = ?', ['admin']);
            
            if (!adminExists) {
                // 从环境变量获取管理员账户信息，如果没有则使用默认值
                const adminUsername = process.env.ADMIN_USERNAME || 'admin';
                const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
                const adminEmail = process.env.ADMIN_EMAIL || `${adminUsername}@localhost`;
                
                const hashedPassword = await bcrypt.hash(adminPassword, 10);
                
                await this.run(
                    `INSERT INTO users (username, email, password, role, status, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [adminUsername, adminEmail, hashedPassword, 'admin', 'active', new Date(), new Date()]
                );
                
                console.log(`初始管理员账户已创建: ${adminUsername}/${adminPassword}`);
                
                // 记录系统日志
                await this.logAction(null, 'ADMIN_CREATED', 'users', `初始管理员账户创建: ${adminUsername}`);
            }
        } catch (error) {
            console.error('创建初始管理员账户失败:', error);
            throw error;
        }
    }

    // 执行SQL语句（返回Promise）
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    // 查询单条记录
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // 查询多条记录
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // 关闭数据库连接
    close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('数据库连接已关闭');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    // 记录系统日志
    async logAction(userId, action, resource = null, details = null, ipAddress = null, userAgent = null) {
        try {
            await this.run(
                'INSERT INTO system_logs (user_id, action, resource, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, action, resource, details, ipAddress, userAgent]
            );
        } catch (error) {
            console.error('记录系统日志失败:', error);
        }
    }

    // 清理过期会话
    async cleanExpiredSessions() {
        try {
            const result = await this.run('DELETE FROM sessions WHERE expires_at < datetime("now")');
            if (result.changes > 0) {
                console.log(`清理了 ${result.changes} 个过期会话`);
            }
        } catch (error) {
            console.error('清理过期会话失败:', error);
        }
    }
}

// 创建全局数据库实例
const database = new Database();

module.exports = database;
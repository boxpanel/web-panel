const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const CryptoUtils = require('../modules/crypto-utils');
const ConnectionPool = require('./connection-pool');
const QueryCache = require('./query-cache');

// 配置缓存
let configCache = new Map();
let cacheExpiry = new Map();

// 配置缓存TTL（5分钟）
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

class Database {
    constructor() {
        // 根据环境变量或用户权限动态设置数据库路径
        let dbDir;
        if (process.env.DB_DIR) {
            dbDir = process.env.DB_DIR;
            console.log(`使用环境变量DB_DIR: ${dbDir}`);
        } else {
            try {
                // 检查是否为root用户（仅在支持的系统上）
                const isRoot = process.getuid && process.getuid() === 0;
                dbDir = isRoot ? '/opt/web-panel/database' : 
                       path.join(require('os').homedir(), '.local/share/web-panel/database');
                console.log(`根据用户权限设置数据库目录: ${dbDir} (root: ${isRoot})`);
            } catch (err) {
                // 在不支持getuid的系统上使用默认路径
                console.log('无法检测用户权限，使用默认路径');
                dbDir = path.join(require('os').homedir(), '.local/share/web-panel/database');
            }
        }
        this.dbPath = path.join(dbDir, 'server_panel.db');
        this.db = null;
        
        // 初始化连接池和查询缓存
        this.connectionPool = new ConnectionPool({
            dbPath: this.dbPath,
            maxConnections: 10,
            acquireTimeout: 30000,
            idleTimeout: 300000
        });
        
        this.queryCache = new QueryCache({
            maxSize: 1000,
            defaultTTL: 300000, // 5分钟
            maxMemoryMB: 100,
            cleanupInterval: 60000
        });
        
        // 初始化优化查询模块
        const OptimizedQueries = require('./optimized-queries');
        this.optimizedQueries = null; // 延迟初始化，等待数据库连接建立
        
        // 确保数据库目录存在
        const dbDirPath = path.dirname(this.dbPath);
        console.log(`检查数据库目录: ${dbDirPath}`);
        if (!fs.existsSync(dbDirPath)) {
            console.log(`创建数据库目录: ${dbDirPath}`);
            try {
                fs.mkdirSync(dbDirPath, { recursive: true });
                console.log(`数据库目录创建成功: ${dbDirPath}`);
            } catch (err) {
                console.error(`数据库目录创建失败: ${err.message}`);
                throw err;
            }
        } else {
            console.log(`数据库目录已存在: ${dbDirPath}`);
        }
        
        console.log(`数据库文件路径: ${this.dbPath}`);
    }

    // 初始化数据库连接
    init() {
        return new Promise((resolve, reject) => {
            // 检查数据库目录权限
            const dbDirPath = path.dirname(this.dbPath);
            try {
                fs.accessSync(dbDirPath, fs.constants.R_OK | fs.constants.W_OK);
                console.log(`数据库目录权限检查通过: ${dbDirPath}`);
            } catch (err) {
                console.error(`数据库目录权限不足: ${dbDirPath}`, err.message);
                reject(new Error(`数据库目录权限不足: ${err.message}`));
                return;
            }
            
            console.log(`尝试连接数据库: ${this.dbPath}`);
            // 使用读写模式打开数据库，确保不是只读模式
            this.db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
                if (err) {
                    console.error('数据库连接失败:', err.message);
                    console.error('错误代码:', err.code);
                    console.error('错误详情:', err);
                    
                    // 详细的错误诊断
                    if (err.code === 'SQLITE_READONLY') {
                        console.error('数据库文件为只读状态，请检查文件权限');
                        console.error(`数据库文件路径: ${this.dbPath}`);
                        try {
                            const stats = fs.statSync(this.dbPath);
                            console.error(`文件权限: ${stats.mode.toString(8)}`);
                            console.error(`文件所有者: uid=${stats.uid}, gid=${stats.gid}`);
                        } catch (statErr) {
                            console.error('无法获取文件状态:', statErr.message);
                        }
                    } else if (err.code === 'SQLITE_CANTOPEN') {
                        console.error('无法打开数据库文件，可能的原因:');
                        console.error('  1. 目录不存在或无权限');
                        console.error('  2. 磁盘空间不足');
                        console.error('  3. 文件系统只读');
                        
                        // 检查目录状态
                        const dbDirPath = path.dirname(this.dbPath);
                        try {
                            const dirStats = fs.statSync(dbDirPath);
                            console.error(`目录权限: ${dirStats.mode.toString(8)}`);
                            console.error(`目录所有者: uid=${dirStats.uid}, gid=${dirStats.gid}`);
                        } catch (dirErr) {
                            console.error('无法获取目录状态:', dirErr.message);
                        }
                    }
                    
                    reject(err);
                } else {
                    console.log('数据库连接成功');
                    // 验证数据库文件是否创建
                    if (fs.existsSync(this.dbPath)) {
                        console.log(`数据库文件创建成功: ${this.dbPath}`);
                        const stats = fs.statSync(this.dbPath);
                        console.log(`数据库文件大小: ${stats.size} bytes`);
                        console.log(`文件权限: ${stats.mode.toString(8)}`);
                        
                        // 确保数据库文件有写入权限
                        try {
                            fs.accessSync(this.dbPath, fs.constants.W_OK);
                            console.log('数据库文件写入权限检查通过');
                        } catch (err) {
                            console.log('数据库文件写入权限不足，尝试修复...');
                            try {
                                // 尝试设置文件权限为可读写
                                fs.chmodSync(this.dbPath, 0o666);
                                console.log('数据库文件权限已修复为可读写');
                            } catch (chmodErr) {
                                console.error('无法修复数据库文件权限:', chmodErr.message);
                            }
                        }
                    } else {
                        console.error(`数据库文件未创建: ${this.dbPath}`);
                    }
                    
                    // 数据库性能优化配置
                    this.db.run("PRAGMA journal_mode = WAL"); // 启用WAL模式提高并发性能
                    this.db.run("PRAGMA synchronous = NORMAL"); // 平衡性能和安全性
                    this.db.run("PRAGMA cache_size = 10000"); // 增加缓存大小
                    this.db.run("PRAGMA temp_store = MEMORY"); // 临时表存储在内存中
                    this.db.run("PRAGMA mmap_size = 268435456"); // 启用内存映射(256MB)
                    
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    // 创建数据表
    createTables() {
        return new Promise((resolve, reject) => {
            const createConfigTable = `
                CREATE TABLE IF NOT EXISTS config (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    value TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createUsersTable = `
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,

                    role TEXT DEFAULT 'admin',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME
                )
            `;



            const createLogsTable = `
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    action TEXT NOT NULL,
                    details TEXT,
                    ip_address TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    user_agent TEXT,
                    level TEXT DEFAULT 'info',
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            `;

            const createBridgesTable = `
                CREATE TABLE IF NOT EXISTS bridges (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    target_interfaces TEXT NOT NULL,
                    bridge_type TEXT DEFAULT 'bridge',
                    ip_config TEXT,
                    status TEXT DEFAULT 'active',
                    method TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            this.db.serialize(() => {
                // 首先创建所有表
                this.db.run(createConfigTable, (err) => {
                    if (err) {
                        console.error('创建config表失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('config表创建成功');
                });
                
                this.db.run(createUsersTable, (err) => {
                    if (err) {
                        console.error('创建users表失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('users表创建成功');
                });
                
                this.db.run(createLogsTable, (err) => {
                    if (err) {
                        console.error('创建logs表失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('logs表创建成功');
                });
                
                this.db.run(createBridgesTable, (err) => {
                    if (err) {
                        console.error('创建bridges表失败:', err);
                        reject(err);
                        return;
                    }
                    console.log('bridges表创建成功');
                    
                    // 所有表创建完成后，再创建索引
                    this.db.run("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)", (err) => {
                        if (err) console.warn('创建users索引失败:', err);
                        else console.log('users索引创建成功');
                    });
                    
                    this.db.run("CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id)", (err) => {
                        if (err) console.warn('创建logs用户ID索引失败:', err);
                        else console.log('logs用户ID索引创建成功');
                    });
                    
                    this.db.run("CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)", (err) => {
                        if (err) console.warn('创建logs时间索引失败:', err);
                        else console.log('logs时间索引创建成功');
                    });
                    
                    this.db.run("CREATE INDEX IF NOT EXISTS idx_config_key ON config(key)", (err) => {
                        if (err) console.warn('创建config索引失败:', err);
                        else console.log('config索引创建成功');
                    });
                    
                    this.db.run("CREATE INDEX IF NOT EXISTS idx_bridges_status ON bridges(status)", (err) => {
                        if (err) console.warn('创建bridges状态索引失败:', err);
                        else console.log('bridges状态索引创建成功');
                    });
                    
                    this.db.run("CREATE INDEX IF NOT EXISTS idx_bridges_created_at ON bridges(created_at)", (err) => {
                        if (err) console.warn('创建bridges时间索引失败:', err);
                        else console.log('bridges时间索引创建成功');
                        
                        // 所有索引创建完成后，初始化连接池和优化查询模块
                        console.log('数据表和索引创建成功');
                        this.connectionPool.initialize().then(() => {
                            const OptimizedQueries = require('./optimized-queries');
                            this.optimizedQueries = new OptimizedQueries(this);
                            console.log('数据库优化模块初始化完成');
                            resolve();
                        }).catch(reject);
                    });
                });
            });
        });
    }

    // 检查是否已安装
    isInstalled() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT value FROM config WHERE key = 'installed'", (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row && row.value === 'true');
                }
            });
        });
    }

    // 保存配置
    saveConfig(key, value) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`;
            this.db.run(sql, [key, value], function(err) {
                if (err) {
                    reject(err);
                } else {
                    // 清除相关缓存
                    const cacheKey = `config:${key}`;
                    configCache.delete(cacheKey);
                    resolve(this.lastID);
                }
            });
        });
    }

    // 获取配置
    getConfig(key) {
        return new Promise((resolve, reject) => {
            // 检查缓存
            const cacheKey = `config:${key}`;
            const cached = configCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp < CONFIG_CACHE_TTL)) {
                resolve(cached.value);
                return;
            }
            
            this.db.get("SELECT value FROM config WHERE key = ?", [key], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    const value = row ? row.value : null;
                    // 缓存结果
                    configCache.set(cacheKey, {
                        value: value,
                        timestamp: Date.now()
                    });
                    resolve(value);
                }
            });
        });
    }

    // 获取所有配置
    getAllConfigs() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT key, value FROM config", [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const configs = {};
                    rows.forEach(row => {
                        configs[row.key] = row.value;
                        // 更新缓存
                        const cacheKey = `config:${row.key}`;
                        configCache.set(cacheKey, {
                            value: row.value,
                            timestamp: Date.now()
                        });
                    });
                    resolve(configs);
                }
            });
        });
    }

    // 创建用户
    createUser(username, hashedPassword) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO users (username, password) VALUES (?, ?)`;
            this.db.run(sql, [username, hashedPassword], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // 获取用户
    async getUser(username) {
        if (this.optimizedQueries) {
            return await this.optimizedQueries.getOne(
                "SELECT * FROM users WHERE username = ?", 
                [username],
                { ttl: 600000 } // 缓存10分钟
            );
        } else {
            // 降级到原始方法
            return new Promise((resolve, reject) => {
                this.db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            });
        }
    }

    // 更新最后登录时间
    updateLastLogin(userId) {
        return new Promise((resolve, reject) => {
            const sql = `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`;
            this.db.run(sql, [userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }



    // 修改用户密码
    updateUserPassword(userId, hashedPassword) {
        return new Promise((resolve, reject) => {
            const sql = `UPDATE users SET password = ? WHERE id = ?`;
            this.db.run(sql, [hashedPassword, userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // 根据ID获取用户
    async getUserById(userId) {
        if (this.optimizedQueries) {
            return await this.optimizedQueries.getOne(
                "SELECT * FROM users WHERE id = ?", 
                [userId],
                { ttl: 600000 } // 缓存10分钟
            );
        } else {
            // 降级到原始方法
            return new Promise((resolve, reject) => {
                this.db.get("SELECT * FROM users WHERE id = ?", [userId], (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                });
            });
        }
    }

    // 记录日志
    addLog(userIdOrParams, action, details, ipAddress, userAgent, level) {
        return new Promise((resolve, reject) => {
            let userId, finalAction, finalDetails, finalIpAddress, finalUserAgent, finalLevel;
            
            // 支持两种调用方式：对象参数和独立参数
            if (typeof userIdOrParams === 'object' && userIdOrParams !== null) {
                // 对象参数方式
                userId = userIdOrParams.userId;
                finalAction = userIdOrParams.action;
                finalDetails = userIdOrParams.details;
                finalIpAddress = userIdOrParams.ip;
                finalUserAgent = userIdOrParams.userAgent;
                finalLevel = userIdOrParams.level || 'info';
            } else {
                // 独立参数方式（向后兼容）
                userId = userIdOrParams;
                finalAction = action;
                finalDetails = details;
                finalIpAddress = ipAddress;
                finalUserAgent = userAgent;
                finalLevel = level || 'info';
            }
            
            const sql = `INSERT INTO logs (user_id, action, details, ip_address, user_agent, level) VALUES (?, ?, ?, ?, ?, ?)`;
            this.db.run(sql, [userId, finalAction, finalDetails, finalIpAddress, finalUserAgent, finalLevel], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    // 获取日志列表
    async getLogs(page = 1, limit = 20, filters = {}) {
        if (this.optimizedQueries) {
            let sql = `
                SELECT l.*, u.username 
                FROM logs l 
                LEFT JOIN users u ON l.user_id = u.id 
                WHERE 1=1
            `;
            const params = [];
            
            // 添加过滤条件
            if (filters.action) {
                sql += ` AND l.action = ?`;
                params.push(filters.action);
            }
            
            if (filters.startDate) {
                sql += ` AND DATE(l.created_at) >= ?`;
                params.push(filters.startDate);
            }
            
            if (filters.endDate) {
                sql += ` AND DATE(l.created_at) <= ?`;
                params.push(filters.endDate);
            }
            
            sql += ` ORDER BY l.created_at DESC`;
            
            const result = await this.optimizedQueries.paginate(
                sql, 
                params, 
                page, 
                limit,
                { ttl: 60000 } // 缓存1分钟
            );
            
            // 返回数据数组，而不是包含分页信息的对象
            return result.data || [];
        } else {
            // 降级到原始方法
            return new Promise((resolve, reject) => {
                let sql = `
                    SELECT l.*, u.username 
                    FROM logs l 
                    LEFT JOIN users u ON l.user_id = u.id 
                    WHERE 1=1
                `;
                const params = [];
                
                // 添加过滤条件
                if (filters.action) {
                    sql += ` AND l.action = ?`;
                    params.push(filters.action);
                }
                
                if (filters.startDate) {
                    sql += ` AND DATE(l.created_at) >= ?`;
                    params.push(filters.startDate);
                }
                
                if (filters.endDate) {
                    sql += ` AND DATE(l.created_at) <= ?`;
                    params.push(filters.endDate);
                }
                
                // 添加排序和分页
                sql += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
                params.push(limit, (page - 1) * limit);
                
                this.db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        }
    }

    // 获取日志总数
    getLogsCount(filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = `SELECT COUNT(*) as count FROM logs WHERE 1=1`;
            const params = [];
            
            // 添加过滤条件
            if (filters.action) {
                sql += ` AND action = ?`;
                params.push(filters.action);
            }
            
            if (filters.startDate) {
                sql += ` AND DATE(created_at) >= ?`;
                params.push(filters.startDate);
            }
            
            if (filters.endDate) {
                sql += ` AND DATE(created_at) <= ?`;
                params.push(filters.endDate);
            }
            
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    // 关闭数据库连接
    async close() {
        try {
            // 清理查询缓存
            if (this.queryCache) {
                this.queryCache.destroy();
            }
            
            // 清理优化查询模块
            if (this.optimizedQueries) {
                this.optimizedQueries.cleanup();
            }
            
            // 关闭连接池
            if (this.connectionPool) {
                await this.connectionPool.destroy();
            }
            
            // 关闭主数据库连接
            if (this.db) {
                return new Promise((resolve, reject) => {
                    this.db.close((err) => {
                        if (err) {
                            console.error('关闭数据库连接失败:', err.message);
                            reject(err);
                        } else {
                            console.log('数据库连接已关闭');
                            resolve();
                        }
                    });
                });
            }
        } catch (error) {
            console.error('关闭数据库时发生错误:', error);
            throw error;
        }
    }
    
    // 桥接相关方法
    saveBridge(bridgeData) {
        return new Promise((resolve, reject) => {
            const { id, name, targetInterfaces, bridgeType, ipConfig, status, method } = bridgeData;
            const sql = `
                INSERT OR REPLACE INTO bridges 
                (id, name, target_interfaces, bridge_type, ip_config, status, method, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            
            this.db.run(sql, [
                id, 
                name, 
                JSON.stringify(targetInterfaces), 
                bridgeType, 
                JSON.stringify(ipConfig), 
                status, 
                method
            ], function(err) {
                if (err) {
                    console.error('保存桥接数据失败:', err);
                    reject(err);
                } else {
                    resolve({ id: this.lastID });
                }
            });
        });
    }

    getBridge(bridgeId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM bridges WHERE id = ?';
            this.db.get(sql, [bridgeId], (err, row) => {
                if (err) {
                    console.error('获取桥接数据失败:', err);
                    reject(err);
                } else if (row) {
                    // 解析JSON字段
                    try {
                        row.target_interfaces = JSON.parse(row.target_interfaces);
                        row.ip_config = row.ip_config ? JSON.parse(row.ip_config) : null;
                    } catch (parseErr) {
                        console.warn('解析桥接数据JSON失败:', parseErr);
                    }
                    resolve(row);
                } else {
                    resolve(null);
                }
            });
        });
    }

    getAllBridges() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM bridges ORDER BY created_at DESC';
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error('获取所有桥接数据失败:', err);
                    reject(err);
                } else {
                    // 解析JSON字段
                    const bridges = rows.map(row => {
                        try {
                            row.target_interfaces = JSON.parse(row.target_interfaces);
                            row.ip_config = row.ip_config ? JSON.parse(row.ip_config) : null;
                        } catch (parseErr) {
                            console.warn('解析桥接数据JSON失败:', parseErr);
                        }
                        return row;
                    });
                    resolve(bridges);
                }
            });
        });
    }

    deleteBridge(bridgeId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM bridges WHERE id = ?';
            this.db.run(sql, [bridgeId], function(err) {
                if (err) {
                    console.error('删除桥接数据失败:', err);
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    updateBridgeStatus(bridgeId, status) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE bridges SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            this.db.run(sql, [status, bridgeId], function(err) {
                if (err) {
                    console.error('更新桥接状态失败:', err);
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // 验证桥接配置的完整性
    validateBridgeConfig(bridgeId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM bridges WHERE id = ?';
            this.db.get(sql, [bridgeId], (err, row) => {
                if (err) {
                    console.error('验证桥接配置失败:', err);
                    reject(err);
                } else if (!row) {
                    resolve({ 
                        valid: false, 
                        error: '桥接配置不存在' 
                    });
                } else {
                    try {
                        // 验证必要字段
                        const validation = {
                            valid: true,
                            errors: [],
                            warnings: []
                        };

                        // 检查基本字段
                        if (!row.id || !row.name) {
                            validation.valid = false;
                            validation.errors.push('缺少桥接ID或名称');
                        }

                        // 检查目标接口
                        let targetInterfaces;
                        try {
                            targetInterfaces = JSON.parse(row.target_interfaces);
                            if (!Array.isArray(targetInterfaces) || targetInterfaces.length === 0) {
                                validation.valid = false;
                                validation.errors.push('目标接口配置无效');
                            }
                        } catch (parseErr) {
                            validation.valid = false;
                            validation.errors.push('目标接口JSON解析失败');
                        }

                        // 检查IP配置
                        if (row.ip_config) {
                            try {
                                const ipConfig = JSON.parse(row.ip_config);
                                if (ipConfig.type === 'static') {
                                    if (!ipConfig.staticIp || !ipConfig.staticIp.address) {
                                        validation.warnings.push('静态IP配置不完整');
                                    }
                                }
                            } catch (parseErr) {
                                validation.warnings.push('IP配置JSON解析失败');
                            }
                        }

                        // 检查状态
                        if (!['active', 'inactive'].includes(row.status)) {
                            validation.warnings.push('桥接状态值异常');
                        }

                        // 检查创建时间
                        if (!row.created_at) {
                            validation.warnings.push('缺少创建时间');
                        }

                        resolve({
                            valid: validation.valid,
                            errors: validation.errors,
                            warnings: validation.warnings,
                            config: row
                        });
                    } catch (validationErr) {
                        console.error('桥接配置验证过程出错:', validationErr);
                        reject(validationErr);
                    }
                }
            });
        });
    }

    // 验证所有桥接配置
    validateAllBridgeConfigs() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT id FROM bridges';
            this.db.all(sql, [], async (err, rows) => {
                if (err) {
                    console.error('获取桥接列表失败:', err);
                    reject(err);
                } else {
                    try {
                        const results = {
                            total: rows.length,
                            valid: 0,
                            invalid: 0,
                            details: []
                        };

                        for (const row of rows) {
                            try {
                                const validation = await this.validateBridgeConfig(row.id);
                                if (validation.valid) {
                                    results.valid++;
                                } else {
                                    results.invalid++;
                                }
                                results.details.push({
                                    id: row.id,
                                    ...validation
                                });
                            } catch (validationErr) {
                                results.invalid++;
                                results.details.push({
                                    id: row.id,
                                    valid: false,
                                    errors: [`验证过程出错: ${validationErr.message}`],
                                    warnings: []
                                });
                            }
                        }

                        resolve(results);
                    } catch (processErr) {
                        reject(processErr);
                    }
                }
            });
        });
    }

    // 修复桥接配置
    repairBridgeConfig(bridgeId, repairOptions = {}) {
        return new Promise(async (resolve, reject) => {
            try {
                const validation = await this.validateBridgeConfig(bridgeId);
                if (validation.valid) {
                    resolve({ 
                        success: true, 
                        message: '桥接配置无需修复' 
                    });
                    return;
                }

                const repairs = [];
                let updateSql = 'UPDATE bridges SET ';
                const updateParams = [];
                const updateFields = [];

                // 修复状态字段
                if (validation.errors.some(e => e.includes('状态值异常'))) {
                    updateFields.push('status = ?');
                    updateParams.push(repairOptions.defaultStatus || 'inactive');
                    repairs.push('修复状态字段');
                }

                // 修复创建时间
                if (validation.warnings.some(w => w.includes('缺少创建时间'))) {
                    updateFields.push('created_at = ?');
                    updateParams.push(new Date().toISOString());
                    repairs.push('添加创建时间');
                }

                // 修复更新时间
                updateFields.push('updated_at = CURRENT_TIMESTAMP');
                repairs.push('更新修改时间');

                if (updateFields.length > 1) { // 除了updated_at之外还有其他字段需要更新
                    updateSql += updateFields.join(', ') + ' WHERE id = ?';
                    updateParams.push(bridgeId);

                    this.db.run(updateSql, updateParams, function(err) {
                        if (err) {
                            console.error('修复桥接配置失败:', err);
                            reject(err);
                        } else {
                            resolve({
                                success: true,
                                message: `桥接配置修复完成: ${repairs.join(', ')}`,
                                repairs: repairs
                            });
                        }
                    });
                } else {
                    resolve({ 
                        success: true, 
                        message: '桥接配置无需修复' 
                    });
                }
            } catch (error) {
                console.error('修复桥接配置过程出错:', error);
                reject(error);
            }
        });
    }

    // 获取数据库性能统计
    getPerformanceStats() {
        if (this.optimizedQueries) {
            return this.optimizedQueries.getStats();
        }
        return {
            cache: { size: 0, hitRate: 0 },
            connectionPool: { activeConnections: 0, totalConnections: 0 },
            preparedStatements: 0
        };
    }
}

// 如果直接运行此文件，执行初始化安装
if (require.main === module) {
    const crypto = require('crypto');
    
    async function initializeInstallation() {
        const db = new Database();
        
        try {
            await db.init();
            
            // 从环境变量获取配置参数
            const port = process.env.PORT || '3000';
            const username = process.env.ADMIN_USERNAME || 'admin';
            const password = process.env.ADMIN_PASSWORD || 'admin123';
            
            console.log('正在配置面板参数...');
            
            // 保存基本配置
            await db.saveConfig('server_port', port);
            await db.saveConfig('installed', 'true');
            await db.saveConfig('install_time', new Date().toISOString());
            
            // 生成安全密钥
            const secretKey = crypto.randomBytes(32).toString('hex');
            await db.saveConfig('secret_key', secretKey);
            
            // 创建管理员用户
            console.log('正在创建管理员用户...');
            const hashedPassword = await CryptoUtils.hashPassword(password);
            
            try {
                await db.createUser(username, hashedPassword);
                console.log(`管理员用户创建成功: ${username}`);
            } catch (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    console.log('管理员用户已存在，跳过创建');
                } else {
                    throw err;
                }
            }
            
            console.log('数据库初始化完成!');
            console.log(`面板端口: ${port}`);
            console.log(`管理员用户名: ${username}`);
            console.log(`管理员密码: ${password}`);
            
        } catch (error) {
            console.error('初始化失败:', error);
            process.exit(1);
        } finally {
            db.close();
        }
    }
    
    initializeInstallation();
}

module.exports = Database;
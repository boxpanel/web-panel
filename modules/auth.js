const CryptoUtils = require('./crypto-utils');

// 配置crypto性能参数（使用Node.js原生crypto模块）

// 简单的用户缓存（内存缓存，重启后清空）
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// 认证中间件
function requireAuth(req, res, next) {
    if (req.session.userId) {
        // 检查会话是否过期（基于最后活动时间的滑动窗口）
        const now = Date.now();
        const lastActivity = req.session.lastActivity || req.session.loginTime || now;
        const sessionTimeout = req.session.timeout || 30 * 60 * 1000; // 默认30分钟
        
        if (now - lastActivity > sessionTimeout) {
            // 会话已过期，清除session
            console.log(`会话已过期: 用户ID=${req.session.userId}, 最后活动时间=${new Date(lastActivity)}, 当前时间=${new Date(now)}`);
            req.session.destroy((err) => {
                if (err) {
                    console.error('清除过期会话失败:', err);
                }
            });
            
            // 如果是API请求，返回JSON错误
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ success: false, error: '会话已过期，请重新登录' });
            }
            // 否则重定向到登录页面
            return res.redirect('/login');
        }
        
        // 更新最后活动时间（滑动窗口机制）
        req.session.lastActivity = now;
        next();
    } else {
        // 如果是API请求，返回JSON错误
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ success: false, error: '未登录或会话已过期' });
        }
        // 否则重定向到登录页面
        res.redirect('/login');
    }
}

// 检查是否已安装的中间件
function checkInstallation(db) {
    return async function(req, res, next) {
        try {
            const isInstalled = await db.isInstalled();
            if (!isInstalled && req.path !== '/install' && req.path !== '/setup') {
                // 对API请求返回JSON错误，对页面请求返回重定向
                if (req.path.startsWith('/api/')) {
                    return res.status(503).json({ error: '系统未安装，请先完成安装' });
                }
                return res.redirect('/install');
            }
            if (isInstalled && (req.path === '/install' || req.path === '/setup')) {
                // 对API请求返回JSON错误，对页面请求返回重定向
                if (req.path.startsWith('/api/')) {
                    return res.status(400).json({ error: '系统已安装' });
                }
                return res.redirect('/login');
            }
            next();
        } catch (error) {
            console.error('检查安装状态失败:', error);
            // 对API请求返回JSON错误，对页面请求返回HTML错误
            if (req.path.startsWith('/api/')) {
                return res.status(500).json({ error: '服务器错误' });
            }
            res.status(500).send('服务器错误');
        }
    };
}

// 用户登录验证
async function authenticateUser(username, password, db) {
    try {
        if (!username || !password) {
            return { success: false, error: '用户名和密码不能为空' };
        }

        // 检查缓存
        const cacheKey = `user:${username}`;
        const cached = userCache.get(cacheKey);
        let user;
        
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            user = cached.user;
        } else {
            user = await db.getUser(username);
            if (user) {
                // 缓存用户信息
                userCache.set(cacheKey, {
                    user: user,
                    timestamp: Date.now()
                });
            }
        }
        
        if (!user) {
            return { success: false, error: '用户名或密码错误' };
        }

        const isValidPassword = await CryptoUtils.verifyPassword(password, user.password);
        if (!isValidPassword) {
            return { success: false, error: '用户名或密码错误' };
        }

        return { success: true, user };
    } catch (error) {
        console.error('用户认证失败:', error);
        return { success: false, error: '认证过程中发生错误' };
    }
}

// 创建用户会话
async function createUserSession(req, user, db) {
    try {
        // 设置会话信息
        req.session.userId = user.id;
        req.session.username = user.username;
        
        // 设置会话时间信息
        const now = Date.now();
        req.session.loginTime = now;
        req.session.lastActivity = now;
        
        // 获取会话超时配置
        const sessionTimeout = await db.getConfig('session_timeout') || '30';
        req.session.timeout = parseInt(sessionTimeout) * 60 * 1000; // 转换为毫秒
        
        // 更新最后登录时间
        await db.updateLastLogin(user.id);
        
        console.log(`用户 ${user.username} 登录成功，会话超时: ${sessionTimeout} 分钟`);
        
        // 记录登录日志（安装过程中跳过）
        const isInstalled = await db.isInstalled();
        if (isInstalled) {
            await db.addLog(user.id, 'login', '用户登录', req.ip);
        }
        
        return { success: true };
    } catch (error) {
        console.error('创建用户会话失败:', error);
        return { success: false, error: '创建会话失败' };
    }
}

// 销毁用户会话
async function destroyUserSession(req, db) {
    try {
        if (req.session.userId) {
            // 记录登出日志
            const isInstalled = await db.isInstalled();
            if (isInstalled) {
                await db.addLog(req.session.userId, 'logout', '用户登出', req.ip);
            }
            
            console.log(`用户 ${req.session.username} 登出`);
        }
        
        req.session.destroy((err) => {
            if (err) {
                console.error('销毁会话失败:', err);
            }
        });
        
        return { success: true };
    } catch (error) {
        console.error('销毁用户会话失败:', error);
        return { success: false, error: '登出失败' };
    }
}

// 密码加密
async function hashPassword(password) {
    try {
        return await CryptoUtils.hashPassword(password);
    } catch (error) {
        console.error('密码加密失败:', error);
        throw error;
    }
}

// 验证密码
async function verifyPassword(password, hashedPassword) {
    try {
        return await CryptoUtils.verifyPassword(password, hashedPassword);
    } catch (error) {
        console.error('密码验证失败:', error);
        return false;
    }
}

// 验证密码强度
function validatePassword(password) {
    if (!password) {
        return { valid: false, message: '密码不能为空' };
    }
    
    if (password.length < 6) {
        return { valid: false, message: '密码长度至少6位' };
    }
    
    // 可以添加更多密码强度验证规则
    // if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
    //     return { valid: false, message: '密码必须包含大小写字母和数字' };
    // }
    
    return { valid: true };
}

// 验证用户名
function validateUsername(username) {
    if (!username) {
        return { valid: false, message: '用户名不能为空' };
    }
    
    if (username.length < 3) {
        return { valid: false, message: '用户名长度至少3位' };
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { valid: false, message: '用户名只能包含字母、数字和下划线' };
    }
    
    return { valid: true };
}

// 检查用户权限
function checkPermission(requiredPermission) {
    return function(req, res, next) {
        // 这里可以实现基于角色的权限控制
        // 目前简单实现，所有登录用户都有权限
        if (req.session.userId) {
            next();
        } else {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ success: false, error: '权限不足' });
            }
            res.redirect('/login');
        }
    };
}

// 限制请求频率的中间件
function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    const requests = new Map();
    
    return function(req, res, next) {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        // 清理过期记录
        for (const [id, data] of requests.entries()) {
            if (now - data.firstRequest > windowMs) {
                requests.delete(id);
            }
        }
        
        // 检查当前客户端请求
        if (!requests.has(clientId)) {
            requests.set(clientId, {
                count: 1,
                firstRequest: now
            });
            next();
        } else {
            const clientData = requests.get(clientId);
            if (now - clientData.firstRequest > windowMs) {
                // 重置计数
                requests.set(clientId, {
                    count: 1,
                    firstRequest: now
                });
                next();
            } else if (clientData.count < maxRequests) {
                clientData.count++;
                next();
            } else {
                // 超过限制
                if (req.path.startsWith('/api/')) {
                    return res.status(429).json({ success: false, error: '请求过于频繁，请稍后再试' });
                }
                res.status(429).send('请求过于频繁，请稍后再试');
            }
        }
    };
}

module.exports = {
    requireAuth,
    checkInstallation,
    authenticateUser,
    createUserSession,
    destroyUserSession,
    hashPassword,
    verifyPassword,
    validatePassword,
    validateUsername,
    checkPermission,
    rateLimit
};
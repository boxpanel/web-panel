const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const CryptoUtils = require('./modules/crypto-utils');
const Database = require('./database/init');
const si = require('systeminformation');
const os = require('os');
const multer = require('multer');
const fs = require('fs');
const fsPromises = require('fs').promises; // Node.js原生异步文件系统API
const rtspRelay = require('rtsp-relay');
const HttpClient = require('./modules/http-client');
const { getOrCreateDeviceId, computeDeviceId } = require('./modules/device-id');
const { exec, spawn } = require('child_process');
const util = require('util');
const ProcessUtils = require('./modules/process-utils');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Server: IOServer } = require('socket.io');

// 引入拆分的模块
const { 
    cpuNpuData, 
    npuTiers, 
    getNpuTier, 
    detectHardware, 
    extractChipModel, 
    getCpuNpuInfo 
} = require('./modules/hardware');

const { 
    clearSystemCache, 
    optimizeMemory, 
    getDetailedMemoryInfo,
    getSystemInfo,
    getPerformanceData,
    getProcessInfo,
    formatUptime 
} = require('./modules/monitoring');



// 保留一些原有功能的兼容性
const { 
    subnetMaskToCIDR,
    getNetworkInterfaces,
    getRoutingTable,
    detectNetworkTopology,
    getNetworkConfig,
    getNetworkStats
} = require('./modules/network-native');

const { 
    requireAuth, 
    checkInstallation,
    hashPassword,
    verifyPassword 
} = require('./modules/auth');

const NetworkBridge = require('./modules/network-bridge');
const NetworkConnectivity = require('./modules/network-connectivity');

// 引入路由
const filesRouter = require('./routes/files');

// 文件上传配置 - 使用Node.js原生异步API优化
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        try {
            // 使用fs.promises.access检查目录是否存在，比existsSync更高效
            await fsPromises.access(uploadDir);
        } catch (error) {
            // 目录不存在，创建它
            try {
                await fsPromises.mkdir(uploadDir, { recursive: true });
            } catch (mkdirError) {
                return cb(mkdirError);
            }
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 使用更安全的文件名生成
        const timestamp = Date.now();
        const randomSuffix = Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}-${randomSuffix}-${sanitizedName}`);
    }
});

const upload = multer({ storage: storage });

const app = express();
const db = new Database();

// 内存优化配置
process.setMaxListeners(20); // 增加最大监听器数量
app.set('trust proxy', 1); // 信任代理，减少内存开销

// 清理未使用的模块缓存
setInterval(() => {
    // 清理require缓存中的临时模块
    Object.keys(require.cache).forEach(key => {
        if (key.includes('temp') || key.includes('tmp')) {
            delete require.cache[key];
        }
    });
}, 30 * 60 * 1000); // 每30分钟清理一次

// RTSP 配置（仅保留 rtsp-relay，不再使用 express-ws）
const { proxy, scriptUrl } = rtspRelay(app);
// 串口服务
const serialRouter = require('./routes/serial');
const SerialService = require('./modules/serial-service');

// 中间件配置
app.use(compression()); // 启用gzip压缩

// 请求限流配置
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 1000, // 限制每个IP在窗口期内最多1000个请求
    message: {
        error: '请求过于频繁，请稍后再试',
        retryAfter: '15分钟'
    },
    standardHeaders: true, // 返回rate limit信息在 `RateLimit-*` headers
    legacyHeaders: false, // 禁用 `X-RateLimit-*` headers
    skip: (req) => {
        // 跳过本地开发环境的限制
        const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
        return isLocalhost && process.env.NODE_ENV !== 'production';
    }
});

// 登录接口更宽松的限流配置
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 20, // 限制每个IP在窗口期内最多20次登录尝试
    message: {
        error: '登录尝试过于频繁，请5分钟后再试',
        retryAfter: '5分钟'
    },
    skipSuccessfulRequests: true, // 成功的请求不计入限制
});

app.use(limiter); // 应用全局限流

// 会话配置 - 必须在其他中间件之前
const sessionMiddleware = session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 // 24小时
    }
});
app.use(sessionMiddleware);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 静态资源优化配置
const staticOptions = {
    maxAge: '1d', // 1天缓存
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // 对不同类型文件设置不同缓存策略
        if (path.endsWith('.js') || path.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1天
        } else if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.gif') || path.endsWith('.svg')) {
            res.setHeader('Cache-Control', 'public, max-age=604800'); // 7天
        } else if (path.endsWith('.woff') || path.endsWith('.woff2') || path.endsWith('.ttf')) {
            res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30天
        }
    }
};

app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use(express.static(__dirname, staticOptions)); // 添加根目录静态文件服务
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));




// 测试路由 - 验证API是否正常工作
app.get('/api/test', (req, res) => {
    console.log('测试路由被访问');
    res.json({ success: true, message: 'API正常工作', timestamp: new Date().toISOString() });
});
// 轻量健康检查端点：快速返回，供前端心跳使用
app.get('/health', (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
            ok: true,
            uptime: process.uptime(),
            timestamp: Date.now()
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: 'health endpoint error' });
    }
});

// 工具函数（使用优化的ProcessUtils）
const execAsync = ProcessUtils.execCommand;

// 摄像头日志相关变量
let cameraLogs = [];
const MAX_LOGS = 100; // 最多保存100条日志

// RTSPtoWeb服务状态缓存
let lastRTSPStatus = null;
let lastRTSPStatusTime = 0;
const STATUS_CACHE_DURATION = 5000; // 5秒缓存时间

// 摄像头日志相关函数
// 添加摄像头日志
function addCameraLog(level, message) {
    const log = {
        timestamp: new Date().toISOString(),
        level: level, // 'info', 'warn', 'error'
        message: message
    };
    
    cameraLogs.unshift(log); // 添加到开头
    
    // 限制日志数量
    if (cameraLogs.length > MAX_LOGS) {
        cameraLogs = cameraLogs.slice(0, MAX_LOGS);
    }
    
    console.log(`[摄像头日志] [${level.toUpperCase()}] ${message}`);
}

// 检查RTSPtoWeb服务状态（带状态缓存）
async function checkRTSPtoWebStatus() {
    const now = Date.now();
    
    try {
        const rtspResponse = await HttpClient.get('http://localhost:8084/stream/camera/info', {
            auth: {
                username: 'demo',
                password: 'demo'
            },
            timeout: 2000
        });
        
        if (rtspResponse.data && rtspResponse.data.status !== undefined) {
            const currentStatus = rtspResponse.data.status;
            
            // 只在状态发生变化时记录日志
            if (lastRTSPStatus !== currentStatus) {
                if (currentStatus === 1) {
                    addCameraLog('info', 'RTSPtoWeb连接正常，摄像头流状态良好');
                } else {
                    addCameraLog('warn', `RTSPtoWeb连接状态异常，状态码: ${currentStatus}`);
                }
                lastRTSPStatus = currentStatus;
                lastRTSPStatusTime = now;
            }
        }
    } catch (rtspError) {
        const errorStatus = 'error';
        const errorMessage = `无法连接到RTSPtoWeb服务: ${rtspError.message}`;
        
        // 只在状态发生变化时记录错误日志
        if (lastRTSPStatus !== errorStatus || (now - lastRTSPStatusTime) > STATUS_CACHE_DURATION) {
            addCameraLog('error', errorMessage);
            lastRTSPStatus = errorStatus;
            lastRTSPStatusTime = now;
        }
    }
}

// 路由设置函数
function setupRoutes(networkBridge, networkConnectivity) {
    // 安装检查中间件将在 startServer 中设置

    // 静态文件路由
    app.use('/api/files', requireAuth, filesRouter);

    // 串口 REST 接口
    app.use('/api/serial', requireAuth, serialRouter);

    // 安装页面
    app.get('/install', async (req, res) => {
        try {
            const isInstalled = await db.isInstalled();
            if (isInstalled) {
                return res.redirect('/');
            }
            res.render('install');
        } catch (error) {
            console.error('检查安装状态失败:', error);
            res.status(500).send('服务器错误');
        }
    });

    // 处理安装
    app.post('/install', async (req, res) => {
        try {
            const { username, password, server_port } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
            }

            const hashedPassword = await hashPassword(password);
            
            await db.createUser(username, hashedPassword);
            await db.setConfig('server_port', server_port || '3000');
            // 生成并保存设备识别码（安装时创建，稳定且唯一）
            try {
                const deviceId = await computeDeviceId();
                await db.saveConfig('device_id', deviceId);
            } catch (e) {
                console.error('生成设备识别码失败:', e);
            }
            await db.markAsInstalled();

            res.json({ success: true, message: '安装完成' });
        } catch (error) {
            console.error('安装失败:', error);
            res.status(500).json({ success: false, message: '安装失败: ' + error.message });
        }
    });

    // 登录页面
    app.get('/login', async (req, res) => {
        try {
            const isInstalled = await db.isInstalled();
            if (!isInstalled) {
                return res.redirect('/install');
            }
            
            // 从数据库获取系统名称
            const systemName = await db.getConfig('systemName') || 'Linux服务器管理面板';
            res.render('login', { systemName: systemName });
        } catch (error) {
            console.error('检查安装状态失败:', error);
            res.status(500).send('服务器错误');
        }
    });

    // 处理登录
    app.post('/login', loginLimiter, async (req, res) => {
        try {
            const { username, password } = req.body;
            
            // 从数据库获取系统名称
            const systemName = await db.getConfig('systemName') || 'Linux服务器管理面板';
            
            // 快速验证输入
            if (!username || !password) {
                return res.render('login', { 
                    systemName: systemName,
                    error: '用户名和密码不能为空'
                });
            }
            
            const user = await db.getUser(username);
            const passwordValid = user ? await verifyPassword(password, user.password) : false;
            
            if (user && passwordValid) {
                req.session.userId = user.id;
                req.session.username = user.username;
                
                // 异步记录成功日志，不阻塞响应
                setImmediate(() => {
                    db.addLog({
                        userId: req.session?.userId,
                        type: 'auth',
                        action: '用户登录',
                        details: `用户 ${username} 登录成功`,
                        ip: req.ip
                    }).catch(err => console.error('记录登录日志失败:', err));
                });
                
                res.redirect('/');
            } else {
                // 异步记录失败日志，不阻塞响应
                setImmediate(() => {
                    db.addLog({
                        userId: req.session?.userId,
                        type: 'auth',
                        action: '登录失败',
                        details: `用户 ${username} 登录失败`,
                        ip: req.ip
                    }).catch(err => console.error('记录登录日志失败:', err));
                });
                
                // 重新渲染登录页面并显示错误信息
                res.status(401).render('login', { 
                    systemName: systemName,
                    error: '用户名或密码错误，请重新输入'
                });
            }
        } catch (error) {
            console.error('登录失败:', error);
            res.status(500).render('login', { 
                systemName: systemName,
                error: '登录失败，请稍后重试'
            });
        }
    });

    // 登出
    app.post('/logout', (req, res) => {
        try {
            const username = req.session?.username || 'unknown';
            const userId = req.session?.userId;
            
            // 记录登出日志（异步，不阻塞响应）
            if (userId) {
                setImmediate(() => {
                    db.addLog({
                        userId: userId,
                        type: 'auth',
                        action: '登出',
                        details: `用户 ${username} 登出`,
                        ip: req.ip || req.connection.remoteAddress
                    }).catch(err => console.error('记录登出日志失败:', err));
                });
            }
            
            // 销毁会话
            req.session.destroy((err) => {
                if (err) {
                    console.error('会话销毁失败:', err);
                    // 即使会话销毁失败，也要重定向到登录页面
                    return res.redirect('/login');
                }
                console.log(`用户 ${username} 成功登出`);
                res.redirect('/login');
            });
            
        } catch (error) {
            console.error('登出处理异常:', error);
            // 发生异常时，尝试清除会话并重定向
            try {
                req.session.destroy(() => {
                    res.redirect('/login');
                });
            } catch (destroyError) {
                console.error('强制会话销毁失败:', destroyError);
                res.redirect('/login');
            }
        }
    });

    // 主页
    app.get('/', requireAuth, async (req, res) => {
        try {
            const systemInfo = await getSystemInfo();
            const performanceData = await getPerformanceData();
            
            // 获取系统设置
            const [systemName, serverPort, sessionTimeout] = await Promise.all([
                db.getConfig('systemName'),
                db.getConfig('server_port'),
                db.getConfig('session_timeout')
            ]);
            const deviceId = await getOrCreateDeviceId(db);

            const systemSettings = {
                systemName: systemName || 'Linux服务器管理面板',
                serverPort: serverPort || '3000',
                sessionTimeout: sessionTimeout || '30',
                deviceId
            };
            
            res.render('dashboard', {
                username: req.session.username,
                systemInfo,
                performanceData,
                systemSettings
            });
        } catch (error) {
            console.error('获取系统信息失败:', error);
            res.render('dashboard', {
                username: req.session.username,
                systemInfo: null,
                performanceData: null,
                systemSettings: {
                    systemName: 'Linux服务器管理面板',
                    serverPort: '3000',
                    sessionTimeout: '30'
                },
                error: '获取系统信息失败'
            });
        }
    });

    // API 路由
    app.get('/api/system-info', requireAuth, async (req, res) => {
        try {
            const [cpu, mem, currentLoad, fsSize] = await Promise.all([
                si.cpu(),
                si.mem(),
                si.currentLoad(),
                si.fsSize()
            ]);

            res.json({
                memory: {
                    total: Math.round(mem.total / 1024 / 1024), // MB，与monitoring.js保持一致
                    used: Math.round(mem.used / 1024 / 1024), // MB
                    free: Math.round(mem.free / 1024 / 1024), // MB
                    available: Math.round(mem.available / 1024 / 1024), // MB
                    usage: Math.round(mem.used / mem.total * 100)
                },
                cpu: {
                    brand: cpu.brand || cpu.manufacturer || '未知CPU',
                    usage: Math.round(currentLoad.currentLoad)
                },
                // 返回更详细的磁盘信息，单位为 GB
                disk: fsSize.map(disk => ({
                    fs: disk.fs,
                    type: disk.type,
                    size: Math.round(disk.size / 1024 / 1024 / 1024), // GB
                    used: Math.round(disk.used / 1024 / 1024 / 1024), // GB
                    available: Math.round(disk.available / 1024 / 1024 / 1024), // GB
                    usePercent: Math.round(disk.use),
                    mount: disk.mount
                })),
                uptime: formatUptime(os.uptime()) // 添加实时运行时间
            });
        } catch (error) {
            console.error('获取系统信息API失败:', error);
            res.status(500).json({ error: '获取系统信息失败' });
        }
    });

    app.get('/api/performance', requireAuth, async (req, res) => {
        try {
            const performanceData = await getPerformanceData();
            res.json(performanceData);
        } catch (error) {
            console.error('获取性能数据失败:', error);
            res.status(500).json({ error: '获取性能数据失败' });
        }
    });

    app.get('/api/processes', requireAuth, async (req, res) => {
        try {
            console.log('开始获取进程信息...');
            const processes = await si.processes();
            console.log('成功获取进程信息，进程数量:', processes.list ? processes.list.length : 0);
            
            if (!processes.list || processes.list.length === 0) {
                console.log('进程列表为空');
                res.json([]);
                return;
            }
            
            // 获取前20个进程，按CPU使用率排序
            const topProcesses = processes.list
                .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
                .slice(0, 20)
                .map(proc => ({
                    pid: proc.pid || 0,
                    name: proc.name || 'Unknown',
                    cpu: proc.cpu ? proc.cpu.toFixed(1) : '0.0',
                    memory: proc.memRss ? (proc.memRss / 1024 / 1024).toFixed(1) : '0.0',
                    state: proc.state || 'unknown'
                }));
            
            console.log('返回进程数量:', topProcesses.length);
            res.json(topProcesses);
        } catch (error) {
            console.error('获取进程信息失败:', error.message);
            console.error('错误详情:', error);
            res.status(500).json({ error: '获取进程信息失败: ' + error.message });
        }
    });

    // 系统优化 API
    app.post('/api/clear-cache', requireAuth, async (req, res) => {
        try {
            const result = await clearSystemCache();
            
            await db.addLog({
                userId: req.session?.userId,
                type: 'system',
                action: '清理系统缓存',
                details: result.message,
                ip: req.ip
            });
            
            res.json(result);
        } catch (error) {
            console.error('清理缓存失败:', error);
            const msg = (error && (error.message || String(error))) || '未知错误';
            res.status(500).json({ success: false, message: '清理缓存失败: ' + msg });
        }
    });

    app.post('/api/optimize-memory', requireAuth, async (req, res) => {
        try {
            const result = await optimizeMemory();
            
            await db.addLog({
                userId: req.session?.userId,
                type: 'system',
                action: '内存优化',
                details: result.message,
                ip: req.ip
            });
            
            res.json(result);
        } catch (error) {
            console.error('内存优化失败:', error);
            const msg = (error && (error.message || String(error))) || '未知错误';
            res.status(500).json({ success: false, message: '内存优化失败: ' + msg });
        }
    });

    // 网络配置 API
    app.post('/api/network/ip-forwarding', requireAuth, async (req, res) => {
        try {
            const { enable } = req.body;
            const result = enable ? await enableIPForwarding() : await disableIPForwarding();
            
            await db.addLog({
                userId: req.session?.userId,
                type: 'network',
                action: enable ? '启用IP转发' : '禁用IP转发',
                details: result.message,
                ip: req.ip
            });
            
            res.json(result);
        } catch (error) {
            console.error('配置IP转发失败:', error);
            res.status(500).json({ success: false, message: '配置IP转发失败: ' + error.message });
        }
    });

    app.post('/api/network/masquerade', requireAuth, async (req, res) => {
        try {
            const { enable, inInterface, outInterface } = req.body;
            const result = await configureMasquerade(enable, inInterface, outInterface);
            
            await db.addLog({
                userId: req.session?.userId,
                type: 'network',
                action: enable ? '启用MASQUERADE' : '禁用MASQUERADE',
                details: `接口: ${inInterface} -> ${outInterface}, 结果: ${result.message}`,
                ip: req.ip
            });
            
            res.json(result);
        } catch (error) {
            console.error('配置MASQUERADE失败:', error);
            res.status(500).json({ success: false, message: '配置MASQUERADE失败: ' + error.message });
        }
    });

    // 网络信息 API
    app.get('/api/network-info', requireAuth, async (req, res) => {
        try {
            const result = await getNetworkInterfaces();
            
            if (!result.success) {
                return res.status(500).json({ success: false, error: result.error });
            }
            
            // 处理网络接口信息
            const interfaces = result.interfaces.map(iface => {
                // 检测接口类型
                let interfaceType = 'ethernet';
                const name = iface.name.toLowerCase();
                
                if (name.includes('wifi') || name.includes('wlan') || name.includes('wireless')) {
                    interfaceType = 'wifi';
                } else if (name.includes('eth') || name.includes('ethernet')) {
                    interfaceType = 'ethernet';
                } else if (name.includes('usb') || name.includes('rndis')) {
                    interfaceType = 'usb';
                } else if (name.includes('ppp') || name.includes('dial')) {
                    interfaceType = 'ppp';
                } else if (name.includes('tun') || name.includes('tap')) {
                    interfaceType = 'tunnel';
                } else if (name.includes('bridge') || name.includes('br')) {
                    interfaceType = 'bridge';
                } else if (name.includes('vlan')) {
                    interfaceType = 'vlan';
                }
                
                return {
                    name: iface.name,
                    ip: iface.ip4 || iface.ip6,
                    status: iface.status || (iface.connected ? 'up' : 'down'),
                    type: interfaceType,
                    mac: iface.mac,
                    connected: iface.connected
                };
            });
            
            res.json({ success: true, interfaces });
        } catch (error) {
            console.error('获取网络信息失败:', error);
            res.status(500).json({ success: false, error: '获取网络信息失败' });
        }
    });



    // 获取网络接口信息
    app.get('/api/network-interfaces', requireAuth, async (req, res) => {
        try {
            const result = await getNetworkInterfaces();
            
            if (!result.success) {
                return res.status(500).json({ error: result.error || '获取网络接口信息失败' });
            }
            
            const interfaces = result.interfaces;
            
            if (!interfaces || !Array.isArray(interfaces)) {
                return res.status(500).json({ error: '获取网络接口信息失败' });
            }
            
            // 获取所有已存在的桥接，提取已使用的接口
            const existingBridges = await db.getAllBridges();
            const usedInterfaces = new Set();
            
            existingBridges.forEach(bridge => {
                if (bridge.target_interfaces && Array.isArray(bridge.target_interfaces)) {
                    bridge.target_interfaces.forEach(interfaceName => {
                        usedInterfaces.add(interfaceName);
                    });
                }
            });
            
            // 过滤并格式化网络接口信息
            const formattedInterfaces = await Promise.all(
                interfaces
                    .filter(iface => iface.name && !iface.internal) // 排除内部接口
                    .map(async (iface) => {
                        // 检查接口是否被桥接使用
                        const isBridged = usedInterfaces.has(iface.name);
                        
                        // 获取桥接模式状态
                        const bridgeModeEnabled = await db.getConfig(`bridge_mode_${iface.name}`) === 'true';
                        
                        // 如果启用桥接模式，获取连接设备
                        let connectedDevices = [];
                        if (bridgeModeEnabled && os.platform() === 'linux') {
                            const { exec } = require('child_process');
                            try {
                                await new Promise((resolve, reject) => {
                                    exec(`arp -a | grep -E "([0-9]{1,3}\.){3}[0-9]{1,3}" | awk '{print $2}' | tr -d '()' | head -5`, (error, stdout, stderr) => {
                                        if (!error && stdout.trim()) {
                                            const ips = stdout.trim().split('\n').filter(ip => ip && ip !== '127.0.0.1');
                                            connectedDevices = ips;
                                        }
                                        resolve();
                                    });
                                });
                            } catch (error) {
                                console.error('获取连接设备失败:', error);
                            }
                        }
                        
                        // 检测IP模式
                        let ipMode = 'dhcp'; // 默认为DHCP
                        try {
                            const { exec } = require('child_process');
                            const util = require('util');
                            const execAsync = ProcessUtils.execCommand;
                            
                            // 根据操作系统选择不同的检测方法
                            if (os.platform() === 'win32') {
                                // Windows环境：使用netsh命令检测
                                try {
                                    const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
                                    const result = await execAsync(`netsh interface ip show config name="${iface.name}"`, { env, encoding: 'utf8' });
                                    const output = result.stdout;
                                    
                                    // DHCP检测逻辑
                                    const dhcpEnabledMatch = output.match(/DHCP\s*(?:enabled|已启用)[:\s]*([YesNo是否]+)/i);
                                    const dhcpConfigMatch = output.match(/Configuration for interface[^:]*:\s*DHCP/i);
                                    const staticConfigMatch = output.match(/Statically Configured/i);
                                    
                                    if (dhcpEnabledMatch) {
                                        const dhcpValue = dhcpEnabledMatch[1].toLowerCase();
                                        if (dhcpValue.includes('yes') || dhcpValue.includes('是')) {
                                            ipMode = 'dhcp';
                                        } else if (dhcpValue.includes('no') || dhcpValue.includes('否')) {
                                            ipMode = 'static';
                                        }
                                    } else if (dhcpConfigMatch) {
                                        ipMode = 'dhcp';
                                    } else if (staticConfigMatch) {
                                        ipMode = 'static';
                                    } else {
                                        // 备用PowerShell检测
                                        try {
                                            const psCommand = `Get-NetIPConfiguration -InterfaceAlias "${iface.name}" | Select-Object -ExpandProperty IPv4Address | Select-Object -ExpandProperty PrefixOrigin`;
                                            const psResult = await execAsync(`powershell -Command "${psCommand}"`, { encoding: 'utf8' });
                                            
                                            if (psResult.stdout.includes('Dhcp')) {
                                                ipMode = 'dhcp';
                                            } else if (psResult.stdout.includes('Manual')) {
                                                ipMode = 'static';
                                            }
                                        } catch (psError) {
                                            // 智能推断
                                            ipMode = inferIPModeFromAddress(iface.ip, iface.gateway);
                                        }
                                    }
                                } catch (winError) {
                                    // 智能推断
                                    ipMode = inferIPModeFromAddress(iface.address, iface.gateway);
                                }
                            } else {
                                // Linux环境：使用nmcli命令检测
                                try {
                                    const result = await execAsync(`nmcli connection show "${iface.name}" | grep ipv4.method`);
                                    if (result.stdout.includes('manual')) {
                                        ipMode = 'static';
                                    } else if (result.stdout.includes('auto')) {
                                        ipMode = 'dhcp';
                                    }
                                } catch (nmcliError) {
                                    // 智能推断
                                    ipMode = inferIPModeFromAddress(iface.address, iface.gateway);
                                }
                            }
                        } catch (error) {
                            // 智能推断
                            ipMode = inferIPModeFromAddress(iface.address, iface.gateway);
                        }
                        
                        // 摄像头功能已移除
                        const cameraEnabled = false;
                        
                        // 检查接口是否已被桥接使用
                        const isUsed = usedInterfaces.has(iface.name);

                        return {
                            name: iface.name,
                            ip: iface.ip || null,
                            mac: iface.mac,
                            type: iface.type || 'ethernet',
                            speed: iface.speed || null,
                            operstate: iface.status,
                            status: iface.status,
                            ipMode: ipMode,
                            cameraEnabled: cameraEnabled,
                            bridgeMode: bridgeModeEnabled,
                            connectedDevices: connectedDevices,
                            isUsed: isUsed,
                            isBridged: isBridged // 添加桥接状态标识
                        };
                    })
            );
            
            // 智能推断函数
            function inferIPModeFromAddress(ip, gw) {
                if (!ip) return 'dhcp';
                
                const commonStaticRanges = [
                    /^192\.168\.1\.(1|2|3|4|5|10|100|200)$/,
                    /^10\.0\.0\.(1|2|3|4|5|10|100|200)$/,
                    /^172\.16\.0\.(1|2|3|4|5|10|100|200)$/
                ];
                
                const commonDHCPRanges = [
                    /^192\.168\.1\.(1[0-9][0-9]|2[0-4][0-9]|25[0-5])$/,
                    /^192\.168\.0\.(1[0-9][0-9]|2[0-4][0-9]|25[0-5])$/,
                    /^10\.0\.0\.(1[0-9][0-9]|2[0-4][0-9]|25[0-5])$/
                ];
                
                if (commonStaticRanges.some(regex => regex.test(ip))) {
                    return 'static';
                }
                
                if (commonDHCPRanges.some(regex => regex.test(ip))) {
                    return 'dhcp';
                }
                
                if (gw && ip) {
                    const ipParts = ip.split('.');
                    const gwParts = gw.split('.');
                    if (ipParts.slice(0, 3).join('.') === gwParts.slice(0, 3).join('.')) {
                        const lastOctet = parseInt(ipParts[3]);
                        if (lastOctet <= 10) {
                            return 'static';
                        }
                    }
                }
                
                return 'dhcp';
            }
            
            res.json({ interfaces: formattedInterfaces });
        } catch (error) {
            console.error('获取网络接口失败:', error);
            res.status(500).json({ error: '获取网络接口失败' });
        }
    });

    // 获取主机网络配置（用于自动填充静态IP设置）
    app.get('/api/host-network-config', requireAuth, async (req, res) => {
        try {
            console.log('开始获取主机网络配置...');
            const networkInterfaces = os.networkInterfaces();
            console.log('可用网络接口:', Object.keys(networkInterfaces));
            
            let primaryInterface = null;
            let hostConfig = {
                ip: '',
                netmask: '',
                gateway: ''
            };

            // 查找主要的网络接口（非回环、有IP地址的接口）
            // 优先选择本地网络接口，避免选择VPN接口
            const interfaceEntries = Object.entries(networkInterfaces);
            const localInterfaces = [];
            const vpnInterfaces = [];
            
            for (const [name, interfaces] of interfaceEntries) {
                console.log(`检查接口 ${name}:`, interfaces);
                
                if (name.toLowerCase().includes('loopback') || name.toLowerCase().includes('lo')) {
                    console.log(`跳过回环接口: ${name}`);
                    continue;
                }
                
                // 检查是否为VPN接口
                const isVpnInterface = name.toLowerCase().includes('tailscale') || 
                                     name.toLowerCase().includes('vmware') || 
                                     name.toLowerCase().includes('virtualbox') ||
                                     name.toLowerCase().includes('vpn') ||
                                     name.toLowerCase().includes('tunnel');
                
                for (const iface of interfaces) {
                    console.log(`检查接口 ${name} 的配置:`, iface);
                    if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
                        const interfaceInfo = {
                            name: name,
                            ...iface
                        };
                        
                        if (isVpnInterface) {
                            console.log(`发现VPN接口: ${name}, IP: ${iface.address}`);
                            vpnInterfaces.push(interfaceInfo);
                        } else {
                            console.log(`发现本地接口: ${name}, IP: ${iface.address}`);
                            localInterfaces.push(interfaceInfo);
                        }
                    }
                }
            }
            
            // 优先选择本地接口，如果没有本地接口则选择VPN接口
            const availableInterfaces = localInterfaces.length > 0 ? localInterfaces : vpnInterfaces;
            if (availableInterfaces.length > 0) {
                primaryInterface = availableInterfaces[0];
                hostConfig.ip = primaryInterface.address;
                hostConfig.netmask = primaryInterface.netmask;
                console.log(`选择主要接口: ${primaryInterface.name}, IP: ${primaryInterface.address}, 子网掩码: ${primaryInterface.netmask}`);
            } else {
                console.log('未找到可用的网络接口');
            }

            // 获取默认网关
            try {
                console.log('开始获取默认网关...');
                if (os.platform() === 'win32') {
                    console.log('检测到Windows系统，使用route命令获取默认网关');
                    // Windows: 使用route命令获取默认网关
                    const result = await execAsync('route print 0.0.0.0');
                    console.log('route命令执行结果:', result.stdout.substring(0, 500) + '...');
                    const lines = result.stdout.split('\n');
                    
                    for (const line of lines) {
                        if (line.includes('0.0.0.0') && line.includes('0.0.0.0')) {
                            console.log('找到默认路由行:', line);
                            const parts = line.trim().split(/\s+/);
                            console.log('路由行解析结果:', parts);
                            if (parts.length >= 3) {
                                const gateway = parts[2];
                                console.log('提取的网关地址:', gateway);
                                // 验证是否为有效IP地址
                                if (/^(\d{1,3}\.){3}\d{1,3}$/.test(gateway) && gateway !== '0.0.0.0') {
                                    hostConfig.gateway = gateway;
                                    console.log('成功设置网关地址:', gateway);
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    // Linux/macOS: 使用ip route或route命令
                    try {
                        const result = await execAsync('ip route show default');
                        const match = result.stdout.match(/default via (\d+\.\d+\.\d+\.\d+)/);
                        if (match) {
                            hostConfig.gateway = match[1];
                        }
                    } catch (error) {
                        // 如果ip命令失败，尝试route命令
                        const result = await execAsync('route -n get default');
                        const match = result.stdout.match(/gateway: (\d+\.\d+\.\d+\.\d+)/);
                        if (match) {
                            hostConfig.gateway = match[1];
                        }
                    }
                }
            } catch (error) {
                console.warn('获取默认网关失败:', error.message);
                // 如果无法获取网关，尝试推测
                if (hostConfig.ip && hostConfig.netmask) {
                    const ipParts = hostConfig.ip.split('.');
                    const maskParts = hostConfig.netmask.split('.');
                    
                    // 计算网络地址并推测网关（通常是网络地址+1）
                    const networkParts = ipParts.map((part, index) => 
                        parseInt(part) & parseInt(maskParts[index])
                    );
                    networkParts[3] = networkParts[3] + 1;
                    hostConfig.gateway = networkParts.join('.');
                }
            }

            console.log('获取主机网络配置:', hostConfig);
            res.json({
                success: true,
                config: hostConfig,
                interface: primaryInterface ? primaryInterface.name : null
            });

        } catch (error) {
            console.error('获取主机网络配置失败:', error);
            res.status(500).json({ 
                success: false,
                error: '获取主机网络配置失败',
                config: {
                    ip: '',
                    netmask: '',
                    gateway: ''
                }
            });
        }
    });

    // 获取主机网络配置（测试端点，无需认证）
    app.get('/api/test/host-network-config', async (req, res) => {
        try {
            console.log('开始获取主机网络配置（测试端点）...');
            const networkInterfaces = os.networkInterfaces();
            console.log('可用网络接口:', Object.keys(networkInterfaces));
            
            let primaryInterface = null;
            let hostConfig = {
                ip: '',
                netmask: '',
                gateway: ''
            };

            // 查找主要的网络接口（非回环、有IP地址的接口）
            // 优先选择本地网络接口，避免选择VPN接口
            const interfaceEntries = Object.entries(networkInterfaces);
            const localInterfaces = [];
            const vpnInterfaces = [];
            
            for (const [name, interfaces] of interfaceEntries) {
                console.log(`检查接口 ${name}:`, interfaces);
                
                if (name.toLowerCase().includes('loopback') || name.toLowerCase().includes('lo')) {
                    console.log(`跳过回环接口: ${name}`);
                    continue;
                }
                
                // 检查是否为VPN接口
                const isVpnInterface = name.toLowerCase().includes('tailscale') || 
                                     name.toLowerCase().includes('vmware') || 
                                     name.toLowerCase().includes('virtualbox') ||
                                     name.toLowerCase().includes('vpn') ||
                                     name.toLowerCase().includes('tunnel');
                
                for (const iface of interfaces) {
                    console.log(`检查接口 ${name} 的配置:`, iface);
                    if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
                        const interfaceInfo = {
                            name: name,
                            ...iface
                        };
                        
                        if (isVpnInterface) {
                            console.log(`发现VPN接口: ${name}, IP: ${iface.address}`);
                            vpnInterfaces.push(interfaceInfo);
                        } else {
                            console.log(`发现本地接口: ${name}, IP: ${iface.address}`);
                            localInterfaces.push(interfaceInfo);
                        }
                    }
                }
            }
            
            // 优先选择本地接口，如果没有本地接口则选择VPN接口
            const availableInterfaces = localInterfaces.length > 0 ? localInterfaces : vpnInterfaces;
            if (availableInterfaces.length > 0) {
                primaryInterface = availableInterfaces[0];
                hostConfig.ip = primaryInterface.address;
                hostConfig.netmask = primaryInterface.netmask;
                console.log(`选择主要接口: ${primaryInterface.name}, IP: ${primaryInterface.address}, 子网掩码: ${primaryInterface.netmask}`);
            } else {
                console.log('未找到可用的网络接口');
            }

            // 获取默认网关
            try {
                console.log('开始获取默认网关...');
                if (os.platform() === 'win32') {
                    console.log('检测到Windows系统，使用route命令获取默认网关');
                    // Windows: 使用route命令获取默认网关
                    const result = await execAsync('route print 0.0.0.0');
                    console.log('route命令执行结果:', result.stdout.substring(0, 500) + '...');
                    const lines = result.stdout.split('\n');
                    
                    for (const line of lines) {
                        if (line.includes('0.0.0.0') && line.includes('0.0.0.0')) {
                            console.log('找到默认路由行:', line);
                            const parts = line.trim().split(/\s+/);
                            console.log('路由行解析结果:', parts);
                            if (parts.length >= 3) {
                                const gateway = parts[2];
                                console.log('提取的网关地址:', gateway);
                                // 验证是否为有效IP地址
                                if (/^(\d{1,3}\.){3}\d{1,3}$/.test(gateway) && gateway !== '0.0.0.0') {
                                    hostConfig.gateway = gateway;
                                    console.log('成功设置网关地址:', gateway);
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    // Linux/macOS: 使用ip route或route命令
                    try {
                        const result = await execAsync('ip route show default');
                        const match = result.stdout.match(/default via (\d+\.\d+\.\d+\.\d+)/);
                        if (match) {
                            hostConfig.gateway = match[1];
                        }
                    } catch (error) {
                        // 如果ip命令失败，尝试route命令
                        const result = await execAsync('route -n get default');
                        const match = result.stdout.match(/gateway: (\d+\.\d+\.\d+\.\d+)/);
                        if (match) {
                            hostConfig.gateway = match[1];
                        }
                    }
                }
            } catch (error) {
                console.warn('获取默认网关失败:', error.message);
                // 如果无法获取网关，尝试推测
                if (hostConfig.ip && hostConfig.netmask) {
                    const ipParts = hostConfig.ip.split('.');
                    const maskParts = hostConfig.netmask.split('.');
                    
                    // 计算网络地址并推测网关（通常是网络地址+1）
                    const networkParts = ipParts.map((part, index) => 
                        parseInt(part) & parseInt(maskParts[index])
                    );
                    networkParts[3] = networkParts[3] + 1;
                    hostConfig.gateway = networkParts.join('.');
                }
            }

            console.log('获取主机网络配置（测试端点）:', hostConfig);
            res.json({
                success: true,
                config: hostConfig,
                interface: primaryInterface ? primaryInterface.name : null,
                debug: {
                    localInterfaces: localInterfaces.map(i => ({ name: i.name, ip: i.address })),
                    vpnInterfaces: vpnInterfaces.map(i => ({ name: i.name, ip: i.address })),
                    selectedInterface: primaryInterface ? primaryInterface.name : null
                }
            });

        } catch (error) {
            console.error('获取主机网络配置失败（测试端点）:', error);
            res.status(500).json({ 
                success: false,
                error: '获取主机网络配置失败',
                config: {
                    ip: '',
                    netmask: '',
                    gateway: ''
                }
            });
        }
    });

    // ==================== 网络桥接 API ====================
    
    // 创建桥接
    app.post('/api/network-bridge/create', requireAuth, async (req, res) => {
        try {
            const { bridgeName, targetInterfaces, bridgeType = 'bridge', ipConfig } = req.body;
            
            // 验证必填字段
            if (!bridgeName || !targetInterfaces || !Array.isArray(targetInterfaces) || targetInterfaces.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: '缺少必填字段或目标接口为空' 
                });
            }
            
            // 验证桥接名称格式
            if (!/^[a-zA-Z0-9_-]+$/.test(bridgeName)) {
                return res.status(400).json({ 
                    success: false, 
                    error: '桥接名称只能包含字母、数字、下划线和连字符' 
                });
            }
            
            // 验证IP配置
            if (ipConfig && ipConfig.type === 'static') {
                if (!ipConfig.staticIp || !ipConfig.staticIp.address || !ipConfig.staticIp.netmask || !ipConfig.staticIp.gateway) {
                    return res.status(400).json({ 
                        success: false, 
                        error: '静态IP配置不完整' 
                    });
                }
                
                // 简单的IP地址格式验证
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                if (!ipRegex.test(ipConfig.staticIp.address) || 
                    !ipRegex.test(ipConfig.staticIp.netmask) || 
                    !ipRegex.test(ipConfig.staticIp.gateway)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'IP地址格式不正确' 
                    });
                }
            }
            
            const result = await networkBridge.createBridge(bridgeName, targetInterfaces, bridgeType, ipConfig);
            
            if (result.success) {
                res.json({ 
                    success: true, 
                    message: '桥接创建成功',
                    bridge: result.bridge
                });
            } else {
                res.status(500).json({ 
                    success: false, 
                    error: result.error 
                });
            }
        } catch (error) {
            console.error('创建桥接失败:', error);
            res.status(500).json({ 
                success: false, 
                error: '创建桥接失败: ' + error.message 
            });
        }
    });
    
    // 获取桥接列表
    app.get('/api/network-bridge/list', requireAuth, async (req, res) => {
        try {
            const result = await networkBridge.listBridges();
            
            if (result.success) {
                res.json({ 
                    success: true, 
                    bridges: result.bridges 
                });
            } else {
                res.status(500).json({ 
                    success: false, 
                    error: result.error 
                });
            }
        } catch (error) {
            console.error('获取桥接列表失败:', error);
            res.status(500).json({ 
                success: false, 
                error: '获取桥接列表失败: ' + error.message 
            });
        }
    });
    
    // 删除桥接
    app.delete('/api/network-bridge/:bridgeName', requireAuth, async (req, res) => {
        try {
            const { bridgeName } = req.params;
            
            if (!bridgeName) {
                return res.status(400).json({ 
                    success: false, 
                    error: '缺少桥接名称' 
                });
            }
            
            const result = await networkBridge.deleteBridge(bridgeName);
            
            if (result.success) {
                res.json({ 
                    success: true, 
                    message: '桥接删除成功' 
                });
            } else {
                res.status(500).json({ 
                    success: false, 
                    error: result.error 
                });
            }
        } catch (error) {
            console.error('删除桥接失败:', error);
            res.status(500).json({ 
                success: false, 
                error: '删除桥接失败: ' + error.message 
            });
        }
    });

    // 获取桥接详情
    app.get('/api/network-bridge/details/:bridgeName', requireAuth, async (req, res) => {
        try {
            const { bridgeName } = req.params;
            
            if (!bridgeName) {
                return res.status(400).json({ 
                    success: false, 
                    error: '缺少桥接名称' 
                });
            }
            
            // 获取桥接状态
            const statusResult = await networkBridge.checkBridgeStatus(bridgeName);
            
            if (!statusResult.success) {
                return res.status(404).json({ 
                    success: false, 
                    error: '桥接不存在或获取状态失败' 
                });
            }
            
            // 获取桥接详细信息
            const bridges = await networkBridge.getActiveBridges();
            const bridge = bridges.find(b => b.id === bridgeName || b.name === bridgeName);
            
            if (!bridge) {
                return res.status(404).json({ 
                    success: false, 
                    error: '桥接不存在' 
                });
            }
            
            // 返回详细信息
            res.json({ 
                success: true, 
                bridge: {
                    ...bridge,
                    status: statusResult.status || bridge.status,
                    details: statusResult.details || {}
                }
            });
            
        } catch (error) {
            console.error('获取桥接详情失败:', error);
            res.status(500).json({ 
                success: false, 
                error: '获取桥接详情失败: ' + error.message 
            });
        }
    });



    // 获取单个摄像头状态API
    app.get('/api/camera/status/:interfaceName', requireAuth, async (req, res) => {
        try {
            const { interfaceName } = req.params;
            
            if (!interfaceName) {
                return res.status(400).json({ 
                    success: false, 
                    error: '缺少接口名称参数' 
                });
            }
            
            // 验证网络接口是否存在
            const interfacesResult = await getNetworkInterfaces();
            if (!interfacesResult.success) {
                return res.status(500).json({ 
                    success: false, 
                    error: '获取网络接口失败' 
                });
            }
            
            const targetInterface = interfacesResult.interfaces.find(iface => iface.name === interfaceName);
            
            if (!targetInterface) {
                return res.status(404).json({ 
                    success: false, 
                    error: '网络接口不存在' 
                });
            }
            
            // 摄像头功能已移除
            res.json({
                success: true,
                interfaceName: interfaceName,
                state: null
            });
            
        } catch (error) {
            console.error('获取摄像头状态失败:', error);
            res.status(500).json({ 
                success: false, 
                error: '获取摄像头状态失败',
                details: error.message 
            });
        }
    });

    // 获取所有摄像头状态
    app.get('/api/camera-states', requireAuth, async (req, res) => {
        try {
            // 摄像头功能已移除
            res.json({ 
                success: true, 
                states: {} 
            });
        } catch (error) {
            console.error('获取摄像头状态失败:', error);
            res.status(500).json({ error: '获取摄像头状态失败' });
        }
    });

    // 自动连接状态API已移除

    // 状态同步API（已移除）
    app.post('/api/sync-states', requireAuth, async (req, res) => {
        try {
            // 摄像头功能已移除
            res.json({ 
                success: true, 
                message: '状态同步功能已移除',
                validation: null
            });
        } catch (error) {
            console.error('状态同步失败:', error);
            res.status(500).json({ error: '状态同步失败' });
        }
    });

    // 内存优化API - 执行内存清理
app.post('/api/memory/optimize', requireAuth, async (req, res) => {
    try {
        console.log('开始执行内存优化...');
        const result = await optimizeMemory();
        console.log('内存优化结果:', result);
        res.json(result);
    } catch (error) {
        console.error('内存优化失败:', error);
        const msg = (error && (error.message || String(error))) || '未知错误';
        res.status(500).json({ error: '内存优化失败: ' + msg });
    }
});

// 修改用户密码
app.post('/api/user/password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        // 验证必填字段
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: '所有密码字段都不能为空' });
        }
        
        // 验证新密码长度
        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码长度至少6位' });
        }
        
        // 验证新密码确认
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: '新密码与确认密码不匹配' });
        }
        
        // 获取当前用户信息
        const user = await db.getUserById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        // 验证当前密码
        const isCurrentPasswordValid = await CryptoUtils.verifyPassword(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ error: '当前密码不正确' });
        }
        
        // 加密新密码
        const hashedNewPassword = await CryptoUtils.hashPassword(newPassword);
        
        // 更新密码
        await db.updateUserPassword(req.session.userId, hashedNewPassword);
        
        // 记录日志（安装过程中跳过）
        const isInstalled = await db.isInstalled();
        if (isInstalled) {
            await db.addLog(req.session.userId, '修改密码', '用户修改了登录密码', req.ip);
        }
        
        res.json({ success: true, message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ error: '修改密码失败' });
    }
});

// 网络接口详细信息API
app.get('/api/network-interface-details', requireAuth, async (req, res) => {
    try {
        const interfaceName = req.query.interface;
        
        if (!interfaceName) {
            return res.status(400).json({ error: '缺少接口名称参数' });
        }
        const [interfacesResult, stats] = await Promise.all([
            getNetworkInterfaces(),
            getNetworkStats(interfaceName)
        ]);
        
        // 检查网络接口获取是否成功
        if (!interfacesResult.success) {
            return res.status(500).json({ error: interfacesResult.error || '获取网络接口失败' });
        }
        
        const interfaces = interfacesResult.interfaces;
        if (!interfaces || !Array.isArray(interfaces)) {
            return res.status(500).json({ error: '网络接口数据格式错误' });
        }
        
        // 查找指定接口
        const targetInterface = interfaces.find(iface => iface.name === interfaceName);
        
        if (!targetInterface) {
            return res.status(404).json({ error: '网络接口不存在' });
        }
        
        const details = {
            name: targetInterface.name,
            type: targetInterface.type || 'Unknown',
            mac: targetInterface.mac || 'N/A',
            mtu: targetInterface.mtu || 'N/A',
            speed: targetInterface.speed ? `${targetInterface.speed} Mbps` : 'N/A',
            duplex: targetInterface.duplex || 'N/A',
            operstate: targetInterface.state || 'Unknown',
            carrier: targetInterface.carrier || 'N/A',
            ipv4: targetInterface.address || 'N/A',
            ipv6: targetInterface.ipv6 || 'N/A',
            netmask: targetInterface.netmask || 'N/A',
            gateway: targetInterface.gateway || 'N/A',
            rxBytes: stats.rx_bytes ? formatBytes(stats.rx_bytes) : 'N/A',
            txBytes: stats.tx_bytes ? formatBytes(stats.tx_bytes) : 'N/A',
            rxPackets: stats.rx_sec || 'N/A',
            txPackets: stats.tx_sec || 'N/A',
            rxErrors: stats.rx_errors || 0,
            txErrors: stats.tx_errors || 0,
            rxDropped: stats.rx_dropped || 0,
            txDropped: stats.tx_dropped || 0
        };
        
        res.json(details);
    } catch (error) {
        console.error('获取网络接口详细信息失败:', error);
        res.status(500).json({ error: '获取网络接口详细信息失败' });
    }
});

// 格式化字节数
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 网络连接设备API
app.get('/api/network-connected-devices', requireAuth, async (req, res) => {
    try {
        const interfaceName = req.query.interface;
        
        if (!interfaceName) {
            return res.status(400).json({ error: '缺少接口名称参数' });
        }
        
        // 模拟连接设备数据（在实际环境中需要根据操作系统实现）
        const connectedDevices = [
            {
                ip: '192.168.1.100',
                mac: '00:11:22:33:44:55',
                status: 'connected',
                lastSeen: new Date().toISOString(),
                communicationStatus: 'good',
                latency: 15.2,
                packetLoss: 0,
                stabilityScore: 95
            },
            {
                ip: '192.168.1.101',
                mac: '00:11:22:33:44:56',
                status: 'connected',
                lastSeen: new Date().toISOString(),
                communicationStatus: 'fair',
                latency: 45.8,
                packetLoss: 2.5,
                stabilityScore: 78
            }
        ];
        
        res.json({
            interface: interfaceName,
            devices: connectedDevices,
            totalDevices: connectedDevices.length
        });
    } catch (error) {
        console.error('获取网络连接设备失败:', error);
        res.status(500).json({ error: '获取网络连接设备失败' });
    }
});

// 系统设置API
app.post('/api/system-settings', requireAuth, async (req, res) => {
    try {
        const { serverPort, systemName, sessionTimeout } = req.body;
        
        // 验证必要参数
        if (!serverPort || !systemName || sessionTimeout === undefined) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        // 验证端口号
        if (isNaN(serverPort) || serverPort < 1024 || serverPort > 65535) {
            return res.status(400).json({ error: '端口号必须在1024-65535之间' });
        }
        
        // 验证会话超时时间
        if (isNaN(sessionTimeout) || sessionTimeout < 1 || sessionTimeout > 1440) {
            return res.status(400).json({ error: '会话超时时间必须在1-1440分钟之间' });
        }
        
        // 保存配置到数据库
        await db.saveConfig('server_port', serverPort.toString());
        await db.saveConfig('systemName', systemName);
        await db.saveConfig('session_timeout', sessionTimeout.toString());
        // 同步保存设备识别码，确保与系统设置一起持久化
        try {
            const deviceId = await getOrCreateDeviceId(db);
            await db.saveConfig('device_id', deviceId);
        } catch (e) {
            console.error('保存设备识别码失败:', e);
        }
        
        // 记录系统设置修改日志（安装过程中跳过）
        const isInstalled = await db.isInstalled();
        if (isInstalled) {
            await db.addLog(req.session.userId, 'system_settings', `修改系统设置: 端口=${serverPort}, 系统名称=${systemName}, 会话超时=${sessionTimeout}分钟`, req.ip);
        }
        
        console.log('系统设置已保存:', req.body);
        
        res.json({ 
            success: true, 
            message: '系统设置保存成功',
            settings: {
                serverPort,
                systemName,
                sessionTimeout,
                deviceId: await db.getConfig('device_id')
            }
        });
        
    } catch (error) {
        console.error('保存系统设置失败:', error);
        res.status(500).json({ error: '保存系统设置失败' });
    }
});

// 重启设备 API（支持 Linux 与 Windows）
app.post('/api/system/restart', requireAuth, async (req, res) => {
    try {
        const platform = process.platform;

        // 记录操作日志
        const isInstalled = await db.isInstalled();
        if (isInstalled) {
            await db.addLog(req.session.userId, 'system_restart', '触发设备重启', req.ip);
        }

        if (platform === 'linux') {
            // 无交互 sudo 方式触发重启（服务账户需具备权限）
            const rebootCmd = 'sudo -n systemctl reboot || sudo -n shutdown -r now || /sbin/shutdown -r now || reboot';
            exec(rebootCmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('执行重启命令失败:', error, stderr);
                    return res.status(500).json({ success: false, error: stderr || error.message });
                }
                return res.status(202).json({ success: true, message: '已触发重启，设备即将重启' });
            });
        } else if (platform === 'win32') {
            // Windows：使用 detached 方式触发命令，确保命令独立运行
            const { spawn } = require('child_process');
            const launchDetached = (cmd, args) => {
                try {
                    const p = spawn(cmd, args, { detached: true, stdio: 'ignore' });
                    p.unref();
                    return true;
                } catch (e) {
                    console.error(`启动重启命令失败: ${cmd} ${args.join(' ')}`, e.message);
                    return false;
                }
            };

            // 优先使用 PowerShell 强制重启，其次使用 shutdown 强制重启
            const launched =
                launchDetached('powershell', ['-NoProfile', '-Command', 'Restart-Computer -Force']) ||
                launchDetached('shutdown', ['/r', '/t', '0', '/f']);

            if (!launched) {
                return res.status(500).json({ success: false, error: '无法触发系统重启，请检查运行权限' });
            }
            return res.status(202).json({ success: true, message: '已触发重启，设备即将重启' });
        } else {
            return res.status(400).json({ success: false, error: '当前平台暂不支持自动重启' });
        }
    } catch (error) {
        console.error('触发设备重启失败:', error);
        res.status(500).json({ success: false, error: '触发设备重启失败' });
    }
});

// 摄像头日志存储
let cameraLogs = [];
const MAX_LOGS = 100; // 最多保存100条日志

// 添加摄像头日志
function addCameraLog(level, message) {
    const log = {
        timestamp: new Date().toISOString(),
        level: level, // 'info', 'warn', 'error'
        message: message
    };
    
    cameraLogs.unshift(log); // 添加到开头
    
    // 限制日志数量
    if (cameraLogs.length > MAX_LOGS) {
        cameraLogs = cameraLogs.slice(0, MAX_LOGS);
    }
    
    console.log(`[摄像头日志] [${level.toUpperCase()}] ${message}`);
}

// 获取摄像头配置API
app.get('/api/camera/config', requireAuth, async (req, res) => {
    try {
        const config = {
            ip: await db.getConfig('camera_ip') || '',
            port: await db.getConfig('camera_port') || '554',
            username: await db.getConfig('camera_username') || '',
            password: await db.getConfig('camera_password') || '',
            streamUrl: await db.getConfig('camera_stream_url') || ''
        };
        
        res.json(config);
    } catch (error) {
        console.error('获取摄像头配置失败:', error);
        res.status(500).json({ error: '获取摄像头配置失败' });
    }
});

// 保存摄像头配置API
app.post('/api/camera/config', requireAuth, async (req, res) => {
    try {
        const { ip, port, username, password, streamUrl } = req.body;
        
        // 添加摄像头日志
        addCameraLog('info', `开始保存摄像头配置: IP=${ip}, 端口=${port || '554'}`);
        
        // 保存配置到数据库
        await db.saveConfig('camera_ip', ip || '');
        await db.saveConfig('camera_port', port || '554');
        await db.saveConfig('camera_username', username || '');
        await db.saveConfig('camera_password', password || '');
        await db.saveConfig('camera_stream_url', streamUrl || '');
        
        // 记录操作日志
        await db.addLog(req.session.userId, 'camera_config', `保存摄像头配置: IP=${ip}, 端口=${port}`, req.ip);
        
        addCameraLog('info', '摄像头配置保存成功');
        
        res.json({ success: true, message: '摄像头配置保存成功' });
    } catch (error) {
        console.error('保存摄像头配置失败:', error);
        addCameraLog('error', `保存摄像头配置失败: ${error.message}`);
        res.status(500).json({ error: '保存摄像头配置失败' });
    }
});

// 测试摄像头连接API
app.post('/api/camera/test-connection', requireAuth, async (req, res) => {
    try {
        const { ip, port, username, password, streamPath } = req.body;
        
        if (!ip) {
            addCameraLog('warn', '测试连接失败: 未提供摄像头IP地址');
            return res.status(400).json({ success: false, error: '请提供摄像头IP地址' });
        }
        
        addCameraLog('info', `开始测试摄像头连接: ${ip}:${port || 554}`);
        
        // 模拟连接测试（实际环境中需要实现真实的RTSP连接测试）
        const testResult = {
            success: true,
            message: '摄像头连接测试成功',
            details: {
                ip: ip,
                port: port || 554,
                responseTime: Math.floor(Math.random() * 100) + 50 // 模拟响应时间
            }
        };
        
        addCameraLog('info', `摄像头连接测试成功: ${ip}:${port || 554}`);
        res.json(testResult);
    } catch (error) {
        console.error('测试摄像头连接失败:', error);
        addCameraLog('error', `测试摄像头连接失败: ${error.message}`);
        res.status(500).json({ success: false, error: '测试摄像头连接失败' });
    }
});

// 雷达车道参数API
app.get('/api/radar/lane-settings', requireAuth, async (req, res) => {
    try {
        const laneCountStr = await db.getConfig('radar_lane_count');
        const laneWidthStr = await db.getConfig('radar_lane_width');
        const laneCount = parseInt(laneCountStr || '4', 10);
        const laneWidth = parseFloat(laneWidthStr || '6');
        res.json({ laneCount, laneWidth });
    } catch (error) {
        console.error('获取雷达车道参数失败:', error);
        res.status(500).json({ error: '获取雷达车道参数失败' });
    }
});

app.post('/api/radar/lane-settings', requireAuth, async (req, res) => {
    try {
        const { laneCount, laneWidth } = req.body;
        const count = parseInt(laneCount, 10);
        const width = parseFloat(laneWidth);
        
        if (isNaN(count) || count < 1 || count > 8) {
            return res.status(400).json({ error: '车道数量必须在1-8之间' });
        }
        if (isNaN(width) || width < 2 || width > 12) {
            return res.status(400).json({ error: '车道宽度必须在2-12之间' });
        }
        
        await db.saveConfig('radar_lane_count', String(count));
        await db.saveConfig('radar_lane_width', width.toFixed(1));
        
        const isInstalled = await db.isInstalled();
        if (isInstalled) {
            await db.addLog(req.session.userId, 'radar_lane_settings', `保存车道参数: 数量=${count}, 宽度=${width.toFixed(1)}`, req.ip);
        }
        
        res.json({ success: true, message: '车道参数保存成功' });
    } catch (error) {
        console.error('保存雷达车道参数失败:', error);
        res.status(500).json({ error: '保存雷达车道参数失败' });
    }
});

// 更新RTSPtoWeb配置文件
async function updateRTSPtoWebConfig() {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        
        // 获取摄像头配置
        const ip = await db.getConfig('camera_ip');
        const port = await db.getConfig('camera_port') || '554';
        const username = await db.getConfig('camera_username');
        const password = await db.getConfig('camera_password');
        const streamUrl = await db.getConfig('camera_stream_url');
        
        if (!ip) {
            throw new Error('摄像头IP地址未配置');
        }
        
        // 构建RTSP URL
        let rtspUrl;
        if (streamUrl && streamUrl.startsWith('rtsp://')) {
            rtspUrl = streamUrl;
        } else {
            const auth = username && password ? `${username}:${password}@` : '';
            const urlPath = streamUrl || '/stream1';
            rtspUrl = `rtsp://${auth}${ip}:${port}${urlPath}`;
        }
        
        console.log('更新RTSPtoWeb配置，RTSP URL:', rtspUrl);
        
        // 读取现有配置
        const configPath = path.join(__dirname, 'RTSPtoWeb', 'config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // 确保streams对象存在
        if (!config.streams) {
            config.streams = {};
        }
        
        // 确保camera流配置存在
        if (!config.streams.camera) {
            config.streams.camera = {
                name: "Camera Stream",
                channels: {
                    "0": {
                        name: "main",
                        url: rtspUrl,
                        on_demand: true,
                        debug: false,
                        status: 0
                    }
                }
            };
        } else {
            // 更新现有摄像头流配置
            if (!config.streams.camera.channels) {
                config.streams.camera.channels = {};
            }
            if (!config.streams.camera.channels['0']) {
                config.streams.camera.channels['0'] = {
                    name: "main",
                    url: rtspUrl,
                    on_demand: true,
                    debug: false,
                    status: 0
                };
            } else {
                config.streams.camera.channels['0'].url = rtspUrl;
            }
        }
        
        // 写入更新后的配置
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log('RTSPtoWeb配置已更新');
        
        addCameraLog('info', `RTSPtoWeb配置更新成功，RTSP URL: ${rtspUrl.replace(/:\/\/.*@/, '://***@')}`);
        return rtspUrl;
    } catch (error) {
        console.error('更新RTSPtoWeb配置失败:', error);
        addCameraLog('error', `更新RTSPtoWeb配置失败: ${error.message}`);
        throw error;
    }
}

// 代理RTSPtoWeb WebRTC请求
app.post('/api/camera/webrtc', requireAuth, async (req, res) => {
    try {
        console.log('收到WebRTC请求，原始body:', JSON.stringify(req.body));
        console.log('req.body.data类型:', typeof req.body.data);
        console.log('req.body.data长度:', req.body.data ? req.body.data.length : 'undefined');
        
        // RTSPtoWeb期望接收base64编码的SDP数据，所以直接使用前端发送的base64数据
        const base64SdpOffer = req.body.data;
        
        console.log('发送给RTSPtoWeb的base64 SDP长度:', base64SdpOffer.length);
        console.log('base64 SDP前100字符:', base64SdpOffer.substring(0, 100));
        
        const response = await HttpClient.post('http://localhost:8084/stream/camera/channel/0/webrtc', 
            new URLSearchParams({ data: base64SdpOffer }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from('demo:demo').toString('base64')
            }
        });
        
        if (response.status === 200) {
            console.log('RTSPtoWeb响应成功，answer长度:', response.data.length);
            // RTSPtoWeb返回的是base64编码的SDP answer，前端期望base64格式，直接返回
            console.log('返回base64编码的SDP answer前100字符:', response.data.substring(0, 100));
            res.send(response.data);
        } else {
            console.log('RTSPtoWeb响应失败:', response.status, response.data);
            res.status(response.status).json({ error: 'WebRTC协商失败' });
        }
    } catch (error) {
        console.error('WebRTC代理失败:', error);
        if (error.response) {
            console.error('RTSPtoWeb错误响应:', error.response.status, error.response.data);
            res.status(error.response.status).json({ error: 'WebRTC协商失败: ' + error.response.data.payload || error.response.data });
        } else {
            // 网络错误或其他错误
            res.status(500).json({ error: 'WebRTC代理失败: ' + error.message });
        }
    }
});

// RTSPtoWeb流管理API
app.post('/api/camera/rtsp2web/stream', requireAuth, async (req, res) => {
    let streamData;
    let rtspUrl;
    
    try {
        // 更新RTSPtoWeb配置
        rtspUrl = await updateRTSPtoWebConfig();
        
        console.log('开始添加流到RTSPtoWeb');
        
        // 向RTSPtoWeb服务器添加流
        streamData = {
            name: "Camera Stream",
            channels: {
                "0": {
                    name: "main",
                    url: rtspUrl,
                    on_demand: true,
                    debug: false,
                    status: 0
                }
            }
        };
        
        // 尝试添加流，如果失败则自动重试
        let success = false;
        let lastError = null;
        const maxRetries = 3;
        
        for (let attempt = 1; attempt <= maxRetries && !success; attempt++) {
            try {
                console.log(`尝试添加流 (第 ${attempt} 次)...`);
                
                const response = await HttpClient.post('http://localhost:8084/stream/camera/add', streamData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic ' + Buffer.from('demo:demo').toString('base64')
                    },
                    timeout: 10000
                });
                
                if (response.status === 200) {
                    console.log(`流添加成功 (第 ${attempt} 次)`);
                    await db.addLog(req.session.userId, 'camera_rtsp2web', `添加RTSPtoWeb流成功 (尝试 ${attempt}): ${rtspUrl}`, req.ip);
                    addCameraLog('info', `RTSPtoWeb流添加成功 (尝试 ${attempt})`);
                    res.json({ success: true, streamId: 'camera', rtspUrl, attempt });
                    success = true;
                    return;
                } else {
                    const error = response.data || response.statusText;
                    lastError = new Error('RTSPtoWeb服务器错误: ' + error);
                    console.log(`流添加失败 (第 ${attempt} 次)，状态码: ${response.status}`);
                }
            } catch (addError) {
                console.error(`添加流失败 (第 ${attempt} 次):`, addError.message);
                lastError = addError;
                
                // 检查是否是流已存在的错误
                const isStreamExistsError = addError.response && addError.response.data && 
                    (addError.response.data.payload === 'stream already exists' || 
                     (typeof addError.response.data === 'string' && addError.response.data.includes('stream already exists')) ||
                     (typeof addError.response.data === 'object' && JSON.stringify(addError.response.data).includes('stream already exists')));
                
                if (isStreamExistsError && attempt < maxRetries) {
                    console.log(`检测到流冲突，尝试删除现有流 (第 ${attempt} 次)...`);
                    
                    try {
                        // 删除现有流
                        const deleteResponse = await HttpClient.get('http://localhost:8084/stream/camera/delete', {
                            headers: {
                                'Authorization': 'Basic ' + Buffer.from('demo:demo').toString('base64')
                            },
                            timeout: 5000
                        });
                        console.log(`删除流响应 (第 ${attempt} 次):`, deleteResponse.status, deleteResponse.data);
                        
                        // 等待确保删除操作完成
                        const waitTime = attempt * 1000;
                        console.log(`等待 ${waitTime}ms 确保删除完成...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        
                    } catch (deleteError) {
                        console.error(`删除流失败 (第 ${attempt} 次):`, deleteError.message);
                    }
                } else if (attempt < maxRetries) {
                    // 其他错误，等待后重试
                    const waitTime = attempt * 1000;
                    console.log(`等待 ${waitTime}ms 后重试...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }
        
        // 如果所有尝试都失败了
        if (!success) {
            console.error(`所有 ${maxRetries} 次尝试都失败了`);
            const errorMessage = lastError ? lastError.message : '未知错误';
            addCameraLog('error', `RTSPtoWeb流添加失败: ${errorMessage}`);
            
            await db.addLog(req.session.userId, 'camera_rtsp2web', `添加RTSPtoWeb流失败: ${errorMessage}`, req.ip);
            res.status(500).json({ 
                error: `RTSPtoWeb流添加失败: ${errorMessage}`,
                details: lastError ? lastError.toString() : '未知错误'
            });
        }
    } catch (error) {
        console.error('RTSPtoWeb流管理失败:', error);
        addCameraLog('error', `RTSPtoWeb流管理失败: ${error.message}`);
        res.status(500).json({ error: `RTSPtoWeb流管理失败: ${error.message}` });
    }
});

// 获取网络配置
    app.get('/api/network-config', requireAuth, (req, res) => {
        try {
            // 这里返回模拟的网络配置，实际应用中应该从系统配置文件读取
            const config = {
                networkInterface: 'eth0', // 默认网络接口
                ipMode: 'static', // 只支持 static
                staticIP: '',
                subnetMask: '',
                gateway: '',
                dnsMode: 'auto', // auto 或 manual
                primaryDNS: '',
                secondaryDNS: ''
            };
            
            res.json(config);
        } catch (error) {
            console.error('获取网络配置失败:', error);
            res.status(500).json({ error: '获取网络配置失败' });
        }
    });

    // 保存网络配置
    app.post('/api/network-config', requireAuth, async (req, res) => {
        try {
            const { ipMode, staticIP, subnetMask, gateway, dnsMode, primaryDNS, secondaryDNS } = req.body;
            
            // 获取当前IP地址用于比较
            let currentIP = null;
            try {
                const result = await getNetworkInterfaces();
                if (result.success) {
                    const activeInterface = result.interfaces.find(iface => 
                        !iface.internal && 
                        iface.address && 
                        iface.address !== '127.0.0.1' && 
                        iface.state === 'up'
                    );
                    if (activeInterface) {
                        currentIP = activeInterface.address;
                    }
                }
            } catch (error) {
                console.log('获取当前IP失败:', error);
            }
            
            // 验证必要参数
            if (!ipMode) {
                return res.status(400).json({ error: 'IP模式不能为空' });
            }
            
            if (!dnsMode) {
                return res.status(400).json({ error: 'DNS模式不能为空' });
            }
            
            // 验证IP模式
            if (!['dhcp', 'static'].includes(ipMode)) {
                return res.status(400).json({ error: 'IP模式无效，只支持dhcp或static' });
            }
            
            // 验证静态IP配置
            if (ipMode === 'static') {
                if (!staticIP || !subnetMask || !gateway) {
                    return res.status(400).json({ error: '静态IP配置不完整' });
                }
                
                // 简单的IP地址格式验证
                const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
                if (!ipRegex.test(staticIP) || !ipRegex.test(subnetMask) || !ipRegex.test(gateway)) {
                    return res.status(400).json({ error: 'IP地址格式无效' });
                }
            }
            
            // 验证DNS配置
            if (dnsMode === 'manual') {
                if (!primaryDNS) {
                    return res.status(400).json({ error: '首选DNS服务器不能为空' });
                }
                
                const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
                if (!ipRegex.test(primaryDNS) || (secondaryDNS && !ipRegex.test(secondaryDNS))) {
                    return res.status(400).json({ error: 'DNS服务器地址格式无效' });
                }
            }
            
            // 检测IP是否会发生变更
            let ipChanged = false;
            let newIP = currentIP;
            
            if (ipMode === 'static' && staticIP && currentIP && staticIP !== currentIP) {
                ipChanged = true;
                newIP = staticIP;
            }
            
            // 在实际应用中，这里应该执行系统网络配置命令
            // 例如修改 /etc/netplan/ 配置文件或使用 nmcli 命令
            console.log('网络配置请求:', req.body);
            console.log('IP变更检测:', { currentIP, newIP, ipChanged });
            
            // 记录网络配置修改日志（安装过程中跳过）
            const isInstalled = await db.isInstalled();
            if (isInstalled) {
                const configDetails = `IP模式: ${ipMode}${ipMode === 'static' ? `, 静态IP: ${staticIP}, 子网掩码: ${subnetMask}, 网关: ${gateway}` : ''}, DNS模式: ${dnsMode}${dnsMode === 'manual' ? `, 首选DNS: ${primaryDNS}${secondaryDNS ? `, 备用DNS: ${secondaryDNS}` : ''}` : ''}`;
                await db.addLog({
                    type: 'network',
                    action: '修改网络配置',
                    details: configDetails,
                    ip: req.ip || req.connection.remoteAddress
                });
            }
            
            // 模拟配置应用过程
            setTimeout(() => {
                console.log('网络配置已应用');
            }, 1000);
            
            res.json({ 
                success: true, 
                message: '网络配置已保存，正在应用中...',
                config: req.body,
                ipChanged: ipChanged,
                currentIP: currentIP,
                newIP: newIP
            });
            
        } catch (error) {
            console.error('保存网络配置失败:', error);
            res.status(500).json({ error: '保存网络配置失败' });
        }
    });

    // 获取网络接口设置
    app.get('/api/network-interface-settings', requireAuth, async (req, res) => {
        try {
            const interfaceName = req.query.interface;
            
            if (!interfaceName) {
                return res.status(400).json({ error: '缺少接口名称参数' });
            }
            
            // 获取网络接口信息
            const result = await getNetworkInterfaces();
            if (!result.success) {
                return res.status(500).json({ error: '获取网络接口失败' });
            }
            const targetInterface = result.interfaces.find(iface => iface.name === interfaceName);
            
            if (!targetInterface) {
                return res.status(404).json({ error: '网络接口不存在' });
            }
            
            // 检测IP模式 - 使用多种方法检测
            let ipMode = 'dhcp'; // 默认为DHCP
            let staticIP = targetInterface.address || '';
            let subnetMask = targetInterface.netmask || '';
            let gateway = targetInterface.gateway || '';
            
            console.log(`[IP模式检测] 接口: ${interfaceName}`);
            console.log(`[IP模式检测] 初始信息 - IP: ${staticIP}, 子网掩码: ${subnetMask}, 网关: ${gateway}`);
            
            try {
                // 根据操作系统选择不同的检测方法
                if (os.platform() === 'win32') {
                    // Windows环境：使用netsh命令检测
                    try {
                        // 设置英文环境变量以避免编码问题
                        const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
                        console.log(`[Windows检测] 执行命令: netsh interface ip show config "${interfaceName}"`);
                        
                        // 直接使用netsh命令，避免PowerShell转义问题
                        const result = await execAsync(`netsh interface ip show config name="${interfaceName}"`, { env, encoding: 'utf8' });
                        console.log(`[Windows检测] 命令输出:`, result.stdout);
                        
                        const output = result.stdout;
                        
                        // 更强健的DHCP检测逻辑，支持中英文输出
                        const dhcpEnabledMatch = output.match(/DHCP\s*(?:enabled|已启用)[:\s]*([YesNo是否]+)/i);
                        const dhcpConfigMatch = output.match(/Configuration for interface[^:]*:\s*DHCP/i);
                        const staticConfigMatch = output.match(/Statically Configured/i);
                        
                        console.log(`[Windows检测] DHCP启用匹配:`, dhcpEnabledMatch);
                        console.log(`[Windows检测] DHCP配置匹配:`, dhcpConfigMatch);
                        console.log(`[Windows检测] 静态配置匹配:`, staticConfigMatch);
                        
                        if (dhcpEnabledMatch) {
                            const dhcpValue = dhcpEnabledMatch[1].toLowerCase();
                            if (dhcpValue.includes('yes') || dhcpValue.includes('是')) {
                                ipMode = 'dhcp';
                                console.log(`[Windows检测] 检测到DHCP模式 (通过DHCP enabled)`);
                            } else if (dhcpValue.includes('no') || dhcpValue.includes('否')) {
                                ipMode = 'static';
                                console.log(`[Windows检测] 检测到静态IP模式 (通过DHCP enabled)`);
                            }
                        } else if (dhcpConfigMatch) {
                            ipMode = 'dhcp';
                            console.log(`[Windows检测] 检测到DHCP模式 (通过配置类型)`);
                        } else if (staticConfigMatch) {
                            ipMode = 'static';
                            console.log(`[Windows检测] 检测到静态IP模式 (通过配置类型)`);
                        } else {
                            console.log(`[Windows检测] 无法从输出中确定IP模式，尝试备用方法`);
                            // 尝试使用Get-NetIPConfiguration作为备用方法
                            try {
                                const psCommand = `Get-NetIPConfiguration -InterfaceAlias "${interfaceName}" | Select-Object -ExpandProperty IPv4Address | Select-Object -ExpandProperty PrefixOrigin`;
                                const psResult = await execAsync(`powershell -Command "${psCommand}"`, { encoding: 'utf8' });
                                console.log(`[Windows检测] PowerShell输出:`, psResult.stdout);
                                
                                if (psResult.stdout.includes('Dhcp')) {
                                    ipMode = 'dhcp';
                                    console.log(`[Windows检测] 通过PowerShell检测到DHCP模式`);
                                } else if (psResult.stdout.includes('Manual')) {
                                    ipMode = 'static';
                                    console.log(`[Windows检测] 通过PowerShell检测到静态IP模式`);
                                }
                            } catch (psError) {
                                console.log(`[Windows检测] PowerShell检测失败:`, psError.message);
                            }
                        }
                        
                        // 提取网关信息，支持中英文
                        const gatewayMatch = output.match(/(?:Default Gateway|默认网关)[:\s]*([0-9.]+)/i);
                        if (gatewayMatch && gatewayMatch[1]) {
                            gateway = gatewayMatch[1];
                            console.log(`[Windows检测] 提取到网关: ${gateway}`);
                        }
                    } catch (winError) {
                        console.log('Windows netsh检测失败，使用备用方法:', winError.message);
                        // 备用检测：通过WMI查询
                        try {
                            const wmiResult = await execAsync(`wmic path win32_networkadapterconfiguration where "description='${interfaceName}'" get DHCPEnabled /format:list`);
                            if (wmiResult.stdout.includes('DHCPEnabled=TRUE')) {
                                ipMode = 'dhcp';
                            } else if (wmiResult.stdout.includes('DHCPEnabled=FALSE')) {
                                ipMode = 'static';
                            }
                        } catch (wmiError) {
                            console.log('WMI检测也失败，使用智能推断:', wmiError.message);
                            // 智能推断：检查IP地址特征
                            ipMode = inferIPModeFromAddress(staticIP, gateway);
                            console.log(`[智能推断] 推断结果: ${ipMode}`);
                        }
                    }
                } else {
                    // Linux环境：使用nmcli命令检测
                    try {
                        const result = await execAsync(`nmcli connection show "${interfaceName}" | grep ipv4.method`);
                        if (result.stdout.includes('manual')) {
                            ipMode = 'static';
                        } else if (result.stdout.includes('auto')) {
                            ipMode = 'dhcp';
                        }
                    } catch (nmcliError) {
                        console.log('nmcli检测失败，尝试其他方法:', nmcliError.message);
                        // 备用方法：检查网络配置文件
                        try {
                            const configResult = await execAsync(`cat /etc/network/interfaces | grep -A 5 "${interfaceName}"`);
                            if (configResult.stdout.includes('static')) {
                                ipMode = 'static';
                            } else if (configResult.stdout.includes('dhcp')) {
                                ipMode = 'dhcp';
                            }
                        } catch (configError) {
                            console.log('配置文件检测失败，使用智能推断:', configError.message);
                            ipMode = inferIPModeFromAddress(staticIP, gateway);
                        }
                    }
                }
            } catch (error) {
                console.log('IP模式检测失败，使用智能推断:', error.message);
                ipMode = inferIPModeFromAddress(staticIP, gateway);
            }
            
            // 智能推断函数
            function inferIPModeFromAddress(ip, gw) {
                // 如果没有IP地址，很可能是DHCP但未获取到地址
                if (!ip) {
                    return 'dhcp';
                }
                
                // 检查是否为常见的静态IP模式特征
                const commonStaticRanges = [
                    /^192\.168\.1\.(1|2|3|4|5|10|100|200)$/, // 常见的静态IP
                    /^10\.0\.0\.(1|2|3|4|5|10|100|200)$/,
                    /^172\.16\.0\.(1|2|3|4|5|10|100|200)$/
                ];
                
                // 检查是否为常见的DHCP分配范围
                const commonDHCPRanges = [
                    /^192\.168\.1\.(1[0-9][0-9]|2[0-4][0-9]|25[0-5])$/, // 192.168.1.100-255
                    /^192\.168\.0\.(1[0-9][0-9]|2[0-4][0-9]|25[0-5])$/,  // 192.168.0.100-255
                    /^10\.0\.0\.(1[0-9][0-9]|2[0-4][0-9]|25[0-5])$/      // 10.0.0.100-255
                ];
                
                // 如果IP匹配常见静态IP模式
                if (commonStaticRanges.some(regex => regex.test(ip))) {
                    return 'static';
                }
                
                // 如果IP匹配常见DHCP范围
                if (commonDHCPRanges.some(regex => regex.test(ip))) {
                    return 'dhcp';
                }
                
                // 如果网关和IP在同一个很小的网段（如前3位相同且IP较小），可能是静态
                if (gw && ip) {
                    const ipParts = ip.split('.');
                    const gwParts = gw.split('.');
                    if (ipParts.slice(0, 3).join('.') === gwParts.slice(0, 3).join('.')) {
                        const lastOctet = parseInt(ipParts[3]);
                        if (lastOctet <= 10) {
                            return 'static';
                        }
                    }
                }
                
                // 默认推断为DHCP
                return 'dhcp';
            }
            
            // 返回接口设置信息
            const settings = {
                interfaceName: interfaceName,
                ipMode: ipMode,
                staticIP: staticIP,
                subnetMask: subnetMask,
                gateway: gateway,
                mac: targetInterface.mac || '',
                status: targetInterface.operstate || 'unknown'
            };
            
            console.log(`[最终结果] 接口 ${interfaceName} 的IP模式: ${ipMode}`);
            console.log(`[最终结果] 返回设置:`, settings);
            
            res.json(settings);
        } catch (error) {
            console.error('获取网络接口设置失败:', error);
            res.status(500).json({ error: '获取网络接口设置失败' });
        }
    });

    // 保存单个网络接口配置
    app.post('/api/network-interface-config', requireAuth, async (req, res) => {
        try {
            const { interfaceName, ipMode, staticIP, subnetMask, gateway } = req.body;
            
            // 获取当前接口的IP地址用于比较
            let currentIP = null;
            try {
                const result = await getNetworkInterfaces();
                if (result.success) {
                    const targetInterface = result.interfaces.find(iface => 
                        iface.name === interfaceName && 
                        !iface.internal && 
                        iface.address
                    );
                    if (targetInterface) {
                        currentIP = targetInterface.address;
                    }
                }
            } catch (error) {
                console.log('获取当前接口IP失败:', error);
            }
            
            // 验证必要参数
            if (!interfaceName) {
                return res.status(400).json({ error: '网络接口名称不能为空' });
            }
            
            if (!ipMode) {
                return res.status(400).json({ error: 'IP模式不能为空' });
            }
            
            // 验证网络接口是否存在
            const result = await getNetworkInterfaces();
            if (!result.success) {
                return res.status(500).json({ error: '获取网络接口失败' });
            }
            const interfaceExists = result.interfaces.some(iface => iface.name === interfaceName && !iface.internal);
            if (!interfaceExists) {
                return res.status(400).json({ error: `网络接口 '${interfaceName}' 不存在或为内部接口` });
            }
            
            // 验证静态IP配置
            if (ipMode === 'static') {
                if (!staticIP || !subnetMask || !gateway) {
                    return res.status(400).json({ error: '静态IP配置不完整' });
                }
                
                // 简单的IP地址格式验证
                const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
                if (!ipRegex.test(staticIP) || !ipRegex.test(subnetMask) || !ipRegex.test(gateway)) {
                    return res.status(400).json({ error: 'IP地址格式无效' });
                }
            }
            
            // 执行实际的网络配置命令
            console.log('网络接口配置请求:', req.body);
            
            let command = '';
            let warning = '';
            
            try {
                const { exec } = require('child_process');
                const util = require('util');
                const execAsync = ProcessUtils.execCommand;
                const os = require('os');
                
                // 检查操作系统类型
                const isWindows = os.platform() === 'win32';
                const isLinux = os.platform() === 'linux';
                
                if (isWindows) {
                    // Windows系统使用netsh命令
                    if (ipMode === 'static') {
                        // 设置静态IP
                        command = `netsh interface ip set address "${interfaceName}" static ${staticIP} ${subnetMask} ${gateway}`;
                        console.log(`执行Windows静态IP设置命令: ${command}`);
                        await execAsync(command);
                        console.log(`接口 ${interfaceName} 已设置静态IP: ${staticIP}`);
                    } else if (ipMode === 'dhcp') {
                        // 设置DHCP自动获取IP
                        command = `netsh interface ip set address "${interfaceName}" dhcp`;
                        console.log(`执行Windows DHCP设置命令: ${command}`);
                        await execAsync(command);
                        console.log(`接口 ${interfaceName} 已设置为DHCP自动获取IP`);
                    }
                } else if (isLinux) {
                    // Linux系统使用nmcli命令
                    // 首先检查nmcli是否可用
                    try {
                        await execAsync('which nmcli');
                    } catch (nmcliError) {
                        throw new Error('nmcli命令不可用。请确保已安装NetworkManager并且nmcli命令在PATH中。');
                    }
                    
                    // 检查NetworkManager连接是否存在，如果不存在则创建
                    try {
                        await execAsync(`nmcli connection show "${interfaceName}"`);
                    } catch (connectionError) {
                        console.log(`连接 ${interfaceName} 不存在，正在创建...`);
                        try {
                            await execAsync(`nmcli connection add type ethernet con-name "${interfaceName}" ifname "${interfaceName}"`);
                            console.log(`已创建连接 ${interfaceName}`);
                        } catch (createError) {
                            console.warn(`创建连接失败，尝试直接配置设备: ${createError.message}`);
                        }
                    }
                    
                    if (ipMode === 'static') {
                        // 设置静态IP
                        // 计算CIDR格式的子网掩码
                        const cidr = subnetMaskToCIDR(subnetMask);
                        command = `nmcli connection modify "${interfaceName}" ipv4.method manual ipv4.addresses "${staticIP}/${cidr}" ipv4.gateway "${gateway}" && nmcli connection up "${interfaceName}"`;
                        console.log(`执行Linux静态IP设置命令: ${command}`);
                        await execAsync(command);
                        console.log(`接口 ${interfaceName} 已设置静态IP: ${staticIP}`);
                    } else if (ipMode === 'dhcp') {
                        // 设置DHCP自动获取IP
                        command = `nmcli connection modify "${interfaceName}" ipv4.method auto && nmcli connection up "${interfaceName}"`;
                        console.log(`执行Linux DHCP设置命令: ${command}`);
                        await execAsync(command);
                        console.log(`接口 ${interfaceName} 已设置为DHCP自动获取IP`);
                    }
                } else {
                    throw new Error(`不支持的操作系统: ${os.platform()}`);
                }
            } catch (error) {
                console.error('网络配置命令执行失败:', error);
                warning = `网络配置命令执行失败: ${error.message}。配置已保存但可能需要手动应用。`;
            }
            
            // 记录网络配置修改日志
            const isInstalled = await db.isInstalled();
            if (isInstalled) {
                const configDetails = `接口: ${interfaceName}, IP模式: ${ipMode}${ipMode === 'static' ? `, 静态IP: ${staticIP}, 子网掩码: ${subnetMask}, 网关: ${gateway}` : ipMode === 'dhcp' ? ' (自动获取)' : ''}`;
                await db.addLog({
                    type: 'network',
                    action: '修改网络接口配置',
                    details: configDetails,
                    ip: req.ip || req.connection.remoteAddress
                });
            }
            
            // 检测IP是否会发生变更
            let ipChanged = false;
            let newIP = currentIP;
            
            if (ipMode === 'static' && staticIP && currentIP && staticIP !== currentIP) {
                ipChanged = true;
                newIP = staticIP;
            }
            
            // 构建响应消息
            let message = '';
            if (warning) {
                message = warning;
            } else {
                if (ipMode === 'static') {
                    message = `网络接口 ${interfaceName} 已成功设置静态IP: ${staticIP}`;
                } else if (ipMode === 'dhcp') {
                    message = `网络接口 ${interfaceName} 已成功设置为DHCP自动获取IP`;
                } else {
                    message = `不支持的IP模式: ${ipMode}`;
                }
            }
            
            const response = { 
                success: true, 
                message: message,
                config: req.body,
                ipChanged: ipChanged,
                currentIP: currentIP,
                newIP: newIP
            };
            
            if (warning) {
                response.warning = warning;
            }
            
            console.log('接口IP变更检测:', { interfaceName, currentIP, newIP, ipChanged });
            
            res.json(response);
            
        } catch (error) {
            console.error('保存网络接口配置失败:', error);
            res.status(500).json({ error: '保存网络接口配置失败' });
        }
    });

    // 系统日志 API
    app.get('/api/logs', requireAuth, async (req, res) => {
        try {
            const { page = 1, limit = 50, action, startDate, endDate } = req.query;
            
            // 验证分页参数
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            
            if (isNaN(pageNum) || pageNum < 1) {
                return res.status(400).json({ error: '页码必须是大于0的整数' });
            }
            
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                return res.status(400).json({ error: '每页条数必须在1-100之间' });
            }
            
            // 构建查询条件
            const filters = {};
            if (action) {
                filters.action = action;
            }
            if (startDate) {
                filters.startDate = startDate;
            }
            if (endDate) {
                filters.endDate = endDate;
            }
            
            // 获取日志数据
            const logs = await db.getLogs(pageNum, limitNum, filters);
            const totalCount = await db.getLogsCount(filters);
            
            res.json({
                success: true,
                data: logs,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / limitNum)
                }
            });
        } catch (error) {
            console.error('获取日志失败:', error);
            res.status(500).json({ error: '获取日志失败' });
        }
    });

    // 摄像头日志 API
    app.get('/api/camera/logs', requireAuth, async (req, res) => {
        try {
            // 使用带缓存的状态检查，避免频繁重复日志
            await checkRTSPtoWebStatus();
            
            res.json({
                success: true,
                logs: cameraLogs.slice(0, 50) // 返回最新50条日志
            });
        } catch (error) {
            console.error('获取摄像头日志失败:', error);
            res.status(500).json({ error: '获取摄像头日志失败' });
        }
    });

    // 清空摄像头日志API
    app.delete('/api/camera/logs', requireAuth, async (req, res) => {
        try {
            cameraLogs = [];
            addCameraLog('info', '日志已清空');
            
            res.json({
                success: true,
                message: '日志已清空'
            });
        } catch (error) {
            console.error('清空摄像头日志失败:', error);
            res.status(500).json({ error: '清空摄像头日志失败' });
        }
    });

    // 模型管理 API
    app.get('/api/models', requireAuth, async (req, res) => {
        try {
            const modelsDir = path.join(__dirname, 'Ai_models');
            
            // 检查Ai_models目录是否存在
            if (!fs.existsSync(modelsDir)) {
                return res.json({ models: [] });
            }
            
            // 读取目录中的文件
            const files = fs.readdirSync(modelsDir);
            
            // 过滤出模型文件（常见的AI模型文件扩展名）
            const modelExtensions = ['.onnx', '.pt', '.pth', '.bin', '.safetensors', '.gguf', '.ggml', '.tflite', '.pb'];
            const models = files
                .filter(file => {
                    const ext = path.extname(file).toLowerCase();
                    return modelExtensions.includes(ext) && file !== '.gitkeep';
                })
                .map(file => {
                    const filePath = path.join(modelsDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        size: stats.size,
                        modified: stats.mtime,
                        extension: path.extname(file).toLowerCase()
                    };
                });
            
            res.json({ models });
        } catch (error) {
            console.error('获取模型列表失败:', error);
            res.status(500).json({ error: '获取模型列表失败: ' + error.message });
        }
    });







    // 其他路由...
    // 这里可以继续添加其他路由处理逻辑
}

// WS串口专用文件日志，便于在控制台嘈杂时定位
const wsSerialLogDir = path.join(os.homedir(), '.local', 'share', 'web-panel', 'logs');
const wsSerialLogFile = path.join(wsSerialLogDir, 'ws-serial.log');
function wsSerialLog(event, payload) {
    try {
        fs.mkdirSync(wsSerialLogDir, { recursive: true });
        const line = JSON.stringify({ ts: new Date().toISOString(), event, payload });
        fs.appendFile(wsSerialLogFile, line + '\n', () => {});
    } catch (_) {}
}

// 已移除原生 WebSocket 串口路由，改用纯 Socket.IO 的 /serial 命名空间

// 启动服务器
async function startServer() {
    try {
        await db.init();
        
        const isInstalled = await db.isInstalled();
        // 启动时确保设备识别码存在（兼容旧安装）
        try {
            await getOrCreateDeviceId(db);
        } catch (e) {
            console.error('初始化设备识别码失败:', e);
        }
        
        // 设置安装检查中间件
        app.use(checkInstallation(db));
        
        // 创建网络桥接实例
        const networkBridge = new NetworkBridge(db);
        
        // 创建网络连通性测试实例
        const networkConnectivity = new NetworkConnectivity();
        
        // 设置路由
        setupRoutes(networkBridge, networkConnectivity);
        
        // 初始化网络桥接模块，从数据库加载桥接数据
        try {
            await networkBridge.initialize();
            console.log('网络桥接模块初始化完成');
        } catch (error) {
            console.error('网络桥接模块初始化失败:', error);
        }
        
        // 启动会话清理定时器
        setInterval(() => {
            console.log('定期检查会话状态...');
        }, 10 * 60 * 1000); // 每10分钟检查一次
        // 看门狗：写入心跳文件，供系统计划任务独立监测并在假死时强制重启
        try {
            const fs = require('fs');
            const HEARTBEAT_PATH = path.join(__dirname, 'watchdog-heartbeat.txt');
            setInterval(() => {
                try {
                    fs.writeFileSync(HEARTBEAT_PATH, new Date().toISOString());
                } catch (e) {
                    console.error('写入看门狗心跳失败:', e);
                }
            }, 30 * 1000); // 每30秒更新一次心跳
            console.log('看门狗心跳已启用:', HEARTBEAT_PATH);
        } catch (e) {
            console.warn('初始化看门狗心跳失败:', e.message);
        }
        
        // 优先使用环境变量PORT（便于本地预览与调试），否则使用数据库配置或默认值
        let port = process.env.PORT || 3000;
        
        if (isInstalled) {
            const savedPort = await db.getConfig('server_port');
            if (savedPort && !process.env.PORT) {
                port = parseInt(savedPort);
            }
        }
        
        port = parseInt(port);
        
        const server = app.listen(port, () => {
            console.log(`服务器运行在端口 ${port}`);
            console.log(`访问地址: http://localhost:${port}`);
            if (!isInstalled) {
                console.log('首次运行，请访问 /install 进行初始化设置');
            }
            
            // 内存使用监控
            const memUsage = process.memoryUsage();
            console.log(`初始内存使用: RSS=${Math.round(memUsage.rss/1024/1024)}MB, Heap=${Math.round(memUsage.heapUsed/1024/1024)}MB`);
            
            // 定期内存监控和垃圾回收
            setInterval(() => {
                const memUsage = process.memoryUsage();
                const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
                const rssMB = Math.round(memUsage.rss / 1024 / 1024);
                
                // 如果堆内存使用超过150MB，触发垃圾回收
                if (heapUsedMB > 150) {
                    console.log(`内存使用较高: RSS=${rssMB}MB, Heap=${heapUsedMB}MB, 触发垃圾回收`);
                    if (global.gc) {
                        global.gc();
                        const afterGC = process.memoryUsage();
                        console.log(`垃圾回收后: Heap=${Math.round(afterGC.heapUsed/1024/1024)}MB`);
                    }
                }
            }, 10 * 60 * 1000); // 每10分钟检查一次，减少频率
        });
        
        // 服务器性能优化配置
        server.maxConnections = 1000; // 最大连接数
        server.timeout = 30000; // 30秒超时
        server.keepAliveTimeout = 65000; // Keep-Alive超时
        server.headersTimeout = 66000; // 头部超时

        // Socket.IO 初始化与会话共享
        const io = new IOServer(server, {
            path: '/socket.io',
            cors: { origin: true, credentials: true }
        });
        io.use((socket, next) => sessionMiddleware(socket.request, {}, next));
        io.use((socket, next) => {
            const req = socket.request;
            if (req.session && req.session.username) return next();
            next(new Error('未登录或会话失效'));
        });

        const serialNsp = io.of('/serial');
        serialNsp.on('connection', (socket) => {
            try { wsSerialLog('socket.io connected', { id: socket.id, ip: socket.handshake.address }); } catch (_) {}
            SerialService.addSubscriber(socket);
            try { socket.send(JSON.stringify({ type: 'status', open: SerialService.isOpen() })); } catch (_) {}

            socket.on('open', async ({ path, baudRate, ...opts }) => {
                if (!path) {
                    try { socket.send(JSON.stringify({ type: 'error', action: 'open', error: '缺少参数: path' })); } catch (_) {}
                    return;
                }
                try {
                    const result = await SerialService.openPort(path, parseInt(baudRate, 10) || 115200, opts || {});
                    try { socket.send(JSON.stringify({ type: 'ack', action: 'open', result })); } catch (_) {}
                    try { wsSerialLog('socket.io open ok', { path, baudRate, opts }); } catch (_) {}
                } catch (err) {
                    try { socket.send(JSON.stringify({ type: 'error', action: 'open', error: err.message })); } catch (_) {}
                    try { wsSerialLog('socket.io open error', { path, baudRate, error: err && err.message }); } catch (_) {}
                }
            });

            socket.on('write', async ({ data, hex }) => {
                if (typeof data !== 'string') {
                    try { socket.send(JSON.stringify({ type: 'error', action: 'write', error: '缺少参数: data' })); } catch (_) {}
                    return;
                }
                try {
                    const result = await SerialService.writeData(data, !!hex);
                    try { socket.send(JSON.stringify({ type: 'ack', action: 'write', result })); } catch (_) {}
                    try { wsSerialLog('socket.io write ok', { bytes: (result && result.bytesWritten) || 0, hex: !!hex }); } catch (_) {}
                } catch (err) {
                    try { socket.send(JSON.stringify({ type: 'error', action: 'write', error: err.message })); } catch (_) {}
                    try { wsSerialLog('socket.io write error', { error: err && err.message }); } catch (_) {}
                }
            });

            socket.on('close', async () => {
                try {
                    const result = await SerialService.closePort();
                    try { socket.send(JSON.stringify({ type: 'ack', action: 'close', result })); } catch (_) {}
                    try { wsSerialLog('socket.io close ok', {}); } catch (_) {}
                } catch (err) {
                    try { socket.send(JSON.stringify({ type: 'error', action: 'close', error: err.message })); } catch (_) {}
                    try { wsSerialLog('socket.io close error', { error: err && err.message }); } catch (_) {}
                }
            });

            socket.on('disconnect', () => {
                try { wsSerialLog('socket.io disconnected', { id: socket.id }); } catch (_) {}
            });
        });
        
        // 优雅关闭处理
        process.on('SIGTERM', () => {
            console.log('收到SIGTERM信号，开始优雅关闭...');
            server.close(() => {
                console.log('服务器已关闭');
                process.exit(0);
            });
        });
        
        process.on('SIGINT', () => {
            console.log('收到SIGINT信号，开始优雅关闭...');
            server.close(() => {
                console.log('服务器已关闭');
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('启动服务器失败:', error);
        process.exit(1);
    }
}

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    db.close();
    process.exit(0);
});

startServer();
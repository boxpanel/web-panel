const si = require('systeminformation');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const { getCpuNpuInfo, npuTiers, detectHardware, extractChipModel } = require('./hardware');
const ProcessUtils = require('./process-utils');
const { getNetworkInterfaces, getNetworkStats } = require('./network-native');

const execAsync = ProcessUtils.execCommand;

// 检查是否为Linux系统
function isLinux() {
    return os.platform() === 'linux';
}

// 格式化运行时间 - 使用Node.js原生API优化
function formatUptime(uptimeSeconds = process.uptime()) {
    // 使用Number.isFinite进行更严格的数值验证
    if (!Number.isFinite(uptimeSeconds) || uptimeSeconds < 0) {
        return '未知';
    }
    
    // 使用更高效的位运算和Math.trunc
    const totalMinutes = Math.trunc(uptimeSeconds / 60);
    const hours = Math.trunc(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    // 使用模板字符串和原生padStart，性能更好
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

// 内存优化工具函数
async function clearSystemCache() {
    try {
        if (!isLinux()) {
            return { success: false, message: '内存清理功能仅支持Linux系统' };
        }

        const commands = [
            'sync', // 同步文件系统
            'echo 1 > /proc/sys/vm/drop_caches', // 清理页面缓存
            'echo 2 > /proc/sys/vm/drop_caches', // 清理目录项和inode缓存
            'echo 3 > /proc/sys/vm/drop_caches'  // 清理所有缓存
        ];

        for (const cmd of commands) {
            await execAsync(cmd);
        }

        console.log('系统缓存清理完成');
        return { success: true, message: '系统缓存清理完成' };
    } catch (error) {
        console.error('清理系统缓存失败:', error);
        return { success: false, message: `缓存清理失败: ${error.message}` };
    }
}

async function optimizeMemory() {
    try {
        if (!isLinux()) {
            return { success: false, message: '内存优化功能仅支持Linux系统' };
        }

        const results = [];
        
        // 1. 清理系统缓存
        const cacheResult = await clearSystemCache();
        results.push(cacheResult);

        // 2. 清理交换空间（如果存在）
        try {
            await execAsync('swapoff -a && swapon -a');
            results.push({ success: true, message: '交换空间已重置' });
        } catch (swapError) {
            results.push({ success: false, message: '交换空间重置失败或不存在' });
        }

        // 3. 强制垃圾回收
        if (global.gc) {
            global.gc();
            results.push({ success: true, message: 'Node.js垃圾回收已执行' });
        }

        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;

        console.log('内存优化完成，成功执行', successCount, '/', totalCount, '项操作');
        return { 
            success: successCount > 0, 
            message: `内存优化完成，成功执行 ${successCount}/${totalCount} 项操作`,
            details: results
        };
    } catch (error) {
        console.error('内存优化失败:', error);
        return { success: false, message: `内存优化失败: ${error.message}` };
    }
}

async function getDetailedMemoryInfo() {
    try {
        const mem = await si.mem();
        const processes = await si.processes();
        
        // 获取内存使用最高的进程
        const topMemoryProcesses = processes.list
            .filter(proc => proc.memRss > 0)
            .sort((a, b) => (b.memRss || 0) - (a.memRss || 0))
            .slice(0, 10)
            .map(proc => ({
                pid: proc.pid,
                name: proc.name,
                memory: Math.round(proc.memRss / 1024 / 1024), // MB
                memoryPercent: ((proc.memRss / mem.total) * 100).toFixed(1)
            }));

        return {
            total: Math.round(mem.total / 1024 / 1024), // MB
            used: Math.round(mem.used / 1024 / 1024), // MB
            free: Math.round(mem.free / 1024 / 1024), // MB
            available: Math.round(mem.available / 1024 / 1024), // MB
            cached: Math.round((mem.cached || 0) / 1024 / 1024), // MB
            buffers: Math.round((mem.buffers || 0) / 1024 / 1024), // MB
            usagePercent: Math.round((mem.used / mem.total) * 100),
            availablePercent: Math.round((mem.available / mem.total) * 100),
            topProcesses: topMemoryProcesses
        };
    } catch (error) {
        console.error('获取详细内存信息失败:', error);
        throw error;
    }
}

// 获取系统信息
async function getSystemInfo() {
    try {
        const [cpu, mem, osInfo, currentLoad, fsSize, networkResult] = await Promise.all([
            si.cpu(),
            si.mem(),
            si.osInfo(),
            si.currentLoad(),
            si.fsSize(),
            getNetworkInterfaces()
        ]);
        
        const networkInterfaces = networkResult.success ? networkResult.interfaces : [];

        // 获取NPU信息 - 使用新的硬件检测逻辑
        let cpuNpuInfo;
        let detectedChipModel = null;
        try {
            const hardwareInfo = await detectHardware();
            detectedChipModel = extractChipModel(hardwareInfo);
            cpuNpuInfo = getCpuNpuInfo(detectedChipModel || cpu.brand);
            console.log(`[系统信息] 检测到芯片型号: ${detectedChipModel || cpu.brand}`);
        } catch (error) {
            console.log(`[系统信息] 硬件检测失败，使用默认CPU品牌: ${cpu.brand}`, error.message);
            cpuNpuInfo = getCpuNpuInfo(cpu.brand);
        }
        
        // 优先使用检测到的芯片型号，如果没有则使用原始CPU品牌
        const displayBrand = detectedChipModel || cpu.brand || cpu.manufacturer || '未知CPU';
        
        return {
            cpu: {
                manufacturer: cpu.manufacturer,
                brand: displayBrand,
                speed: cpu.speed,
                cores: cpu.cores,
                physicalCores: cpu.physicalCores,
                processors: cpu.processors,
                npu: cpuNpuInfo.npuInfo ? cpuNpuInfo.npuInfo.performance : '未知',
                npuTier: cpuNpuInfo.tier || npuTiers.none,
                supportFormats: cpuNpuInfo.npuInfo ? cpuNpuInfo.npuInfo.supportFormats : 'N/A',
                aiCapable: cpuNpuInfo.npuInfo && cpuNpuInfo.npuInfo.performance !== '无独立NPU' && cpuNpuInfo.npuInfo.performance !== '未知'
            },
            memory: {
                total: Math.round(mem.total / 1024 / 1024), // MB
                used: Math.round(mem.used / 1024 / 1024),
                free: Math.round(mem.free / 1024 / 1024),
                available: Math.round(mem.available / 1024 / 1024),
                usagePercent: Math.round((mem.used / mem.total) * 100)
            },
            os: {
                platform: osInfo.platform,
                distro: osInfo.distro,
                release: osInfo.release,
                codename: osInfo.codename,
                kernel: osInfo.kernel,
                arch: osInfo.arch,
                hostname: osInfo.hostname,
                uptime: formatUptime(osInfo.uptime)
            },
            load: {
                currentLoad: Math.round(currentLoad.currentLoad),
                avgLoad: currentLoad.avgLoad
            },
            disk: fsSize.map(fs => ({
                fs: fs.fs,
                type: fs.type,
                size: Math.round(fs.size / 1024 / 1024 / 1024), // GB
                used: Math.round(fs.used / 1024 / 1024 / 1024),
                available: Math.round(fs.available / 1024 / 1024 / 1024),
                usePercent: Math.round(fs.use),
                mount: fs.mount
            })),
            network: networkInterfaces.filter(iface => !iface.internal).map(iface => ({
                iface: iface.iface,
                ip4: iface.ip4,
                ip6: iface.ip6,
                mac: iface.mac,
                speed: iface.speed,
                type: iface.type
            }))
        };
    } catch (error) {
        console.error('获取系统信息失败:', error);
        throw error;
    }
}

// 获取实时性能数据
async function getPerformanceData() {
    try {
        const [currentLoad, mem, fsStats, networkResult] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsStats(),
            getNetworkStats()
        ]);
        
        const networkStats = networkResult.success ? networkResult.stats : [];

        return {
            cpu: {
                usage: Math.round((currentLoad && currentLoad.currentLoad) || 0),
                cores: (currentLoad && currentLoad.cpus) ? currentLoad.cpus.map(cpu => Math.round(cpu.load || 0)) : []
            },
            memory: {
                total: (mem && mem.total) || 0,
                used: (mem && mem.used) || 0,
                free: (mem && mem.free) || 0,
                available: (mem && mem.available) || 0,
                usagePercent: (mem && mem.total) ? Math.round((mem.used / mem.total) * 100) : 0
            },
            disk: {
                readSpeed: Math.round((fsStats && fsStats.rx_sec) || 0),
                writeSpeed: Math.round((fsStats && fsStats.wx_sec) || 0),
                readBytes: (fsStats && fsStats.rx_bytes) || 0,
                writeBytes: (fsStats && fsStats.wx_bytes) || 0
            },
            network: (networkStats || []).map(stat => ({
                iface: stat.iface,
                rx_sec: Math.round(stat.rx_sec || 0),
                tx_sec: Math.round(stat.tx_sec || 0),
                rx_bytes: stat.rx_bytes || 0,
                tx_bytes: stat.tx_bytes || 0
            }))
        };
    } catch (error) {
        console.error('获取性能数据失败:', error);
        throw error;
    }
}

// 获取进程信息
async function getProcessInfo() {
    try {
        const processes = await si.processes();
        
        // 按CPU使用率排序，取前10个
        const topCpuProcesses = processes.list
            .filter(proc => proc.pcpu > 0)
            .sort((a, b) => (b.pcpu || 0) - (a.pcpu || 0))
            .slice(0, 10)
            .map(proc => ({
                pid: proc.pid,
                name: proc.name,
                cpu: proc.pcpu.toFixed(1),
                memory: Math.round(proc.memRss / 1024 / 1024), // MB
                command: proc.command
            }));

        // 按内存使用率排序，取前10个
        const topMemoryProcesses = processes.list
            .filter(proc => proc.memRss > 0)
            .sort((a, b) => (b.memRss || 0) - (a.memRss || 0))
            .slice(0, 10)
            .map(proc => ({
                pid: proc.pid,
                name: proc.name,
                cpu: proc.pcpu.toFixed(1),
                memory: Math.round(proc.memRss / 1024 / 1024), // MB
                command: proc.command
            }));

        return {
            total: processes.all,
            running: processes.running,
            sleeping: processes.sleeping,
            blocked: processes.blocked,
            zombie: processes.zombie,
            topCpu: topCpuProcesses,
            topMemory: topMemoryProcesses
        };
    } catch (error) {
        console.error('获取进程信息失败:', error);
        throw error;
    }
}

module.exports = {
    isLinux,
    formatUptime,
    clearSystemCache,
    optimizeMemory,
    getDetailedMemoryInfo,
    getSystemInfo,
    getPerformanceData,
    getProcessInfo
};
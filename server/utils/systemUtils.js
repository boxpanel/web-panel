const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const execAsync = util.promisify(exec);

// 系统信息获取工具
class SystemUtils {
  // 获取CPU信息
  static async getCPUInfo() {
    try {
      const cpus = os.cpus();
      const loadAvg = os.loadavg();
      
      // 计算CPU使用率
      const cpuUsage = await this.getCPUUsage();
      
      return {
        model: cpus[0].model,
        cores: cpus.length,
        speed: cpus[0].speed,
        usage: cpuUsage,
        loadAverage: {
          '1min': loadAvg[0],
          '5min': loadAvg[1],
          '15min': loadAvg[2]
        }
      };
    } catch (error) {
      throw new Error(`获取CPU信息失败: ${error.message}`);
    }
  }

  // 计算CPU使用率
  static async getCPUUsage() {
    return new Promise((resolve) => {
      const startMeasure = this.cpuAverage();
      
      setTimeout(() => {
        const endMeasure = this.cpuAverage();
        const idleDifference = endMeasure.idle - startMeasure.idle;
        const totalDifference = endMeasure.total - startMeasure.total;
        const percentageCPU = 100 - ~~(100 * idleDifference / totalDifference);
        resolve(percentageCPU);
      }, 1000);
    });
  }

  // CPU平均值计算
  static cpuAverage() {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    
    for (let cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice;
      sys += cpu.times.sys;
      idle += cpu.times.idle;
      irq += cpu.times.irq;
    }
    
    const total = user + nice + sys + idle + irq;
    return { idle, total };
  }

  // 获取内存信息
  static getMemoryInfo() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usage: Math.round((usedMem / totalMem) * 100)
    };
  }

  // 获取磁盘信息
  static async getDiskInfo() {
    try {
      if (process.platform === 'win32') {
        // Windows系统
        const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
        const lines = stdout.trim().split('\n').slice(1);
        const disks = [];
        
        for (let line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
            const caption = parts[0];
            const freeSpace = parseInt(parts[1]);
            const size = parseInt(parts[2]);
            const used = size - freeSpace;
            
            disks.push({
              filesystem: caption,
              size,
              used,
              available: freeSpace,
              usage: Math.round((used / size) * 100),
              mountpoint: caption
            });
          }
        }
        return disks;
      } else {
        // Linux/Unix系统
        const { stdout } = await execAsync('df -h');
        const lines = stdout.trim().split('\n').slice(1);
        const disks = [];
        
        for (let line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 6) {
            disks.push({
              filesystem: parts[0],
              size: this.parseSize(parts[1]),
              used: this.parseSize(parts[2]),
              available: this.parseSize(parts[3]),
              usage: parseInt(parts[4]),
              mountpoint: parts[5]
            });
          }
        }
        return disks;
      }
    } catch (error) {
      throw new Error(`获取磁盘信息失败: ${error.message}`);
    }
  }

  // 解析大小字符串（如 "1.5G" -> 字节数）
  static parseSize(sizeStr) {
    const units = { 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4 };
    const match = sizeStr.match(/^([0-9.]+)([KMGT]?)$/);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2] || '';
    return Math.round(value * (units[unit] || 1));
  }

  // 获取网络信息
  static getNetworkInfo() {
    const interfaces = os.networkInterfaces();
    const networkInfo = [];
    
    for (let [name, addresses] of Object.entries(interfaces)) {
      for (let addr of addresses) {
        if (!addr.internal) {
          networkInfo.push({
            interface: name,
            address: addr.address,
            family: addr.family,
            mac: addr.mac
          });
        }
      }
    }
    
    return networkInfo;
  }

  // 获取系统运行时间
  static getUptime() {
    const uptime = os.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    return {
      total: uptime,
      formatted: `${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`
    };
  }

  // 获取进程列表
  static async getProcessList() {
    try {
      if (process.platform === 'win32') {
        // Windows系统
        const { stdout } = await execAsync('tasklist /fo csv');
        const lines = stdout.trim().split('\n');
        const processes = [];
        
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',').map(part => part.replace(/"/g, ''));
          if (parts.length >= 5) {
            processes.push({
              pid: parseInt(parts[1]),
              name: parts[0],
              memory: this.parseMemory(parts[4]),
              cpu: 0 // Windows tasklist不直接提供CPU使用率
            });
          }
        }
        return processes;
      } else {
        // Linux/Unix系统
        const { stdout } = await execAsync('ps aux --no-headers');
        const lines = stdout.trim().split('\n');
        const processes = [];
        
        for (let line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 11) {
            processes.push({
              pid: parseInt(parts[1]),
              name: parts[10],
              cpu: parseFloat(parts[2]),
              memory: parseFloat(parts[3]),
              user: parts[0],
              command: parts.slice(10).join(' ')
            });
          }
        }
        return processes;
      }
    } catch (error) {
      throw new Error(`获取进程列表失败: ${error.message}`);
    }
  }

  // 解析内存大小
  static parseMemory(memStr) {
    const match = memStr.match(/([0-9,]+)\s*([KMG]?B?)/i);
    if (!match) return 0;
    
    const value = parseInt(match[1].replace(/,/g, ''));
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'KB': return value * 1024;
      case 'MB': return value * 1024 * 1024;
      case 'GB': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  // 终止进程
  static async killProcess(pid, force = false) {
    try {
      if (process.platform === 'win32') {
        const command = force ? `taskkill /F /PID ${pid}` : `taskkill /PID ${pid}`;
        await execAsync(command);
      } else {
        const signal = force ? 'SIGKILL' : 'SIGTERM';
        process.kill(pid, signal);
      }
      return true;
    } catch (error) {
      throw new Error(`终止进程失败: ${error.message}`);
    }
  }

  // 获取系统服务状态（仅Linux）
  static async getSystemServices() {
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync('sc query type=service state=all');
        // 解析Windows服务信息
        const services = [];
        const serviceBlocks = stdout.split('\n\n');
        
        for (let block of serviceBlocks) {
          const lines = block.trim().split('\n');
          if (lines.length >= 3) {
            const nameMatch = lines[0].match(/SERVICE_NAME:\s*(.+)/);
            const stateMatch = lines[2].match(/STATE\s*:\s*\d+\s+(.+)/);
            
            if (nameMatch && stateMatch) {
              services.push({
                name: nameMatch[1],
                status: stateMatch[1].split(' ')[0],
                description: ''
              });
            }
          }
        }
        return services;
      } catch (error) {
        return [];
      }
    } else {
      try {
        const { stdout } = await execAsync('systemctl list-units --type=service --no-pager');
        const lines = stdout.trim().split('\n').slice(1);
        const services = [];
        
        for (let line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4) {
            services.push({
              name: parts[0],
              status: parts[2],
              description: parts.slice(4).join(' ')
            });
          }
        }
        return services;
      } catch (error) {
        return [];
      }
    }
  }

  // 格式化字节数
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // 获取系统基本信息
  static getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      release: os.release(),
      type: os.type(),
      version: os.version ? os.version() : 'N/A',
      nodeVersion: process.version,
      uptime: this.getUptime()
    };
  }
}

module.exports = SystemUtils;
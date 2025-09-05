const express = require('express');
const si = require('systeminformation');
const os = require('os');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get system overview
router.get('/overview', async (req, res) => {
  try {
    const [system, osInfo, cpu, mem] = await Promise.all([
      si.system(),
      si.osInfo(),
      si.cpu(),
      si.mem()
    ]);
    
    const systemUptime = os.uptime();
    
    res.json({
      system: {
        manufacturer: system.manufacturer,
        model: system.model,
        version: system.version
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        arch: osInfo.arch,
        hostname: osInfo.hostname,
        uptime: systemUptime
      },
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        speed: cpu.speed,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores
      },
      memory: {
        total: mem.total,
        free: mem.free,
        used: mem.used,
        active: mem.active,
        available: mem.available
      }
    });
  } catch (error) {
    console.error('System overview error:', error);
    res.status(500).json({ error: 'Failed to get system overview' });
  }
});

// Get CPU information and load
router.get('/cpu', async (req, res) => {
  try {
    const [cpu, currentLoad, cpuTemperature] = await Promise.all([
      si.cpu(),
      si.currentLoad(),
      si.cpuTemperature()
    ]);
    
    res.json({
      info: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        speed: cpu.speed,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        processors: cpu.processors
      },
      load: {
        avgLoad: currentLoad.avgLoad,
        currentLoad: currentLoad.currentLoad,
        currentLoadUser: currentLoad.currentLoadUser,
        currentLoadSystem: currentLoad.currentLoadSystem,
        currentLoadNice: currentLoad.currentLoadNice,
        currentLoadIdle: currentLoad.currentLoadIdle,
        cpus: currentLoad.cpus
      },
      temperature: cpuTemperature
    });
  } catch (error) {
    console.error('CPU info error:', error);
    res.status(500).json({ error: 'Failed to get CPU information' });
  }
});

// Get memory information
router.get('/memory', async (req, res) => {
  try {
    const mem = await si.mem();
    
    res.json({
      total: mem.total,
      free: mem.free,
      used: mem.used,
      active: mem.active,
      available: mem.available,
      buffers: mem.buffers,
      cached: mem.cached,
      slab: mem.slab,
      swaptotal: mem.swaptotal,
      swapused: mem.swapused,
      swapfree: mem.swapfree
    });
  } catch (error) {
    console.error('Memory info error:', error);
    res.status(500).json({ error: 'Failed to get memory information' });
  }
});

// Get disk information
router.get('/disk', async (req, res) => {
  try {
    const [fsSize, blockDevices, diskLayout] = await Promise.all([
      si.fsSize(),
      si.blockDevices(),
      si.diskLayout()
    ]);
    
    res.json({
      filesystems: fsSize,
      blockDevices: blockDevices,
      diskLayout: diskLayout
    });
  } catch (error) {
    console.error('Disk info error:', error);
    res.status(500).json({ error: 'Failed to get disk information' });
  }
});

// Get network information
router.get('/network', async (req, res) => {
  try {
    const [networkInterfaces, networkStats] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats()
    ]);
    
    res.json({
      interfaces: networkInterfaces,
      stats: networkStats
    });
  } catch (error) {
    console.error('Network info error:', error);
    res.status(500).json({ error: 'Failed to get network information' });
  }
});

// Get system load and uptime
router.get('/load', async (req, res) => {
  try {
    const [currentLoad, fullLoad, uptime] = await Promise.all([
      si.currentLoad(),
      si.fullLoad(),
      si.uptime()
    ]);
    
    res.json({
      currentLoad: currentLoad,
      fullLoad: fullLoad,
      uptime: uptime
    });
  } catch (error) {
    console.error('Load info error:', error);
    res.status(500).json({ error: 'Failed to get load information' });
  }
});

// Get running services (Linux only)
router.get('/services', async (req, res) => {
  try {
    const services = await si.services('*');
    res.json(services);
  } catch (error) {
    console.error('Services info error:', error);
    res.status(500).json({ error: 'Failed to get services information' });
  }
});

module.exports = router;
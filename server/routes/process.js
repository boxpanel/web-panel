const express = require('express');
const si = require('systeminformation');
const { exec } = require('child_process');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all processes
router.get('/', async (req, res) => {
  try {
    const processes = await si.processes();
    res.json(processes);
  } catch (error) {
    console.error('Processes error:', error);
    res.status(500).json({ error: 'Failed to get processes' });
  }
});

// Get process details by PID
router.get('/:pid', async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const processes = await si.processes();
    const process = processes.list.find(p => p.pid === pid);
    
    if (!process) {
      return res.status(404).json({ error: 'Process not found' });
    }
    
    res.json(process);
  } catch (error) {
    console.error('Process details error:', error);
    res.status(500).json({ error: 'Failed to get process details' });
  }
});

// Kill a process by PID
router.delete('/:pid', (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    
    if (!pid || pid <= 0) {
      return res.status(400).json({ error: 'Invalid PID' });
    }
    
    // Use kill command to terminate process
    exec(`kill ${pid}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Kill process error:', error);
        return res.status(500).json({ error: 'Failed to kill process' });
      }
      
      res.json({ message: `Process ${pid} terminated successfully` });
    });
  } catch (error) {
    console.error('Kill process error:', error);
    res.status(500).json({ error: 'Failed to kill process' });
  }
});

// Force kill a process by PID
router.delete('/:pid/force', (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    
    if (!pid || pid <= 0) {
      return res.status(400).json({ error: 'Invalid PID' });
    }
    
    // Use kill -9 command to force terminate process
    exec(`kill -9 ${pid}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Force kill process error:', error);
        return res.status(500).json({ error: 'Failed to force kill process' });
      }
      
      res.json({ message: `Process ${pid} force terminated successfully` });
    });
  } catch (error) {
    console.error('Force kill process error:', error);
    res.status(500).json({ error: 'Failed to force kill process' });
  }
});

// Get process tree
router.get('/tree/:pid', async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const processes = await si.processes();
    
    // Find the process and its children
    const findChildren = (parentPid) => {
      return processes.list.filter(p => p.parentPid === parentPid);
    };
    
    const buildTree = (process) => {
      const children = findChildren(process.pid);
      return {
        ...process,
        children: children.map(child => buildTree(child))
      };
    };
    
    const rootProcess = processes.list.find(p => p.pid === pid);
    if (!rootProcess) {
      return res.status(404).json({ error: 'Process not found' });
    }
    
    const tree = buildTree(rootProcess);
    res.json(tree);
  } catch (error) {
    console.error('Process tree error:', error);
    res.status(500).json({ error: 'Failed to get process tree' });
  }
});

// Search processes by name
router.get('/search/:name', async (req, res) => {
  try {
    const searchName = req.params.name.toLowerCase();
    const processes = await si.processes();
    
    const matchingProcesses = processes.list.filter(p => 
      p.name.toLowerCase().includes(searchName) || 
      p.command.toLowerCase().includes(searchName)
    );
    
    res.json({
      all: processes.all,
      running: processes.running,
      blocked: processes.blocked,
      sleeping: processes.sleeping,
      unknown: processes.unknown,
      list: matchingProcesses
    });
  } catch (error) {
    console.error('Process search error:', error);
    res.status(500).json({ error: 'Failed to search processes' });
  }
});

// Get top processes by CPU usage
router.get('/top/cpu', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const processes = await si.processes();
    
    const topProcesses = processes.list
      .sort((a, b) => b.pcpu - a.pcpu)
      .slice(0, limit);
    
    res.json({
      all: processes.all,
      running: processes.running,
      blocked: processes.blocked,
      sleeping: processes.sleeping,
      unknown: processes.unknown,
      list: topProcesses
    });
  } catch (error) {
    console.error('Top CPU processes error:', error);
    res.status(500).json({ error: 'Failed to get top CPU processes' });
  }
});

// Get top processes by memory usage
router.get('/top/memory', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const processes = await si.processes();
    
    const topProcesses = processes.list
      .sort((a, b) => b.pmem - a.pmem)
      .slice(0, limit);
    
    res.json({
      all: processes.all,
      running: processes.running,
      blocked: processes.blocked,
      sleeping: processes.sleeping,
      unknown: processes.unknown,
      list: topProcesses
    });
  } catch (error) {
    console.error('Top memory processes error:', error);
    res.status(500).json({ error: 'Failed to get top memory processes' });
  }
});

module.exports = router;
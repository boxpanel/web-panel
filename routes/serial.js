const express = require('express');
const router = express.Router();

const SerialService = require('../modules/serial-service');

router.get('/ports', async (req, res) => {
  try {
    const ports = await SerialService.listPorts();
    res.json({ success: true, ports });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 提示迁移到WebSocket
router.post('/open', async (req, res) => {
  try {
    const { path, baudRate } = req.body || {};
    if (!path || !baudRate) {
      return res.status(400).json({ success: false, message: '缺少参数: path 或 baudRate' });
    }
    const result = await SerialService.openPort(path, parseInt(baudRate, 10));
    res.json({ ...result, notice: '建议改用 Socket.IO 命名空间 /serial，事件 open' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/write', async (req, res) => {
  try {
    const { data, hex } = req.body || {};
    if (typeof data !== 'string') {
      return res.status(400).json({ success: false, message: '缺少参数: data' });
    }
    const result = await SerialService.writeData(data, !!hex);
    res.json({ ...result, notice: '建议改用 Socket.IO 命名空间 /serial，事件 write' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/close', async (req, res) => {
  try {
    const result = await SerialService.closePort();
    res.json({ ...result, notice: '建议改用 Socket.IO 命名空间 /serial，事件 close' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
const { SerialPort } = require('serialport');

let currentPort = null;
let currentPath = null;
let currentBaud = null;
let subscribers = new Set();
let receiveChunks = [];
let flushTimer = null;
const FLUSH_INTERVAL_MS = 50; // 聚合每50ms推送一次，降低消息频率

function startFlush() {
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      if (!receiveChunks.length) return;
      try {
        const buf = Buffer.concat(receiveChunks);
        receiveChunks = [];
        broadcast({ type: 'data', path: currentPath, data: buf.toString('hex') });
      } catch (_) {
        receiveChunks = [];
      }
    }, FLUSH_INTERVAL_MS);
  }
}

function stopFlush() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  receiveChunks = [];
}

async function listPorts() {
  try {
    const ports = await SerialPort.list();
    // 在 Linux 上补充特殊设备 /dev/ttyFIQ0（某些发行版/设备不在默认列表中）
    if (process.platform === 'linux') {
      const fs = require('fs');
      const specialPath = '/dev/ttyFIQ0';
      try {
        await fs.promises.access(specialPath, fs.constants.R_OK | fs.constants.W_OK);
        const exists = ports.some(p => p && p.path === specialPath);
        if (!exists) {
          ports.push({
            path: specialPath,
            friendlyName: 'FIQ Serial',
            vendorId: null,
            productId: null
          });
        }
      } catch (_) {
        // 不可访问或不存在则忽略
      }
    }
    return ports;
  } catch (err) {
    // 兜底：若默认枚举失败，在 Linux 上尝试返回 /dev/ttyFIQ0（若存在）
    const fallback = [];
    if (process.platform === 'linux') {
      const fs = require('fs');
      const specialPath = '/dev/ttyFIQ0';
      try {
        await fs.promises.access(specialPath, fs.constants.R_OK | fs.constants.W_OK);
        fallback.push({
          path: specialPath,
          friendlyName: 'FIQ Serial',
          vendorId: null,
          productId: null
        });
      } catch (_) {}
    }
    return fallback;
  }
}

function isOpen() {
  return !!(currentPort && currentPort.isOpen);
}

function broadcast(message) {
  for (const ws of subscribers) {
    try {
      ws.send(JSON.stringify(message));
    } catch (_) {}
  }
}

async function openPort(path, baudRate, opts = {}) {
  if (isOpen()) {
    if (currentPath === path && currentBaud === baudRate) {
      return { success: true, message: '串口已打开', path, baudRate };
    }
    await closePort();
  }
  return new Promise((resolve, reject) => {
    const options = {
      path,
      baudRate,
      autoOpen: false,
      highWaterMark: typeof opts.highWaterMark === 'number' ? opts.highWaterMark : 1024,
      rtscts: !!opts.rtscts,
      xon: !!opts.xon,
      xoff: !!opts.xoff,
      xany: !!opts.xany,
      dataBits: opts.dataBits || 8,
      stopBits: opts.stopBits || 1,
      parity: opts.parity || 'none',
    };
    try {
      currentPort = new SerialPort(options);
    } catch (e) {
      return reject(new Error('创建串口失败: ' + e.message));
    }
    currentPath = path;
    currentBaud = baudRate;
    currentPort.open(err => {
      if (err) {
        currentPort = null;
        currentPath = null;
        currentBaud = null;
        return reject(new Error('打开串口失败: ' + err.message));
      }
      // 数据监听
      currentPort.on('data', (chunk) => {
        // 高速情况下进行缓冲，定时聚合推送
        try {
          receiveChunks.push(Buffer.from(chunk));
          if (!flushTimer) startFlush();
        } catch (_) {}
      });
      currentPort.on('error', (e) => {
        broadcast({ type: 'error', path: currentPath, error: e.message });
      });
      currentPort.on('close', () => {
        broadcast({ type: 'close', path: currentPath });
        broadcast({ type: 'status', open: false, path: currentPath });
        stopFlush();
      });
      // 打开成功后广播状态
      broadcast({ type: 'status', open: true, path: currentPath, baudRate: currentBaud });
      startFlush();
      resolve({ success: true, message: '串口已打开', path, baudRate });
    });
  });
}

async function writeData(data, isHex = false) {
  if (!isOpen()) throw new Error('串口未打开');
  let buffer;
  if (isHex) {
    const cleaned = data.replace(/\s+/g, '');
    buffer = Buffer.from(cleaned, 'hex');
  } else {
    buffer = Buffer.from(data, 'utf8');
  }
  return new Promise((resolve, reject) => {
    currentPort.write(buffer, (err) => {
      if (err) return reject(new Error('写入失败: ' + err.message));
      currentPort.drain((drainErr) => {
        if (drainErr) return reject(new Error('刷新失败: ' + drainErr.message));
        resolve({ success: true, bytesWritten: buffer.length });
      });
    });
  });
}

async function closePort() {
  if (!isOpen()) return { success: true, message: '串口已关闭' };
  return new Promise((resolve, reject) => {
    currentPort.close((err) => {
      if (err) return reject(new Error('关闭失败: ' + err.message));
      currentPort = null;
      currentPath = null;
      currentBaud = null;
      broadcast({ type: 'status', open: false });
      stopFlush();
      resolve({ success: true, message: '串口已关闭' });
    });
  });
}

function addSubscriber(ws) {
  subscribers.add(ws);
  try { ws.on && ws.on('close', () => subscribers.delete(ws)); } catch (_) {}
  try { ws.on && ws.on('disconnect', () => subscribers.delete(ws)); } catch (_) {}
}

module.exports = {
  listPorts,
  openPort,
  writeData,
  closePort,
  isOpen,
  addSubscriber,
};
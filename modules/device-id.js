const crypto = require('crypto');
const si = require('systeminformation');

async function computeDeviceId() {
  try {
    const [system, baseboard, bios, cpu, nets, osInfo] = await Promise.all([
      si.system(),
      si.baseboard(),
      si.bios(),
      si.cpu(),
      si.networkInterfaces(),
      si.osInfo()
    ]);

    // 选择一个稳定的物理网卡MAC（排除虚拟/内部接口）
    const primaryMac = (nets || []).find(n => n && n.mac && !n.virtual && !n.internal)?.mac || '';

    const pieces = [
      system?.uuid || '',
      system?.serial || '',
      baseboard?.serial || '',
      bios?.serial || '',
      cpu?.processorId || cpu?.serial || '',
      primaryMac,
      osInfo?.hostname || ''
    ]
      .map(x => (x || '').trim().toLowerCase())
      .filter(Boolean);

    const material = `v1|${pieces.join('|')}`;
    // 使用 SHA256 生成稳定、唯一的设备识别码
    const hash = crypto.createHash('sha256').update(material).digest('hex').toUpperCase();
    return hash;
  } catch (err) {
    // 在极端情况下，退化为随机但持久化的标识（仅作为最后兜底）
    return crypto.randomBytes(16).toString('hex').toUpperCase();
  }
}

async function getOrCreateDeviceId(db) {
  let id = await db.getConfig('device_id');
  if (!id) {
    id = await computeDeviceId();
    await db.saveConfig('device_id', id);
  }
  return id;
}

module.exports = {
  computeDeviceId,
  getOrCreateDeviceId
};
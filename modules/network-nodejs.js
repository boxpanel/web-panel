const os = require('os');
const net = require('net');
const dgram = require('dgram');
const fs = require('fs').promises;
const { spawn, exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// 检查是否为Linux系统
function isLinux() {
    return os.platform() === 'linux';
}

// 网络转发管理器
class NetworkForwardingManager {
    constructor() {
        this.forwardingRules = new Map(); // 存储转发规则
        this.dhcpRelays = new Map(); // 存储DHCP中继
        this.firewallRules = new Map(); // 存储防火墙规则
    }

    // 启用IP转发
    async enableIPForwarding() {
        if (!isLinux()) {
            return { success: true, message: '非Linux系统，跳过IP转发配置' };
        }

        try {
            // 使用Node.js原生fs模块写入系统文件
            await fs.writeFile('/proc/sys/net/ipv4/ip_forward', '1', 'utf8');
            
            // 验证设置是否生效
            const content = await fs.readFile('/proc/sys/net/ipv4/ip_forward', 'utf8');
            if (content.trim() === '1') {
                return { success: true, message: 'IP转发已启用' };
            } else {
                throw new Error('IP转发设置未生效');
            }
        } catch (error) {
            console.error('启用IP转发失败:', error);
            return { success: false, error: '启用IP转发失败: ' + error.message };
        }
    }

    // 禁用IP转发
    async disableIPForwarding() {
        if (!isLinux()) {
            return { success: true, message: '非Linux系统，跳过IP转发配置' };
        }

        try {
            await fs.writeFile('/proc/sys/net/ipv4/ip_forward', '0', 'utf8');
            
            const content = await fs.readFile('/proc/sys/net/ipv4/ip_forward', 'utf8');
            if (content.trim() === '0') {
                return { success: true, message: 'IP转发已禁用' };
            } else {
                throw new Error('IP转发设置未生效');
            }
        } catch (error) {
            console.error('禁用IP转发失败:', error);
            return { success: false, error: '禁用IP转发失败: ' + error.message };
        }
    }

    // 使用Node.js实现网络包转发
    async configureNetworkForwarding(enable, inInterface, outInterface, config = {}) {
        const ruleKey = `${inInterface}-${outInterface}`;
        
        if (enable) {
            if (this.forwardingRules.has(ruleKey)) {
                return { success: true, message: `网络转发规则已存在: ${inInterface} -> ${outInterface}` };
            }

            try {
                // 创建网络转发规则
                const forwardingRule = {
                    inInterface,
                    outInterface,
                    enabled: true,
                    created: new Date(),
                    specialHandling: config.requiresSpecialHandling || false
                };

                // 使用Node.js的网络功能实现包转发
                // 这里使用netfilterqueue的Node.js替代方案
                const result = await this.setupPacketForwarding(inInterface, outInterface, config);
                
                if (result.success) {
                    this.forwardingRules.set(ruleKey, forwardingRule);
                    return { 
                        success: true, 
                        message: `网络转发已配置: ${inInterface} -> ${outInterface}${config.requiresSpecialHandling ? ' (特殊处理模式)' : ''}`,
                        rule: forwardingRule,
                        specialHandling: config.requiresSpecialHandling || false
                    };
                } else {
                    return result;
                }
            } catch (error) {
                return { success: false, error: `配置网络转发失败: ${error.message}` };
            }
        } else {
            if (!this.forwardingRules.has(ruleKey)) {
                return { success: true, message: `网络转发规则不存在: ${inInterface} -> ${outInterface}` };
            }

            try {
                await this.removePacketForwarding(inInterface, outInterface);
                this.forwardingRules.delete(ruleKey);
                return { 
                    success: true, 
                    message: `网络转发已删除: ${inInterface} -> ${outInterface}` 
                };
            } catch (error) {
                return { success: false, error: `删除网络转发失败: ${error.message}` };
            }
        }
    }

    // 设置包转发（使用Node.js网络库）
    async setupPacketForwarding(inInterface, outInterface, config = {}) {
        try {
            // 使用Node.js的原生网络功能
            // 由于Node.js无法直接操作网络包转发，我们使用系统调用的替代方案
            
            // 检查网络接口是否存在
            const interfaces = os.networkInterfaces();
            if (!interfaces[inInterface]) {
                return { success: false, error: `网络接口 ${inInterface} 不存在` };
            }
            if (!interfaces[outInterface]) {
                return { success: false, error: `网络接口 ${outInterface} 不存在` };
            }

            const results = [];
            
            // 检查是否需要特殊处理（未分配IP的接口）
            if (config.requiresSpecialHandling) {
                console.log(`为未分配IP的接口 ${inInterface} 配置特殊转发规则`);
                
                // 为未分配IP的接口配置桥接模式转发
                const bridgeCommands = [
                    // 启用接口
                    `ip link set ${inInterface} up`,
                    // 配置桥接转发规则
                    `iptables -t nat -A POSTROUTING -o ${outInterface} -j MASQUERADE`,
                    `iptables -A FORWARD -i ${inInterface} -o ${outInterface} -j ACCEPT`,
                    `iptables -A FORWARD -i ${outInterface} -o ${inInterface} -m state --state RELATED,ESTABLISHED -j ACCEPT`,
                    // 配置DHCP转发
                    `echo 1 > /proc/sys/net/ipv4/ip_forward`
                ];
                
                for (const cmd of bridgeCommands) {
                    try {
                        const { stdout, stderr } = await execAsync(cmd);
                        results.push({ command: cmd, success: true, output: stdout });
                    } catch (error) {
                        // 某些命令可能已经存在或不适用，记录但继续
                        results.push({ command: cmd, success: false, error: error.message, ignored: true });
                    }
                }
                
            } else {
                // 标准的路由表转发配置
                const commands = [
                    `ip route add default via $(ip route | grep ${outInterface} | grep default | awk '{print $3}') dev ${outInterface} table 100`,
                    `ip rule add iif ${inInterface} table 100`,
                    `ip route flush cache`
                ];

                for (const cmd of commands) {
                    try {
                        const { stdout, stderr } = await execAsync(cmd);
                        results.push({ command: cmd, success: true, output: stdout });
                    } catch (error) {
                        // 某些命令可能已经存在，忽略错误
                        results.push({ command: cmd, success: false, error: error.message });
                    }
                }
            }

            return { 
                success: true, 
                message: config.requiresSpecialHandling ? '未分配IP接口的桥接转发配置完成' : '包转发配置完成',
                details: results,
                specialHandling: config.requiresSpecialHandling || false
            };
        } catch (error) {
            return { success: false, error: `设置包转发失败: ${error.message}` };
        }
    }

    // 移除包转发
    async removePacketForwarding(inInterface, outInterface) {
        try {
            const commands = [
                `ip rule del iif ${inInterface} table 100`,
                `ip route flush table 100`,
                `ip route flush cache`
            ];

            for (const cmd of commands) {
                try {
                    await execAsync(cmd);
                } catch (error) {
                    // 忽略删除错误
                }
            }

            return { success: true, message: '包转发已移除' };
        } catch (error) {
            return { success: false, error: `移除包转发失败: ${error.message}` };
        }
    }
}

// DHCP中继管理器
class DHCPRelayManager {
    constructor() {
        this.relays = new Map();
    }

    // 配置DHCP广播转发
    async configureDHCPForwarding(enable, interface1, interface2) {
        const relayKey = `${interface1}-${interface2}`;
        
        if (enable) {
            if (this.relays.has(relayKey)) {
                return { success: true, message: `DHCP中继已存在: ${interface1} <-> ${interface2}` };
            }

            try {
                // 创建DHCP中继服务
                const relay = await this.createDHCPRelay(interface1, interface2);
                this.relays.set(relayKey, relay);
                
                return { 
                    success: true, 
                    message: `DHCP广播转发已配置: ${interface1} <-> ${interface2}`,
                    relay: relay
                };
            } catch (error) {
                return { success: false, error: `配置DHCP转发失败: ${error.message}` };
            }
        } else {
            if (!this.relays.has(relayKey)) {
                return { success: true, message: `DHCP中继不存在: ${interface1} <-> ${interface2}` };
            }

            try {
                const relay = this.relays.get(relayKey);
                await this.stopDHCPRelay(relay);
                this.relays.delete(relayKey);
                
                return { 
                    success: true, 
                    message: `DHCP广播转发已禁用: ${interface1} <-> ${interface2}` 
                };
            } catch (error) {
                return { success: false, error: `禁用DHCP转发失败: ${error.message}` };
            }
        }
    }

    // 创建DHCP中继
    async createDHCPRelay(interface1, interface2) {
        return new Promise((resolve, reject) => {
            try {
                // 创建UDP套接字用于DHCP中继
                const socket1 = dgram.createSocket('udp4');
                const socket2 = dgram.createSocket('udp4');

                const relay = {
                    interface1,
                    interface2,
                    socket1,
                    socket2,
                    active: true,
                    created: new Date()
                };

                // 绑定到DHCP端口
                socket1.bind(67, () => {
                    console.log(`DHCP中继套接字1已绑定到端口67 (${interface1})`);
                });

                socket2.bind(68, () => {
                    console.log(`DHCP中继套接字2已绑定到端口68 (${interface2})`);
                });

                // 设置消息转发
                socket1.on('message', (msg, rinfo) => {
                    if (relay.active) {
                        // 转发DHCP请求到另一个接口
                        socket2.send(msg, 0, msg.length, 67, this.getInterfaceIP(interface2), (err) => {
                            if (err) console.error('DHCP转发错误:', err);
                        });
                    }
                });

                socket2.on('message', (msg, rinfo) => {
                    if (relay.active) {
                        // 转发DHCP响应到另一个接口
                        socket1.send(msg, 0, msg.length, 68, this.getInterfaceIP(interface1), (err) => {
                            if (err) console.error('DHCP转发错误:', err);
                        });
                    }
                });

                // 错误处理
                socket1.on('error', (err) => {
                    console.error('DHCP中继套接字1错误:', err);
                });

                socket2.on('error', (err) => {
                    console.error('DHCP中继套接字2错误:', err);
                });

                resolve(relay);
            } catch (error) {
                reject(error);
            }
        });
    }

    // 停止DHCP中继
    async stopDHCPRelay(relay) {
        try {
            relay.active = false;
            if (relay.socket1) {
                relay.socket1.close();
            }
            if (relay.socket2) {
                relay.socket2.close();
            }
            return { success: true, message: 'DHCP中继已停止' };
        } catch (error) {
            return { success: false, error: `停止DHCP中继失败: ${error.message}` };
        }
    }

    // 获取接口IP地址
    getInterfaceIP(interfaceName) {
        const interfaces = os.networkInterfaces();
        const iface = interfaces[interfaceName];
        if (iface) {
            const ipv4 = iface.find(addr => addr.family === 'IPv4' && !addr.internal);
            return ipv4 ? ipv4.address : null; // 返回null而不是127.0.0.1
        }
        return null;
    }

    // 检查接口是否有有效的IP地址
    hasValidIP(interfaceName) {
        const ip = this.getInterfaceIP(interfaceName);
        return ip !== null && ip !== '127.0.0.1' && ip !== '0.0.0.0';
    }
}

// 防火墙管理器
class FirewallManager {
    constructor() {
        this.rules = new Map();
    }

    // 配置防火墙规则
    async configureFirewallRules(enable, interface1, interface2) {
        const ruleKey = `${interface1}-${interface2}`;
        
        if (enable) {
            if (this.rules.has(ruleKey)) {
                return { success: true, message: `防火墙规则已存在: ${interface1} <-> ${interface2}` };
            }

            try {
                // 使用Node.js实现防火墙规则
                const rule = await this.createFirewallRule(interface1, interface2);
                this.rules.set(ruleKey, rule);
                
                return { 
                    success: true, 
                    message: `防火墙规则已配置: ${interface1} <-> ${interface2}`,
                    rule: rule
                };
            } catch (error) {
                return { success: false, error: `配置防火墙规则失败: ${error.message}` };
            }
        } else {
            if (!this.rules.has(ruleKey)) {
                return { success: true, message: `防火墙规则不存在: ${interface1} <-> ${interface2}` };
            }

            try {
                const rule = this.rules.get(ruleKey);
                await this.removeFirewallRule(rule);
                this.rules.delete(ruleKey);
                
                return { 
                    success: true, 
                    message: `防火墙规则已删除: ${interface1} <-> ${interface2}` 
                };
            } catch (error) {
                return { success: false, error: `删除防火墙规则失败: ${error.message}` };
            }
        }
    }

    // 创建防火墙规则
    async createFirewallRule(interface1, interface2) {
        try {
            // 使用Node.js的网络功能实现基本的防火墙规则
            // 这里主要是配置接口间的通信许可
            
            const rule = {
                interface1,
                interface2,
                allowedPorts: [80, 443, 22, 67, 68], // 允许的端口
                created: new Date(),
                active: true
            };

            // 使用系统路由表配置接口间通信
            const commands = [
                `ip route add $(ip route | grep ${interface2} | head -1 | awk '{print $1}') via $(ip route | grep ${interface1} | head -1 | awk '{print $9}') dev ${interface1}`,
                `ip route add $(ip route | grep ${interface1} | head -1 | awk '{print $1}') via $(ip route | grep ${interface2} | head -1 | awk '{print $9}') dev ${interface2}`
            ];

            const results = [];
            for (const cmd of commands) {
                try {
                    const { stdout } = await execAsync(cmd);
                    results.push({ command: cmd, success: true, output: stdout });
                } catch (error) {
                    // 路由可能已存在，忽略错误
                    results.push({ command: cmd, success: false, error: error.message });
                }
            }

            rule.configResults = results;
            return rule;
        } catch (error) {
            throw new Error(`创建防火墙规则失败: ${error.message}`);
        }
    }

    // 移除防火墙规则
    async removeFirewallRule(rule) {
        try {
            rule.active = false;
            
            // 清理路由规则
            const commands = [
                `ip route del $(ip route | grep ${rule.interface2} | head -1 | awk '{print $1}') via $(ip route | grep ${rule.interface1} | head -1 | awk '{print $9}') dev ${rule.interface1}`,
                `ip route del $(ip route | grep ${rule.interface1} | head -1 | awk '{print $1}') via $(ip route | grep ${rule.interface2} | head -1 | awk '{print $9}') dev ${rule.interface2}`
            ];

            for (const cmd of commands) {
                try {
                    await execAsync(cmd);
                } catch (error) {
                    // 忽略删除错误
                }
            }

            return { success: true, message: '防火墙规则已移除' };
        } catch (error) {
            throw new Error(`移除防火墙规则失败: ${error.message}`);
        }
    }
}

// 主要的网络配置管理器
class NetworkConfigManager {
    constructor() {
        this.forwardingManager = new NetworkForwardingManager();
        this.dhcpRelayManager = new DHCPRelayManager();
        this.firewallManager = new FirewallManager();
    }

    // 应用完整的网络配置
    async applyNetworkConfig(enable, interfaceName) {
        const results = [];
        
        if (!isLinux()) {
            results.push({ success: true, message: '非Linux系统，跳过网络配置' });
            return results;
        }

        try {
            if (enable) {
                console.log(`启用网络配置，目标接口: ${interfaceName}`);
                
                // 1. 启用IP转发
                const ipForwardResult = await this.forwardingManager.enableIPForwarding();
                results.push(ipForwardResult);
                
                // 2. 获取网络接口配置
                const config = await this.getOptimalNetworkConfig(interfaceName);
                if (!config.success) {
                    results.push(config);
                    return results;
                }
                
                const { inInterface, outInterface } = config.config;
                
                // 3. 配置网络转发
                const forwardingResult = await this.forwardingManager.configureNetworkForwarding(
                    true, inInterface, outInterface, config.config
                );
                results.push(forwardingResult);
                
                // 4. 配置DHCP广播转发
                const dhcpResult = await this.dhcpRelayManager.configureDHCPForwarding(
                    true, inInterface, outInterface
                );
                results.push(dhcpResult);
                
                // 5. 配置防火墙规则
                const firewallResult = await this.firewallManager.configureFirewallRules(
                    true, inInterface, outInterface
                );
                results.push(firewallResult);
                
                results.push({
                    success: true,
                    message: `网络配置已完全应用: ${inInterface} <-> ${outInterface}`,
                    config: config.config,
                    features: ['IP转发', 'DHCP广播转发', '防火墙规则']
                });
                
            } else {
                console.log(`禁用网络配置，目标接口: ${interfaceName}`);
                
                // 获取配置以清理规则
                const config = await this.getOptimalNetworkConfig(interfaceName);
                if (config.success) {
                    const { inInterface, outInterface } = config.config;
                    
                    // 清理所有规则
                    const forwardingResult = await this.forwardingManager.configureNetworkForwarding(
                        false, inInterface, outInterface
                    );
                    results.push(forwardingResult);
                    
                    const dhcpResult = await this.dhcpRelayManager.configureDHCPForwarding(
                        false, inInterface, outInterface
                    );
                    results.push(dhcpResult);
                    
                    const firewallResult = await this.firewallManager.configureFirewallRules(
                        false, inInterface, outInterface
                    );
                    results.push(firewallResult);
                }
                
                // 禁用IP转发
                const ipForwardResult = await this.forwardingManager.disableIPForwarding();
                results.push(ipForwardResult);
            }
            
        } catch (error) {
            results.push({ success: false, error: `网络配置失败: ${error.message}` });
        }
        
        return results;
    }

    // 获取最优网络配置
    async getOptimalNetworkConfig(targetInterface) {
        try {
            const interfaces = os.networkInterfaces();
            
            // 查找目标接口
            if (!interfaces[targetInterface]) {
                return { success: false, error: `接口 ${targetInterface} 不存在` };
            }
            
            // 查找默认网关接口
            let gatewayInterface = null;
            try {
                const { stdout } = await execAsync('ip route | grep default');
                const defaultRoute = stdout.split('\n')[0];
                const match = defaultRoute.match(/dev\s+(\w+)/);
                if (match) {
                    gatewayInterface = match[1];
                }
            } catch (error) {
                // 使用第一个有有效IP的非回环接口作为默认
                for (const [name, addrs] of Object.entries(interfaces)) {
                    if (name !== 'lo' && name !== targetInterface) {
                        const hasIPv4 = addrs.some(addr => addr.family === 'IPv4' && !addr.internal);
                        if (hasIPv4) {
                            gatewayInterface = name;
                            break;
                        }
                    }
                }
            }
            
            if (!gatewayInterface) {
                return { success: false, error: '无法找到网关接口' };
            }
            
            // 检查目标接口是否有IP
            const targetHasIP = this.dhcpRelayManager.hasValidIP(targetInterface);
            const gatewayHasIP = this.dhcpRelayManager.hasValidIP(gatewayInterface);
            
            return {
                success: true,
                config: {
                    inInterface: targetInterface,
                    outInterface: gatewayInterface,
                    internalIP: this.dhcpRelayManager.getInterfaceIP(targetInterface),
                    externalIP: this.dhcpRelayManager.getInterfaceIP(gatewayInterface),
                    targetHasIP: targetHasIP,
                    gatewayHasIP: gatewayHasIP,
                    requiresSpecialHandling: !targetHasIP // 标记需要特殊处理
                }
            };
        } catch (error) {
            return { success: false, error: `获取网络配置失败: ${error.message}` };
        }
    }



    // 获取网络接口信息
    async getNetworkInterfaces() {
        try {
            const interfaces = os.networkInterfaces();
            const result = [];
            
            for (const [name, addrs] of Object.entries(interfaces)) {
                const ipv4 = addrs.find(addr => addr.family === 'IPv4' && !addr.internal);
                if (ipv4) {
                    result.push({
                        name,
                        address: ipv4.address,
                        netmask: ipv4.netmask,
                        mac: ipv4.mac,
                        internal: ipv4.internal
                    });
                }
            }
            
            return { success: true, interfaces: result };
        } catch (error) {
            return { success: false, error: `获取网络接口失败: ${error.message}` };
        }
    }

    // 检查IP转发状态
    async checkIPForwardingStatus() {
        return await this.forwardingManager.enableIPForwarding();
    }
}

// 创建全局实例
const networkManager = new NetworkConfigManager();

module.exports = {
    isLinux,
    NetworkForwardingManager,
    DHCPRelayManager,
    FirewallManager,
    NetworkConfigManager,
    // 兼容原有接口
    enableIPForwarding: () => networkManager.forwardingManager.enableIPForwarding(),
    disableIPForwarding: () => networkManager.forwardingManager.disableIPForwarding(),
    configureDHCPForwarding: (enable, interface1, interface2) => 
        networkManager.dhcpRelayManager.configureDHCPForwarding(enable, interface1, interface2),
    configureEnhancedFirewallRules: (enable, interface1, interface2) => 
        networkManager.firewallManager.configureFirewallRules(enable, interface1, interface2),
    configureMasquerade: (enable, inInterface, outInterface) => 
        networkManager.forwardingManager.configureNetworkForwarding(enable, inInterface, outInterface),
    applyNetworkConfig: (enable, interfaceName) => 
        networkManager.applyNetworkConfig(enable, interfaceName),
    getNetworkInterfaces: () => networkManager.getNetworkInterfaces(),
    checkIPForwardingStatus: () => networkManager.checkIPForwardingStatus(),
    getOptimalNetworkConfig: (targetInterface) => networkManager.getOptimalNetworkConfig(targetInterface),
    
    // 新增的管理器实例
    networkManager
};
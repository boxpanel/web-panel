const os = require('os');
const net = require('net');
const fs = require('fs').promises;
const path = require('path');
const ProcessUtils = require('./process-utils');

// 检查是否为Linux系统
function isLinux() {
    return os.platform() === 'linux';
}

// 子网掩码转CIDR
function subnetMaskToCIDR(subnetMask) {
    if (!subnetMask) return 24; // 默认值
    
    const parts = subnetMask.split('.');
    if (parts.length !== 4) return 24;
    
    let cidr = 0;
    for (const part of parts) {
        const num = parseInt(part);
        if (isNaN(num) || num < 0 || num > 255) return 24;
        
        // 计算二进制中1的个数
        let binary = num;
        while (binary) {
            cidr += binary & 1;
            binary >>= 1;
        }
    }
    
    return cidr;
}

// 使用Node.js原生方法启用IP转发
async function enableIPForwarding() {
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

// 使用Node.js原生方法禁用IP转发
async function disableIPForwarding() {
    if (!isLinux()) {
        return { success: true, message: '非Linux系统，跳过IP转发配置' };
    }
    
    try {
        // 使用Node.js原生fs模块写入系统文件
        await fs.writeFile('/proc/sys/net/ipv4/ip_forward', '0', 'utf8');
        
        // 验证设置是否生效
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

// 检测网络接口的IP配置类型（DHCP或静态）
async function detectIPConfigType(interfaceName) {
    if (os.platform() === 'win32') {
        try {
            // 使用netsh命令检查接口配置
            const result = await ProcessUtils.execCommand(`netsh interface ip show config name="${interfaceName}"`);
            
            if (result.code === 0 && result.stdout) {
                const output = result.stdout;
                // 检查中文输出
                if (output.includes('DHCP 已启用') && output.includes('是')) {
                    return 'dhcp';
                } else if (output.includes('DHCP 已启用') && output.includes('否')) {
                    return 'static';
                }
                
                // 检查英文输出
                const lowerOutput = output.toLowerCase();
                if (lowerOutput.includes('dhcp enabled') && lowerOutput.includes('yes')) {
                    return 'dhcp';
                } else if (lowerOutput.includes('dhcp enabled') && lowerOutput.includes('no')) {
                    return 'static';
                } else if (lowerOutput.includes('自动配置') || lowerOutput.includes('dhcp')) {
                    return 'dhcp';
                } else if (lowerOutput.includes('静态') || lowerOutput.includes('static')) {
                    return 'static';
                }
            }
        } catch (error) {
            console.warn(`检测接口 ${interfaceName} 的IP配置类型失败:`, error.message);
        }
    } else if (os.platform() === 'linux') {
        try {
            // Linux环境：使用nmcli命令检测
            const result = await ProcessUtils.execCommand(`nmcli connection show "${interfaceName}" | grep ipv4.method`);
            if (result.code === 0 && result.stdout) {
                if (result.stdout.includes('manual')) {
                    return 'static';
                } else if (result.stdout.includes('auto')) {
                    return 'dhcp';
                }
            }
        } catch (nmcliError) {
            // 如果nmcli失败，尝试检查网络配置文件
            try {
                // 检查 /etc/network/interfaces (Debian/Ubuntu)
                const interfacesContent = await fs.readFile('/etc/network/interfaces', 'utf8');
                if (interfacesContent.includes(`iface ${interfaceName} inet static`)) {
                    return 'static';
                } else if (interfacesContent.includes(`iface ${interfaceName} inet dhcp`)) {
                    return 'dhcp';
                }
            } catch (interfacesError) {
                // 检查 netplan 配置 (Ubuntu 18+)
                try {
                    const netplanDir = '/etc/netplan';
                    const files = await fs.readdir(netplanDir);
                    for (const file of files) {
                        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                            const content = await fs.readFile(path.join(netplanDir, file), 'utf8');
                            if (content.includes(interfaceName)) {
                                if (content.includes('dhcp4: true') || content.includes('dhcp6: true')) {
                                    return 'dhcp';
                                } else if (content.includes('addresses:')) {
                                    return 'static';
                                }
                            }
                        }
                    }
                } catch (netplanError) {
                    console.warn(`检测接口 ${interfaceName} 的IP配置类型失败:`, netplanError.message);
                }
            }
        }
    }
    
    // 默认返回DHCP
    return 'dhcp';
}

// 使用Node.js原生方法获取网络接口信息
async function getNetworkInterfaces() {
    try {
        const interfaces = os.networkInterfaces();
        const result = [];
        
        for (const [name, addresses] of Object.entries(interfaces)) {
            // 过滤掉回环接口
            if (name === 'lo' || name.startsWith('lo:') || name.includes('Loopback')) continue;
            
            const ipv4 = addresses.find(addr => addr.family === 'IPv4' && !addr.internal);
            const ipv6 = addresses.find(addr => addr.family === 'IPv6' && !addr.internal);
            
            // 检测IP配置类型
            const ipMode = await detectIPConfigType(name);
            
            // 包含所有非回环接口，即使没有IP地址
            result.push({
                name: name,
                ip: ipv4 ? ipv4.address : null, // 前端期望的字段名
                ip4: ipv4 ? ipv4.address : null,
                ip6: ipv6 ? ipv6.address : null,
                mac: ipv4 ? ipv4.mac : (ipv6 ? ipv6.mac : (addresses[0] ? addresses[0].mac : null)),
                netmask: ipv4 ? ipv4.netmask : null,
                cidr: ipv4 ? subnetMaskToCIDR(ipv4.netmask) : null,
                internal: false,
                family: ipv4 ? 'IPv4' : (ipv6 ? 'IPv6' : 'Unknown'),
                status: (ipv4 || ipv6) ? 'up' : 'down', // 前端期望的状态字段
                connected: !!(ipv4 || ipv6), // 保留原有字段
                ipMode: ipMode // 使用检测到的IP配置类型
            });
        }
        
        // 在Windows系统上，还需要检查断开连接的接口
        if (os.platform() === 'win32') {
            try {
                const result_ipconfig = await ProcessUtils.execCommand('ipconfig /all');
                
                if (result_ipconfig.code === 0) {
                    const lines = result_ipconfig.stdout.split('\n');
                    let currentAdapter = null;
                    let isDisconnected = false;
                    
                    for (const line of lines) {
                        // 检测适配器名称 - 匹配各种格式的适配器
                        const adapterMatch = line.match(/^(以太网适配器|未知适配器|Unknown adapter|Ethernet adapter)\s+(.+):/);
                        if (adapterMatch) {
                            currentAdapter = adapterMatch[2].trim();
                            isDisconnected = false;
                        }
                        
                        // 检测媒体断开连接状态
                        if (line.includes('媒体已断开连接') || line.includes('Media disconnected')) {
                            isDisconnected = true;
                        }
                        
                        // 检测物理地址
                        const macMatch = line.match(/物理地址[.\s]*:\s*([0-9A-F-]+)/i);
                        if (macMatch && currentAdapter && isDisconnected) {
                            // 检查是否已经在结果中
                            const exists = result.find(iface => iface.name === currentAdapter);
                            if (!exists && !currentAdapter.includes('Loopback')) {
                                result.push({
                                    name: currentAdapter,
                                    ip: null, // 前端期望的字段名
                                    ip4: null,
                                    ip6: null,
                                    mac: macMatch[1],
                                    netmask: null,
                                    cidr: null,
                                    internal: false,
                                    family: 'Unknown',
                                    status: 'down', // 前端期望的状态字段
                                    connected: false, // 保留原有字段
                                    ipMode: 'dhcp' // 默认为DHCP
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('获取断开连接的接口失败:', error.message);
            }
        }
        
        // 在Linux系统上，还需要检查所有可用的网络接口
        if (os.platform() === 'linux') {
            console.log('[Linux网络接口] 开始获取Linux系统网络接口信息...');
            
            try {
                // 首先检查ip命令是否可用
                const ipCommandExists = await ProcessUtils.commandExists('ip');
                if (!ipCommandExists) {
                    console.error('[Linux网络接口] ip命令不存在，尝试使用ifconfig命令');
                    throw new Error('ip命令不可用，请安装iproute2包: sudo apt install iproute2');
                }
                
                // 方法1: 尝试直接读取/sys/class/net/目录
                let interfaceNames = [];
                try {
                    console.log('[Linux网络接口] 尝试读取 /sys/class/net/ 目录');
                    const lsResult = await ProcessUtils.execCommand('ls -la /sys/class/net/');
                    if (lsResult.code === 0) {
                        console.log('[Linux网络接口] /sys/class/net/ 目录内容:');
                        console.log(lsResult.stdout);
                        
                        // 解析ls输出，提取接口名称
                        const lines = lsResult.stdout.split('\n');
                        for (const line of lines) {
                            // 匹配符号链接行: "lrwxrwxrwx  1 root root 0 1月   1  2021 eth0 -> ../../devices/platform/2a220000.ethernet/net/eth0"
                            const linkMatch = line.match(/^l[rwx-]+\s+\d+\s+\w+\s+\w+\s+\d+\s+.+?\s+(\w+)\s+->/);
                            if (linkMatch) {
                                const interfaceName = linkMatch[1];
                                if (interfaceName !== 'lo' && !interfaceName.startsWith('lo:')) {
                                    interfaceNames.push(interfaceName);
                                    console.log(`[Linux网络接口] 从/sys/class/net/发现接口: ${interfaceName}`);
                                }
                            }
                        }
                    }
                } catch (sysError) {
                    console.warn(`[Linux网络接口] 读取/sys/class/net/失败: ${sysError.message}`);
                }
                
                // 方法2: 使用ip link命令获取所有网络接口（作为备用或补充）
                console.log('[Linux网络接口] 执行命令: ip link show');
                const result_ip = await ProcessUtils.execCommand('ip link show');
                
                if (result_ip.code === 0) {
                    console.log('[Linux网络接口] ip link show 执行成功');
                    const lines = result_ip.stdout.split('\n');
                    
                    for (const line of lines) {
                        // 匹配接口行格式: "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP mode DEFAULT group default qlen 1000"
                        const interfaceMatch = line.match(/^\d+:\s+([^:@]+)[@:]?\s*<([^>]*)>/);
                        if (interfaceMatch) {
                            const interfaceName = interfaceMatch[1].trim();
                            const flags = interfaceMatch[2];
                            
                            // 跳过回环接口和虚拟接口
                            if (interfaceName === 'lo' || interfaceName.startsWith('lo:') || 
                                interfaceName.includes('@') || interfaceName.startsWith('veth')) {
                                console.log(`[Linux网络接口] 跳过接口: ${interfaceName}`);
                                continue;
                            }
                            
                            // 添加到接口列表（去重）
                            if (!interfaceNames.includes(interfaceName)) {
                                interfaceNames.push(interfaceName);
                                console.log(`[Linux网络接口] 从ip link发现接口: ${interfaceName}, 标志: ${flags}`);
                            }
                        }
                    }
                } else {
                    console.error(`[Linux网络接口] ip link show 命令执行失败: 退出码=${result_ip.code}, 错误=${result_ip.stderr}`);
                }
                
                // 处理发现的每个接口
                console.log(`[Linux网络接口] 总共发现 ${interfaceNames.length} 个接口: ${interfaceNames.join(', ')}`);
                
                for (const interfaceName of interfaceNames) {
                    try {
                        console.log(`[Linux网络接口] 开始处理接口: ${interfaceName}`);
                        
                        // 检查是否已经在结果中
                        const exists = result.find(iface => iface.name === interfaceName);
                        if (exists) {
                            console.log(`[Linux网络接口] 接口 ${interfaceName} 已存在，跳过`);
                            continue;
                        }
                        
                        // 获取接口详细信息
                        const interfaceDetails = await ProcessUtils.execCommand(`ip link show ${interfaceName}`);
                        let isUp = false;
                        let isRunning = false;
                        let macAddress = null;
                        
                        if (interfaceDetails.code === 0) {
                            const detailLines = interfaceDetails.stdout.split('\n');
                            for (const detailLine of detailLines) {
                                // 检查接口状态
                                const flagMatch = detailLine.match(/<([^>]*)>/);
                                if (flagMatch) {
                                    const flags = flagMatch[1];
                                    isUp = flags.includes('UP');
                                    isRunning = flags.includes('LOWER_UP');
                                }
                                
                                // 获取MAC地址
                                const macMatch = detailLine.match(/link\/ether\s+([a-f0-9:]{17})/i);
                                if (macMatch) {
                                    macAddress = macMatch[1];
                                }
                            }
                        }
                        
                        console.log(`[Linux网络接口] 接口 ${interfaceName} 状态: UP=${isUp}, RUNNING=${isRunning}, MAC=${macAddress}`);
                        
                        // 如果通过ip命令没有获取到MAC地址，尝试读取sys文件
                        if (!macAddress) {
                            try {
                                const macResult = await ProcessUtils.execCommand(`cat /sys/class/net/${interfaceName}/address 2>/dev/null`);
                                if (macResult.code === 0 && macResult.stdout.trim()) {
                                    macAddress = macResult.stdout.trim();
                                    console.log(`[Linux网络接口] 从sys文件获取到MAC地址: ${macAddress}`);
                                }
                            } catch (macError) {
                                console.warn(`[Linux网络接口] 无法从sys文件读取MAC地址: ${macError.message}`);
                            }
                        }
                        
                        // 获取IP地址信息
                        let ipAddress = null;
                        let netmask = null;
                        let cidr = null;
                        let ipv6Address = null;
                        
                        try {
                            console.log(`[Linux网络接口] 获取接口 ${interfaceName} 的IP地址信息`);
                            const ipResult = await ProcessUtils.execCommand(`ip addr show ${interfaceName}`);
                            if (ipResult.code === 0) {
                                const ipLines = ipResult.stdout.split('\n');
                                for (const ipLine of ipLines) {
                                    // 匹配IPv4地址: "inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0"
                                    const ipv4Match = ipLine.trim().match(/inet\s+(\d+\.\d+\.\d+\.\d+)\/(\d+)/);
                                    if (ipv4Match && !ipAddress) {
                                        ipAddress = ipv4Match[1];
                                        cidr = parseInt(ipv4Match[2]);
                                        // 将CIDR转换为子网掩码
                                        const mask = (0xffffffff << (32 - cidr)) >>> 0;
                                        netmask = [
                                            (mask >>> 24) & 0xff,
                                            (mask >>> 16) & 0xff,
                                            (mask >>> 8) & 0xff,
                                            mask & 0xff
                                        ].join('.');
                                        console.log(`[Linux网络接口] 获取到IPv4地址: ${ipAddress}/${cidr}, 子网掩码: ${netmask}`);
                                    }
                                    
                                    // 匹配IPv6地址: "inet6 fe80::a00:27ff:fe4e:66a1/64 scope link"
                                    const ipv6Match = ipLine.trim().match(/inet6\s+([a-f0-9:]+)\/\d+/);
                                    if (ipv6Match && !ipv6Address && !ipv6Match[1].startsWith('::1')) {
                                        ipv6Address = ipv6Match[1];
                                        console.log(`[Linux网络接口] 获取到IPv6地址: ${ipv6Address}`);
                                    }
                                }
                            } else {
                                console.warn(`[Linux网络接口] 获取IP地址失败: ${ipResult.stderr}`);
                            }
                        } catch (ipError) {
                            console.warn(`[Linux网络接口] 获取IP地址异常: ${ipError.message}`);
                        }
                        
                        // 检测IP配置类型
                        let ipMode = 'unknown';
                        try {
                            if (ipAddress) {
                                ipMode = await detectIPConfigType(interfaceName);
                                console.log(`[Linux网络接口] 检测到IP配置类型: ${ipMode}`);
                            }
                        } catch (ipModeError) {
                            console.warn(`[Linux网络接口] 检测IP配置类型失败: ${ipModeError.message}`);
                            ipMode = ipAddress ? 'dhcp' : 'unknown'; // 默认假设为DHCP
                        }
                        
                        const interfaceInfo = {
                            name: interfaceName,
                            ip: ipAddress, // 前端期望的字段名
                            ip4: ipAddress,
                            ip6: ipv6Address,
                            mac: macAddress,
                            netmask: netmask,
                            cidr: cidr,
                            internal: false,
                            family: ipAddress ? 'IPv4' : 'Unknown',
                            status: (isUp && isRunning) ? 'up' : 'down', // 前端期望的状态字段
                            connected: ipAddress ? true : false, // 有IP地址表示已连接
                            ipMode: ipMode
                        };
                        
                        result.push(interfaceInfo);
                        console.log(`[Linux网络接口] 添加接口信息:`, JSON.stringify(interfaceInfo, null, 2));
                        
                    } catch (interfaceError) {
                        console.error(`[Linux网络接口] 处理接口 ${interfaceName} 时出错: ${interfaceError.message}`);
                        // 继续处理其他接口，不要因为一个接口失败而停止
                    }
                }
                
            } catch (error) {
                console.error('[Linux网络接口] 获取Linux网络接口失败:', error.message);
                console.error('[Linux网络接口] 错误堆栈:', error.stack);
                
                // 尝试使用备用方法 - ifconfig命令
                try {
                    console.log('[Linux网络接口] 尝试使用ifconfig命令作为备用方案');
                    const ifconfigExists = await ProcessUtils.commandExists('ifconfig');
                    if (ifconfigExists) {
                        const ifconfigResult = await ProcessUtils.execCommand('ifconfig -a');
                        if (ifconfigResult.code === 0) {
                            console.log('[Linux网络接口] ifconfig命令执行成功，解析输出...');
                            
                            // 解析ifconfig输出
                            const ifconfigLines = ifconfigResult.stdout.split('\n');
                            let currentInterface = null;
                            let currentInterfaceData = {};
                            
                            for (const line of ifconfigLines) {
                                // 检测新接口开始
                                const interfaceMatch = line.match(/^(\w+):\s+flags=\d+<([^>]*)>/);
                                if (interfaceMatch) {
                                    // 保存前一个接口
                                    if (currentInterface && currentInterface !== 'lo' && !currentInterface.startsWith('lo:')) {
                                        const exists = result.find(iface => iface.name === currentInterface);
                                        if (!exists) {
                                            result.push({
                                                name: currentInterface,
                                                ip: currentInterfaceData.ip || null,
                                                ip4: currentInterfaceData.ip || null,
                                                ip6: currentInterfaceData.ip6 || null,
                                                mac: currentInterfaceData.mac || null,
                                                netmask: currentInterfaceData.netmask || null,
                                                cidr: currentInterfaceData.cidr || null,
                                                internal: false,
                                                family: currentInterfaceData.ip ? 'IPv4' : 'Unknown',
                                                status: currentInterfaceData.flags && currentInterfaceData.flags.includes('UP') ? 'up' : 'down',
                                                connected: currentInterfaceData.ip ? true : false,
                                                ipMode: currentInterfaceData.ip ? 'dhcp' : 'unknown'
                                            });
                                            console.log(`[Linux网络接口] 通过ifconfig添加接口: ${currentInterface}`);
                                        }
                                    }
                                    
                                    // 开始新接口
                                    currentInterface = interfaceMatch[1];
                                    currentInterfaceData = { flags: interfaceMatch[2] };
                                    continue;
                                }
                                
                                if (currentInterface) {
                                    // 获取MAC地址
                                    const macMatch = line.match(/ether\s+([a-f0-9:]{17})/i);
                                    if (macMatch) {
                                        currentInterfaceData.mac = macMatch[1];
                                    }
                                    
                                    // 获取IPv4地址
                                    const ipMatch = line.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
                                    if (ipMatch) {
                                        currentInterfaceData.ip = ipMatch[1];
                                    }
                                    
                                    // 获取子网掩码
                                    const netmaskMatch = line.match(/netmask\s+(\d+\.\d+\.\d+\.\d+)/);
                                    if (netmaskMatch) {
                                        currentInterfaceData.netmask = netmaskMatch[1];
                                    }
                                    
                                    // 获取IPv6地址
                                    const ipv6Match = line.match(/inet6\s+([a-f0-9:]+)/);
                                    if (ipv6Match && !ipv6Match[1].startsWith('::1')) {
                                        currentInterfaceData.ip6 = ipv6Match[1];
                                    }
                                }
                            }
                            
                            // 处理最后一个接口
                            if (currentInterface && currentInterface !== 'lo' && !currentInterface.startsWith('lo:')) {
                                const exists = result.find(iface => iface.name === currentInterface);
                                if (!exists) {
                                    result.push({
                                        name: currentInterface,
                                        ip: currentInterfaceData.ip || null,
                                        ip4: currentInterfaceData.ip || null,
                                        ip6: currentInterfaceData.ip6 || null,
                                        mac: currentInterfaceData.mac || null,
                                        netmask: currentInterfaceData.netmask || null,
                                        cidr: currentInterfaceData.cidr || null,
                                        internal: false,
                                        family: currentInterfaceData.ip ? 'IPv4' : 'Unknown',
                                        status: currentInterfaceData.flags && currentInterfaceData.flags.includes('UP') ? 'up' : 'down',
                                        connected: currentInterfaceData.ip ? true : false,
                                        ipMode: currentInterfaceData.ip ? 'dhcp' : 'unknown'
                                    });
                                    console.log(`[Linux网络接口] 通过ifconfig添加接口: ${currentInterface}`);
                                }
                            }
                        }
                    } else {
                        console.error('[Linux网络接口] ifconfig命令也不可用');
                    }
                } catch (backupError) {
                    console.error('[Linux网络接口] 备用方案也失败:', backupError.message);
                }
                
                // 如果所有方法都失败且没有获取到任何接口，提供详细的错误信息
                if (result.length === 0) {
                    const errorMsg = `Linux系统网络接口获取失败: ${error.message}. 
                    
请检查以下项目:
1. 安装必要工具: sudo apt install iproute2 net-tools
2. 检查权限: 确保应用有权限访问网络接口信息
3. 检查系统: ls -la /sys/class/net/ 
4. 手动测试: ip link show 或 ifconfig -a
5. 查看详细日志以获取更多信息

如果问题持续存在，请提供以上命令的输出结果。`;
                    
                    throw new Error(errorMsg);
                }
            }
            
            console.log(`[Linux网络接口] 完成Linux网络接口获取，共找到 ${result.length} 个接口`);
        }
        
        return { success: true, interfaces: result };
    } catch (error) {
        console.error('获取网络接口失败:', error);
        return { success: false, error: '获取网络接口失败: ' + error.message };
    }
}

// 使用Node.js原生方法检查IP转发状态
async function checkIPForwardingStatus() {
    if (!isLinux()) {
        return { success: true, enabled: false, message: '非Linux系统' };
    }
    
    try {
        const content = await fs.readFile('/proc/sys/net/ipv4/ip_forward', 'utf8');
        const enabled = content.trim() === '1';
        
        return {
            success: true,
            enabled: enabled,
            message: enabled ? 'IP转发已启用' : 'IP转发已禁用'
        };
    } catch (error) {
        console.error('检查IP转发状态失败:', error);
        return { success: false, error: '检查IP转发状态失败: ' + error.message };
    }
}

// 使用Node.js原生方法获取路由表信息
async function getRoutingTable() {
    if (!isLinux()) {
        return { success: true, routes: [], message: '非Linux系统，无法获取路由表' };
    }
    
    try {
        // 读取/proc/net/route文件获取路由信息
        const routeContent = await fs.readFile('/proc/net/route', 'utf8');
        const lines = routeContent.split('\n').slice(1); // 跳过标题行
        const routes = [];
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            const parts = line.split('\t');
            if (parts.length < 8) continue;
            
            const iface = parts[0];
            const destination = parts[1];
            const gateway = parts[2];
            const flags = parseInt(parts[3], 16);
            const mask = parts[7];
            
            // 转换十六进制IP地址为点分十进制
            const destIP = hexToIP(destination);
            const gwIP = hexToIP(gateway);
            const maskIP = hexToIP(mask);
            
            routes.push({
                interface: iface,
                destination: destIP,
                gateway: gwIP === '0.0.0.0' ? '*' : gwIP,
                netmask: maskIP,
                flags: flags,
                metric: 0 // /proc/net/route中没有metric信息
            });
        }
        
        return { success: true, routes: routes };
    } catch (error) {
        console.error('获取路由表失败:', error);
        return { success: false, error: '获取路由表失败: ' + error.message };
    }
}

// 十六进制IP地址转换为点分十进制
function hexToIP(hex) {
    if (!hex || hex === '00000000') return '0.0.0.0';
    
    // 将十六进制字符串转换为数字，然后转换为IP地址
    const num = parseInt(hex, 16);
    return [
        (num & 0xFF),
        ((num >> 8) & 0xFF),
        ((num >> 16) & 0xFF),
        ((num >> 24) & 0xFF)
    ].join('.');
}

// 使用Node.js原生方法配置MASQUERADE（需要调用系统命令）
async function configureMasquerade(enable = true, inInterface = 'eth1', outInterface = 'eth0') {
    if (!isLinux()) {
        return { success: true, message: '非Linux系统，跳过MASQUERADE配置' };
    }
    
    try {
        const execAsync = ProcessUtils.execCommand;
        
        if (enable) {
            // 检查规则是否已存在
            const checkCmd = `iptables -t nat -C POSTROUTING -o ${outInterface} -j MASQUERADE`;
            
            try {
                await execAsync(`${checkCmd} 2>/dev/null`);
                return { success: true, message: `MASQUERADE规则已存在: ${inInterface} -> ${outInterface}` };
            } catch (checkError) {
                // 规则不存在，添加新规则
                const addCmd = `iptables -t nat -A POSTROUTING -o ${outInterface} -j MASQUERADE`;
                await execAsync(addCmd);
                return { success: true, message: `MASQUERADE已启用: ${inInterface} -> ${outInterface}` };
            }
        } else {
            // 删除MASQUERADE规则
            try {
                const deleteCmd = `iptables -t nat -D POSTROUTING -o ${outInterface} -j MASQUERADE`;
                await execAsync(`${deleteCmd} 2>/dev/null`);
                return { success: true, message: `MASQUERADE已禁用: ${inInterface} -> ${outInterface}` };
            } catch (deleteError) {
                return { success: true, message: 'MASQUERADE规则不存在或已删除' };
            }
        }
    } catch (error) {
        console.error('配置MASQUERADE失败:', error);
        return { success: false, error: '配置MASQUERADE失败: ' + error.message };
    }
}



// 应用网络配置
async function applyNetworkConfig(enable, interfaceName) {
    const results = [];
    
    try {
        // 1. 配置IP转发
        const ipForwardResult = enable ? await enableIPForwarding() : await disableIPForwarding();
        results.push(ipForwardResult);
        
        // 2. 获取网络接口信息
        const interfacesResult = await getNetworkInterfaces();
        if (!interfacesResult.success) {
            results.push({ success: false, error: '无法获取网络接口信息' });
            return results;
        }
        
        // 3. 查找目标接口和默认网关接口
        const targetInterface = interfacesResult.interfaces.find(iface => iface.name === interfaceName);
        if (!targetInterface) {
            results.push({ success: false, error: `网络接口 ${interfaceName} 不存在` });
            return results;
        }
        
        // 4. 查找默认网关接口（通常是主要的网络接口）
        let gatewayInterface = null;
        const routingResult = await getRoutingTable();
        if (routingResult.success) {
            const defaultRoute = routingResult.routes.find(route => 
                route.destination === '0.0.0.0' && route.gateway !== '*'
            );
            if (defaultRoute) {
                gatewayInterface = interfacesResult.interfaces.find(iface => 
                    iface.name === defaultRoute.interface
                );
            }
        }
        
        // 如果没有找到网关接口，使用第一个非目标接口
        if (!gatewayInterface) {
            gatewayInterface = interfacesResult.interfaces.find(iface => 
                iface.name !== interfaceName && iface.ip4
            );
        }
        
        if (!gatewayInterface) {
            results.push({ success: false, error: '无法找到合适的网关接口' });
            return results;
        }
        
        // 5. 配置MASQUERADE
        const masqueradeResult = await configureMasquerade(enable, interfaceName, gatewayInterface.name);
        results.push(masqueradeResult);
        

        
        return results;
    } catch (error) {
        console.error('应用网络配置失败:', error);
        results.push({ success: false, error: '应用网络配置失败: ' + error.message });
        return results;
    }
}

// 检测网络拓扑
async function detectNetworkTopology() {
    try {
        const interfacesResult = await getNetworkInterfaces();
        const routingResult = await getRoutingTable();
        
        if (!interfacesResult.success) {
            return { success: false, error: '无法获取网络接口信息' };
        }
        
        const topology = {
            interfaces: interfacesResult.interfaces,
            routes: routingResult.success ? routingResult.routes : [],
            defaultGateway: null,
            primaryInterface: null
        };
        
        // 查找默认网关和主接口
        if (routingResult.success) {
            const defaultRoute = routingResult.routes.find(route => 
                route.destination === '0.0.0.0' && route.gateway !== '*'
            );
            
            if (defaultRoute) {
                topology.defaultGateway = defaultRoute.gateway;
                topology.primaryInterface = defaultRoute.interface;
            }
        }
        
        return { success: true, topology: topology };
    } catch (error) {
        console.error('检测网络拓扑失败:', error);
        return { success: false, error: '检测网络拓扑失败: ' + error.message };
    }
}

// 获取最优网络配置
async function getOptimalNetworkConfig(targetInterface) {
    try {
        const topologyResult = await detectNetworkTopology();
        if (!topologyResult.success) {
            return { success: false, error: '无法检测网络拓扑' };
        }
        
        const { topology } = topologyResult;
        const target = topology.interfaces.find(iface => iface.name === targetInterface);
        
        if (!target) {
            return { success: false, error: `接口 ${targetInterface} 不存在` };
        }
        
        const config = {
            targetInterface: targetInterface,
            gatewayInterface: topology.primaryInterface,
            ipForwarding: true,
            masquerade: {
                enabled: true,
                inInterface: targetInterface,
                outInterface: topology.primaryInterface
            }
        };
        
        return { success: true, config: config };
    } catch (error) {
        console.error('获取最优网络配置失败:', error);
        return { success: false, error: '获取最优网络配置失败: ' + error.message };
    }
}

// 使用Node.js原生方法获取网络连接














// 获取网络配置
async function getNetworkConfig(interfaceName) {
    try {
        const ipForwardingStatus = await checkIPForwardingStatus();
        const interfacesResult = await getNetworkInterfaces();
        const routingResult = await getRoutingTable();
        
        const config = {
            interface: interfaceName,
            ipForwarding: ipForwardingStatus.success ? ipForwardingStatus.enabled : false,
            interfaces: interfacesResult.success ? interfacesResult.interfaces : [],
            routes: routingResult.success ? routingResult.routes : []
        };
        
        return { success: true, config: config };
    } catch (error) {
        console.error('获取网络配置失败:', error);
        return { success: false, error: '获取网络配置失败: ' + error.message };
    }
}

// 获取网络统计信息
async function getNetworkStats(interfaceName) {
    const execAsync = ProcessUtils.execCommand;
    
    try {
        if (os.platform() === 'win32') {
            // Windows: 使用PowerShell获取网络统计
            try {
                const command = `Get-NetAdapterStatistics -Name "${interfaceName}" | ConvertTo-Json`;
                const result = await execAsync(`powershell -Command "${command}"`);
                
                if (result.code === 0 && result.stdout) {
                    const stats = JSON.parse(result.stdout);
                    return {
                        iface: interfaceName,
                        rx_bytes: stats.ReceivedBytes || 0,
                        tx_bytes: stats.SentBytes || 0,
                        rx_sec: stats.ReceivedUnicastPackets || 0,
                        tx_sec: stats.SentUnicastPackets || 0,
                        rx_errors: 0,
                        tx_errors: 0,
                        rx_dropped: 0,
                        tx_dropped: 0
                    };
                } else {
                    console.warn(`Windows网络统计获取失败 (${interfaceName}):`, result.stderr || 'PowerShell命令执行失败');
                }
            } catch (winError) {
                console.warn(`Windows网络统计获取异常 (${interfaceName}):`, winError.message);
            }
        } else {
            // Linux/Unix: 读取/proc/net/dev文件
            try {
                const data = await fs.readFile('/proc/net/dev', 'utf8');
                const lines = data.split('\n');
                
                for (const line of lines) {
                    if (line.includes(interfaceName + ':')) {
                        const parts = line.trim().split(/\s+/);
                        const ifaceName = parts[0].replace(':', '');
                        
                        if (ifaceName === interfaceName) {
                            return {
                                iface: interfaceName,
                                rx_bytes: parseInt(parts[1]) || 0,
                                tx_bytes: parseInt(parts[9]) || 0,
                                rx_sec: parseInt(parts[2]) || 0,
                                tx_sec: parseInt(parts[10]) || 0,
                                rx_errors: parseInt(parts[3]) || 0,
                                tx_errors: parseInt(parts[11]) || 0,
                                rx_dropped: parseInt(parts[4]) || 0,
                                tx_dropped: parseInt(parts[12]) || 0
                            };
                        }
                    }
                }
                console.warn(`Linux网络统计未找到接口 (${interfaceName}): 接口可能不存在或未激活`);
            } catch (linuxError) {
                console.warn(`Linux网络统计获取异常 (${interfaceName}):`, linuxError.message);
                
                // 尝试使用ip命令作为备选方案
                try {
                    const result = await execAsync(`ip -s link show ${interfaceName}`);
                    if (result.code === 0 && result.stdout) {
                        const lines = result.stdout.split('\n');
                        let rxLine = null, txLine = null;
                        
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].includes('RX:') && i + 1 < lines.length) {
                                rxLine = lines[i + 1].trim().split(/\s+/);
                            }
                            if (lines[i].includes('TX:') && i + 1 < lines.length) {
                                txLine = lines[i + 1].trim().split(/\s+/);
                            }
                        }
                        
                        if (rxLine && txLine) {
                            return {
                                iface: interfaceName,
                                rx_bytes: parseInt(rxLine[0]) || 0,
                                tx_bytes: parseInt(txLine[0]) || 0,
                                rx_sec: parseInt(rxLine[1]) || 0,
                                tx_sec: parseInt(txLine[1]) || 0,
                                rx_errors: parseInt(rxLine[2]) || 0,
                                tx_errors: parseInt(txLine[2]) || 0,
                                rx_dropped: parseInt(rxLine[3]) || 0,
                                tx_dropped: parseInt(txLine[3]) || 0
                            };
                        }
                    }
                } catch (ipError) {
                    console.warn(`Linux ip命令备选方案失败 (${interfaceName}):`, ipError.message);
                }
            }
        }
        
        // 如果所有方法都失败，返回默认值
        console.info(`返回默认网络统计信息 (${interfaceName}): 所有获取方法均失败`);
        return {
            iface: interfaceName,
            rx_bytes: 0,
            tx_bytes: 0,
            rx_sec: 0,
            tx_sec: 0,
            rx_errors: 0,
            tx_errors: 0,
            rx_dropped: 0,
            tx_dropped: 0
        };
    } catch (error) {
        console.error(`获取网络统计信息失败 (${interfaceName}):`, error.message);
        return {
            iface: interfaceName,
            rx_bytes: 0,
            tx_bytes: 0,
            rx_sec: 0,
            tx_sec: 0,
            rx_errors: 0,
            tx_errors: 0,
            rx_dropped: 0,
            tx_dropped: 0
        };
    }
}

module.exports = {
    isLinux,
    subnetMaskToCIDR,
    enableIPForwarding,
    disableIPForwarding,
    configureMasquerade,
    applyNetworkConfig,
    getNetworkInterfaces,
    getRoutingTable,
    checkIPForwardingStatus,
    detectNetworkTopology,
    getOptimalNetworkConfig,
    getNetworkConfig,
    getNetworkStats
};
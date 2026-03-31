const os = require('os');
const { spawn, exec } = require('child_process');
const ProcessUtils = require('./process-utils');
const networkNative = require('./network-native');

class NetworkBridge {
    constructor(database = null) {
        this.activeBridges = new Map();
        this.isWindows = os.platform() === 'win32';
        this.isLinux = os.platform() === 'linux';
        this.database = database;
        this.initialized = false;
    }

    /**
     * 初始化桥接管理器，从数据库加载现有桥接数据并自动恢复桥接配置
     */
    async initialize() {
        if (this.initialized || !this.database) {
            return;
        }

        try {
            console.log('正在从数据库加载桥接数据...');
            const bridges = await this.database.getAllBridges();
            
            // 统计恢复结果
            let successCount = 0;
            let failureCount = 0;
            const failedBridges = [];
            
            for (const bridge of bridges) {
                try {
                    // 将数据库中的桥接数据加载到内存中
                    const bridgeInfo = {
                        targetInterfaces: bridge.target_interfaces,
                        bridgeType: bridge.bridge_type,
                        ipConfig: bridge.ip_config,
                        created: new Date(bridge.created_at),
                        status: bridge.status,
                        method: bridge.method
                    };
                    
                    // 只恢复状态为active的桥接
                    if (bridge.status === 'active') {
                        console.log(`正在恢复桥接: ${bridge.id}...`);
                        
                        // 检查目标接口是否存在
                        const interfaceResult = await networkNative.getNetworkInterfaces();
                        if (!interfaceResult.success) {
                            throw new Error(`获取网络接口失败: ${interfaceResult.error}`);
                        }
                        
                        const availableInterfaces = interfaceResult.interfaces.map(i => i.name);
                        const missingInterfaces = bridge.target_interfaces.filter(iface => 
                            !availableInterfaces.includes(iface)
                        );
                        
                        if (missingInterfaces.length > 0) {
                            console.warn(`桥接 ${bridge.id} 的目标接口不存在: ${missingInterfaces.join(', ')}`);
                            // 更新状态为inactive
                            bridgeInfo.status = 'inactive';
                            await this.database.updateBridgeStatus(bridge.id, 'inactive');
                            failureCount++;
                            failedBridges.push({
                                id: bridge.id,
                                reason: `目标接口不存在: ${missingInterfaces.join(', ')}`
                            });
                        } else {
                            // 尝试恢复桥接配置
                            let restoreResult;
                            if (this.isWindows) {
                                restoreResult = await this.restoreWindowsBridge(bridge.id, bridge.target_interfaces, bridge.ip_config, bridge.method);
                            } else if (this.isLinux) {
                                restoreResult = await this.restoreLinuxBridge(bridge.id, bridge.target_interfaces, bridge.ip_config);
                            } else {
                                throw new Error('不支持的操作系统');
                            }
                            
                            if (restoreResult.success) {
                                console.log(`桥接 ${bridge.id} 恢复成功`);
                                successCount++;
                            } else {
                                console.error(`桥接 ${bridge.id} 恢复失败: ${restoreResult.message}`);
                                // 更新状态为inactive
                                bridgeInfo.status = 'inactive';
                                await this.database.updateBridgeStatus(bridge.id, 'inactive');
                                failureCount++;
                                failedBridges.push({
                                    id: bridge.id,
                                    reason: restoreResult.message
                                });
                            }
                        }
                    } else {
                        console.log(`跳过非活动桥接: ${bridge.id}, 状态: ${bridge.status}`);
                    }
                    
                    this.activeBridges.set(bridge.id, bridgeInfo);
                    
                } catch (bridgeError) {
                    console.error(`处理桥接 ${bridge.id} 时发生错误:`, bridgeError);
                    failureCount++;
                    failedBridges.push({
                        id: bridge.id,
                        reason: bridgeError.message
                    });
                    
                    // 仍然加载到内存中，但标记为inactive
                    const bridgeInfo = {
                        targetInterfaces: bridge.target_interfaces,
                        bridgeType: bridge.bridge_type,
                        ipConfig: bridge.ip_config,
                        created: new Date(bridge.created_at),
                        status: 'inactive',
                        method: bridge.method
                    };
                    this.activeBridges.set(bridge.id, bridgeInfo);
                    
                    // 更新数据库状态
                    try {
                        await this.database.updateBridgeStatus(bridge.id, 'inactive');
                    } catch (updateError) {
                        console.error(`更新桥接 ${bridge.id} 状态失败:`, updateError);
                    }
                }
            }
            
            console.log(`桥接数据加载完成，共加载 ${bridges.length} 个桥接`);
            console.log(`恢复结果: 成功 ${successCount} 个，失败 ${failureCount} 个`);
            
            if (failedBridges.length > 0) {
                console.log('失败的桥接详情:');
                failedBridges.forEach(bridge => {
                    console.log(`  - ${bridge.id}: ${bridge.reason}`);
                });
            }
            
            this.initialized = true;
        } catch (error) {
            console.error('从数据库加载桥接数据失败:', error);
            // 即使加载失败，也标记为已初始化，避免重复尝试
            this.initialized = true;
        }
    }

    /**
     * 创建网络桥接
     * @param {string} bridgeName - 桥接名称
     * @param {Array<string>} targetInterfaces - 目标网络接口名称数组
     * @param {string} bridgeType - 桥接类型（可选）
     * @param {Object} ipConfig - IP配置（可选）
     * @returns {Promise<Object>} 操作结果
     */
    async createBridge(bridgeName, targetInterfaces, bridgeType = 'bridge', ipConfig = null) {
        try {
            const bridgeId = bridgeName;
            
            if (this.activeBridges.has(bridgeId)) {
                return { 
                    success: false, 
                    message: `桥接 ${bridgeId} 已存在`,
                    bridgeId 
                };
            }

            let result;
            if (this.isWindows) {
                result = await this.createWindowsBridge(targetInterfaces, bridgeId, ipConfig);
            } else if (this.isLinux) {
                result = await this.createLinuxBridge(targetInterfaces, bridgeId, ipConfig);
            } else {
                throw new Error('不支持的操作系统');
            }

            if (result.success) {
                // 存储桥接信息，确保数据格式正确
                const bridgeInfo = {
                    targetInterfaces: Array.isArray(targetInterfaces) ? targetInterfaces : [targetInterfaces],
                    bridgeType,
                    ipConfig,
                    created: new Date(),
                    status: 'active',
                    method: result.method || 'unknown'
                };

                // 如果是IP转发模式，只有一个目标接口
                if (result.method === 'ip_forwarding' && targetInterfaces.length > 0) {
                    bridgeInfo.targetInterface = targetInterfaces[0];
                }

                this.activeBridges.set(bridgeId, bridgeInfo);

                // 保存到数据库
                if (this.database) {
                    try {
                        await this.database.saveBridge({
                            id: bridgeId,
                            name: bridgeId,
                            targetInterfaces: bridgeInfo.targetInterfaces,
                            bridgeType: bridgeInfo.bridgeType,
                            ipConfig: bridgeInfo.ipConfig,
                            status: bridgeInfo.status,
                            method: bridgeInfo.method
                        });
                        console.log(`桥接数据已保存到数据库: ${bridgeId}`);
                    } catch (dbError) {
                        console.error('保存桥接数据到数据库失败:', dbError);
                        // 不影响桥接创建的成功状态
                    }
                }

                // 如果有IP配置信息，添加到结果中
                if (ipConfig) {
                    result.ipConfig = ipConfig;
                    if (ipConfig.type === 'dhcp' || ipConfig.type === 'auto') {
                        result.message += '，已配置DHCP自动获取IP';
                    } else if (ipConfig.type === 'static' && ipConfig.staticIp) {
                        result.message += `，已配置静态IP: ${ipConfig.staticIp.address}`;
                    }
                }
            }

            return { ...result, bridgeId };
        } catch (error) {
            console.error('创建桥接失败:', error);
            return { 
                success: false, 
                message: `创建桥接失败: ${error.message}`,
                error: error.message 
            };
        }
    }

    /**
     * 恢复Windows桥接配置
     * @param {string} bridgeId - 桥接ID
     * @param {Array<string>} targetInterfaces - 目标接口
     * @param {Object} ipConfig - IP配置
     * @param {string} method - 原始创建方法
     * @returns {Promise<Object>} 恢复结果
     */
    async restoreWindowsBridge(bridgeId, targetInterfaces, ipConfig, method) {
        try {
            console.log(`正在恢复Windows桥接 ${bridgeId}，方法: ${method}`);
            
            // 检查桥接是否已经存在
            try {
                const checkResult = await this.executeCommand(`netsh interface show interface name="${bridgeId}"`);
                if (checkResult.includes(bridgeId)) {
                    console.log(`桥接 ${bridgeId} 已存在，跳过创建`);
                    return { success: true, message: '桥接已存在，无需恢复' };
                }
            } catch (checkError) {
                // 桥接不存在，继续创建
                console.log(`桥接 ${bridgeId} 不存在，开始恢复`);
            }
            
            // 根据原始方法恢复桥接
            let result;
            if (method === 'netsh_bridge') {
                result = await this.createWindowsBridge(targetInterfaces, bridgeId, ipConfig);
            } else if (method === 'ip_forwarding') {
                result = await this.createWindowsIPForwarding(targetInterfaces[0], bridgeId, ipConfig);
            } else {
                // 默认尝试netsh bridge方法
                result = await this.createWindowsBridge(targetInterfaces, bridgeId, ipConfig);
            }
            
            return result;
        } catch (error) {
            console.error(`恢复Windows桥接 ${bridgeId} 失败:`, error);
            return {
                success: false,
                message: `恢复Windows桥接失败: ${error.message}`
            };
        }
    }

    /**
     * 恢复Linux桥接配置
     * @param {string} bridgeId - 桥接ID
     * @param {Array<string>} targetInterfaces - 目标接口
     * @param {Object} ipConfig - IP配置
     * @returns {Promise<Object>} 恢复结果
     */
    async restoreLinuxBridge(bridgeId, targetInterfaces, ipConfig) {
        try {
            console.log(`正在恢复Linux桥接 ${bridgeId}`);
            
            // 检查桥接是否已经存在
            try {
                const checkResult = await this.executeCommand(`ip link show ${bridgeId}`);
                if (checkResult.includes(bridgeId)) {
                    console.log(`桥接 ${bridgeId} 已存在，检查配置`);
                    
                    // 检查接口是否已经添加到桥接
                    for (const targetInterface of targetInterfaces) {
                        try {
                            const masterResult = await this.executeCommand(`ip link show ${targetInterface}`);
                            if (!masterResult.includes(`master ${bridgeId}`)) {
                                console.log(`将接口 ${targetInterface} 添加到桥接 ${bridgeId}`);
                                await this.executeCommand(`ip link set ${targetInterface} master ${bridgeId}`);
                                await this.executeCommand(`ip link set ${targetInterface} up`);
                            }
                        } catch (interfaceError) {
                            console.warn(`处理接口 ${targetInterface} 时出错:`, interfaceError.message);
                        }
                    }
                    
                    // 确保桥接接口是启用的
                    await this.executeCommand(`ip link set ${bridgeId} up`);
                    
                    // 重新配置IP（如果需要）
                    if (ipConfig) {
                        await this.configureLinuxIP(bridgeId, ipConfig);
                    }
                    
                    return { success: true, message: '桥接已存在，配置已更新' };
                }
            } catch (checkError) {
                // 桥接不存在，继续创建
                console.log(`桥接 ${bridgeId} 不存在，开始恢复`);
            }
            
            // 创建新的桥接
            const result = await this.createLinuxBridge(targetInterfaces, bridgeId, ipConfig);
            return result;
            
        } catch (error) {
            console.error(`恢复Linux桥接 ${bridgeId} 失败:`, error);
            return {
                success: false,
                message: `恢复Linux桥接失败: ${error.message}`
            };
        }
    }

    /**
     * Windows 平台创建桥接
     */
    async createWindowsBridge(targetInterfaces, bridgeId, ipConfig = null) {
        try {
            // 在Windows上，我们使用PowerShell创建网络桥接
            // 首先尝试使用New-NetBridge命令
            try {
                const bridgeResult = await this.executeCommand(
                    `powershell -Command "New-NetBridge -Name '${bridgeId}' -NetAdapterName @('${targetInterfaces.join("','")}')"`
                );

                if (bridgeResult.success) {
                    // 配置IP地址
                    if (ipConfig) {
                        await this.configureWindowsIP(bridgeId, ipConfig);
                    }
                    
                    return {
                        success: true,
                        message: `Windows 桥接 ${bridgeId} 创建成功，包含 ${targetInterfaces.length} 个接口`,
                        method: 'powershell_netbridge'
                    };
                }
            } catch (psError) {
                console.log('PowerShell NetBridge 方法失败，尝试备用方法:', psError.message);
            }

            // 备用方法1: 使用netsh interface bridge（如果支持）
            try {
                const bridgeResult = await this.executeCommand(
                    `netsh interface bridge create "${bridgeId}"`
                );

                if (bridgeResult.success) {
                    // 将所有目标接口添加到桥接
                    for (const targetInterface of targetInterfaces) {
                        await this.executeCommand(`netsh interface bridge add "${targetInterface}" to "${bridgeId}"`);
                    }
                    
                    // 配置IP地址
                    if (ipConfig) {
                        await this.configureWindowsIP(bridgeId, ipConfig);
                    }
                    
                    return {
                        success: true,
                        message: `Windows 桥接 ${bridgeId} 创建成功，包含 ${targetInterfaces.length} 个接口`,
                        method: 'netsh_bridge'
                    };
                }
            } catch (netshError) {
                console.log('Netsh bridge 方法失败，使用IP转发方法:', netshError.message);
            }

            // 备用方法2: 使用IP转发配置
            return await this.createWindowsIPForwarding(targetInterfaces[0], bridgeId, ipConfig);

        } catch (error) {
            console.error('Windows 桥接创建失败:', error);
            return { 
                success: false, 
                message: `Windows 桥接创建失败: ${error.message}。请确保以管理员权限运行程序。`,
                error: error.message
            };
        }
    }

    /**
     * Windows IP 转发方式桥接
     */
    async createWindowsIPForwarding(targetInterface, bridgeId, ipConfig = null) {
        try {
            // 启用目标接口的 IP 转发
            await this.executeCommand(
                `netsh interface ipv4 set interface "${targetInterface}" forwarding=enabled`
            );

            // 获取接口信息
            const interfacesResult = await networkNative.getNetworkInterfaces();
            if (!interfacesResult.success) {
                throw new Error(`获取网络接口失败: ${interfacesResult.error}`);
            }
            
            const interfaces = interfacesResult.interfaces;
            const targetIface = interfaces.find(i => i.name === targetInterface);

            if (!targetIface) {
                throw new Error(`找不到指定的网络接口: ${targetInterface}`);
            }

            // 配置IP地址
            if (ipConfig) {
                const ipResult = await this.configureWindowsIP(targetInterface, ipConfig);
                if (!ipResult.success) {
                    console.warn(`IP配置失败，但继续创建桥接: ${ipResult.message}`);
                    // 不抛出错误，允许桥接继续创建，只是记录警告
                }
            }

            return {
                success: true,
                message: `Windows IP转发桥接 ${bridgeId} 创建成功`,
                method: 'ip_forwarding'
            };

        } catch (error) {
            throw new Error(`Windows IP转发配置失败: ${error.message}`);
        }
    }

    /**
     * 配置Windows接口IP地址
     */
    async configureWindowsIP(interfaceName, ipConfig) {
        try {
            // 首先检查接口是否存在
            const interfaceCheck = await this.executeCommand(
                `netsh interface show interface name="${interfaceName}"`
            );
            
            if (!interfaceCheck.success) {
                console.warn(`接口 ${interfaceName} 不存在或无法访问，跳过IP配置`);
                return { success: false, message: `接口不存在: ${interfaceName}` };
            }

            // 释放接口原有IP地址
            try {
                console.log(`正在释放接口 ${interfaceName} 的原有IP地址...`);
                
                // 方法1: 使用PowerShell移除所有IP地址
                const removeIPResult = await this.executeCommand(
                    `powershell -Command "Remove-NetIPAddress -InterfaceAlias '${interfaceName}' -Confirm:$false -ErrorAction SilentlyContinue"`
                );
                
                if (removeIPResult.success) {
                    console.log(`使用PowerShell成功释放接口 ${interfaceName} 的IP地址`);
                } else {
                    // 方法2: 使用netsh设置为DHCP（这会清除静态IP）
                    console.log(`PowerShell释放IP失败，尝试使用netsh方法...`);
                    await this.executeCommand(
                        `netsh interface ipv4 set address name="${interfaceName}" source=dhcp`
                    );
                    
                    // 然后立即禁用DHCP，确保接口处于无IP状态
                    await this.executeCommand(
                        `powershell -Command "Set-NetIPInterface -InterfaceAlias '${interfaceName}' -Dhcp Disabled -ErrorAction SilentlyContinue"`
                    );
                    
                    console.log(`使用netsh方法释放接口 ${interfaceName} 的IP地址`);
                }
                
                // 等待一小段时间确保IP释放完成
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (releaseError) {
                console.warn(`释放接口 ${interfaceName} 原有IP失败:`, releaseError.message);
                // 继续执行，不阻止新IP配置
            }

            if (ipConfig.type === 'static' && ipConfig.staticIp) {
                const { address, netmask, gateway } = ipConfig.staticIp;
                
                try {
                    console.log(`正在为接口 ${interfaceName} 配置静态IP: ${address}/${netmask}, 网关: ${gateway}`);
                    
                    // 设置静态IP地址
                    const result = await this.executeCommand(
                        `netsh interface ipv4 set address name="${interfaceName}" source=static addr=${address} mask=${netmask} gateway=${gateway}`
                    );
                    
                    if (result.success) {
                        // 验证IP配置是否成功
                        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待配置生效
                        
                        try {
                            const verifyResult = await this.executeCommand(`netsh interface ipv4 show config name="${interfaceName}"`);
                            if (verifyResult.success && verifyResult.output.includes(address)) {
                                console.log(`已为接口 ${interfaceName} 成功配置静态IP: ${address}/${netmask}, 网关: ${gateway}`);
                                return { success: true, message: '静态IP配置成功' };
                            } else {
                                console.warn(`静态IP配置可能未完全生效，但命令执行成功`);
                                return { success: true, message: '静态IP配置成功（需要验证）' };
                            }
                        } catch (verifyError) {
                            console.warn(`无法验证IP配置状态:`, verifyError.message);
                            return { success: true, message: '静态IP配置成功（无法验证）' };
                        }
                    } else {
                        throw new Error(result.error || '静态IP配置失败');
                    }
                } catch (staticError) {
                    console.warn(`静态IP配置失败，尝试使用PowerShell方法:`, staticError.message);
                    
                    // 备用方法：使用PowerShell
                    try {
                        const psResult = await this.executeCommand(
                            `powershell -Command "New-NetIPAddress -InterfaceAlias '${interfaceName}' -IPAddress ${address} -PrefixLength ${this.netmaskToCIDR(netmask)} -DefaultGateway ${gateway} -ErrorAction SilentlyContinue"`
                        );
                        
                        if (psResult.success) {
                            console.log(`使用PowerShell为接口 ${interfaceName} 配置静态IP成功`);
                            return { success: true, message: '静态IP配置成功（PowerShell）' };
                        }
                    } catch (psError) {
                        console.warn(`PowerShell静态IP配置也失败:`, psError.message);
                    }
                    
                    throw staticError;
                }
            } else if (ipConfig.type === 'auto' || ipConfig.type === 'dhcp') {
                try {
                    console.log(`正在为接口 ${interfaceName} 配置DHCP自动获取IP...`);
                    
                    // 设置为DHCP自动获取
                    const result = await this.executeCommand(
                        `netsh interface ipv4 set address name="${interfaceName}" source=dhcp`
                    );
                    
                    if (result.success) {
                        // 等待DHCP获取IP地址
                        console.log(`等待DHCP为接口 ${interfaceName} 分配IP地址...`);
                        await new Promise(resolve => setTimeout(resolve, 5000)); // 等待DHCP分配
                        
                        try {
                            const verifyResult = await this.executeCommand(`netsh interface ipv4 show config name="${interfaceName}"`);
                            if (verifyResult.success) {
                                const output = verifyResult.output;
                                if (output.includes('DHCP enabled') || output.includes('自动配置')) {
                                    console.log(`已为接口 ${interfaceName} 成功配置DHCP自动获取IP`);
                                    return { success: true, message: 'DHCP配置成功' };
                                } else {
                                    console.warn(`DHCP配置可能未完全生效，但命令执行成功`);
                                    return { success: true, message: 'DHCP配置成功（需要验证）' };
                                }
                            } else {
                                console.warn(`无法验证DHCP配置状态`);
                                return { success: true, message: 'DHCP配置成功（无法验证）' };
                            }
                        } catch (verifyError) {
                            console.warn(`无法验证DHCP配置状态:`, verifyError.message);
                            return { success: true, message: 'DHCP配置成功（无法验证）' };
                        }
                    } else {
                        throw new Error(result.error || 'DHCP配置失败');
                    }
                } catch (dhcpError) {
                    console.warn(`DHCP配置失败，尝试使用PowerShell方法:`, dhcpError.message);
                    
                    // 备用方法：使用PowerShell
                    try {
                        const psResult = await this.executeCommand(
                            `powershell -Command "Set-NetIPInterface -InterfaceAlias '${interfaceName}' -Dhcp Enabled -ErrorAction SilentlyContinue"`
                        );
                        
                        if (psResult.success) {
                            console.log(`使用PowerShell为接口 ${interfaceName} 配置DHCP成功`);
                            return { success: true, message: 'DHCP配置成功（PowerShell）' };
                        }
                    } catch (psError) {
                        console.warn(`PowerShell DHCP配置也失败:`, psError.message);
                    }
                    
                    throw dhcpError;
                }
            }
            
            return { success: true, message: '无需配置IP' };
        } catch (error) {
            console.error(`配置接口 ${interfaceName} IP失败:`, error);
            
            // 提供更详细的错误信息和解决建议
            let errorMessage = `IP配置失败: ${error.message}`;
            if (error.message.includes('拒绝访问') || error.message.includes('Access is denied')) {
                errorMessage += '。请以管理员权限运行程序。';
            } else if (error.message.includes('找不到') || error.message.includes('not found')) {
                errorMessage += `。接口 "${interfaceName}" 可能不存在或已被禁用。`;
            }
            
            return { success: false, message: errorMessage, error: error.message };
        }
    }

    /**
     * 将子网掩码转换为CIDR格式
     */
    netmaskToCIDR(netmask) {
        if (!netmask) return 24;
        
        const parts = netmask.split('.');
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

    /**
     * Linux 平台创建桥接
     */
    async createLinuxBridge(targetInterfaces, bridgeId, ipConfig = null) {
        try {
            // 创建桥接接口
            await this.executeCommand(`ip link add name ${bridgeId} type bridge`);
            
            // 将所有目标接口添加到桥接
            for (const targetInterface of targetInterfaces) {
                await this.executeCommand(`ip link set ${targetInterface} master ${bridgeId}`);
            }
            
            // 启用桥接接口
            await this.executeCommand(`ip link set ${bridgeId} up`);
            
            // 启用所有目标接口
            for (const targetInterface of targetInterfaces) {
                await this.executeCommand(`ip link set ${targetInterface} up`);
            }

            // 配置IP地址
            if (ipConfig) {
                await this.configureLinuxIP(bridgeId, ipConfig);
            }

            return {
                success: true,
                message: `Linux 桥接 ${bridgeId} 创建成功，包含 ${targetInterfaces.length} 个接口`,
                method: 'linux_bridge'
            };

        } catch (error) {
            throw new Error(`Linux 桥接创建失败: ${error.message}`);
        }
    }

    /**
     * 配置Linux接口IP地址
     */
    async configureLinuxIP(interfaceName, ipConfig) {
        try {
            if (ipConfig.type === 'static' && ipConfig.staticIp) {
                const { address, netmask, gateway } = ipConfig.staticIp;
                
                // 清除现有IP地址
                try {
                    console.log(`正在释放接口 ${interfaceName} 的原有IP地址...`);
                    await this.executeCommand(`ip addr flush dev ${interfaceName}`);
                    console.log(`成功释放接口 ${interfaceName} 的原有IP地址`);
                    
                    // 等待一小段时间确保IP释放完成
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (flushError) {
                    console.warn(`清除接口 ${interfaceName} 现有IP失败:`, flushError.message);
                }
                
                // 设置静态IP地址
                const cidr = this.netmaskToCIDR(netmask);
                console.log(`正在为接口 ${interfaceName} 配置静态IP: ${address}/${cidr}, 网关: ${gateway}`);
                
                await this.executeCommand(`ip addr add ${address}/${cidr} dev ${interfaceName}`);
                
                // 设置默认网关
                if (gateway) {
                    // 先删除可能存在的默认路由
                    try {
                        await this.executeCommand(`ip route del default dev ${interfaceName}`);
                    } catch (routeError) {
                        // 忽略删除路由失败的错误
                    }
                    
                    await this.executeCommand(`ip route add default via ${gateway} dev ${interfaceName}`);
                }
                
                // 验证IP配置是否成功
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待配置生效
                    const verifyResult = await this.executeCommand(`ip addr show ${interfaceName}`);
                    if (verifyResult.success && verifyResult.output.includes(address)) {
                        console.log(`已为接口 ${interfaceName} 成功配置静态IP: ${address}/${cidr}, 网关: ${gateway}`);
                        return { success: true, message: '静态IP配置成功' };
                    } else {
                        console.warn(`静态IP配置可能未完全生效，但命令执行成功`);
                        return { success: true, message: '静态IP配置成功（需要验证）' };
                    }
                } catch (verifyError) {
                    console.warn(`无法验证IP配置状态:`, verifyError.message);
                    console.log(`已为接口 ${interfaceName} 配置静态IP: ${address}/${cidr}, 网关: ${gateway}`);
                    return { success: true, message: '静态IP配置成功（无法验证）' };
                }
                
            } else if (ipConfig.type === 'auto' || ipConfig.type === 'dhcp') {
                // 清除现有IP地址
                try {
                    console.log(`正在释放接口 ${interfaceName} 的原有IP地址...`);
                    await this.executeCommand(`ip addr flush dev ${interfaceName}`);
                    console.log(`成功释放接口 ${interfaceName} 的原有IP地址`);
                    
                    // 等待一小段时间确保IP释放完成
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (flushError) {
                    console.warn(`清除接口 ${interfaceName} 现有IP失败:`, flushError.message);
                }
                
                // 停止可能正在运行的dhclient进程
                try {
                    await this.executeCommand(`pkill -f "dhclient.*${interfaceName}"`);
                } catch (killError) {
                    // 忽略停止dhclient失败的错误
                }
                
                // 使用dhclient请求DHCP地址
                try {
                    console.log(`正在为接口 ${interfaceName} 配置DHCP自动获取IP...`);
                    await this.executeCommand(`dhclient ${interfaceName}`);
                    
                    // 等待DHCP获取IP地址
                    console.log(`等待DHCP为接口 ${interfaceName} 分配IP地址...`);
                    await new Promise(resolve => setTimeout(resolve, 5000)); // 等待DHCP分配
                    
                    // 验证DHCP配置是否成功
                    try {
                        const verifyResult = await this.executeCommand(`ip addr show ${interfaceName}`);
                        if (verifyResult.success) {
                            const output = verifyResult.output;
                            // 检查是否有动态分配的IP地址（通常包含inet关键字）
                            if (output.includes('inet ') && !output.includes('127.0.0.1')) {
                                console.log(`已为接口 ${interfaceName} 成功配置DHCP自动获取IP`);
                                return { success: true, message: 'DHCP配置成功' };
                            } else {
                                console.warn(`DHCP可能未获取到IP地址，但配置已完成`);
                                return { success: true, message: 'DHCP配置成功（等待IP分配）' };
                            }
                        } else {
                            console.warn(`无法验证DHCP配置状态`);
                            return { success: true, message: 'DHCP配置成功（无法验证）' };
                        }
                    } catch (verifyError) {
                        console.warn(`无法验证DHCP配置状态:`, verifyError.message);
                        console.log(`已为接口 ${interfaceName} 配置为DHCP自动获取IP`);
                        return { success: true, message: 'DHCP配置成功（无法验证）' };
                    }
                } catch (dhclientError) {
                    console.warn(`dhclient失败，尝试使用dhcpcd:`, dhclientError.message);
                    
                    // 备用方法：使用dhcpcd
                    try {
                        await this.executeCommand(`dhcpcd ${interfaceName}`);
                        console.log(`使用dhcpcd为接口 ${interfaceName} 配置DHCP成功`);
                        return { success: true, message: 'DHCP配置成功（dhcpcd）' };
                    } catch (dhcpcdError) {
                        console.warn(`dhcpcd也失败，尝试使用NetworkManager:`, dhcpcdError.message);
                        
                        // 备用方法：使用NetworkManager
                        try {
                            await this.executeCommand(`nmcli device connect ${interfaceName}`);
                            console.log(`使用NetworkManager为接口 ${interfaceName} 配置DHCP成功`);
                            return { success: true, message: 'DHCP配置成功（NetworkManager）' };
                        } catch (nmError) {
                            throw new Error(`所有DHCP配置方法都失败: dhclient(${dhclientError.message}), dhcpcd(${dhcpcdError.message}), nmcli(${nmError.message})`);
                        }
                    }
                }
            }
            
            return { success: true, message: '无需配置IP' };
        } catch (error) {
            console.error(`配置接口 ${interfaceName} IP失败:`, error);
            
            // 提供更详细的错误信息和解决建议
            let errorMessage = `IP配置失败: ${error.message}`;
            if (error.message.includes('Permission denied') || error.message.includes('Operation not permitted')) {
                errorMessage += '。请以root权限运行程序。';
            } else if (error.message.includes('No such device')) {
                errorMessage += `。接口 "${interfaceName}" 不存在。`;
            } else if (error.message.includes('dhclient') || error.message.includes('dhcpcd')) {
                errorMessage += '。请确保系统已安装DHCP客户端（dhclient或dhcpcd）。';
            }
            
            return { success: false, message: errorMessage, error: error.message };
        }
    }

    /**
     * 删除桥接
     */
    async removeBridge(bridgeId) {
        try {
            if (!this.activeBridges.has(bridgeId)) {
                return { 
                    success: false, 
                    message: `桥接 ${bridgeId} 不存在` 
                };
            }

            const bridge = this.activeBridges.get(bridgeId);
            let result;

            if (this.isWindows) {
                result = await this.removeWindowsBridge(bridge, bridgeId);
            } else if (this.isLinux) {
                result = await this.removeLinuxBridge(bridgeId);
            }

            if (result.success) {
                this.activeBridges.delete(bridgeId);
                
                // 从数据库中删除
                if (this.database) {
                    try {
                        await this.database.deleteBridge(bridgeId);
                        console.log(`桥接数据已从数据库删除: ${bridgeId}`);
                    } catch (dbError) {
                        console.error('从数据库删除桥接数据失败:', dbError);
                        // 不影响桥接删除的成功状态
                    }
                }
            }

            return result;

        } catch (error) {
            console.error('删除桥接失败:', error);
            return { 
                success: false, 
                message: `删除桥接失败: ${error.message}` 
            };
        }
    }

    /**
     * 删除 Windows 桥接
     */
    async removeWindowsBridge(bridge, bridgeId) {
        try {
            // 禁用目标接口的 IP 转发
            const targetInterfaces = bridge.targetInterfaces || [];
            
            // 如果有单个目标接口（兼容旧数据）
            if (bridge.targetInterface) {
                targetInterfaces.push(bridge.targetInterface);
            }

            // 禁用所有目标接口的IP转发
            for (const targetInterface of targetInterfaces) {
                try {
                    await this.executeCommand(
                        `netsh interface ipv4 set interface "${targetInterface}" forwarding=disabled`
                    );
                    console.log(`已禁用接口 ${targetInterface} 的IP转发`);
                } catch (e) {
                    console.warn(`禁用接口 ${targetInterface} IP转发失败: ${e.message}`);
                    // 继续处理其他接口
                }
            }

            // 尝试删除桥接接口
            try {
                await this.executeCommand(`netsh interface bridge delete "${bridgeId}"`);
                console.log(`已删除桥接接口 ${bridgeId}`);
            } catch (e) {
                console.warn(`删除桥接接口失败: ${e.message}`);
                // 忽略错误，可能桥接接口不存在
            }

            return {
                success: true,
                message: `Windows 桥接 ${bridgeId} 删除成功`
            };

        } catch (error) {
            throw new Error(`Windows 桥接删除失败: ${error.message}`);
        }
    }

    /**
     * 删除 Linux 桥接
     */
    async removeLinuxBridge(bridgeId) {
        try {
            // 删除桥接接口
            await this.executeCommand(`ip link delete ${bridgeId} type bridge`);

            return {
                success: true,
                message: `Linux 桥接 ${bridgeId} 删除成功`
            };

        } catch (error) {
            throw new Error(`Linux 桥接删除失败: ${error.message}`);
        }
    }

    /**
     * 获取网络接口的实际IP地址
     */
    async getInterfaceRealIP(interfaceName) {
        try {
            if (this.isWindows) {
                // Windows系统使用netsh命令获取接口IP
                const command = `netsh interface ip show address "${interfaceName}"`;
                const result = await this.executeCommand(command);
                
                if (result.success) {
                    // 解析输出获取IP地址
                    const lines = result.output.split('\n');
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        // 支持中文和英文的IP地址标识
                        if (trimmedLine.includes('IP 地址:') || 
                            trimmedLine.includes('IP Address:') ||
                            trimmedLine.includes('IP地址:')) {
                            const ipMatch = trimmedLine.match(/(\d+\.\d+\.\d+\.\d+)/);
                            if (ipMatch) {
                                return ipMatch[1];
                            }
                        }
                    }
                }
            } else {
                // Linux系统使用ip命令
                const command = `ip addr show ${interfaceName}`;
                const result = await this.executeCommand(command);
                
                if (result.success) {
                    const lines = result.output.split('\n');
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine.includes('inet ') && !trimmedLine.includes('127.0.0.1')) {
                            const ipMatch = trimmedLine.match(/inet (\d+\.\d+\.\d+\.\d+)/);
                            if (ipMatch) {
                                return ipMatch[1];
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`获取接口 ${interfaceName} IP地址失败:`, error);
        }
        return null;
    }

    /**
     * 获取所有活动桥接
     */
    async getActiveBridges() {
        const bridges = [];
        for (const [id, info] of this.activeBridges) {
            // 格式化桥接信息以匹配前端期望的数据结构
            const bridge = {
                id: id,
                name: id, // 前端期望的name字段
                status: info.status || 'active',
                type: info.bridgeType || 'bridge',
                interface: Array.isArray(info.targetInterfaces) ? info.targetInterfaces.join(', ') : (info.targetInterface || 'N/A'),
                interfaces: info.targetInterfaces || [],
                created: info.created,
                // IP配置信息
                ip: 'N/A',
                netmask: 'N/A',
                gateway: 'N/A',
                mac: 'N/A',
                mtu: 'N/A',
                ipMethod: 'N/A', // 新增IP方式字段
                realIP: 'N/A'    // 新增实际IP地址字段
            };

            // 如果有IP配置，提取相关信息
            if (info.ipConfig) {
                if (info.ipConfig.type === 'static' && info.ipConfig.staticIp) {
                    bridge.ip = info.ipConfig.staticIp.address || 'N/A';
                    bridge.netmask = info.ipConfig.staticIp.netmask || 'N/A';
                    bridge.gateway = info.ipConfig.staticIp.gateway || 'N/A';
                    bridge.ipMethod = '静态IP';
                    bridge.realIP = bridge.ip;
                } else if (info.ipConfig.type === 'auto' || info.ipConfig.type === 'dhcp') {
                    bridge.ipMethod = 'DHCP';
                    
                    // 尝试获取DHCP分配的实际IP地址
                    if (info.targetInterfaces && info.targetInterfaces.length > 0) {
                        try {
                            // 对于多个接口，尝试获取第一个接口的IP
                            const interfaceName = Array.isArray(info.targetInterfaces) ? 
                                info.targetInterfaces[0] : info.targetInterfaces;
                            const realIP = await this.getInterfaceRealIP(interfaceName);
                            if (realIP) {
                                bridge.ip = realIP; // 直接将实际IP填充到IP地址字段
                                bridge.realIP = realIP;
                            } else {
                                bridge.ip = 'DHCP (未获取到IP)';
                            }
                        } catch (error) {
                            console.error(`获取桥接 ${id} 实际IP失败:`, error);
                            bridge.ip = 'DHCP (获取失败)';
                        }
                    } else {
                        bridge.ip = 'DHCP (无接口)';
                    }
                }
            }

            bridges.push(bridge);
        }
        return bridges;
    }

    /**
     * 列出所有桥接
     */
    async listBridges() {
        try {
            const bridges = await this.getActiveBridges();
            return {
                success: true,
                bridges: bridges
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 删除桥接
     */
    async deleteBridge(bridgeId) {
        try {
            const result = await this.removeBridge(bridgeId);
            return result;
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 检查桥接状态
     */
    async checkBridgeStatus(bridgeId) {
        if (!this.activeBridges.has(bridgeId)) {
            return { 
                success: false, 
                error: '桥接不存在',
                exists: false 
            };
        }

        const bridge = this.activeBridges.get(bridgeId);
        
        try {
            // 检查接口是否仍然存在
            const interfaceResult = await networkNative.getNetworkInterfaces();
            if (!interfaceResult.success) {
                throw new Error(interfaceResult.error || '获取网络接口失败');
            }
            const interfaces = interfaceResult.interfaces;
            
            // 兼容新旧数据结构
            let targetInterfaces = [];
            if (bridge.targetInterfaces && Array.isArray(bridge.targetInterfaces)) {
                targetInterfaces = bridge.targetInterfaces;
            } else if (bridge.interface1 && bridge.interface2) {
                targetInterfaces = [bridge.interface1, bridge.interface2];
            }
            
            // 检查所有目标接口是否存在
            const interfaceStatus = targetInterfaces.map(ifaceName => {
                const exists = interfaces.some(i => i.name === ifaceName);
                return { name: ifaceName, exists };
            });
            
            const allInterfacesExist = interfaceStatus.every(iface => iface.exists);
            const someInterfacesExist = interfaceStatus.some(iface => iface.exists);
            
            let status = 'inactive';
            if (allInterfacesExist) {
                status = 'active';
            } else if (someInterfacesExist) {
                status = 'partial';
            }

            return {
                success: true,
                exists: true,
                status: status,
                interfaceStatus: interfaceStatus,
                details: {
                    targetInterfaces: targetInterfaces,
                    allInterfacesExist: allInterfacesExist,
                    someInterfacesExist: someInterfacesExist
                },
                ...bridge
            };

        } catch (error) {
            console.error('检查桥接状态失败:', error);
            return {
                success: false,
                exists: true,
                status: 'error',
                error: error.message,
                ...bridge
            };
        }
    }

    /**
     * 执行系统命令
     */
    async executeCommand(command) {
        return new Promise((resolve) => {
            // Windows系统使用chcp 65001设置UTF-8编码
            const finalCommand = this.isWindows ? `chcp 65001 >nul && ${command}` : command;
            
            exec(finalCommand, { 
                encoding: 'utf8',
                env: { ...process.env, LANG: 'zh_CN.UTF-8' }
            }, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        output: stderr || error.message,
                        error: error
                    });
                } else {
                    resolve({
                        success: true,
                        output: stdout,
                        error: null
                    });
                }
            });
        });
    }

    /**
     * 从 IP 和子网掩码获取子网
     */
    getSubnetFromIP(ip, netmask) {
        if (!ip || !netmask) return null;
        
        const ipParts = ip.split('.').map(Number);
        const maskParts = netmask.split('.').map(Number);
        
        const subnet = ipParts.map((part, index) => part & maskParts[index]);
        return subnet.join('.');
    }

    /**
     * 验证桥接配置的完整性
     */
    async validateBridgeConfig(bridgeId) {
        if (!this.database) {
            return { 
                valid: false, 
                error: '数据库未初始化' 
            };
        }

        try {
            return await this.database.validateBridgeConfig(bridgeId);
        } catch (error) {
            console.error('验证桥接配置失败:', error);
            return { 
                valid: false, 
                error: error.message 
            };
        }
    }

    /**
     * 验证所有桥接配置
     */
    async validateAllBridgeConfigs() {
        if (!this.database) {
            return { 
                total: 0,
                valid: 0,
                invalid: 0,
                details: [],
                error: '数据库未初始化'
            };
        }

        try {
            return await this.database.validateAllBridgeConfigs();
        } catch (error) {
            console.error('验证所有桥接配置失败:', error);
            return { 
                total: 0,
                valid: 0,
                invalid: 0,
                details: [],
                error: error.message
            };
        }
    }

    /**
     * 修复桥接配置
     */
    async repairBridgeConfig(bridgeId, repairOptions = {}) {
        if (!this.database) {
            return { 
                success: false, 
                message: '数据库未初始化' 
            };
        }

        try {
            return await this.database.repairBridgeConfig(bridgeId, repairOptions);
        } catch (error) {
            console.error('修复桥接配置失败:', error);
            return { 
                success: false, 
                message: error.message 
            };
        }
    }

    /**
     * 检查桥接持久化状态
     */
    async checkBridgePersistence() {
        try {
            const validation = await this.validateAllBridgeConfigs();
            const activeBridges = await this.getActiveBridges();
            
            const persistenceStatus = {
                database: {
                    total: validation.total,
                    valid: validation.valid,
                    invalid: validation.invalid,
                    hasErrors: validation.invalid > 0
                },
                runtime: {
                    active: activeBridges.length,
                    loaded: this.activeBridges.size
                },
                consistency: {
                    synchronized: true,
                    issues: []
                }
            };

            // 检查数据库与运行时状态的一致性
            if (validation.total !== this.activeBridges.size) {
                persistenceStatus.consistency.synchronized = false;
                persistenceStatus.consistency.issues.push(
                    `数据库中有${validation.total}个桥接，但运行时只加载了${this.activeBridges.size}个`
                );
            }

            // 检查是否有配置错误
            if (validation.invalid > 0) {
                persistenceStatus.consistency.synchronized = false;
                persistenceStatus.consistency.issues.push(
                    `有${validation.invalid}个桥接配置存在错误`
                );
            }

            return persistenceStatus;
        } catch (error) {
            console.error('检查桥接持久化状态失败:', error);
            return {
                database: { total: 0, valid: 0, invalid: 0, hasErrors: true },
                runtime: { active: 0, loaded: 0 },
                consistency: { 
                    synchronized: false, 
                    issues: [`检查失败: ${error.message}`] 
                }
            };
        }
    }
}

module.exports = NetworkBridge;
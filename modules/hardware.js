const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');

// CPU及NPU算力参数数据
const cpuNpuData = {
    // NanoPC系列
    nanopc: {
        't6': {
            cpu: 'Rockchip RK3588',
            architecture: '四核ARM Cortex-A76 (最高2.4GHz) + 四核Cortex-A55 (最高1.8GHz)',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16'
        },
        't4': {
            cpu: 'Rockchip RK3399',
            architecture: '双核Cortex-A72 + 四核Cortex-A53',
            npu: '无独立NPU',
            supportFormats: 'N/A'
        }
    },
    
    // NanoPi R系列（路由器系列）
    nanopi_r: {
        'r6s': {
            cpu: 'Rockchip RK3588S',
            architecture: '八核 (2.4GHz + 1.8GHz)',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16'
        },
        'r6c': {
            cpu: 'Rockchip RK3588S',
            architecture: '四核ARM Cortex-A76 (最高2.4GHz) + 四核Cortex-A55 (最高1.8GHz)',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16'
        },
        'r76s': {
            cpu: 'Rockchip RK3576',
            architecture: '58K DMIPS',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16'
        },
        'r5s': {
            cpu: 'Rockchip RK3568B2',
            architecture: '四核 (2.0GHz)',
            npu: '0.8 TOPS',
            supportFormats: 'INT8/FP16'
        },
        'r5c': {
            cpu: 'Rockchip RK3568',
            architecture: '四核ARM Cortex-A55',
            npu: '0.8 TOPS',
            supportFormats: 'INT8/FP16'
        },
        'r4s': {
            cpu: 'Rockchip RK3399',
            architecture: '双核Cortex-A72 + 四核Cortex-A53',
            npu: '无独立NPU',
            supportFormats: 'N/A'
        },
        'r3s': {
            cpu: 'Rockchip RK3566',
            architecture: '四核ARM Cortex-A55 (最高1.8GHz)',
            npu: '0.8 TOPS',
            supportFormats: 'INT8/FP16'
        },
        'r2s': {
            cpu: 'Rockchip RK3328',
            architecture: '四核Cortex-A53 (最高1.4GHz)',
            npu: '无独立NPU',
            supportFormats: 'N/A'
        }
    },
    
    // NanoPi M系列
    nanopi_m: {
        'm6': {
            cpu: 'Rockchip RK3588S',
            architecture: '四核ARM Cortex-A76 (最高2.4GHz) + 四核Cortex-A55 (最高1.8GHz)',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16'
        },
        'm5': {
            cpu: 'Rockchip RK3576',
            architecture: '四核Cortex-A72 (最高2.2GHz) + 四核Cortex-A53',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16'
        },
        'm4': {
            cpu: 'Rockchip RK3399',
            architecture: '双核Cortex-A72 (最高2.0GHz) + 四核Cortex-A53',
            npu: '无独立NPU',
            supportFormats: 'N/A'
        }
    },
    
    // Orange Pi AI系列
    orangepi_ai: {
        'aipro_20t': {
            cpu: '4核64位处理器 + AI处理器',
            architecture: '4核64位处理器',
            npu: '20 TOPS',
            memory: '12GB/24GB LPDDR4X',
            supportFormats: 'INT4/INT8/INT16/FP16/BF16'
        },
        'aipro_8t': {
            cpu: '4核64位处理器 + AI处理器',
            architecture: '4核64位处理器',
            npu: '8 TOPS',
            memory: '8GB/16GB LPDDR4X',
            supportFormats: 'INT4/INT8/INT16/FP16/BF16'
        },
        'rv2': {
            cpu: '8核RISC-V AI处理器',
            architecture: '8核RISC-V',
            npu: '2 TOPS CPU融合通用算力',
            supportFormats: 'INT8/FP16'
        },
        'r2s': {
            cpu: 'Sky X1 8核RISC-V AI处理器',
            architecture: '8核RISC-V',
            npu: '2 TOPS CPU融合通用算力',
            memory: '2GB/4GB/8GB LPDDR4X',
            supportFormats: 'INT8/FP16'
        }
    },
    
    // Orange Pi 标准系列
    orangepi: {
        'zero2w': {
            cpu: 'Allwinner H618',
            architecture: '四核ARM Cortex-A53 (最高1.5GHz)',
            npu: '无独立NPU',
            memory: '1GB/1.5GB/4GB LPDDR4',
            supportFormats: 'N/A'
        },
        '5plus': {
            cpu: 'Rockchip RK3588',
            architecture: '四核ARM Cortex-A76 (最高2.4GHz) + 四核Cortex-A55 (最高1.8GHz)',
            npu: '6 TOPS',
            memory: '4GB/8GB/16GB/32GB LPDDR4X',
            supportFormats: 'INT4/INT8/INT16/FP16'
        },
        '5': {
            cpu: 'Rockchip RK3588S',
            architecture: '四核ARM Cortex-A76 (最高2.4GHz) + 四核Cortex-A55 (最高1.8GHz)',
            npu: '6 TOPS',
            memory: '4GB/8GB/16GB LPDDR4X',
            supportFormats: 'INT4/INT8/INT16/FP16'
        },
        '3b': {
            cpu: 'Rockchip RK3566',
            architecture: '四核ARM Cortex-A55 (最高1.8GHz)',
            npu: '0.8 TOPS',
            memory: '2GB/4GB/8GB LPDDR4X',
            supportFormats: 'INT8/FP16'
        }
    },
    
    // 通用Rockchip芯片数据库
    rockchip_generic: {
        'rk3588': {
            cpu: 'Rockchip RK3588',
            architecture: '四核ARM Cortex-A76 (最高2.4GHz) + 四核Cortex-A55 (最高1.8GHz)',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16',
            memory: '4GB/8GB/16GB/32GB LPDDR4X'
        },
        'rk3588s': {
            cpu: 'Rockchip RK3588S',
            architecture: '四核ARM Cortex-A76 (最高2.4GHz) + 四核Cortex-A55 (最高1.8GHz)',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16',
            memory: '4GB/8GB/16GB LPDDR4X'
        },
        'rk3576': {
            cpu: 'Rockchip RK3576',
            architecture: '四核ARM Cortex-A72 (最高2.2GHz) + 四核Cortex-A53',
            npu: '6 TOPS',
            supportFormats: 'INT4/INT8/INT16/FP16',
            memory: '4GB/8GB/16GB LPDDR4X'
        },
        'rk3568': {
            cpu: 'Rockchip RK3568',
            architecture: '四核ARM Cortex-A55 (最高2.0GHz)',
            npu: '0.8 TOPS',
            supportFormats: 'INT8/FP16',
            memory: '2GB/4GB/8GB LPDDR4X'
        },
        'rk3568b2': {
            cpu: 'Rockchip RK3568B2',
            architecture: '四核ARM Cortex-A55 (最高2.0GHz)',
            npu: '0.8 TOPS',
            supportFormats: 'INT8/FP16',
            memory: '2GB/4GB/8GB LPDDR4X'
        },
        'rk3566': {
            cpu: 'Rockchip RK3566',
            architecture: '四核ARM Cortex-A55 (最高1.8GHz)',
            npu: '0.8 TOPS',
            supportFormats: 'INT8/FP16',
            memory: '2GB/4GB/8GB LPDDR4X'
        },
        'rk3562': {
            cpu: 'Rockchip RK3562',
            architecture: '四核ARM Cortex-A53 (最高1.8GHz)',
            npu: '1.0 TOPS',
            supportFormats: 'INT8/FP16',
            memory: '2GB/4GB/8GB LPDDR4X'
        },
        'rk3562': {
            cpu: 'Rockchip RK3562',
            architecture: '四核ARM Cortex-A53 (最高1.8GHz)',
            npu: '1.0 TOPS',
            supportFormats: 'INT8/FP16',
            memory: '2GB/4GB/8GB LPDDR4X'
        },
        'rk3399': {
            cpu: 'Rockchip RK3399',
            architecture: '双核ARM Cortex-A72 (最高2.0GHz) + 四核Cortex-A53 (最高1.4GHz)',
            npu: '无独立NPU',
            supportFormats: 'N/A',
            memory: '2GB/4GB LPDDR4'
        },
        'rk3328': {
            cpu: 'Rockchip RK3328',
            architecture: '四核ARM Cortex-A53 (最高1.4GHz)',
            npu: '无独立NPU',
            supportFormats: 'N/A',
            memory: '1GB/2GB/4GB DDR4'
        },
        'rk3326': {
            cpu: 'Rockchip RK3326',
            architecture: '四核ARM Cortex-A35 (最高1.5GHz)',
            npu: '无独立NPU',
            supportFormats: 'N/A',
            memory: '1GB/2GB/4GB LPDDR3'
        },
        'rk3308': {
            cpu: 'Rockchip RK3308',
            architecture: '四核ARM Cortex-A35 (最高1.3GHz)',
            npu: '无独立NPU',
            supportFormats: 'N/A',
            memory: '256MB/512MB DDR3L'
        },
        'rk3288': {
            cpu: 'Rockchip RK3288',
            architecture: '四核ARM Cortex-A17 (最高1.8GHz)',
            npu: '无独立NPU',
            supportFormats: 'N/A',
            memory: '2GB/4GB DDR3'
        }
    }
};

// NPU算力等级分类（基于Rockchip官方规格）
const npuTiers = {
    'flagship': { min: 6.0, label: '旗舰级', color: '#ff0066', description: 'RK3588系列' },
    'premium': { min: 3.0, label: '高端', color: '#ff4444', description: 'RK3576等' },
    'mainstream': { min: 1.0, label: '主流', color: '#ff8800', description: 'RK3562等' },
    'entry': { min: 0.5, label: '入门', color: '#ffaa00', description: 'RK3566/RK3568系列' },
    'basic': { min: 0.1, label: '基础', color: '#88cc00', description: 'RK3399等' },
    'none': { min: 0, label: '无NPU', color: '#cccccc', description: '不支持NPU' }
};

// 获取NPU算力等级
function getNpuTier(npuValue) {
    if (npuValue === '无独立NPU' || npuValue === 'N/A') {
        return npuTiers.none;
    }
    
    const numericValue = parseFloat(npuValue.replace(/[^0-9.]/g, ''));
    
    if (numericValue >= npuTiers.flagship.min) return npuTiers.flagship;
    if (numericValue >= npuTiers.premium.min) return npuTiers.premium;
    if (numericValue >= npuTiers.mainstream.min) return npuTiers.mainstream;
    if (numericValue >= npuTiers.entry.min) return npuTiers.entry;
    if (numericValue >= npuTiers.basic.min) return npuTiers.basic;
    
    return npuTiers.none;
}

// Linux系统硬件检测函数
function detectLinuxHardware() {
    return new Promise((resolve, reject) => {
        const hardwareInfo = {
            cpuinfo: null,
            deviceTree: null,
            model: null,
            compatible: null,
            boardName: null,
            socModel: null,
            socCompatible: null,
            cpuCompatible: null,
            machineModel: null,
            systemType: null
        };

        console.log('[CPU检测] 开始Linux硬件检测');

        // 读取 /proc/cpuinfo
        fs.readFile('/proc/cpuinfo', 'utf8', (err, cpuData) => {
            if (!err && cpuData) {
                hardwareInfo.cpuinfo = cpuData;
                console.log('[CPU检测] 成功读取 /proc/cpuinfo');
            } else {
                console.log('[CPU检测] 无法读取 /proc/cpuinfo:', err?.message);
            }

            // 扩展的设备树文件路径，包含更多Rockchip特定路径
            const deviceTreePaths = [
                // 标准设备树路径
                { key: 'model', path: '/proc/device-tree/model' },
                { key: 'compatible', path: '/proc/device-tree/compatible' },
                { key: 'boardName', path: '/proc/device-tree/board-name' },
                { key: 'socModel', path: '/proc/device-tree/soc/model' },
                { key: 'socCompatible', path: '/proc/device-tree/soc/compatible' },
                { key: 'cpuCompatible', path: '/proc/device-tree/cpus/cpu@0/compatible' },
                { key: 'machineModel', path: '/sys/firmware/devicetree/base/model' },
                { key: 'systemType', path: '/proc/device-tree/system-type' },
                
                // Rockchip特定路径
                { key: 'rockchipModel', path: '/proc/device-tree/rockchip,model' },
                { key: 'rockchipBoard', path: '/proc/device-tree/rockchip,board' },
                { key: 'rockchipSoc', path: '/proc/device-tree/rockchip,soc' },
                
                // 更多CPU相关路径
                { key: 'cpu0Model', path: '/proc/device-tree/cpus/cpu@0/model' },
                { key: 'cpu0Name', path: '/proc/device-tree/cpus/cpu@0/device_type' },
                
                // 系统固件路径
                { key: 'firmwareModel', path: '/sys/firmware/devicetree/base/model' },
                { key: 'firmwareCompatible', path: '/sys/firmware/devicetree/base/compatible' },
                
                // DMI信息（某些系统可能有用）
                { key: 'dmiProduct', path: '/sys/class/dmi/id/product_name' },
                { key: 'dmiBoard', path: '/sys/class/dmi/id/board_name' },
                { key: 'dmiVersion', path: '/sys/class/dmi/id/product_version' },
                
                // 备用路径
                { key: 'deviceTree', path: '/sys/class/dmi/id/product_name' }
            ];

            let completedReads = 0;
            const totalReads = deviceTreePaths.length;

            deviceTreePaths.forEach(({ key, path }) => {
                fs.readFile(path, 'utf8', (err, data) => {
                    if (!err && data) {
                        // 清理null字符和空白字符
                        const cleanData = data.replace(/\0/g, ' ').trim();
                        if (cleanData) {
                            hardwareInfo[key] = cleanData;
                            console.log(`[CPU检测] 成功读取 ${path}: ${cleanData.substring(0, 50)}${cleanData.length > 50 ? '...' : ''}`);
                        }
                    }
                    
                    completedReads++;
                    if (completedReads === totalReads) {
                        // 尝试从lscpu获取额外信息
                        exec('lscpu 2>/dev/null', (err, stdout) => {
                            if (!err && stdout) {
                                hardwareInfo.lscpu = stdout;
                                console.log('[CPU检测] 成功获取 lscpu 信息');
                            }
                            
                            // 尝试从dmesg获取启动信息
                            exec('dmesg | grep -i "rockchip\\|rk[0-9]" | head -10 2>/dev/null', (err, stdout) => {
                                if (!err && stdout && stdout.trim()) {
                                    hardwareInfo.dmesg = stdout.trim();
                                    console.log('[CPU检测] 从 dmesg 找到 Rockchip 相关信息');
                                }
                                
                                // 尝试从uname获取内核信息
                                exec('uname -a 2>/dev/null', (err, stdout) => {
                                    if (!err && stdout) {
                                        hardwareInfo.uname = stdout.trim();
                                        console.log('[CPU检测] 获取内核信息');
                                    }
                                    
                                    // 尝试读取更多硬件信息文件
                                    const additionalFiles = [
                                        { key: 'cpuModelName', path: '/sys/devices/system/cpu/cpu0/cpufreq/scaling_driver' },
                                        { key: 'socFamily', path: '/sys/devices/soc0/family' },
                                        { key: 'socMachine', path: '/sys/devices/soc0/machine' },
                                        { key: 'socSocId', path: '/sys/devices/soc0/soc_id' }
                                    ];
                                    
                                    let additionalCompleted = 0;
                                    const totalAdditional = additionalFiles.length;
                                    
                                    additionalFiles.forEach(({ key, path }) => {
                                        fs.readFile(path, 'utf8', (err, data) => {
                                            if (!err && data) {
                                                const cleanData = data.replace(/\0/g, ' ').trim();
                                                if (cleanData) {
                                                    hardwareInfo[key] = cleanData;
                                                    console.log(`[CPU检测] 额外信息 ${path}: ${cleanData}`);
                                                }
                                            }
                                            
                                            additionalCompleted++;
                                            if (additionalCompleted === totalAdditional) {
                                                console.log('[CPU检测] Linux硬件检测完成');
                                                resolve(hardwareInfo);
                                            }
                                        });
                                    });
                                });
                            });
                        });
                    }
                });
            });
        });
    });
}

// Windows系统硬件检测函数
function detectWindowsHardware() {
    return new Promise((resolve, reject) => {
        const hardwareInfo = {
            cpuinfo: null,
            deviceTree: null,
            model: null,
            compatible: null,
            boardName: null,
            socModel: null,
            socCompatible: null,
            cpuCompatible: null,
            machineModel: null,
            systemType: null,
            wmicCpu: null,
            wmicBoard: null,
            powershellCpu: null,
            registryInfo: null
        };

        let completedQueries = 0;
        const totalQueries = 4;

        // 使用wmic获取CPU信息
        exec('wmic cpu get Name,Manufacturer,Description,ProcessorId /format:list', (err, stdout) => {
            if (!err && stdout) {
                hardwareInfo.wmicCpu = stdout.trim();
                console.log('[CPU检测] WMIC CPU信息:', stdout.substring(0, 200));
            }
            
            completedQueries++;
            if (completedQueries === totalQueries) {
                resolve(hardwareInfo);
            }
        });

        // 使用wmic获取主板信息
        exec('wmic baseboard get Product,Manufacturer,SerialNumber /format:list', (err, stdout) => {
            if (!err && stdout) {
                hardwareInfo.wmicBoard = stdout.trim();
                console.log('[CPU检测] WMIC主板信息:', stdout.substring(0, 200));
            }
            
            completedQueries++;
            if (completedQueries === totalQueries) {
                resolve(hardwareInfo);
            }
        });

        // 使用PowerShell获取更详细的CPU信息
        const psCommand = `Get-WmiObject -Class Win32_Processor | Select-Object Name,Manufacturer,Description,ProcessorId,Architecture | ConvertTo-Json`;
        exec(`powershell -Command "${psCommand}"`, (err, stdout) => {
            if (!err && stdout) {
                try {
                    hardwareInfo.powershellCpu = JSON.parse(stdout);
                    console.log('[CPU检测] PowerShell CPU信息:', JSON.stringify(hardwareInfo.powershellCpu, null, 2).substring(0, 300));
                } catch (e) {
                    hardwareInfo.powershellCpu = stdout.trim();
                    console.log('[CPU检测] PowerShell CPU信息 (文本):', stdout.substring(0, 200));
                }
            }
            
            completedQueries++;
            if (completedQueries === totalQueries) {
                resolve(hardwareInfo);
            }
        });

        // 尝试从注册表获取硬件信息
        const regCommand = `reg query "HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0" /v ProcessorNameString`;
        exec(regCommand, (err, stdout) => {
            if (!err && stdout) {
                hardwareInfo.registryInfo = stdout.trim();
                console.log('[CPU检测] 注册表信息:', stdout.substring(0, 200));
            }
            
            completedQueries++;
            if (completedQueries === totalQueries) {
                resolve(hardwareInfo);
            }
        });
    });
}

// 通用硬件检测函数（根据操作系统选择）
function detectHardware() {
    const platform = os.platform();
    console.log(`[CPU检测] 检测到操作系统: ${platform}`);
    
    if (platform === 'win32') {
        return detectWindowsHardware();
    } else if (platform === 'linux') {
        return detectLinuxHardware();
    } else {
        return Promise.reject(new Error(`不支持的操作系统: ${platform}`));
    }
}

// 从硬件信息中提取芯片型号
function extractChipModel(hardwareInfo) {
    let chipModel = null;
    
    // Windows环境下的检测逻辑
    if (hardwareInfo.wmicCpu || hardwareInfo.powershellCpu || hardwareInfo.registryInfo) {
        console.log('[CPU检测] 使用Windows检测逻辑');
        
        // 从Windows硬件信息中提取芯片型号
        const windowsSources = [
            { key: 'wmicCpu', patterns: [
                /Name=.*RK(\d+\w*)/i,
                /Description=.*RK(\d+\w*)/i,
                /Name=.*Rockchip\s+RK(\d+\w*)/i,
                /RK(\d+\w*)/i
            ]},
            { key: 'wmicBoard', patterns: [
                /Product=.*RK(\d+\w*)/i,
                /Manufacturer=.*Rockchip/i,
                /RK(\d+\w*)/i
            ]},
            { key: 'registryInfo', patterns: [
                /ProcessorNameString.*RK(\d+\w*)/i,
                /RK(\d+\w*)/i,
                /Rockchip\s+RK(\d+\w*)/i
            ]}
        ];
        
        // 处理PowerShell返回的JSON数据
        if (hardwareInfo.powershellCpu) {
            let cpuData = hardwareInfo.powershellCpu;
            if (typeof cpuData === 'string') {
                try {
                    cpuData = JSON.parse(cpuData);
                } catch (e) {
                    // 如果解析失败，当作字符串处理
                }
            }
            
            if (typeof cpuData === 'object' && cpuData !== null) {
                // 处理数组或单个对象
                const processors = Array.isArray(cpuData) ? cpuData : [cpuData];
                for (const proc of processors) {
                    if (proc.Name) {
                        const nameMatch = proc.Name.match(/RK(\d+\w*)/i);
                        if (nameMatch) {
                            chipModel = 'RK' + nameMatch[1].toUpperCase();
                            console.log(`[CPU检测] 从PowerShell Name字段检测到: ${chipModel}`);
                            return chipModel;
                        }
                    }
                    if (proc.Description) {
                        const descMatch = proc.Description.match(/RK(\d+\w*)/i);
                        if (descMatch) {
                            chipModel = 'RK' + descMatch[1].toUpperCase();
                            console.log(`[CPU检测] 从PowerShell Description字段检测到: ${chipModel}`);
                            return chipModel;
                        }
                    }
                }
            } else if (typeof cpuData === 'string') {
                // 处理字符串格式的PowerShell输出
                const psMatch = cpuData.match(/RK(\d+\w*)/i);
                if (psMatch) {
                    chipModel = 'RK' + psMatch[1].toUpperCase();
                    console.log(`[CPU检测] 从PowerShell字符串检测到: ${chipModel}`);
                    return chipModel;
                }
            }
        }
        
        // 检查其他Windows来源
        for (const source of windowsSources) {
            const data = hardwareInfo[source.key];
            if (!data) continue;
            
            for (const pattern of source.patterns) {
                const match = data.match(pattern);
                if (match && match[1]) {
                    let modelNumber = match[1].toUpperCase();
                    if (!/^RK/.test(modelNumber)) {
                        modelNumber = 'RK' + modelNumber;
                    }
                    chipModel = modelNumber;
                    console.log(`[CPU检测] 从Windows ${source.key} 检测到 Rockchip 芯片: ${chipModel}`);
                    return chipModel;
                }
            }
        }
    }
    
    // Linux环境下的检测逻辑（保持原有逻辑）
    // 定义Rockchip芯片检测的优先级顺序
    const rockchipSources = [
        // 最高优先级：设备树兼容性字符串（官方标准格式）
        { key: 'compatible', patterns: [
            /rockchip,rk(\d+\w*)/i,        // 官方标准格式：rockchip,rk3588
            /^rk(\d+\w*),rockchip$/i,      // 反向格式：rk3588,rockchip
            /rockchip-rk(\d+\w*)/i,        // 连字符格式：rockchip-rk3588
            /rk(\d+\w*)-.*rockchip/i       // 其他变体格式
        ]},
        { key: 'socCompatible', patterns: [
            /rockchip,rk(\d+\w*)/i,
            /rk(\d+\w*)/i
        ]},
        { key: 'cpuCompatible', patterns: [
            /rockchip,rk(\d+\w*)/i
        ]},
        // 中等优先级：模型信息
        { key: 'model', patterns: [
            /RK(\d+\w*)/i,
            /Rockchip\s+RK(\d+\w*)/i,
            /.*RK(\d+\w*).*/i
        ]},
        { key: 'machineModel', patterns: [
            /RK(\d+\w*)/i,
            /Rockchip\s+RK(\d+\w*)/i
        ]},
        { key: 'socModel', patterns: [
            /RK(\d+\w*)/i,
            /Rockchip\s+RK(\d+\w*)/i
        ]},
        { key: 'rockchipModel', patterns: [
            /RK(\d+\w*)/i,
            /(.*)/i  // 任何内容都可能是型号
        ]},
        // 较低优先级：其他来源
        { key: 'boardName', patterns: [
            /RK(\d+\w*)/i,
            /.*-rk(\d+\w*)/i
        ]},
        { key: 'rockchipBoard', patterns: [
            /RK(\d+\w*)/i,
            /(.*)/i
        ]},
        { key: 'systemType', patterns: [
            /RK(\d+\w*)/i,
            /Rockchip\s+RK(\d+\w*)/i
        ]}
    ];
    
    // 按优先级检测Rockchip芯片
    for (const source of rockchipSources) {
        const data = hardwareInfo[source.key];
        if (!data) continue;
        
        for (const pattern of source.patterns) {
            const match = data.match(pattern);
            if (match && match[1]) {
                let modelNumber = match[1].toUpperCase();
                // 确保型号格式正确
                if (!/^RK/.test(modelNumber)) {
                    modelNumber = 'RK' + modelNumber;
                }
                chipModel = modelNumber;
                console.log(`[CPU检测] 从 ${source.key} 检测到 Rockchip 芯片: ${chipModel}`);
                return chipModel;
            }
        }
    }
    
    // 从CPU信息中提取Rockchip信息
    if (hardwareInfo.cpuinfo) {
        // 匹配Hardware字段中的Rockchip信息
        const hardwarePatterns = [
            /Hardware\s*:\s*.*RK(\d+\w*)/i,
            /Hardware\s*:\s*.*Rockchip\s+RK(\d+\w*)/i,
            /Hardware\s*:\s*(RK\d+\w*)/i
        ];
        
        for (const pattern of hardwarePatterns) {
            const match = hardwareInfo.cpuinfo.match(pattern);
            if (match) {
                chipModel = match[1].startsWith('RK') ? match[1].toUpperCase() : 'RK' + match[1].toUpperCase();
                console.log(`[CPU检测] 从 /proc/cpuinfo Hardware 字段检测到: ${chipModel}`);
                return chipModel;
            }
        }
        
        // 检查Model name字段
        const modelNameMatch = hardwareInfo.cpuinfo.match(/model name\s*:\s*.*RK(\d+\w*)/i);
        if (modelNameMatch) {
            chipModel = 'RK' + modelNameMatch[1].toUpperCase();
            console.log(`[CPU检测] 从 /proc/cpuinfo Model name 字段检测到: ${chipModel}`);
            return chipModel;
        }
    }
    
    // 从dmesg启动信息中检测
    if (hardwareInfo.dmesg) {
        const dmesgPatterns = [
            /rockchip,rk(\d+\w*)/i,
            /RK(\d+\w*)/i,
            /Rockchip\s+RK(\d+\w*)/i
        ];
        
        for (const pattern of dmesgPatterns) {
            const match = hardwareInfo.dmesg.match(pattern);
            if (match && match[1]) {
                chipModel = match[1].startsWith('RK') ? match[1].toUpperCase() : 'RK' + match[1].toUpperCase();
                console.log(`[CPU检测] 从 dmesg 检测到: ${chipModel}`);
                return chipModel;
            }
        }
    }
    
    // 从lscpu信息中检测
    if (hardwareInfo.lscpu) {
        const lscpuPatterns = [
            /Model name:\s*.*RK(\d+\w*)/i,
            /Architecture:\s*.*RK(\d+\w*)/i,
            /Vendor ID:\s*.*RK(\d+\w*)/i,
            /CPU family:\s*.*RK(\d+\w*)/i,
            /Model:\s*.*RK(\d+\w*)/i
        ];
        
        for (const pattern of lscpuPatterns) {
            const match = hardwareInfo.lscpu.match(pattern);
            if (match && match[1]) {
                chipModel = match[1].startsWith('RK') ? match[1].toUpperCase() : 'RK' + match[1].toUpperCase();
                console.log(`[CPU检测] 从 lscpu 检测到: ${chipModel}`);
                return chipModel;
            }
        }
    }
    
    // 从uname信息中检测
    if (hardwareInfo.uname) {
        const unamePatterns = [
            /.*RK(\d+\w*)/i,
            /.*rockchip.*rk(\d+\w*)/i
        ];
        
        for (const pattern of unamePatterns) {
            const match = hardwareInfo.uname.match(pattern);
            if (match && match[1]) {
                chipModel = match[1].startsWith('RK') ? match[1].toUpperCase() : 'RK' + match[1].toUpperCase();
                console.log(`[CPU检测] 从 uname 检测到: ${chipModel}`);
                return chipModel;
            }
        }
    }
    
    // 从内核模块信息中检测
    if (hardwareInfo.modules) {
        const modulePatterns = [
            /rockchip.*rk(\d+\w*)/i,
            /rk(\d+\w*).*rockchip/i,
            /rk(\d+\w*)/i
        ];
        
        for (const pattern of modulePatterns) {
            const match = hardwareInfo.modules.match(pattern);
            if (match && match[1]) {
                chipModel = match[1].startsWith('RK') ? match[1].toUpperCase() : 'RK' + match[1].toUpperCase();
                console.log(`[CPU检测] 从内核模块检测到: ${chipModel}`);
                return chipModel;
            }
        }
    }
    
    // 从设备信息中检测（额外的设备树路径）
    if (hardwareInfo.deviceInfo) {
        const devicePatterns = [
            /rockchip,rk(\d+\w*)/i,
            /rk(\d+\w*)/i,
            /.*RK(\d+\w*)/i
        ];
        
        for (const pattern of devicePatterns) {
            const match = hardwareInfo.deviceInfo.match(pattern);
            if (match && match[1]) {
                chipModel = match[1].startsWith('RK') ? match[1].toUpperCase() : 'RK' + match[1].toUpperCase();
                console.log(`[CPU检测] 从设备信息检测到: ${chipModel}`);
                return chipModel;
            }
        }
    }
    
    // 从系统信息中检测（额外的系统文件）
    if (hardwareInfo.systemInfo) {
        const systemPatterns = [
            /.*RK(\d+\w*)/i,
            /rockchip.*rk(\d+\w*)/i,
            /.*rockchip.*(\d+\w*)/i
        ];
        
        for (const pattern of systemPatterns) {
            const match = hardwareInfo.systemInfo.match(pattern);
            if (match && match[1]) {
                let modelNumber = match[1];
                if (!/^\d/.test(modelNumber)) {
                    // 如果不是以数字开头，可能是完整的型号
                    chipModel = modelNumber.toUpperCase();
                } else {
                    chipModel = 'RK' + modelNumber.toUpperCase();
                }
                console.log(`[CPU检测] 从系统信息检测到: ${chipModel}`);
                return chipModel;
            }
        }
    }
    
    // 最后尝试从所有可用信息中进行模糊匹配
    const allInfoKeys = Object.keys(hardwareInfo);
    for (const key of allInfoKeys) {
        const data = hardwareInfo[key];
        if (typeof data === 'string' && data.length > 0) {
            // 尝试匹配任何包含RK+数字的模式
            const fuzzyMatch = data.match(/RK(\d{4}\w*)/i);
            if (fuzzyMatch) {
                chipModel = 'RK' + fuzzyMatch[1].toUpperCase();
                console.log(`[CPU检测] 从 ${key} 模糊匹配检测到: ${chipModel}`);
                return chipModel;
            }
            
            // 尝试匹配Rockchip相关信息
            const rockchipMatch = data.match(/rockchip.*?(\d{4}\w*)/i);
            if (rockchipMatch) {
                chipModel = 'RK' + rockchipMatch[1].toUpperCase();
                console.log(`[CPU检测] 从 ${key} Rockchip模式检测到: ${chipModel}`);
                return chipModel;
            }
        }
    }
    
    // 从不同来源提取芯片型号（保留原有逻辑作为后备）
    const sources = [
        hardwareInfo.cpuinfo,
        hardwareInfo.deviceTree,
        hardwareInfo.boardName
    ];
    
    for (const source of sources) {
        if (!source) continue;
        
        // 匹配常见的芯片型号模式
        const patterns = [
            /RK(\d+\w*)/i,           // Rockchip RK3588, RK3399等
            /BCM(\d+)/i,             // Broadcom BCM2711等
            /MT(\d+)/i,              // MediaTek MT8183等
            /H(\d+)/i,               // Allwinner H618等
            /Exynos\s*(\d+)/i,       // Samsung Exynos
            /Snapdragon\s*(\d+)/i,   // Qualcomm Snapdragon
            /A(\d+)/i,               // Apple A系列
            /Tegra\s*(\w+)/i,        // NVIDIA Tegra
            /OMAP(\d+)/i,            // TI OMAP
            /i\.MX(\d+)/i,           // NXP i.MX
            /STM32(\w+)/i,           // STMicroelectronics STM32
            /AM(\d+)/i,              // TI AM系列
            /Cortex-(\w+)/i          // ARM Cortex系列
        ];
        
        for (const pattern of patterns) {
            const match = source.match(pattern);
            if (match) {
                // 根据匹配的模式构建芯片型号
                if (pattern.source.includes('RK')) {
                    chipModel = 'RK' + match[1];
                } else if (pattern.source.includes('BCM')) {
                    chipModel = 'BCM' + match[1];
                } else if (pattern.source.includes('MT')) {
                    chipModel = 'MT' + match[1];
                } else if (pattern.source.includes('H')) {
                    chipModel = 'H' + match[1];
                } else {
                    chipModel = match[0];
                }
                
                // 如果找到了芯片型号，立即返回
                if (chipModel) {
                    return chipModel.toUpperCase();
                }
            }
        }
    }
    
    return chipModel;
}

// CPU型号标准化处理
function normalizeCpuModel(model) {
    if (!model) return null;
    
    // 转换为小写并移除多余空格
    let normalized = model.toLowerCase().trim();
    
    // 移除常见前缀和后缀
    normalized = normalized.replace(/^(rockchip\s+|rk\s*)/i, '');
    normalized = normalized.replace(/\s*(soc|processor|cpu)$/i, '');
    
    // 移除版本号后缀（如 v1.0, rev1等）
    normalized = normalized.replace(/\s*(v\d+\.\d+|rev\d+|r\d+p\d+)$/i, '');
    
    // 标准化常见变体（按官方命名规范）
    const variants = {
        'rk3588s': 'rk3588s',
        'rk3588': 'rk3588',
        'rk3582': 'rk3582',
        'rk3576': 'rk3576',
        'rk3568b2': 'rk3568b2',
        'rk3568': 'rk3568',
        'rk3566': 'rk3566',
        'rk3562': 'rk3562',
        'rk3399': 'rk3399',
        'rk3328': 'rk3328',
        'rk3326': 'rk3326',
        'rk3308': 'rk3308',
        'rk3288': 'rk3288'
    };
    
    return variants[normalized] || normalized;
}

// 根据CPU型号获取CPU和NPU信息
function getCpuNpuInfo(cpuModel) {
    if (!cpuModel) {
        return {
            detected: false,
            message: '未检测到CPU型号',
            cpuInfo: null,
            npuInfo: null,
            tier: npuTiers.none
        };
    }
    
    // 标准化CPU型号
    const normalizedModel = normalizeCpuModel(cpuModel) || cpuModel.toUpperCase().replace(/\s+/g, '');
    
    // 首先尝试直接从通用Rockchip数据库匹配
    if (normalizedModel.startsWith('RK')) {
        const chipKey = normalizedModel.toLowerCase();
        if (cpuNpuData.rockchip_generic[chipKey]) {
            const specs = cpuNpuData.rockchip_generic[chipKey];
            const npuTier = getNpuTier(specs.npu);
            
            return {
                detected: true,
                series: 'rockchip',
                model: chipKey.toUpperCase(),
                message: `检测到 Rockchip ${chipKey.toUpperCase()} 芯片`,
                cpuInfo: {
                    model: specs.cpu,
                    architecture: specs.architecture
                },
                npuInfo: {
                    performance: specs.npu,
                    supportFormats: specs.supportFormats,
                    tier: npuTier
                },
                memory: specs.memory || '未知',
                tier: npuTier
            };
        }
    }
    
    // 遍历所有产品系列查找匹配
    for (const [series, models] of Object.entries(cpuNpuData)) {
        // 跳过通用数据库，因为已经在上面处理过了
        if (series === 'rockchip_generic') continue;
        
        for (const [model, specs] of Object.entries(models)) {
            const specCpu = specs.cpu.toUpperCase().replace(/\s+/g, '');
            
            // 检查CPU型号是否匹配
            if (normalizedModel.includes(specCpu.replace('ROCKCHIP', '')) || 
                specCpu.includes(normalizedModel)) {
                
                const npuTier = getNpuTier(specs.npu);
                
                return {
                    detected: true,
                    series: series,
                    model: model,
                    message: `检测到 ${series.toUpperCase()} ${model.toUpperCase()} 系列设备`,
                    cpuInfo: {
                        model: specs.cpu,
                        architecture: specs.architecture
                    },
                    npuInfo: {
                        performance: specs.npu,
                        supportFormats: specs.supportFormats,
                        tier: npuTier
                    },
                    memory: specs.memory || '未知',
                    tier: npuTier
                };
            }
        }
    }
    
    // 如果没有找到精确匹配，尝试部分匹配
    const partialMatches = [];
    
    for (const [series, models] of Object.entries(cpuNpuData)) {
        for (const [model, specs] of Object.entries(models)) {
            const specCpu = specs.cpu.toUpperCase();
            
            // 提取主要芯片型号进行匹配
            const chipMatch = specCpu.match(/(RK\d+\w*|H\d+|BCM\d+|MT\d+)/);
            if (chipMatch && normalizedModel.includes(chipMatch[1])) {
                partialMatches.push({
                    series,
                    model,
                    specs,
                    confidence: 'medium'
                });
            }
        }
    }
    
    if (partialMatches.length > 0) {
        const bestMatch = partialMatches[0];
        const npuTier = getNpuTier(bestMatch.specs.npu);
        
        return {
            detected: true,
            series: bestMatch.series,
            model: bestMatch.model,
            confidence: bestMatch.confidence,
            message: `可能是 ${bestMatch.series.toUpperCase()} ${bestMatch.model.toUpperCase()} 系列设备 (部分匹配)`,
            cpuInfo: {
                model: bestMatch.specs.cpu,
                architecture: bestMatch.specs.architecture
            },
            npuInfo: {
                performance: bestMatch.specs.npu,
                supportFormats: bestMatch.specs.supportFormats,
                tier: npuTier
            },
            memory: bestMatch.specs.memory || '未知',
            tier: npuTier
        };
    }
    
    return {
        detected: false,
        message: `未知的CPU型号: ${cpuModel}`,
        cpuInfo: {
            model: cpuModel,
            architecture: '未知'
        },
        npuInfo: {
            performance: '未知',
            supportFormats: '未知',
            tier: npuTiers.none
        },
        tier: npuTiers.none
    };
}

module.exports = {
    cpuNpuData,
    npuTiers,
    getNpuTier,
    detectLinuxHardware,
    detectWindowsHardware,
    detectHardware,
    extractChipModel,
    getCpuNpuInfo
};
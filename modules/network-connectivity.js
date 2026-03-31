const os = require('os');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class NetworkConnectivity {
    constructor() {
        this.isWindows = os.platform() === 'win32';
        this.isLinux = os.platform() === 'linux';
        this.defaultTestHosts = [
            '8.8.8.8',      // Google DNS
            '1.1.1.1',      // Cloudflare DNS
            '114.114.114.114', // 114 DNS
            'www.baidu.com', // 百度
            'www.google.com' // Google
        ];
    }

    /**
     * 测试指定接口的网络连通性
     * @param {string} interfaceName - 网络接口名称
     * @param {Array<string>} testHosts - 测试主机列表（可选）
     * @returns {Promise<Object>} 连通性测试结果
     */
    async testInterfaceConnectivity(interfaceName, testHosts = null) {
        const hosts = testHosts || this.defaultTestHosts;
        const results = {
            interfaceName,
            timestamp: new Date().toISOString(),
            overallStatus: 'unknown',
            tests: [],
            summary: {
                total: hosts.length,
                success: 0,
                failed: 0,
                successRate: 0
            }
        };

        console.log(`开始测试接口 ${interfaceName} 的网络连通性...`);

        for (const host of hosts) {
            try {
                const testResult = await this.pingHost(host, interfaceName);
                results.tests.push(testResult);
                
                if (testResult.success) {
                    results.summary.success++;
                } else {
                    results.summary.failed++;
                }
            } catch (error) {
                console.error(`测试主机 ${host} 时发生错误:`, error);
                results.tests.push({
                    host,
                    success: false,
                    error: error.message,
                    responseTime: null
                });
                results.summary.failed++;
            }
        }

        // 计算成功率
        results.summary.successRate = Math.round((results.summary.success / results.summary.total) * 100);

        // 确定整体状态
        if (results.summary.successRate >= 80) {
            results.overallStatus = 'excellent';
        } else if (results.summary.successRate >= 60) {
            results.overallStatus = 'good';
        } else if (results.summary.successRate >= 30) {
            results.overallStatus = 'poor';
        } else {
            results.overallStatus = 'failed';
        }

        console.log(`接口 ${interfaceName} 连通性测试完成，成功率: ${results.summary.successRate}%`);
        return results;
    }

    /**
     * 测试桥接的网络连通性
     * @param {string} bridgeName - 桥接名称
     * @param {Array<string>} testTargets - 测试目标列表
     * @returns {Promise<Object>} 桥接连通性测试结果
     */
    async testBridgeConnectivity(bridgeName, testTargets = null) {
        const targets = testTargets || this.defaultTestHosts;
        const results = {
            bridgeName,
            timestamp: new Date().toISOString(),
            results: [],
            overallStatus: 'unknown',
            successCount: 0,
            totalTests: targets.length,
            successRate: 0,
            averageLatency: 0
        };

        console.log(`开始测试桥接 ${bridgeName} 的网络连通性...`);

        let totalLatency = 0;
        let validLatencyCount = 0;

        for (const target of targets) {
            try {
                const testResult = await this.pingHost(target);
                results.results.push({
                    target,
                    success: testResult.success,
                    latency: testResult.latency,
                    error: testResult.error
                });
                
                if (testResult.success) {
                    results.successCount++;
                    if (testResult.latency > 0) {
                        totalLatency += testResult.latency;
                        validLatencyCount++;
                    }
                }
            } catch (error) {
                console.error(`测试目标 ${target} 时发生错误:`, error);
                results.results.push({
                    target,
                    success: false,
                    latency: 0,
                    error: error.message
                });
            }
        }

        // 计算统计信息
        results.successRate = Math.round((results.successCount / results.totalTests) * 100);
        results.averageLatency = validLatencyCount > 0 ? Math.round(totalLatency / validLatencyCount) : 0;

        // 确定桥接整体状态
        if (results.successRate >= 90) {
            results.overallStatus = 'excellent';
        } else if (results.successRate >= 70) {
            results.overallStatus = 'good';
        } else if (results.successRate >= 30) {
            results.overallStatus = 'poor';
        } else {
            results.overallStatus = 'failed';
        }

        console.log(`桥接 ${bridgeName} 连通性测试完成，成功率: ${results.successRate}%`);
        return results;
    }

    /**
     * 测试桥接内所有接口的连通性（保留原方法用于其他用途）
     * @param {Array<string>} bridgeInterfaces - 桥接内的接口列表
     * @returns {Promise<Object>} 桥接连通性测试结果
     */
    async testBridgeInterfacesConnectivity(bridgeInterfaces) {
        const bridgeResults = {
            timestamp: new Date().toISOString(),
            bridgeInterfaces,
            interfaceResults: [],
            overallStatus: 'unknown',
            summary: {
                totalInterfaces: bridgeInterfaces.length,
                workingInterfaces: 0,
                failedInterfaces: 0,
                averageSuccessRate: 0
            }
        };

        console.log(`开始测试桥接内 ${bridgeInterfaces.length} 个接口的连通性...`);

        let totalSuccessRate = 0;

        for (const interfaceName of bridgeInterfaces) {
            try {
                const interfaceResult = await this.testInterfaceConnectivity(interfaceName);
                bridgeResults.interfaceResults.push(interfaceResult);
                
                totalSuccessRate += interfaceResult.summary.successRate;
                
                if (interfaceResult.summary.successRate >= 50) {
                    bridgeResults.summary.workingInterfaces++;
                } else {
                    bridgeResults.summary.failedInterfaces++;
                }
            } catch (error) {
                console.error(`测试接口 ${interfaceName} 时发生错误:`, error);
                bridgeResults.interfaceResults.push({
                    interfaceName,
                    timestamp: new Date().toISOString(),
                    overallStatus: 'error',
                    error: error.message,
                    tests: [],
                    summary: { total: 0, success: 0, failed: 0, successRate: 0 }
                });
                bridgeResults.summary.failedInterfaces++;
            }
        }

        // 计算平均成功率
        if (bridgeResults.interfaceResults.length > 0) {
            bridgeResults.summary.averageSuccessRate = Math.round(
                totalSuccessRate / bridgeResults.interfaceResults.length
            );
        }

        // 确定桥接整体状态
        const workingRatio = bridgeResults.summary.workingInterfaces / bridgeResults.summary.totalInterfaces;
        if (workingRatio >= 0.8 && bridgeResults.summary.averageSuccessRate >= 70) {
            bridgeResults.overallStatus = 'excellent';
        } else if (workingRatio >= 0.6 && bridgeResults.summary.averageSuccessRate >= 50) {
            bridgeResults.overallStatus = 'good';
        } else if (workingRatio >= 0.3 || bridgeResults.summary.averageSuccessRate >= 30) {
            bridgeResults.overallStatus = 'poor';
        } else {
            bridgeResults.overallStatus = 'failed';
        }

        console.log(`桥接连通性测试完成，平均成功率: ${bridgeResults.summary.averageSuccessRate}%`);
        return bridgeResults;
    }

    /**
     * Ping指定主机
     * @param {string} host - 目标主机
     * @param {string} interfaceName - 网络接口名称（可选）
     * @returns {Promise<Object>} Ping结果
     */
    async pingHost(host, interfaceName = null) {
        const startTime = Date.now();
        
        try {
            let command;
            if (this.isWindows) {
                // Windows ping命令
                command = `ping -n 3 ${host}`;
                if (interfaceName) {
                    // 在Windows上，我们可以尝试指定源接口
                    const interfaceIP = await this.getInterfaceIP(interfaceName);
                    if (interfaceIP) {
                        command = `ping -n 3 -S ${interfaceIP} ${host}`;
                    }
                }
            } else {
                // Linux ping命令
                command = `ping -c 3 ${host}`;
                if (interfaceName) {
                    command = `ping -c 3 -I ${interfaceName} ${host}`;
                }
            }

            const { stdout, stderr } = await execAsync(command, { timeout: 10000 });
            const responseTime = Date.now() - startTime;

            // 解析ping结果
            const success = this.parsePingOutput(stdout, stderr);
            
            return {
                host,
                success,
                responseTime,
                output: stdout,
                error: stderr || null
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            return {
                host,
                success: false,
                responseTime,
                output: null,
                error: error.message
            };
        }
    }

    /**
     * 解析ping命令输出
     * @param {string} stdout - 标准输出
     * @param {string} stderr - 错误输出
     * @returns {boolean} 是否成功
     */
    parsePingOutput(stdout, stderr) {
        if (stderr && stderr.trim()) {
            return false;
        }

        if (this.isWindows) {
            // Windows ping输出解析
            return stdout.includes('TTL=') || stdout.includes('时间=') || stdout.includes('time=');
        } else {
            // Linux ping输出解析
            return stdout.includes('ttl=') && !stdout.includes('100% packet loss');
        }
    }

    /**
     * 获取网络接口的IP地址
     * @param {string} interfaceName - 接口名称
     * @returns {Promise<string|null>} IP地址
     */
    async getInterfaceIP(interfaceName) {
        try {
            const interfaces = os.networkInterfaces();
            const iface = interfaces[interfaceName];
            
            if (iface) {
                for (const addr of iface) {
                    if (addr.family === 'IPv4' && !addr.internal) {
                        return addr.address;
                    }
                }
            }
            return null;
        } catch (error) {
            console.error(`获取接口 ${interfaceName} IP地址失败:`, error);
            return null;
        }
    }

    /**
     * 测试DNS解析
     * @param {string} hostname - 主机名
     * @returns {Promise<Object>} DNS解析结果
     */
    async testDNSResolution(hostname) {
        const startTime = Date.now();
        
        try {
            let command;
            if (this.isWindows) {
                command = `nslookup ${hostname}`;
            } else {
                command = `dig +short ${hostname}`;
            }

            const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
            const responseTime = Date.now() - startTime;

            const success = stdout && stdout.trim() && !stderr;
            
            return {
                hostname,
                success,
                responseTime,
                result: stdout.trim(),
                error: stderr || null
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            return {
                hostname,
                success: false,
                responseTime,
                result: null,
                error: error.message
            };
        }
    }

    /**
     * 获取网络接口统计信息
     * @param {string} interfaceName - 接口名称
     * @returns {Promise<Object>} 接口统计信息
     */
    async getInterfaceStats(interfaceName) {
        try {
            let command;
            if (this.isWindows) {
                command = `powershell -Command "Get-NetAdapterStatistics -Name '${interfaceName}' | ConvertTo-Json"`;
            } else {
                command = `cat /proc/net/dev | grep ${interfaceName}`;
            }

            const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
            
            if (this.isWindows) {
                try {
                    const stats = JSON.parse(stdout);
                    return {
                        interfaceName,
                        bytesReceived: stats.BytesReceived || 0,
                        bytesSent: stats.BytesSent || 0,
                        packetsReceived: stats.PacketsReceived || 0,
                        packetsSent: stats.PacketsSent || 0,
                        errors: stats.InboundErrors || 0
                    };
                } catch (parseError) {
                    throw new Error('解析Windows网络统计失败');
                }
            } else {
                // Linux解析逻辑
                const lines = stdout.split('\n');
                for (const line of lines) {
                    if (line.includes(interfaceName)) {
                        const parts = line.trim().split(/\s+/);
                        return {
                            interfaceName,
                            bytesReceived: parseInt(parts[1]) || 0,
                            packetsReceived: parseInt(parts[2]) || 0,
                            bytesSent: parseInt(parts[9]) || 0,
                            packetsSent: parseInt(parts[10]) || 0,
                            errors: parseInt(parts[3]) || 0
                        };
                    }
                }
                throw new Error('未找到接口统计信息');
            }
        } catch (error) {
            console.error(`获取接口 ${interfaceName} 统计信息失败:`, error);
            return {
                interfaceName,
                error: error.message,
                bytesReceived: 0,
                bytesSent: 0,
                packetsReceived: 0,
                packetsSent: 0,
                errors: 0
            };
        }
    }
}

module.exports = NetworkConnectivity;
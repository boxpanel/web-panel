const { spawn, execFile } = require('child_process');
const path = require('path');
const os = require('os');

/**
 * 优化的子进程工具，用于替换util.promisify(exec)
 */
class ProcessUtils {
    /**
     * 执行命令（使用spawn，更安全和高效）
     * @param {string} command - 命令
     * @param {Array} args - 参数数组
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    static async spawnCommand(command, args = [], options = {}) {
        return new Promise((resolve, reject) => {
            const defaultOptions = {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 30000, // 30秒超时
                ...options
            };

            const child = spawn(command, args, defaultOptions);
            
            let stdout = options.encoding === 'buffer' ? Buffer.alloc(0) : '';
            let stderr = options.encoding === 'buffer' ? Buffer.alloc(0) : '';
            
            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    if (options.encoding === 'buffer') {
                        stdout = Buffer.concat([stdout, data]);
                    } else {
                        stdout += data.toString();
                    }
                });
            }
            
            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    if (options.encoding === 'buffer') {
                        stderr = Buffer.concat([stderr, data]);
                    } else {
                        stderr += data.toString();
                    }
                });
            }
            
            const timeoutId = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Command timeout after ${defaultOptions.timeout}ms`));
            }, defaultOptions.timeout);
            
            child.on('close', (code) => {
                clearTimeout(timeoutId);
                
                const result = {
                    stdout: options.encoding === 'buffer' ? stdout : stdout.trim(),
                    stderr: options.encoding === 'buffer' ? stderr : stderr.trim(),
                    code
                };
                
                if (code === 0) {
                    resolve(result);
                } else {
                    const error = new Error(`Command failed with code ${code}`);
                    error.stdout = options.encoding === 'buffer' ? stdout : stdout.trim();
                    error.stderr = options.encoding === 'buffer' ? stderr : stderr.trim();
                    error.code = code;
                    reject(error);
                }
            });
            
            child.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    /**
     * 执行可执行文件（使用execFile，比exec更安全）
     * @param {string} file - 可执行文件路径
     * @param {Array} args - 参数数组
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    static async execFileCommand(file, args = [], options = {}) {
        return new Promise((resolve, reject) => {
            const defaultOptions = {
                timeout: 30000, // 30秒超时
                maxBuffer: 1024 * 1024, // 1MB缓冲区
                ...options
            };

            execFile(file, args, defaultOptions, (error, stdout, stderr) => {
                const result = {
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    code: error ? error.code : 0
                };
                
                if (error) {
                    error.stdout = stdout.trim();
                    error.stderr = stderr.trim();
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * 执行shell命令（兼容原有的exec用法）
     * @param {string} command - 完整的shell命令
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    static async execCommand(command, options = {}) {
        // 根据操作系统选择shell
        const isWindows = os.platform() === 'win32';
        const shell = isWindows ? 'cmd.exe' : '/bin/sh';
        const shellFlag = isWindows ? '/c' : '-c';
        
        // 在Windows上设置正确的编码
        const spawnOptions = {
            ...options
        };
        
        if (isWindows) {
            spawnOptions.encoding = 'buffer'; // 使用buffer来处理编码
        }
        
        const result = await ProcessUtils.spawnCommand(shell, [shellFlag, command], spawnOptions);
        
        // 在Windows上手动处理编码
        if (isWindows && Buffer.isBuffer(result.stdout)) {
            try {
                // 尝试使用iconv-lite来解码GBK
                const iconv = require('iconv-lite');
                result.stdout = iconv.decode(result.stdout, 'gbk').trim();
                if (Buffer.isBuffer(result.stderr)) {
                    result.stderr = iconv.decode(result.stderr, 'gbk').trim();
                }
            } catch (error) {
                // 如果iconv-lite不可用，回退到默认处理
                console.warn('无法使用iconv-lite解码，使用默认编码');
                result.stdout = result.stdout.toString().trim();
                if (Buffer.isBuffer(result.stderr)) {
                    result.stderr = result.stderr.toString().trim();
                }
            }
        }
        
        return result;
    }

    /**
     * 安全地执行系统命令（自动转义参数）
     * @param {string} command - 基础命令
     * @param {Array} args - 参数数组
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    static async safeExec(command, args = [], options = {}) {
        // 验证命令是否在允许的列表中（可选的安全检查）
        const allowedCommands = [
            'systemctl', 'service', 'ps', 'top', 'free', 'df', 'lscpu',
            'nvidia-smi', 'lspci', 'lsusb', 'ip', 'ifconfig', 'netstat',
            'ping', 'curl', 'wget', 'git', 'npm', 'node', 'python',
            'python3', 'pip', 'pip3', 'docker', 'docker-compose'
        ];
        
        const baseCommand = path.basename(command);
        if (options.strict && !allowedCommands.includes(baseCommand)) {
            throw new Error(`Command not allowed: ${baseCommand}`);
        }
        
        return this.spawnCommand(command, args, options);
    }

    /**
     * 执行带有实时输出的命令
     * @param {string} command - 命令
     * @param {Array} args - 参数数组
     * @param {Function} onData - 数据回调函数
     * @param {Object} options - 选项
     * @returns {Promise<Object>} 执行结果
     */
    static async execWithOutput(command, args = [], onData = null, options = {}) {
        return new Promise((resolve, reject) => {
            const defaultOptions = {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 60000, // 60秒超时
                ...options
            };

            const child = spawn(command, args, defaultOptions);
            
            let stdout = '';
            let stderr = '';
            
            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    const text = data.toString();
                    stdout += text;
                    if (onData) {
                        onData('stdout', text);
                    }
                });
            }
            
            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    const text = data.toString();
                    stderr += text;
                    if (onData) {
                        onData('stderr', text);
                    }
                });
            }
            
            const timeoutId = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Command timeout after ${defaultOptions.timeout}ms`));
            }, defaultOptions.timeout);
            
            child.on('close', (code) => {
                clearTimeout(timeoutId);
                
                const result = {
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    code
                };
                
                if (code === 0) {
                    resolve(result);
                } else {
                    const error = new Error(`Command failed with code ${code}`);
                    error.stdout = stdout.trim();
                    error.stderr = stderr.trim();
                    error.code = code;
                    reject(error);
                }
            });
            
            child.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    /**
     * 检查命令是否存在
     * @param {string} command - 命令名称
     * @returns {Promise<boolean>} 是否存在
     */
    static async commandExists(command) {
        try {
            const isWindows = os.platform() === 'win32';
            const checkCommand = isWindows ? 'where' : 'which';
            
            await this.spawnCommand(checkCommand, [command], { timeout: 5000 });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 获取命令的完整路径
     * @param {string} command - 命令名称
     * @returns {Promise<string>} 命令路径
     */
    static async getCommandPath(command) {
        try {
            const isWindows = os.platform() === 'win32';
            const checkCommand = isWindows ? 'where' : 'which';
            
            const result = await this.spawnCommand(checkCommand, [command], { timeout: 5000 });
            return result.stdout.split('\n')[0].trim();
        } catch (error) {
            throw new Error(`Command not found: ${command}`);
        }
    }
}

module.exports = ProcessUtils;
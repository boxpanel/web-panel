const http = require('http');
const https = require('https');
const { URL } = require('url');
const querystring = require('querystring');

/**
 * Node.js原生HTTP客户端，用于替换axios
 */
class HttpClient {
    /**
     * 发送HTTP请求
     * @param {string} url - 请求URL
     * @param {Object} options - 请求选项
     * @returns {Promise<Object>} 响应对象
     */
    static async request(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const httpModule = isHttps ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers || {},
                timeout: options.timeout || 10000
            };

            // 处理认证
            if (options.auth) {
                const auth = Buffer.from(`${options.auth.username}:${options.auth.password}`).toString('base64');
                requestOptions.headers['Authorization'] = `Basic ${auth}`;
            }

            // 处理请求体
            let postData = null;
            if (options.data) {
                if (typeof options.data === 'string') {
                    postData = options.data;
                } else if (options.data instanceof URLSearchParams) {
                    postData = options.data.toString();
                } else {
                    postData = JSON.stringify(options.data);
                    if (!requestOptions.headers['Content-Type']) {
                        requestOptions.headers['Content-Type'] = 'application/json';
                    }
                }
                requestOptions.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            const req = httpModule.request(requestOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        let responseData = data;
                        
                        // 尝试解析JSON响应
                        const contentType = res.headers['content-type'] || '';
                        if (contentType.includes('application/json') && data) {
                            try {
                                responseData = JSON.parse(data);
                            } catch (e) {
                                // 如果解析失败，保持原始字符串
                            }
                        }
                        
                        const response = {
                            status: res.statusCode,
                            statusText: res.statusMessage,
                            data: responseData,
                            headers: res.headers
                        };
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
                            error.response = response;
                            reject(error);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            // 发送请求体
            if (postData) {
                req.write(postData);
            }
            
            req.end();
        });
    }

    /**
     * GET请求
     * @param {string} url - 请求URL
     * @param {Object} options - 请求选项
     * @returns {Promise<Object>} 响应对象
     */
    static async get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    }

    /**
     * POST请求
     * @param {string} url - 请求URL
     * @param {*} data - 请求数据
     * @param {Object} options - 请求选项
     * @returns {Promise<Object>} 响应对象
     */
    static async post(url, data, options = {}) {
        return this.request(url, { ...options, method: 'POST', data });
    }

    /**
     * PUT请求
     * @param {string} url - 请求URL
     * @param {*} data - 请求数据
     * @param {Object} options - 请求选项
     * @returns {Promise<Object>} 响应对象
     */
    static async put(url, data, options = {}) {
        return this.request(url, { ...options, method: 'PUT', data });
    }

    /**
     * DELETE请求
     * @param {string} url - 请求URL
     * @param {Object} options - 请求选项
     * @returns {Promise<Object>} 响应对象
     */
    static async delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    }
}

module.exports = HttpClient;
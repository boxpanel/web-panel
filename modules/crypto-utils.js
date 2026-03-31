const crypto = require('crypto');

/**
 * Node.js原生crypto工具，用于替换bcrypt
 */
class CryptoUtils {
    /**
     * 生成随机盐值
     * @param {number} length - 盐值长度（字节）
     * @returns {string} 十六进制盐值
     */
    static generateSalt(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * 使用PBKDF2算法哈希密码
     * @param {string} password - 原始密码
     * @param {string} salt - 盐值（可选，如果不提供会自动生成）
     * @param {number} iterations - 迭代次数
     * @param {number} keyLength - 密钥长度
     * @param {string} digest - 哈希算法
     * @returns {Promise<string>} 哈希后的密码（格式：salt:hash）
     */
    static async hashPassword(password, salt = null, iterations = 100000, keyLength = 64, digest = 'sha512') {
        return new Promise((resolve, reject) => {
            if (!salt) {
                salt = this.generateSalt();
            }
            
            crypto.pbkdf2(password, salt, iterations, keyLength, digest, (err, derivedKey) => {
                if (err) {
                    reject(err);
                } else {
                    const hash = derivedKey.toString('hex');
                    resolve(`${salt}:${hash}`);
                }
            });
        });
    }

    /**
     * 验证密码
     * @param {string} password - 原始密码
     * @param {string} hashedPassword - 哈希后的密码（格式：salt:hash）
     * @param {number} iterations - 迭代次数
     * @param {number} keyLength - 密钥长度
     * @param {string} digest - 哈希算法
     * @returns {Promise<boolean>} 验证结果
     */
    static async verifyPassword(password, hashedPassword, iterations = 100000, keyLength = 64, digest = 'sha512') {
        return new Promise((resolve, reject) => {
            try {
                const [salt, hash] = hashedPassword.split(':');
                if (!salt || !hash) {
                    resolve(false);
                    return;
                }
                
                crypto.pbkdf2(password, salt, iterations, keyLength, digest, (err, derivedKey) => {
                    if (err) {
                        reject(err);
                    } else {
                        const newHash = derivedKey.toString('hex');
                        resolve(hash === newHash);
                    }
                });
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * 同步版本的密码哈希（使用scrypt算法）
     * @param {string} password - 原始密码
     * @param {string} salt - 盐值（可选）
     * @param {number} keyLength - 密钥长度
     * @returns {string} 哈希后的密码（格式：salt:hash）
     */
    static hashPasswordSync(password, salt = null, keyLength = 64) {
        if (!salt) {
            salt = this.generateSalt();
        }
        
        const hash = crypto.scryptSync(password, salt, keyLength).toString('hex');
        return `${salt}:${hash}`;
    }

    /**
     * 同步版本的密码验证（使用scrypt算法）
     * @param {string} password - 原始密码
     * @param {string} hashedPassword - 哈希后的密码（格式：salt:hash）
     * @param {number} keyLength - 密钥长度
     * @returns {boolean} 验证结果
     */
    static verifyPasswordSync(password, hashedPassword, keyLength = 64) {
        try {
            const [salt, hash] = hashedPassword.split(':');
            if (!salt || !hash) {
                return false;
            }
            
            const newHash = crypto.scryptSync(password, salt, keyLength).toString('hex');
            return hash === newHash;
        } catch (error) {
            return false;
        }
    }

    /**
     * 生成随机令牌
     * @param {number} length - 令牌长度（字节）
     * @returns {string} 十六进制令牌
     */
    static generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * 创建HMAC签名
     * @param {string} data - 要签名的数据
     * @param {string} secret - 密钥
     * @param {string} algorithm - 算法（默认sha256）
     * @returns {string} 签名
     */
    static createHmac(data, secret, algorithm = 'sha256') {
        return crypto.createHmac(algorithm, secret).update(data).digest('hex');
    }

    /**
     * 验证HMAC签名
     * @param {string} data - 原始数据
     * @param {string} signature - 签名
     * @param {string} secret - 密钥
     * @param {string} algorithm - 算法（默认sha256）
     * @returns {boolean} 验证结果
     */
    static verifyHmac(data, signature, secret, algorithm = 'sha256') {
        const expectedSignature = this.createHmac(data, secret, algorithm);
        return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
    }
}

module.exports = CryptoUtils;
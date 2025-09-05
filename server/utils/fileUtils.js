const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const mime = require('mime-types');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);
const rename = promisify(fs.rename);

// 文件操作工具类
class FileUtils {
  // 安全路径检查
  static isPathSafe(filePath, basePath = '/') {
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(basePath);
    
    // 检查路径是否在基础路径内
    return resolvedPath.startsWith(resolvedBase);
  }

  // 规范化路径
  static normalizePath(filePath) {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  // 获取文件/目录列表
  static async listDirectory(dirPath) {
    try {
      const items = await readdir(dirPath);
      const result = [];
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await stat(itemPath);
        
        result.push({
          name: item,
          path: this.normalizePath(itemPath),
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
          permissions: stats.mode,
          owner: stats.uid,
          group: stats.gid
        });
      }
      
      // 排序：目录在前，然后按名称排序
      result.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      return result;
    } catch (error) {
      throw new Error(`读取目录失败: ${error.message}`);
    }
  }

  // 读取文件内容
  static async readFileContent(filePath, encoding = 'utf8') {
    try {
      const stats = await stat(filePath);
      
      // 检查文件大小（限制为1MB）
      if (stats.size > 1024 * 1024) {
        throw new Error('文件太大，无法读取');
      }
      
      // 检查是否为文本文件
      const mimeType = mime.lookup(filePath);
      if (mimeType && !mimeType.startsWith('text/') && !this.isTextFile(filePath)) {
        throw new Error('不支持的文件类型');
      }
      
      const content = await readFile(filePath, encoding);
      return {
        content,
        size: stats.size,
        mimeType: mimeType || 'text/plain',
        encoding
      };
    } catch (error) {
      throw new Error(`读取文件失败: ${error.message}`);
    }
  }

  // 写入文件内容
  static async writeFileContent(filePath, content, encoding = 'utf8') {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await this.ensureDirectory(dir);
      
      await writeFile(filePath, content, encoding);
      
      const stats = await stat(filePath);
      return {
        path: this.normalizePath(filePath),
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      throw new Error(`写入文件失败: ${error.message}`);
    }
  }

  // 删除文件或目录
  static async deleteItem(itemPath) {
    try {
      const stats = await stat(itemPath);
      
      if (stats.isDirectory()) {
        // 递归删除目录
        await this.deleteDirectory(itemPath);
      } else {
        // 删除文件
        await unlink(itemPath);
      }
      
      return true;
    } catch (error) {
      throw new Error(`删除失败: ${error.message}`);
    }
  }

  // 递归删除目录
  static async deleteDirectory(dirPath) {
    const items = await readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      await this.deleteItem(itemPath);
    }
    
    await rmdir(dirPath);
  }

  // 创建目录
  static async createDirectory(dirPath) {
    try {
      await mkdir(dirPath, { recursive: true });
      return {
        path: this.normalizePath(dirPath),
        created: new Date()
      };
    } catch (error) {
      throw new Error(`创建目录失败: ${error.message}`);
    }
  }

  // 确保目录存在
  static async ensureDirectory(dirPath) {
    try {
      await stat(dirPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.createDirectory(dirPath);
      } else {
        throw error;
      }
    }
  }

  // 重命名/移动文件或目录
  static async renameItem(oldPath, newPath) {
    try {
      // 确保新路径的目录存在
      const newDir = path.dirname(newPath);
      await this.ensureDirectory(newDir);
      
      await rename(oldPath, newPath);
      
      const stats = await stat(newPath);
      return {
        oldPath: this.normalizePath(oldPath),
        newPath: this.normalizePath(newPath),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      throw new Error(`重命名失败: ${error.message}`);
    }
  }

  // 复制文件
  static async copyFile(srcPath, destPath) {
    try {
      // 确保目标目录存在
      const destDir = path.dirname(destPath);
      await this.ensureDirectory(destDir);
      
      const content = await readFile(srcPath);
      await writeFile(destPath, content);
      
      const stats = await stat(destPath);
      return {
        srcPath: this.normalizePath(srcPath),
        destPath: this.normalizePath(destPath),
        size: stats.size,
        modified: stats.mtime
      };
    } catch (error) {
      throw new Error(`复制文件失败: ${error.message}`);
    }
  }

  // 获取文件信息
  static async getFileInfo(filePath) {
    try {
      const stats = await stat(filePath);
      const mimeType = mime.lookup(filePath);
      
      return {
        path: this.normalizePath(filePath),
        name: path.basename(filePath),
        extension: path.extname(filePath),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        permissions: stats.mode,
        owner: stats.uid,
        group: stats.gid,
        mimeType: mimeType || 'application/octet-stream'
      };
    } catch (error) {
      throw new Error(`获取文件信息失败: ${error.message}`);
    }
  }

  // 搜索文件
  static async searchFiles(dirPath, pattern, options = {}) {
    const {
      recursive = true,
      caseSensitive = false,
      includeContent = false,
      maxResults = 100
    } = options;
    
    const results = [];
    const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    
    const searchInDirectory = async (currentDir, depth = 0) => {
      if (results.length >= maxResults) return;
      
      try {
        const items = await readdir(currentDir);
        
        for (const item of items) {
          if (results.length >= maxResults) break;
          
          const itemPath = path.join(currentDir, item);
          const stats = await stat(itemPath);
          
          // 检查文件名是否匹配
          if (regex.test(item)) {
            const result = {
              path: this.normalizePath(itemPath),
              name: item,
              isDirectory: stats.isDirectory(),
              size: stats.size,
              modified: stats.mtime,
              matchType: 'filename'
            };
            
            // 如果需要搜索内容且是文本文件
            if (includeContent && !stats.isDirectory() && this.isTextFile(itemPath)) {
              try {
                const { content } = await this.readFileContent(itemPath);
                if (regex.test(content)) {
                  result.matchType = 'content';
                  result.hasContentMatch = true;
                }
              } catch (error) {
                // 忽略无法读取的文件
              }
            }
            
            results.push(result);
          }
          
          // 递归搜索子目录
          if (recursive && stats.isDirectory() && depth < 10) {
            await searchInDirectory(itemPath, depth + 1);
          }
        }
      } catch (error) {
        // 忽略无法访问的目录
      }
    };
    
    await searchInDirectory(dirPath);
    return results;
  }

  // 检查是否为文本文件
  static isTextFile(filePath) {
    const textExtensions = [
      '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx',
      '.html', '.htm', '.css', '.scss', '.sass', '.less',
      '.xml', '.yaml', '.yml', '.ini', '.conf', '.config',
      '.log', '.csv', '.sql', '.py', '.java', '.c', '.cpp',
      '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs',
      '.sh', '.bat', '.ps1', '.dockerfile', '.gitignore'
    ];
    
    const ext = path.extname(filePath).toLowerCase();
    return textExtensions.includes(ext);
  }

  // 格式化文件大小
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 获取文件扩展名对应的图标类型
  static getFileIconType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const iconMap = {
      '.txt': 'file-text',
      '.md': 'file-markdown',
      '.json': 'file-text',
      '.js': 'file-text',
      '.ts': 'file-text',
      '.html': 'file-text',
      '.css': 'file-text',
      '.jpg': 'file-image',
      '.jpeg': 'file-image',
      '.png': 'file-image',
      '.gif': 'file-image',
      '.pdf': 'file-pdf',
      '.zip': 'file-zip',
      '.rar': 'file-zip',
      '.tar': 'file-zip',
      '.gz': 'file-zip'
    };
    
    return iconMap[ext] || 'file';
  }

  // 验证文件名
  static validateFileName(fileName) {
    // 检查非法字符
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(fileName)) {
      throw new Error('文件名包含非法字符');
    }
    
    // 检查保留名称（Windows）
    const reservedNames = [
      'CON', 'PRN', 'AUX', 'NUL',
      'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
      'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
    ];
    
    if (reservedNames.includes(fileName.toUpperCase())) {
      throw new Error('文件名为系统保留名称');
    }
    
    // 检查长度
    if (fileName.length > 255) {
      throw new Error('文件名过长');
    }
    
    return true;
  }
}

module.exports = FileUtils;
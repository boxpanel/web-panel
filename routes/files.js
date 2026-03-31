const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// 配置multer存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // 获取当前目录路径
        const currentPath = req.body.currentPath || process.cwd();
        // 上传到当前目录下的uploads子文件夹
        const uploadDir = path.join(currentPath, 'uploads');
        
        // 确保uploads目录存在
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 保持原文件名
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

// 获取初始路径
router.get('/initial-path', (req, res) => {
    try {
        // 返回当前工作目录作为初始路径
        res.json({ path: process.cwd() });
    } catch (error) {
        console.error('获取初始路径失败:', error);
        res.status(500).json({ error: '获取初始路径失败' });
    }
});

// 获取指定目录下的所有文件夹
router.get('/folders', (req, res) => {
    try {
        const requestedPath = req.query.path;
        
        // 如果没有指定路径，返回根目录结构
        if (!requestedPath) {
            const drives = [];
            // 在Windows系统上获取所有驱动器
            if (process.platform === 'win32') {
                for (let i = 65; i <= 90; i++) {
                    const drive = String.fromCharCode(i) + ':\\';
                    try {
                        if (fs.existsSync(drive)) {
                            drives.push({
                                name: drive,
                                path: drive,
                                type: 'drive'
                            });
                        }
                    } catch (error) {
                        // 忽略无法访问的驱动器
                    }
                }
            } else {
                // Linux/Mac系统返回根目录
                drives.push({
                    name: '/',
                    path: '/',
                    type: 'drive'
                });
            }
            
            return res.json({
                success: true,
                currentPath: '',
                folders: drives
            });
        }
        
        // 检查路径是否存在
        if (!fs.existsSync(requestedPath)) {
            return res.status(404).json({ error: '路径不存在' });
        }
        
        const files = fs.readdirSync(requestedPath);
        const folders = files.filter(file => {
            const filePath = path.join(requestedPath, file);
            try {
                const stats = fs.statSync(filePath);
                return stats.isDirectory();
            } catch (error) {
                // 忽略无法访问的文件/文件夹
                return false;
            }
        }).map(folder => ({
            name: folder,
            path: path.join(requestedPath, folder),
            type: 'folder'
        }));
        
        res.json({
            success: true,
            currentPath: requestedPath,
            folders: folders
        });
    } catch (error) {
        console.error('获取文件夹列表失败:', error);
        res.status(500).json({ error: '获取文件夹列表失败: ' + error.message });
    }
});

// 获取文件列表
router.get('/', (req, res) => {
    try {
        const dirPath = req.query.path || process.cwd();
        console.log('请求的路径:', dirPath);
        
        // 检查路径是否存在
        if (!fs.existsSync(dirPath)) {
            console.error('路径不存在:', dirPath);
            return res.status(404).json({ error: '路径不存在: ' + dirPath });
        }
        
        // 检查是否为目录
        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
            console.error('路径不是目录:', dirPath);
            return res.status(400).json({ error: '路径不是目录: ' + dirPath });
        }
        
        const files = fs.readdirSync(dirPath);
        console.log('读取到文件数量:', files.length);
        
        const fileList = files.map(file => {
            const filePath = path.join(dirPath, file);
            try {
                const stats = fs.statSync(filePath);
                
                // 获取文件权限信息（仅支持Unix/Linux系统）
                let permissions = '---------';
                let owner = 'unknown';
                let group = 'unknown';
                
                try {
                    // Unix/Linux系统的权限信息
                    permissions = formatUnixPermissions(stats.mode);
                    owner = stats.uid.toString();
                    group = stats.gid.toString();
                    
                    // 尝试获取用户名和组名
                    try {
                        const { execSync } = require('child_process');
                        owner = execSync(`id -un ${stats.uid}`, { encoding: 'utf8' }).trim();
                        group = execSync(`id -gn ${stats.gid}`, { encoding: 'utf8' }).trim();
                    } catch (e) {
                        // 如果无法获取用户名/组名，保持数字ID
                    }
                } catch (permError) {
                    console.log(`获取权限信息失败: ${filePath}, 错误: ${permError.message}`);
                }
                
                return {
                    name: file,
                    type: stats.isDirectory() ? 'folder' : 'file',
                    size: stats.isDirectory() ? '-' : formatFileSize(stats.size),
                    modified: formatDate(stats.mtime),
                    permissions: permissions,
                    owner: owner,
                    group: group
                };
            } catch (error) {
                // 跳过无权限访问的文件/文件夹（如System Volume Information）
                console.log(`跳过无权限访问的文件: ${filePath}, 错误: ${error.code}`);
                return null;
            }
        }).filter(item => item !== null); // 过滤掉null值
        
        res.json({
            path: dirPath,
            files: fileList
        });
    } catch (error) {
        console.error('获取文件列表失败:', error);
        console.error('错误堆栈:', error.stack);
        res.status(500).json({ error: '获取文件列表失败: ' + error.message });
    }
});

// 创建文件夹
router.post('/folder', (req, res) => {
    try {
        const { path: dirPath, name } = req.body;
        const folderPath = path.join(dirPath, name);
        
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath);
            res.json({ success: true });
        } else {
            res.status(400).json({ error: '文件夹已存在' });
        }
    } catch (error) {
        console.error('创建文件夹失败:', error);
        res.status(500).json({ error: '创建文件夹失败: ' + error.message });
    }
});

// 重命名文件或文件夹
router.put('/rename', (req, res) => {
    try {
        const { path: dirPath, oldName, newName } = req.body;
        const oldPath = path.join(dirPath, oldName);
        const newPath = path.join(dirPath, newName);
        
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
            fs.renameSync(oldPath, newPath);
            res.json({ success: true });
        } else if (!fs.existsSync(oldPath)) {
            res.status(404).json({ error: '文件或文件夹不存在' });
        } else {
            res.status(400).json({ error: '新名称已存在' });
        }
    } catch (error) {
        console.error('重命名失败:', error);
        res.status(500).json({ error: '重命名失败: ' + error.message });
    }
});

// 删除文件或文件夹
router.delete('/', (req, res) => {
    try {
        const { path: dirPath, name, type } = req.body;
        const targetPath = path.join(dirPath, name);
        
        if (fs.existsSync(targetPath)) {
            if (type === 'folder') {
                // 递归删除文件夹
                fs.rmSync(targetPath, { recursive: true, force: true });
            } else {
                // 删除文件
                fs.unlinkSync(targetPath);
            }
            res.json({ success: true });
        } else {
            res.status(404).json({ error: '文件或文件夹不存在' });
        }
    } catch (error) {
        console.error('删除失败:', error);
        res.status(500).json({ error: '删除失败: ' + error.message });
    }
});

// 批量删除文件和文件夹
router.post('/delete', (req, res) => {
    try {
        const { files, currentPath } = req.body;
        
        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: '请提供要删除的文件列表' });
        }
        
        let deletedCount = 0;
        const errors = [];
        
        for (const fileName of files) {
            try {
                const targetPath = path.join(currentPath, fileName);
                
                if (fs.existsSync(targetPath)) {
                    const stats = fs.statSync(targetPath);
                    
                    if (stats.isDirectory()) {
                        // 递归删除文件夹
                        fs.rmSync(targetPath, { recursive: true, force: true });
                    } else {
                        // 删除文件
                        fs.unlinkSync(targetPath);
                    }
                    deletedCount++;
                } else {
                    errors.push(`文件不存在: ${fileName}`);
                }
            } catch (error) {
                errors.push(`删除 ${fileName} 失败: ${error.message}`);
            }
        }
        
        if (errors.length > 0) {
            res.json({ 
                success: true, 
                deletedCount, 
                errors,
                message: `成功删除 ${deletedCount} 个文件，${errors.length} 个失败`
            });
        } else {
            res.json({ 
                success: true, 
                deletedCount,
                message: `成功删除 ${deletedCount} 个文件`
            });
        }
    } catch (error) {
        console.error('批量删除失败:', error);
        res.status(500).json({ error: '批量删除失败: ' + error.message });
    }
});

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 格式化日期
function formatDate(date) {
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 格式化Unix权限
function formatUnixPermissions(mode) {
    const permissions = [];
    
    // 文件类型
    if ((mode & 0o170000) === 0o040000) permissions.push('d'); // 目录
    else if ((mode & 0o170000) === 0o120000) permissions.push('l'); // 符号链接
    else permissions.push('-'); // 普通文件
    
    // 所有者权限
    permissions.push((mode & 0o400) ? 'r' : '-');
    permissions.push((mode & 0o200) ? 'w' : '-');
    permissions.push((mode & 0o100) ? 'x' : '-');
    
    // 组权限
    permissions.push((mode & 0o040) ? 'r' : '-');
    permissions.push((mode & 0o020) ? 'w' : '-');
    permissions.push((mode & 0o010) ? 'x' : '-');
    
    // 其他用户权限
    permissions.push((mode & 0o004) ? 'r' : '-');
    permissions.push((mode & 0o002) ? 'w' : '-');
    permissions.push((mode & 0o001) ? 'x' : '-');
    
    return permissions.join('');
}



// 下载文件
router.post('/download', (req, res) => {
    try {
        const { path: downloadPath, files } = req.body;
        
        console.log('下载请求参数:', { downloadPath, files, currentPath: req.query.currentPath });
        
        if (!downloadPath || !files || files.length === 0) {
            return res.status(400).json({ error: '请提供下载路径和文件列表' });
        }
        
        // 检查下载路径是否存在
        if (!fs.existsSync(downloadPath)) {
            try {
                fs.mkdirSync(downloadPath, { recursive: true });
                console.log('创建下载目录:', downloadPath);
            } catch (error) {
                console.error('创建下载目录失败:', error);
                return res.status(400).json({ error: '无法创建下载目录: ' + error.message });
            }
        }
        
        const currentPath = req.query.currentPath || process.cwd();
        console.log('当前路径:', currentPath);
        let successCount = 0;
        let errorFiles = [];
        
        // 复制每个文件到下载目录
        files.forEach(fileName => {
            const sourcePath = path.join(currentPath, fileName);
            const targetPath = path.join(downloadPath, fileName);
            
            console.log('复制文件:', { fileName, sourcePath, targetPath });
            
            try {
                if (!fs.existsSync(sourcePath)) {
                    throw new Error('源文件不存在');
                }
                
                const stats = fs.statSync(sourcePath);
                
                if (stats.isDirectory()) {
                    // 复制文件夹
                    console.log('复制目录:', sourcePath, '->', targetPath);
                    copyDirectory(sourcePath, targetPath);
                } else {
                    // 复制文件
                    console.log('复制文件:', sourcePath, '->', targetPath);
                    fs.copyFileSync(sourcePath, targetPath);
                }
                
                successCount++;
                console.log('复制成功:', fileName);
            } catch (error) {
                console.error('复制失败:', fileName, error.message);
                errorFiles.push({ file: fileName, error: error.message });
            }
        });
        
        res.json({
            success: true,
            message: `成功下载 ${successCount} 个文件`,
            successCount,
            errorFiles
        });
        
    } catch (error) {
        console.error('下载失败:', error);
        res.status(500).json({ error: '下载失败: ' + error.message });
    }
});

// 递归复制目录的辅助函数
function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    
    files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        const stats = fs.statSync(srcPath);
        
        if (stats.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

// 图像预览API
router.get('/preview', (req, res) => {
    try {
        const { path: dirPath, file } = req.query;
        
        if (!dirPath || !file) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        const filePath = path.join(dirPath, file);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        // 检查是否为图像文件
        const ext = path.extname(file).toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
        
        if (!imageExtensions.includes(ext)) {
            return res.status(400).json({ error: '不支持的图像格式' });
        }
        
        // 设置正确的Content-Type
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml'
        };
        
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 缓存1小时
        
        // 发送文件
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('图像预览失败:', error);
        res.status(500).json({ error: '图像预览失败: ' + error.message });
    }
});

// 单文件下载API
router.get('/download-single', (req, res) => {
    try {
        const { path: dirPath, file } = req.query;
        
        if (!dirPath || !file) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        const filePath = path.join(dirPath, file);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        // 检查是否为文件（不是目录）
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            return res.status(400).json({ error: '无法下载目录' });
        }
        
        // 设置下载头
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', stats.size);
        
        // 发送文件
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('文件下载失败:', error);
        res.status(500).json({ error: '文件下载失败: ' + error.message });
    }
});

// 获取文件夹和文件的混合列表（用于上传对话框）
router.get('/folders-and-files', (req, res) => {
    try {
        const requestedPath = req.query.path;
        
        // 如果没有指定路径，返回根目录结构
        if (!requestedPath) {
            const drives = [];
            // 在Windows系统上获取所有驱动器
            if (process.platform === 'win32') {
                for (let i = 65; i <= 90; i++) {
                    const drive = String.fromCharCode(i) + ':\\';
                    try {
                        if (fs.existsSync(drive)) {
                            drives.push({
                                name: drive,
                                path: drive,
                                type: 'drive'
                            });
                        }
                    } catch (error) {
                        // 忽略无法访问的驱动器
                    }
                }
            } else {
                // Linux/Mac系统返回根目录
                drives.push({
                    name: '/',
                    path: '/',
                    type: 'drive'
                });
            }
            
            return res.json({
                success: true,
                currentPath: '',
                items: drives
            });
        }
        
        // 检查路径是否存在
        if (!fs.existsSync(requestedPath)) {
            return res.status(404).json({ error: '路径不存在' });
        }
        
        const files = fs.readdirSync(requestedPath);
        const items = files.map(file => {
            const filePath = path.join(requestedPath, file);
            try {
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    type: stats.isDirectory() ? 'folder' : 'file',
                    size: stats.isDirectory() ? '-' : formatFileSize(stats.size),
                    modified: formatDate(stats.mtime)
                };
            } catch (error) {
                // 忽略无法访问的文件/文件夹
                return null;
            }
        }).filter(item => item !== null)
        .sort((a, b) => {
            // 文件夹排在前面，然后按名称排序
            if (a.type === 'folder' && b.type === 'file') return -1;
            if (a.type === 'file' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
        
        res.json({
            success: true,
            currentPath: requestedPath,
            items: items
        });
    } catch (error) {
        console.error('获取文件夹和文件列表失败:', error);
        res.status(500).json({ error: '获取文件夹和文件列表失败: ' + error.message });
    }
});

// 文件上传API
router.post('/upload', upload.array('files'), (req, res) => {
    try {
        const uploadedFiles = req.files;
        const currentPath = req.body.currentPath;
        
        console.log('文件上传请求:', {
            currentPath,
            filesCount: uploadedFiles ? uploadedFiles.length : 0,
            files: uploadedFiles ? uploadedFiles.map(f => f.originalname) : []
        });
        
        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: '没有选择文件' 
            });
        }
        
        if (!currentPath) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少上传路径' 
            });
        }
        
        // 检查上传路径是否存在
        if (!fs.existsSync(currentPath)) {
            return res.status(400).json({ 
                success: false, 
                error: '上传路径不存在: ' + currentPath 
            });
        }
        
        const successFiles = [];
        const errorFiles = [];
        
        uploadedFiles.forEach(file => {
            try {
                // 文件已经通过multer保存到指定位置
                successFiles.push(file.originalname);
                console.log('文件上传成功:', file.originalname, '到', file.path);
            } catch (error) {
                console.error('处理上传文件失败:', file.originalname, error);
                errorFiles.push({
                    filename: file.originalname,
                    error: error.message
                });
            }
        });
        
        const message = `成功上传 ${successFiles.length} 个文件${errorFiles.length > 0 ? `，${errorFiles.length} 个文件失败` : ''}`;
        
        res.json({
            success: true,
            message: message,
            uploadedFiles: successFiles,
            errorFiles: errorFiles,
            totalFiles: uploadedFiles.length
        });
        
    } catch (error) {
        console.error('文件上传失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '文件上传失败: ' + error.message 
        });
    }
});

// 复制文件API
router.post('/copy', (req, res) => {
    try {
        const { files, sourcePath, targetPath } = req.body;
        
        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: '请提供要复制的文件列表' });
        }
        
        if (!sourcePath || !targetPath) {
            return res.status(400).json({ error: '请提供源路径和目标路径' });
        }
        
        let successCount = 0;
        const errorFiles = [];
        
        files.forEach(fileName => {
            try {
                const sourceFilePath = path.join(sourcePath, fileName);
                const targetFilePath = path.join(targetPath, fileName);
                
                // 检查源文件是否存在
                if (!fs.existsSync(sourceFilePath)) {
                    throw new Error('源文件不存在');
                }
                
                // 如果目标文件已存在，生成新名称
                let finalTargetPath = targetFilePath;
                let counter = 1;
                const ext = path.extname(fileName);
                const baseName = path.basename(fileName, ext);
                
                while (fs.existsSync(finalTargetPath)) {
                    const newName = `${baseName}_副本${counter > 1 ? counter : ''}${ext}`;
                    finalTargetPath = path.join(targetPath, newName);
                    counter++;
                }
                
                const stats = fs.statSync(sourceFilePath);
                
                if (stats.isDirectory()) {
                    // 复制文件夹
                    copyDirectory(sourceFilePath, finalTargetPath);
                } else {
                    // 复制文件
                    fs.copyFileSync(sourceFilePath, finalTargetPath);
                }
                
                successCount++;
            } catch (error) {
                console.error('复制失败:', fileName, error.message);
                errorFiles.push({ file: fileName, error: error.message });
            }
        });
        
        res.json({
            success: true,
            message: `成功复制 ${successCount} 个文件`,
            successCount,
            errorFiles
        });
        
    } catch (error) {
        console.error('复制操作失败:', error);
        res.status(500).json({ error: '复制操作失败: ' + error.message });
    }
});

// 移动文件API
router.post('/move', (req, res) => {
    try {
        const { files, sourcePath, targetPath } = req.body;
        
        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: '请提供要移动的文件列表' });
        }
        
        if (!sourcePath || !targetPath) {
            return res.status(400).json({ error: '请提供源路径和目标路径' });
        }
        
        let successCount = 0;
        const errorFiles = [];
        
        files.forEach(fileName => {
            try {
                const sourceFilePath = path.join(sourcePath, fileName);
                const targetFilePath = path.join(targetPath, fileName);
                
                // 检查源文件是否存在
                if (!fs.existsSync(sourceFilePath)) {
                    throw new Error('源文件不存在');
                }
                
                // 如果目标文件已存在，生成新名称
                let finalTargetPath = targetFilePath;
                let counter = 1;
                const ext = path.extname(fileName);
                const baseName = path.basename(fileName, ext);
                
                while (fs.existsSync(finalTargetPath)) {
                    const newName = `${baseName}_移动${counter > 1 ? counter : ''}${ext}`;
                    finalTargetPath = path.join(targetPath, newName);
                    counter++;
                }
                
                // 移动文件或文件夹
                fs.renameSync(sourceFilePath, finalTargetPath);
                
                successCount++;
            } catch (error) {
                console.error('移动失败:', fileName, error.message);
                errorFiles.push({ file: fileName, error: error.message });
            }
        });
        
        res.json({
            success: true,
            message: `成功移动 ${successCount} 个文件`,
            successCount,
            errorFiles
        });
        
    } catch (error) {
        console.error('移动操作失败:', error);
        res.status(500).json({ error: '移动操作失败: ' + error.message });
    }
});

// 解压文件
router.post('/extract', (req, res) => {
    try {
        const { path: dirPath, fileName } = req.body;
        
        if (!dirPath || !fileName) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        const filePath = path.join(dirPath, fileName);
        const ext = path.extname(fileName).toLowerCase();
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        // 检查是否为支持的压缩格式
        const supportedFormats = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];
        if (!supportedFormats.includes(ext)) {
            return res.status(400).json({ error: '不支持的压缩文件格式' });
        }
        
        // 创建解压目标目录（以文件名命名，去掉扩展名）
        const baseName = path.basename(fileName, ext);
        const extractPath = path.join(dirPath, baseName);
        
        // 如果目标目录已存在，添加时间戳后缀
        let finalExtractPath = extractPath;
        let counter = 1;
        while (fs.existsSync(finalExtractPath)) {
            finalExtractPath = `${extractPath}_${counter}`;
            counter++;
        }
        
        // 创建解压目录
        fs.mkdirSync(finalExtractPath, { recursive: true });
        
        // 根据文件类型选择解压命令
        const { spawn } = require('child_process');
        let command, args;
        
        if (ext === '.zip') {
            // 使用PowerShell的Expand-Archive命令解压zip文件
            command = 'powershell';
            args = ['-Command', `Expand-Archive -Path '${filePath}' -DestinationPath '${finalExtractPath}' -Force`];
        } else if (ext === '.rar') {
            // 需要安装WinRAR或7-Zip
            command = '7z';
            args = ['x', filePath, `-o${finalExtractPath}`, '-y'];
        } else if (ext === '.7z') {
            command = '7z';
            args = ['x', filePath, `-o${finalExtractPath}`, '-y'];
        } else {
            return res.status(400).json({ error: '暂不支持该压缩格式的解压' });
        }
        
        const extractProcess = spawn(command, args, { shell: true });
        
        let output = '';
        let errorOutput = '';
        
        extractProcess.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        extractProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        extractProcess.on('close', (code) => {
            if (code === 0) {
                res.json({ 
                    success: true, 
                    message: '文件解压成功',
                    extractPath: finalExtractPath
                });
            } else {
                // 如果解压失败，删除创建的空目录
                try {
                    if (fs.existsSync(finalExtractPath)) {
                        fs.rmSync(finalExtractPath, { recursive: true, force: true });
                    }
                } catch (cleanupError) {
                    console.error('清理失败的解压目录时出错:', cleanupError);
                }
                
                res.status(500).json({ 
                    error: '解压失败',
                    details: errorOutput || '解压过程中发生错误'
                });
            }
        });
        
        extractProcess.on('error', (error) => {
            // 如果命令执行失败，删除创建的空目录
            try {
                if (fs.existsSync(finalExtractPath)) {
                    fs.rmSync(finalExtractPath, { recursive: true, force: true });
                }
            } catch (cleanupError) {
                console.error('清理失败的解压目录时出错:', cleanupError);
            }
            
            res.status(500).json({ 
                error: '解压命令执行失败',
                details: error.message
            });
        });
        
    } catch (error) {
        console.error('解压操作失败:', error);
        res.status(500).json({ error: '解压操作失败: ' + error.message });
    }
});

// 压缩文件
router.post('/compress', (req, res) => {
    try {
        const { path: dirPath, fileName, files, format = 'zip', options = {} } = req.body;
        
        if (!dirPath || (!fileName && !files)) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        // 确定压缩格式
        const compressFormat = format || 'zip';
        let outputFileName;
        
        if (files && files.length > 0) {
            // 多文件压缩
            outputFileName = fileName || 'compressed';
            if (!outputFileName.includes('.')) {
                outputFileName += `.${compressFormat}`;
            }
        } else {
            // 单文件压缩
            const sourcePath = path.join(dirPath, fileName);
            if (!fs.existsSync(sourcePath)) {
                return res.status(404).json({ error: '文件或文件夹不存在' });
            }
            outputFileName = `${fileName}.${compressFormat}`;
        }
        
        const outputPath = path.join(dirPath, outputFileName);
        
        // 检查输出文件是否已存在
        if (fs.existsSync(outputPath)) {
            return res.status(400).json({ error: '压缩文件已存在' });
        }
        
        const archiver = require('archiver');
        const output = fs.createWriteStream(outputPath);
        
        // 设置压缩级别和格式
        const compressionLevel = options.highCompress ? 9 : 6;
        let archive;
        
        // 根据格式创建不同的压缩器
        switch (compressFormat) {
            case 'zip':
                archive = archiver('zip', {
                    zlib: { level: compressionLevel }
                });
                break;
            case 'tar':
                archive = archiver('tar');
                break;
            case 'tar.gz':
                archive = archiver('tar', {
                    gzip: true,
                    gzipOptions: { level: compressionLevel }
                });
                break;
            case 'gz':
                // 对于单个文件的gzip压缩
                archive = archiver('tar', {
                    gzip: true,
                    gzipOptions: { level: compressionLevel }
                });
                break;
            case 'bz2':
                // bzip2压缩
                archive = archiver('tar', {
                    bzip2: true
                });
                break;
            case 'xz':
                // xz压缩 (需要额外的库支持)
                archive = archiver('tar');
                break;
            default:
                archive = archiver('zip', {
                    zlib: { level: compressionLevel }
                });
        }
        
        output.on('close', () => {
            console.log(`压缩完成: ${archive.pointer()} 字节`);
            res.json({ 
                success: true, 
                message: `压缩成功`,
                compressedFile: outputFileName
            });
        });
        
        archive.on('error', (err) => {
            console.error('压缩失败:', err);
            res.status(500).json({ error: '压缩失败: ' + err.message });
        });
        
        archive.pipe(output);
        
        if (files && files.length > 0) {
            // 多文件压缩
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                if (fs.existsSync(filePath)) {
                    const stats = fs.statSync(filePath);
                    if (stats.isDirectory()) {
                        archive.directory(filePath, file);
                    } else {
                        archive.file(filePath, { name: file });
                    }
                }
            }
        } else {
            // 单文件压缩
            const sourcePath = path.join(dirPath, fileName);
            const stats = fs.statSync(sourcePath);
            if (stats.isDirectory()) {
                archive.directory(sourcePath, fileName);
            } else {
                archive.file(sourcePath, { name: fileName });
            }
        }
        
        archive.finalize();
        
    } catch (error) {
        console.error('压缩操作失败:', error);
        res.status(500).json({ error: '压缩操作失败: ' + error.message });
    }
});

// 获取文件属性
router.get('/properties', (req, res) => {
    try {
        const { path: dirPath, file: fileName } = req.query;
        
        if (!dirPath || !fileName) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        const filePath = path.join(dirPath, fileName);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件或文件夹不存在' });
        }
        
        const stats = fs.statSync(filePath);
        const isDirectory = stats.isDirectory();
        
        // 获取权限信息
        let permissions = '-';
        let owner = '-';
        let group = '-';
        
        try {
            // 仅支持Unix/Linux系统
            permissions = formatUnixPermissions(stats.mode);
            
            // 尝试获取用户和组信息
            try {
                const { execSync } = require('child_process');
                const userInfo = execSync(`id -nu ${stats.uid}`, { encoding: 'utf8' }).trim();
                const groupInfo = execSync(`id -gn ${stats.gid}`, { encoding: 'utf8' }).trim();
                owner = userInfo || stats.uid.toString();
                group = groupInfo || stats.gid.toString();
            } catch (idError) {
                // 如果无法获取用户名和组名，使用ID
                owner = stats.uid ? stats.uid.toString() : '-';
                group = stats.gid ? stats.gid.toString() : '-';
            }
        } catch (permError) {
            console.warn('获取权限信息失败:', permError.message);
        }
        
        const properties = {
            name: fileName,
            type: isDirectory ? 'folder' : 'file',
            size: isDirectory ? '-' : formatFileSize(stats.size),
            modified: formatDate(stats.mtime),
            permissions: permissions,
            owner: owner,
            group: group,
            fullPath: filePath
        };
        
        res.json({ 
            success: true, 
            properties: properties
        });
        
    } catch (error) {
        console.error('获取文件属性失败:', error);
        res.status(500).json({ error: '获取文件属性失败: ' + error.message });
    }
});

module.exports = router;
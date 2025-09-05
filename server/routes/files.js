const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = req.body.path || '/tmp';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// Helper function to get file stats
const getFileStats = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime,
      created: stats.birthtime,
      permissions: stats.mode,
      owner: stats.uid,
      group: stats.gid
    };
  } catch (error) {
    throw error;
  }
};

// List directory contents
router.get('/list', async (req, res) => {
  try {
    const dirPath = req.query.path || '/';
    
    // Security check - prevent directory traversal
    const normalizedPath = path.normalize(dirPath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    const items = await fs.readdir(normalizedPath);
    const fileList = [];
    
    for (const item of items) {
      try {
        const itemPath = path.join(normalizedPath, item);
        const fileInfo = await getFileStats(itemPath);
        fileList.push(fileInfo);
      } catch (error) {
        // Skip files that can't be accessed
        console.warn(`Cannot access ${item}:`, error.message);
      }
    }
    
    // Sort directories first, then files
    fileList.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    res.json({
      path: normalizedPath,
      items: fileList
    });
  } catch (error) {
    console.error('List directory error:', error);
    res.status(500).json({ error: 'Failed to list directory contents' });
  }
});

// Get file content
router.get('/content', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Security check
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    const stats = await fs.stat(normalizedPath);
    
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory' });
    }
    
    // Check file size (limit to 1MB for text files)
    if (stats.size > 1024 * 1024) {
      return res.status(400).json({ error: 'File too large to display' });
    }
    
    const content = await fs.readFile(normalizedPath, 'utf8');
    
    res.json({
      path: normalizedPath,
      content: content,
      size: stats.size,
      modified: stats.mtime
    });
  } catch (error) {
    console.error('Get file content error:', error);
    res.status(500).json({ error: 'Failed to read file content' });
  }
});

// Save file content
router.post('/content', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'File path and content are required' });
    }
    
    // Security check
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    await fs.writeFile(normalizedPath, content, 'utf8');
    
    res.json({ message: 'File saved successfully' });
  } catch (error) {
    console.error('Save file content error:', error);
    res.status(500).json({ error: 'Failed to save file content' });
  }
});

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({
      message: 'File uploaded successfully',
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Download file
router.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Security check
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    const stats = await fs.stat(normalizedPath);
    
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Cannot download directory' });
    }
    
    res.download(normalizedPath);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Delete file or directory
router.delete('/', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Security check
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..') || normalizedPath === '/') {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    const stats = await fs.stat(normalizedPath);
    
    if (stats.isDirectory()) {
      await fs.rmdir(normalizedPath, { recursive: true });
    } else {
      await fs.unlink(normalizedPath);
    }
    
    res.json({ message: 'File/directory deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file/directory' });
  }
});

// Create directory
router.post('/mkdir', async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    
    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path is required' });
    }
    
    // Security check
    const normalizedPath = path.normalize(dirPath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    await fs.mkdir(normalizedPath, { recursive: true });
    
    res.json({ message: 'Directory created successfully' });
  } catch (error) {
    console.error('Create directory error:', error);
    res.status(500).json({ error: 'Failed to create directory' });
  }
});

// Rename/move file or directory
router.post('/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    
    if (!oldPath || !newPath) {
      return res.status(400).json({ error: 'Old path and new path are required' });
    }
    
    // Security check
    const normalizedOldPath = path.normalize(oldPath);
    const normalizedNewPath = path.normalize(newPath);
    
    if (normalizedOldPath.includes('..') || normalizedNewPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    await fs.rename(normalizedOldPath, normalizedNewPath);
    
    res.json({ message: 'File/directory renamed successfully' });
  } catch (error) {
    console.error('Rename file error:', error);
    res.status(500).json({ error: 'Failed to rename file/directory' });
  }
});

module.exports = router;
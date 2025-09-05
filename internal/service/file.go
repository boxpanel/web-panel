package service

import (
	"fmt"
	"io"
	"io/fs"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"web-panel-go/internal/logger"
	"web-panel-go/internal/model"

	"gorm.io/gorm"
)

// FileService 文件服务
type FileService struct {
	db *gorm.DB
}

// NewFileService 创建文件服务实例
func NewFileService(db *gorm.DB) *FileService {
	return &FileService{db: db}
}

// ListFiles 获取文件列表
func (f *FileService) ListFiles(path string, page, pageSize int) ([]model.FileInfo, int64, error) {
	// 安全检查：防止路径遍历攻击
	if !f.isValidPath(path) {
		return nil, 0, fmt.Errorf("无效的路径")
	}

	// 检查路径是否存在
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, 0, fmt.Errorf("路径不存在: %s", path)
	}

	// 读取目录内容
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, 0, fmt.Errorf("读取目录失败: %w", err)
	}

	var files []model.FileInfo
	for _, entry := range entries {
		fileInfo, err := f.getFileInfo(path, entry)
		if err != nil {
			// 跳过无法获取信息的文件
			continue
		}
		files = append(files, *fileInfo)
	}

	// 计算分页
	total := int64(len(files))
	start := (page - 1) * pageSize
	end := start + pageSize

	if start >= len(files) {
		return []model.FileInfo{}, total, nil
	}
	if end > len(files) {
		end = len(files)
	}

	return files[start:end], total, nil
}

// getFileInfo 获取文件信息
func (f *FileService) getFileInfo(basePath string, entry fs.DirEntry) (*model.FileInfo, error) {
	fullPath := filepath.Join(basePath, entry.Name())
	info, err := entry.Info()
	if err != nil {
		return nil, err
	}

	fileType := "file"
	if info.IsDir() {
		fileType = "directory"
	}

	// 获取文件扩展名
	ext := filepath.Ext(entry.Name())
	if ext != "" {
		ext = strings.TrimPrefix(ext, ".")
	}

	// 获取文件权限
	permissions := info.Mode().String()

	return &model.FileInfo{
		Name:        entry.Name(),
		Path:        fullPath,
		Size:        info.Size(),
		FileType:    fileType,
		FileExt:     ext,
		Permissions: permissions,
		ModTime:     info.ModTime(),
		Hidden:      f.isHiddenFile(entry.Name()),
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}, nil
}

// isHiddenFile 检查是否为隐藏文件
func (f *FileService) isHiddenFile(name string) bool {
	return strings.HasPrefix(name, ".")
}

// isValidPath 验证路径是否安全
func (f *FileService) isValidPath(path string) bool {
	// 防止路径遍历攻击
	if strings.Contains(path, "..") {
		return false
	}
	
	// 清理路径
	cleanPath := filepath.Clean(path)
	
	// 检查是否为绝对路径或相对路径
	if !filepath.IsAbs(cleanPath) && !strings.HasPrefix(cleanPath, ".") {
		return false
	}
	
	return true
}

// CreateDirectory 创建目录
func (f *FileService) CreateDirectory(path, name string, userID uint, clientIP, userAgent string) error {
	if !f.isValidPath(path) {
		f.logAuditAction(userID, "create_directory", "file", fmt.Sprintf("创建目录失败: 无效路径 %s/%s", path, name), clientIP, userAgent, "failed")
		return fmt.Errorf("无效的路径")
	}

	fullPath := filepath.Join(path, name)
	
	// 检查目录是否已存在
	if _, err := os.Stat(fullPath); !os.IsNotExist(err) {
		f.logAuditAction(userID, "create_directory", "file", fmt.Sprintf("创建目录失败: 目录已存在 %s", fullPath), clientIP, userAgent, "failed")
		return fmt.Errorf("目录已存在")
	}

	// 创建目录
	if err := os.MkdirAll(fullPath, 0755); err != nil {
		f.logAuditAction(userID, "create_directory", "file", fmt.Sprintf("创建目录失败: %s, 错误: %v", fullPath, err), clientIP, userAgent, "failed")
		return fmt.Errorf("创建目录失败: %w", err)
	}

	f.logAuditAction(userID, "create_directory", "file", fmt.Sprintf("创建目录: %s", fullPath), clientIP, userAgent, "success")
	logger.Info("目录创建成功", "path", fullPath, "user_id", userID)
	return nil
}

// DeleteFile 删除文件或目录
func (f *FileService) DeleteFile(path string, userID uint, clientIP, userAgent string) error {
	if !f.isValidPath(path) {
		f.logAuditAction(userID, "delete_file", "file", fmt.Sprintf("删除文件失败: 无效路径 %s", path), clientIP, userAgent, "failed")
		return fmt.Errorf("无效的路径")
	}

	// 检查文件是否存在
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		f.logAuditAction(userID, "delete_file", "file", fmt.Sprintf("删除文件失败: 文件不存在 %s", path), clientIP, userAgent, "failed")
		return fmt.Errorf("文件不存在")
	}

	fileType := "file"
	if info.IsDir() {
		fileType = "directory"
	}

	// 删除文件或目录
	if err := os.RemoveAll(path); err != nil {
		f.logAuditAction(userID, "delete_file", "file", fmt.Sprintf("删除%s失败: %s, 错误: %v", fileType, path, err), clientIP, userAgent, "failed")
		return fmt.Errorf("删除失败: %w", err)
	}

	f.logAuditAction(userID, "delete_file", "file", fmt.Sprintf("删除%s: %s", fileType, path), clientIP, userAgent, "success")
	logger.Info("文件删除成功", "path", path, "type", fileType, "user_id", userID)
	return nil
}

// RenameFile 重命名文件或目录
func (f *FileService) RenameFile(oldPath, newName string, userID uint, clientIP, userAgent string) error {
	if !f.isValidPath(oldPath) {
		f.logAuditAction(userID, "rename_file", "file", fmt.Sprintf("重命名文件失败: 无效路径 %s", oldPath), clientIP, userAgent, "failed")
		return fmt.Errorf("无效的路径")
	}

	// 检查原文件是否存在
	if _, err := os.Stat(oldPath); os.IsNotExist(err) {
		f.logAuditAction(userID, "rename_file", "file", fmt.Sprintf("重命名文件失败: 文件不存在 %s", oldPath), clientIP, userAgent, "failed")
		return fmt.Errorf("文件不存在")
	}

	// 构建新路径
	dir := filepath.Dir(oldPath)
	newPath := filepath.Join(dir, newName)

	// 检查新文件名是否已存在
	if _, err := os.Stat(newPath); !os.IsNotExist(err) {
		f.logAuditAction(userID, "rename_file", "file", fmt.Sprintf("重命名文件失败: 目标文件已存在 %s", newPath), clientIP, userAgent, "failed")
		return fmt.Errorf("目标文件已存在")
	}

	// 重命名文件
	if err := os.Rename(oldPath, newPath); err != nil {
		f.logAuditAction(userID, "rename_file", "file", fmt.Sprintf("重命名文件失败: %s -> %s, 错误: %v", oldPath, newPath, err), clientIP, userAgent, "failed")
		return fmt.Errorf("重命名失败: %w", err)
	}

	f.logAuditAction(userID, "rename_file", "file", fmt.Sprintf("重命名文件: %s -> %s", oldPath, newPath), clientIP, userAgent, "success")
	logger.Info("文件重命名成功", "old_path", oldPath, "new_path", newPath, "user_id", userID)
	return nil
}

// UploadFile 上传文件
func (f *FileService) UploadFile(targetPath string, file *multipart.FileHeader, userID uint, clientIP, userAgent string) error {
	if !f.isValidPath(targetPath) {
		f.logAuditAction(userID, "upload_file", "file", fmt.Sprintf("上传文件失败: 无效路径 %s", targetPath), clientIP, userAgent, "failed")
		return fmt.Errorf("无效的路径")
	}

	// 确保目标目录存在
	if err := os.MkdirAll(targetPath, 0755); err != nil {
		f.logAuditAction(userID, "upload_file", "file", fmt.Sprintf("上传文件失败: 创建目录失败 %s, 错误: %v", targetPath, err), clientIP, userAgent, "failed")
		return fmt.Errorf("创建目录失败: %w", err)
	}

	// 构建完整文件路径
	filePath := filepath.Join(targetPath, file.Filename)

	// 检查文件是否已存在
	if _, err := os.Stat(filePath); !os.IsNotExist(err) {
		f.logAuditAction(userID, "upload_file", "file", fmt.Sprintf("上传文件失败: 文件已存在 %s", filePath), clientIP, userAgent, "failed")
		return fmt.Errorf("文件已存在")
	}

	// 打开上传的文件
	src, err := file.Open()
	if err != nil {
		f.logAuditAction(userID, "upload_file", "file", fmt.Sprintf("上传文件失败: 打开文件失败 %s, 错误: %v", file.Filename, err), clientIP, userAgent, "failed")
		return fmt.Errorf("打开文件失败: %w", err)
	}
	defer src.Close()

	// 创建目标文件
	dst, err := os.Create(filePath)
	if err != nil {
		f.logAuditAction(userID, "upload_file", "file", fmt.Sprintf("上传文件失败: 创建文件失败 %s, 错误: %v", filePath, err), clientIP, userAgent, "failed")
		return fmt.Errorf("创建文件失败: %w", err)
	}
	defer dst.Close()

	// 复制文件内容
	if _, err := io.Copy(dst, src); err != nil {
		f.logAuditAction(userID, "upload_file", "file", fmt.Sprintf("上传文件失败: 复制文件失败 %s, 错误: %v", filePath, err), clientIP, userAgent, "failed")
		return fmt.Errorf("复制文件失败: %w", err)
	}

	f.logAuditAction(userID, "upload_file", "file", fmt.Sprintf("上传文件: %s (大小: %d bytes)", filePath, file.Size), clientIP, userAgent, "success")
	logger.Info("文件上传成功", "path", filePath, "size", file.Size, "user_id", userID)
	return nil
}

// DownloadFile 下载文件
func (f *FileService) DownloadFile(filePath string, userID uint, clientIP, userAgent string) (*os.File, error) {
	if !f.isValidPath(filePath) {
		f.logAuditAction(userID, "download_file", "file", fmt.Sprintf("下载文件失败: 无效路径 %s", filePath), clientIP, userAgent, "failed")
		return nil, fmt.Errorf("无效的路径")
	}

	// 检查文件是否存在
	info, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		f.logAuditAction(userID, "download_file", "file", fmt.Sprintf("下载文件失败: 文件不存在 %s", filePath), clientIP, userAgent, "failed")
		return nil, fmt.Errorf("文件不存在")
	}

	// 检查是否为文件（不是目录）
	if info.IsDir() {
		f.logAuditAction(userID, "download_file", "file", fmt.Sprintf("下载文件失败: 路径是目录 %s", filePath), clientIP, userAgent, "failed")
		return nil, fmt.Errorf("无法下载目录")
	}

	// 打开文件
	file, err := os.Open(filePath)
	if err != nil {
		f.logAuditAction(userID, "download_file", "file", fmt.Sprintf("下载文件失败: 打开文件失败 %s, 错误: %v", filePath, err), clientIP, userAgent, "failed")
		return nil, fmt.Errorf("打开文件失败: %w", err)
	}

	f.logAuditAction(userID, "download_file", "file", fmt.Sprintf("下载文件: %s (大小: %d bytes)", filePath, info.Size()), clientIP, userAgent, "success")
	logger.Info("文件下载开始", "path", filePath, "size", info.Size(), "user_id", userID)
	return file, nil
}

// GetFileContent 获取文件内容（用于编辑）
func (f *FileService) GetFileContent(filePath string, userID uint, clientIP, userAgent string) (string, error) {
	if !f.isValidPath(filePath) {
		f.logAuditAction(userID, "read_file", "file", fmt.Sprintf("读取文件失败: 无效路径 %s", filePath), clientIP, userAgent, "failed")
		return "", fmt.Errorf("无效的路径")
	}

	// 检查文件是否存在
	info, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		f.logAuditAction(userID, "read_file", "file", fmt.Sprintf("读取文件失败: 文件不存在 %s", filePath), clientIP, userAgent, "failed")
		return "", fmt.Errorf("文件不存在")
	}

	// 检查是否为文件
	if info.IsDir() {
		f.logAuditAction(userID, "read_file", "file", fmt.Sprintf("读取文件失败: 路径是目录 %s", filePath), clientIP, userAgent, "failed")
		return "", fmt.Errorf("无法读取目录")
	}

	// 检查文件大小（限制为10MB）
	if info.Size() > 10*1024*1024 {
		f.logAuditAction(userID, "read_file", "file", fmt.Sprintf("读取文件失败: 文件过大 %s (大小: %d bytes)", filePath, info.Size()), clientIP, userAgent, "failed")
		return "", fmt.Errorf("文件过大，无法编辑")
	}

	// 读取文件内容
	content, err := os.ReadFile(filePath)
	if err != nil {
		f.logAuditAction(userID, "read_file", "file", fmt.Sprintf("读取文件失败: %s, 错误: %v", filePath, err), clientIP, userAgent, "failed")
		return "", fmt.Errorf("读取文件失败: %w", err)
	}

	f.logAuditAction(userID, "read_file", "file", fmt.Sprintf("读取文件: %s (大小: %d bytes)", filePath, len(content)), clientIP, userAgent, "success")
	logger.Info("文件读取成功", "path", filePath, "size", len(content), "user_id", userID)
	return string(content), nil
}

// SaveFileContent 保存文件内容
func (f *FileService) SaveFileContent(filePath, content string, userID uint, clientIP, userAgent string) error {
	if !f.isValidPath(filePath) {
		f.logAuditAction(userID, "save_file", "file", fmt.Sprintf("保存文件失败: 无效路径 %s", filePath), clientIP, userAgent, "failed")
		return fmt.Errorf("无效的路径")
	}

	// 确保目录存在
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		f.logAuditAction(userID, "save_file", "file", fmt.Sprintf("保存文件失败: 创建目录失败 %s, 错误: %v", dir, err), clientIP, userAgent, "failed")
		return fmt.Errorf("创建目录失败: %w", err)
	}

	// 写入文件
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		f.logAuditAction(userID, "save_file", "file", fmt.Sprintf("保存文件失败: %s, 错误: %v", filePath, err), clientIP, userAgent, "failed")
		return fmt.Errorf("保存文件失败: %w", err)
	}

	f.logAuditAction(userID, "save_file", "file", fmt.Sprintf("保存文件: %s (大小: %d bytes)", filePath, len(content)), clientIP, userAgent, "success")
	logger.Info("文件保存成功", "path", filePath, "size", len(content), "user_id", userID)
	return nil
}

// logAuditAction 记录审计日志
func (f *FileService) logAuditAction(userID uint, action, resource, details, clientIP, userAgent, status string) {
	auditLog := &model.AuditLog{
		UserID:    &userID,
		Action:    action,
		Resource:  resource,
		Details:   details,
		IPAddress: clientIP,
		UserAgent: userAgent,
		Status:    status,
	}

	if err := f.db.Create(auditLog).Error; err != nil {
		logger.Error("记录审计日志失败", "error", err)
	}
}
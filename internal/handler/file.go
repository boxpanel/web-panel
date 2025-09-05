package handler

import (
	"net/http"
	"path/filepath"
	"strconv"

	"web-panel-go/internal/middleware"
	"web-panel-go/internal/model"
	"web-panel-go/internal/service"

	"github.com/gin-gonic/gin"
)

// FileHandler 文件处理器
type FileHandler struct {
	fileService *service.FileService
	authService *service.AuthService
}

// NewFileHandler 创建文件处理器实例
func NewFileHandler(fileService *service.FileService, authService *service.AuthService) *FileHandler {
	return &FileHandler{
		fileService: fileService,
		authService: authService,
	}
}

// ListFiles 获取文件列表
// @Summary 获取文件列表
// @Description 获取指定目录下的文件和文件夹列表
// @Tags 文件管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param path query string true "目录路径"
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(50)
// @Success 200 {object} model.APIResponse{data=model.PaginatedResponse}
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/files [get]
func (h *FileHandler) ListFiles(c *gin.Context) {
	path := c.Query("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "路径参数不能为空",
		})
		return
	}

	// 获取分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))

	// 参数验证
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	files, total, err := h.fileService.ListFiles(path, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "获取文件列表失败",
			Error:   err.Error(),
		})
		return
	}

	// 构建分页响应
	response := model.PaginatedResponse{
		Code:    http.StatusOK,
		Message: "获取文件列表成功",
		Data:    files,
		Total:   total,
		Page:    page,
		Size:    pageSize,
	}

	c.JSON(http.StatusOK, response)
}

// CreateDirectory 创建目录
// @Summary 创建目录
// @Description 在指定路径下创建新目录
// @Tags 文件管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body model.CreateDirectoryRequest true "创建目录请求"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/files/directory [post]
func (h *FileHandler) CreateDirectory(c *gin.Context) {
	var req model.CreateDirectoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 参数验证
	if req.Path == "" || req.Name == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "路径和目录名不能为空",
		})
		return
	}

	// 获取用户信息
	userID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 创建目录
	if err := h.fileService.CreateDirectory(req.Path, req.Name, userID, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "创建目录失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "目录创建成功",
	})
}

// DeleteFile 删除文件或目录
// @Summary 删除文件或目录
// @Description 删除指定的文件或目录
// @Tags 文件管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body model.DeleteFileRequest true "删除文件请求"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/files [delete]
func (h *FileHandler) DeleteFile(c *gin.Context) {
	var req model.DeleteFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 参数验证
	if req.Path == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "路径不能为空",
		})
		return
	}

	// 获取用户信息
	userID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 删除文件
	if err := h.fileService.DeleteFile(req.Path, userID, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "删除失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "删除成功",
	})
}

// RenameFile 重命名文件或目录
// @Summary 重命名文件或目录
// @Description 重命名指定的文件或目录
// @Tags 文件管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body model.RenameFileRequest true "重命名文件请求"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/files/rename [put]
func (h *FileHandler) RenameFile(c *gin.Context) {
	var req model.RenameFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 参数验证
	if req.OldPath == "" || req.NewPath == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "原路径和新路径不能为空",
		})
		return
	}

	// 获取用户信息
	userID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 重命名文件
	if err := h.fileService.RenameFile(req.OldPath, req.NewPath, userID, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "重命名失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "重命名成功",
	})
}

// UploadFile 上传文件
// @Summary 上传文件
// @Description 上传文件到指定目录
// @Tags 文件管理
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param path formData string true "目标目录路径"
// @Param file formData file true "上传的文件"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/files/upload [post]
func (h *FileHandler) UploadFile(c *gin.Context) {
	path := c.PostForm("path")
	if path == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "目标路径不能为空",
		})
		return
	}

	// 获取上传的文件
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "获取上传文件失败",
			Error:   err.Error(),
		})
		return
	}

	// 获取用户信息
	userID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 上传文件
	if err := h.fileService.UploadFile(path, file, userID, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "上传文件失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "文件上传成功",
	})
}

// DownloadFile 下载文件
// @Summary 下载文件
// @Description 下载指定的文件
// @Tags 文件管理
// @Accept json
// @Produce application/octet-stream
// @Security BearerAuth
// @Param path query string true "文件路径"
// @Success 200 {file} binary
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/files/download [get]
func (h *FileHandler) DownloadFile(c *gin.Context) {
	filePath := c.Query("path")
	if filePath == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "文件路径不能为空",
		})
		return
	}

	// 获取用户信息
	userID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 下载文件
	file, err := h.fileService.DownloadFile(filePath, userID, clientIP, userAgent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "下载文件失败",
			Error:   err.Error(),
		})
		return
	}
	defer file.Close()

	// 设置响应头
	filename := filepath.Base(filePath)
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Header("Content-Type", "application/octet-stream")

	// 发送文件
	c.File(filePath)
}

// GetFileContent 获取文件内容
// @Summary 获取文件内容
// @Description 获取文件内容用于编辑
// @Tags 文件管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param path query string true "文件路径"
// @Success 200 {object} model.APIResponse{data=model.FileContentResponse}
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/files/content [get]
func (h *FileHandler) GetFileContent(c *gin.Context) {
	filePath := c.Query("path")
	if filePath == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "文件路径不能为空",
		})
		return
	}

	// 获取用户信息
	userID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 获取文件内容
	content, err := h.fileService.GetFileContent(filePath, userID, clientIP, userAgent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "获取文件内容失败",
			Error:   err.Error(),
		})
		return
	}

	response := model.FileContentResponse{
		Path:    filePath,
		Content: content,
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "获取文件内容成功",
		Data:    response,
	})
}

// SaveFileContent 保存文件内容
// @Summary 保存文件内容
// @Description 保存编辑后的文件内容
// @Tags 文件管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body model.SaveFileContentRequest true "保存文件内容请求"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/files/content [put]
func (h *FileHandler) SaveFileContent(c *gin.Context) {
	var req model.SaveFileContentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 参数验证
	if req.Path == "" {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "文件路径不能为空",
		})
		return
	}

	// 获取用户信息
	userID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 保存文件内容
	if err := h.fileService.SaveFileContent(req.Path, req.Content, userID, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "保存文件失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "文件保存成功",
	})
}

// RegisterFileRoutes 注册文件相关路由
func RegisterFileRoutes(r *gin.RouterGroup, fileHandler *FileHandler) {
	files := r.Group("/files")
	files.Use(middleware.AuthMiddleware(fileHandler.authService))
	{
		// 文件列表
		files.GET("", fileHandler.ListFiles)
		
		// 目录操作
		files.POST("/directory", fileHandler.CreateDirectory)
		
		// 文件操作
		files.DELETE("", fileHandler.DeleteFile)
		files.PUT("/rename", fileHandler.RenameFile)
		
		// 文件上传下载
		files.POST("/upload", fileHandler.UploadFile)
		files.GET("/download", fileHandler.DownloadFile)
		
		// 文件内容编辑
		files.GET("/content", fileHandler.GetFileContent)
		files.PUT("/content", fileHandler.SaveFileContent)
	}
}
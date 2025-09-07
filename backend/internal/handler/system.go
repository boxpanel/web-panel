package handler

import (
	"net/http"
	"strconv"

	"web-panel-go/internal/middleware"
	"web-panel-go/internal/model"
	"web-panel-go/internal/service"

	"github.com/gin-gonic/gin"
)

// SystemHandler 系统处理器
type SystemHandler struct {
	systemService *service.SystemService
	authService   *service.AuthService
}

// NewSystemHandler 创建系统处理器实例
func NewSystemHandler(systemService *service.SystemService, authService *service.AuthService) *SystemHandler {
	return &SystemHandler{
		systemService: systemService,
		authService:   authService,
	}
}

// GetSystemOverview 获取系统概览
// @Summary 获取系统概览信息
// @Description 获取CPU、内存、磁盘、负载等系统信息
// @Tags 系统监控
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} model.APIResponse{data=model.SystemStats}
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/system/overview [get]
func (h *SystemHandler) GetSystemOverview(c *gin.Context) {
	stats, err := h.systemService.GetSystemOverview()
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "获取系统信息失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "获取系统信息成功",
		Data:    stats,
	})
}

// GetNetworkStats 获取网络统计信息
// @Summary 获取网络统计信息
// @Description 获取网络接口的流量统计信息
// @Tags 系统监控
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} model.APIResponse{data=[]model.NetworkStats}
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/system/network [get]
func (h *SystemHandler) GetNetworkStats(c *gin.Context) {
	stats, err := h.systemService.GetNetworkStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "获取网络统计信息失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "获取网络统计信息成功",
		Data:    stats,
	})
}

// GetProcessList 获取进程列表
// @Summary 获取进程列表
// @Description 获取系统进程列表，支持分页
// @Tags 系统监控
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Success 200 {object} model.APIResponse{data=model.PaginatedResponse}
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/system/processes [get]
func (h *SystemHandler) GetProcessList(c *gin.Context) {
	// 获取分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	// 参数验证
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	processes, total, err := h.systemService.GetProcessList(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "获取进程列表失败",
			Error:   err.Error(),
		})
		return
	}

	// 构建分页响应
	response := model.PaginatedResponse{
		Data:     processes,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "获取进程列表成功",
		Data:    response,
	})
}

// KillProcess 终止进程
// @Summary 终止进程
// @Description 根据PID终止指定进程
// @Tags 系统监控
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body model.KillProcessRequest true "终止进程请求"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/system/processes/kill [post]
func (h *SystemHandler) KillProcess(c *gin.Context) {
	var req model.KillProcessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 参数验证
	if req.PID <= 0 {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "无效的进程ID",
		})
		return
	}

	// 获取用户信息
	userID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 终止进程
	if err := h.systemService.KillProcess(req.PID, userID, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "终止进程失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "进程已终止",
	})
}

// GetHostInfo 获取主机信息
// @Summary 获取主机信息
// @Description 获取主机的详细信息，包括操作系统、内核版本等
// @Tags 系统监控
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} model.APIResponse{data=map[string]interface{}}
// @Failure 401 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/system/host [get]
func (h *SystemHandler) GetHostInfo(c *gin.Context) {
	hostInfo, err := h.systemService.GetHostInfo()
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "获取主机信息失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "获取主机信息成功",
		Data:    hostInfo,
	})
}

// RegisterSystemRoutes 注册系统相关路由
func RegisterSystemRoutes(r *gin.RouterGroup, systemHandler *SystemHandler) {
	system := r.Group("/system")
	system.Use(middleware.AuthMiddleware(systemHandler.authService))
	{
		// 系统概览
		system.GET("/overview", systemHandler.GetSystemOverview)
		
		// 网络统计
		system.GET("/network", systemHandler.GetNetworkStats)
		
		// 进程管理
		system.GET("/processes", systemHandler.GetProcessList)
		system.POST("/processes/kill", middleware.RequireRole(model.RoleAdmin), systemHandler.KillProcess)
		
		// 主机信息
		system.GET("/host", systemHandler.GetHostInfo)
	}
}
package handler

import (
	"net/http"
	"strconv"

	"web-panel-go/internal/middleware"
	"web-panel-go/internal/model"
	"web-panel-go/internal/service"

	"github.com/gin-gonic/gin"
)

// UserHandler 用户处理器
type UserHandler struct {
	userService *service.UserService
	authService *service.AuthService
}

// NewUserHandler 创建用户处理器实例
func NewUserHandler(userService *service.UserService, authService *service.AuthService) *UserHandler {
	return &UserHandler{
		userService: userService,
		authService: authService,
	}
}

// GetUsers 获取用户列表
// @Summary 获取用户列表
// @Description 获取系统用户列表，支持分页和搜索
// @Tags 用户管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Param search query string false "搜索关键词"
// @Success 200 {object} model.APIResponse{data=model.PaginatedResponse}
// @Failure 401 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/users [get]
func (h *UserHandler) GetUsers(c *gin.Context) {
	// 获取分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	search := c.Query("search")

	// 参数验证
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	users, total, err := h.userService.GetUsers(page, pageSize, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "获取用户列表失败",
			Error:   err.Error(),
		})
		return
	}

	// 构建分页响应
	response := model.PaginatedResponse{
		Data:     users,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "获取用户列表成功",
		Data:    response,
	})
}

// GetUser 获取用户详情
// @Summary 获取用户详情
// @Description 根据用户ID获取用户详细信息
// @Tags 用户管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "用户ID"
// @Success 200 {object} model.APIResponse{data=model.UserResponse}
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Router /api/users/{id} [get]
func (h *UserHandler) GetUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "无效的用户ID",
		})
		return
	}

	user, err := h.userService.GetUserByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, model.ErrorResponse{
			Code:    http.StatusNotFound,
			Message: "用户不存在",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "获取用户信息成功",
		Data:    user,
	})
}

// CreateUser 创建用户
// @Summary 创建用户
// @Description 创建新用户账户
// @Tags 用户管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body model.CreateUserRequest true "创建用户请求"
// @Success 201 {object} model.APIResponse{data=model.UserResponse}
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 409 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/users [post]
func (h *UserHandler) CreateUser(c *gin.Context) {
	var req model.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 参数验证
	if req.Username == "" || req.Password == "" || req.Email == "" {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "用户名、密码和邮箱不能为空",
		})
		return
	}

	// 获取操作用户信息
	operatorID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 创建用户
	user, err := h.userService.CreateUser(&req, operatorID, clientIP, userAgent)
	if err != nil {
		statusCode := http.StatusInternalServerError
		if err.Error() == "用户名已存在" || err.Error() == "邮箱已存在" {
			statusCode = http.StatusConflict
		}
		c.JSON(statusCode, model.ErrorResponse{
			Code:    statusCode,
			Message: "创建用户失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, model.APIResponse{
		Code:    http.StatusCreated,
		Message: "用户创建成功",
		Data:    user,
	})
}

// UpdateUser 更新用户
// @Summary 更新用户
// @Description 更新用户信息
// @Tags 用户管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "用户ID"
// @Param request body model.UpdateUserRequest true "更新用户请求"
// @Success 200 {object} model.APIResponse{data=model.UserResponse}
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/users/{id} [put]
func (h *UserHandler) UpdateUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "无效的用户ID",
		})
		return
	}

	var req model.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 获取操作用户信息
	operatorID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 更新用户
	user, err := h.userService.UpdateUser(uint(id), &req, operatorID, clientIP, userAgent)
	if err != nil {
		statusCode := http.StatusInternalServerError
		if err.Error() == "用户不存在" {
			statusCode = http.StatusNotFound
		} else if err.Error() == "邮箱已存在" {
			statusCode = http.StatusConflict
		}
		c.JSON(statusCode, model.ErrorResponse{
			Code:    statusCode,
			Message: "更新用户失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "用户更新成功",
		Data:    user,
	})
}

// DeleteUser 删除用户
// @Summary 删除用户
// @Description 删除指定用户
// @Tags 用户管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "用户ID"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/users/{id} [delete]
func (h *UserHandler) DeleteUser(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "无效的用户ID",
		})
		return
	}

	// 获取操作用户信息
	operatorID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 检查是否尝试删除自己
	if uint(id) == operatorID {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "不能删除自己的账户",
		})
		return
	}

	// 删除用户
	if err := h.userService.DeleteUser(uint(id), operatorID, clientIP, userAgent); err != nil {
		statusCode := http.StatusInternalServerError
		if err.Error() == "用户不存在" {
			statusCode = http.StatusNotFound
		}
		c.JSON(statusCode, model.ErrorResponse{
			Code:    statusCode,
			Message: "删除用户失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "用户删除成功",
	})
}

// ChangeUserStatus 更改用户状态
// @Summary 更改用户状态
// @Description 启用或禁用用户账户
// @Tags 用户管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "用户ID"
// @Param request body model.ChangeUserStatusRequest true "更改用户状态请求"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/users/{id}/status [put]
func (h *UserHandler) ChangeUserStatus(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "无效的用户ID",
		})
		return
	}

	var req model.ChangeUserStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 获取操作用户信息
	operatorID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 检查是否尝试禁用自己
	if uint(id) == operatorID && req.Status == model.UserStatusInactive {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "不能禁用自己的账户",
		})
		return
	}

	// 更改用户状态
	_, err = h.userService.ChangeUserStatus(uint(id), req.Status, operatorID, clientIP, userAgent)
	if err != nil {
		statusCode := http.StatusInternalServerError
		if err.Error() == "用户不存在" {
			statusCode = http.StatusNotFound
		}
		c.JSON(statusCode, model.ErrorResponse{
			Code:    statusCode,
			Message: "更改用户状态失败",
			Error:   err.Error(),
		})
		return
	}

	status := "启用"
	if req.Status == model.UserStatusInactive {
		status = "禁用"
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "用户" + status + "成功",
	})
}

// ResetUserPassword 重置用户密码
// @Summary 重置用户密码
// @Description 管理员重置用户密码
// @Tags 用户管理
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "用户ID"
// @Param request body model.ResetPasswordRequest true "重置密码请求"
// @Success 200 {object} model.APIResponse
// @Failure 400 {object} model.APIResponse
// @Failure 401 {object} model.APIResponse
// @Failure 403 {object} model.APIResponse
// @Failure 404 {object} model.APIResponse
// @Failure 500 {object} model.APIResponse
// @Router /api/users/{id}/reset-password [put]
func (h *UserHandler) ResetUserPassword(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "无效的用户ID",
		})
		return
	}

	var req model.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数无效",
			Error:   err.Error(),
		})
		return
	}

	// 参数验证
	if req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, model.APIResponse{
			Code:    http.StatusBadRequest,
			Message: "新密码不能为空",
		})
		return
	}

	// 获取操作用户信息
	operatorID, _ := middleware.GetCurrentUserID(c)
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 重置密码
	if err := h.userService.ResetUserPassword(uint(id), req.NewPassword, operatorID, clientIP, userAgent); err != nil {
		statusCode := http.StatusInternalServerError
		if err.Error() == "用户不存在" {
			statusCode = http.StatusNotFound
		}
		c.JSON(statusCode, model.ErrorResponse{
			Code:    statusCode,
			Message: "重置密码失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "密码重置成功",
	})
}

// RegisterUserRoutes 注册用户相关路由
func RegisterUserRoutes(r *gin.RouterGroup, userHandler *UserHandler) {
	users := r.Group("/users")
	users.Use(middleware.AuthMiddleware(userHandler.authService))
	{
		// 用户列表和详情（所有认证用户都可以查看）
		users.GET("", userHandler.GetUsers)
		users.GET("/:id", userHandler.GetUser)
		
		// 用户管理操作（仅管理员）
		users.POST("", middleware.RequireRole(model.RoleAdmin), userHandler.CreateUser)
		users.PUT("/:id", middleware.RequireRole(model.RoleAdmin), userHandler.UpdateUser)
		users.DELETE("/:id", middleware.RequireRole(model.RoleAdmin), userHandler.DeleteUser)
		users.PUT("/:id/status", middleware.RequireRole(model.RoleAdmin), userHandler.ChangeUserStatus)
		users.PUT("/:id/reset-password", middleware.RequireRole(model.RoleAdmin), userHandler.ResetUserPassword)
	}
}
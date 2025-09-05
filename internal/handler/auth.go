package handler

import (
	"net/http"

	"web-panel-go/internal/middleware"
	"web-panel-go/internal/model"
	"web-panel-go/internal/service"

	"github.com/gin-gonic/gin"
)

// AuthHandler 认证处理器
type AuthHandler struct {
	authService *service.AuthService
}

// NewAuthHandler 创建认证处理器实例
func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// Login 用户登录
// @Summary 用户登录
// @Description 用户登录接口
// @Tags 认证
// @Accept json
// @Produce json
// @Param request body model.LoginRequest true "登录请求"
// @Success 200 {object} model.APIResponse{data=model.LoginResponse} "登录成功"
// @Failure 400 {object} model.ErrorResponse "请求参数错误"
// @Failure 401 {object} model.ErrorResponse "认证失败"
// @Router /api/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数错误",
			Error:   err.Error(),
		})
		return
	}

	// 获取客户端信息
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 执行登录
	resp, err := h.authService.Login(&req, clientIP, userAgent)
	if err != nil {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{
			Code:    http.StatusUnauthorized,
			Message: "登录失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "登录成功",
		Data:    resp,
	})
}

// Logout 用户登出
// @Summary 用户登出
// @Description 用户登出接口
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} model.APIResponse "登出成功"
// @Failure 401 {object} model.ErrorResponse "未认证"
// @Router /api/auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	// 获取当前用户和令牌
	userID, exists := middleware.GetCurrentUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{
			Code:    http.StatusUnauthorized,
			Message: "未认证的用户",
		})
		return
	}

	token, exists := middleware.GetCurrentToken(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{
			Code:    http.StatusUnauthorized,
			Message: "未找到令牌",
		})
		return
	}

	// 获取客户端信息
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 执行登出
	if err := h.authService.Logout(token, userID, clientIP, userAgent); err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "登出失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "登出成功",
	})
}

// GetProfile 获取用户信息
// @Summary 获取当前用户信息
// @Description 获取当前登录用户的详细信息
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} model.APIResponse{data=object} "获取成功"
// @Failure 401 {object} model.ErrorResponse "未认证"
// @Router /api/auth/profile [get]
func (h *AuthHandler) GetProfile(c *gin.Context) {
	user, exists := middleware.GetCurrentUser(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{
			Code:    http.StatusUnauthorized,
			Message: "未认证的用户",
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "获取用户信息成功",
		Data:    user.ToSafeJSON(),
	})
}

// ChangePassword 修改密码
// @Summary 修改密码
// @Description 修改当前用户密码
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body model.ChangePasswordRequest true "修改密码请求"
// @Success 200 {object} model.APIResponse "修改成功"
// @Failure 400 {object} model.ErrorResponse "请求参数错误"
// @Failure 401 {object} model.ErrorResponse "未认证或旧密码错误"
// @Router /api/auth/change-password [post]
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req model.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, model.ErrorResponse{
			Code:    http.StatusBadRequest,
			Message: "请求参数错误",
			Error:   err.Error(),
		})
		return
	}

	// 获取当前用户ID
	userID, exists := middleware.GetCurrentUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{
			Code:    http.StatusUnauthorized,
			Message: "未认证的用户",
		})
		return
	}

	// 获取客户端信息
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// 执行密码修改
	if err := h.authService.ChangePassword(userID, &req, clientIP, userAgent); err != nil {
		statusCode := http.StatusInternalServerError
		if err.Error() == "旧密码错误" {
			statusCode = http.StatusUnauthorized
		}

		c.JSON(statusCode, model.ErrorResponse{
			Code:    statusCode,
			Message: "修改密码失败",
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "密码修改成功，请重新登录",
	})
}

// RefreshToken 刷新令牌
// @Summary 刷新令牌
// @Description 刷新JWT令牌
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} model.APIResponse{data=model.LoginResponse} "刷新成功"
// @Failure 401 {object} model.ErrorResponse "未认证"
// @Router /api/auth/refresh [post]
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	user, exists := middleware.GetCurrentUser(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{
			Code:    http.StatusUnauthorized,
			Message: "未认证的用户",
		})
		return
	}

	// 生成新令牌
	token, expiresAt, err := h.authService.GenerateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, model.ErrorResponse{
			Code:    http.StatusInternalServerError,
			Message: "生成令牌失败",
			Error:   err.Error(),
		})
		return
	}

	resp := &model.LoginResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		User:      user.ToSafeJSON(),
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "令牌刷新成功",
		Data:    resp,
	})
}

// ValidateToken 验证令牌
// @Summary 验证令牌
// @Description 验证JWT令牌是否有效
// @Tags 认证
// @Accept json
// @Produce json
// @Security BearerAuth
// @Success 200 {object} model.APIResponse{data=object} "令牌有效"
// @Failure 401 {object} model.ErrorResponse "令牌无效"
// @Router /api/auth/validate [get]
func (h *AuthHandler) ValidateToken(c *gin.Context) {
	user, exists := middleware.GetCurrentUser(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, model.ErrorResponse{
			Code:    http.StatusUnauthorized,
			Message: "未认证的用户",
		})
		return
	}

	c.JSON(http.StatusOK, model.APIResponse{
		Code:    http.StatusOK,
		Message: "令牌有效",
		Data: gin.H{
			"valid": true,
			"user":  user.ToSafeJSON(),
		},
	})
}

// RegisterRoutes 注册认证相关路由
// RegisterAuthRoutes 注册认证路由
func RegisterAuthRoutes(r *gin.RouterGroup, authHandler *AuthHandler) {
	auth := r.Group("/auth")
	{
		// 公开路由（无需认证）
		auth.POST("/login", authHandler.Login)

		// 需要认证的路由
		authenticated := auth.Group("")
		authenticated.Use(middleware.AuthMiddleware(authHandler.authService))
		{
			authenticated.POST("/logout", authHandler.Logout)
			authenticated.GET("/profile", authHandler.GetProfile)
			authenticated.POST("/change-password", authHandler.ChangePassword)
			authenticated.POST("/refresh", authHandler.RefreshToken)
			authenticated.GET("/validate", authHandler.ValidateToken)
		}
	}
}

// RegisterRoutes 注册认证路由（兼容性方法）
func (h *AuthHandler) RegisterRoutes(r *gin.RouterGroup) {
	RegisterAuthRoutes(r, h)
}
package handler

import (
	"web-panel-go/internal/service"

	"github.com/gin-gonic/gin"
)

// Handlers 处理器集合
type Handlers struct {
	Auth   *AuthHandler
	User   *UserHandler
	System *SystemHandler
	File   *FileHandler
}

// NewHandlers 创建处理器集合
func NewHandlers(services *service.Services) *Handlers {
	return &Handlers{
		Auth:   NewAuthHandler(services.Auth),
		User:   NewUserHandler(services.User, services.Auth),
		System: NewSystemHandler(services.System, services.Auth),
		File:   NewFileHandler(services.File, services.Auth),
	}
}

// RegisterRoutes 注册所有路由
func RegisterRoutes(r *gin.Engine, handlers *Handlers) {
	// API 路由组
	api := r.Group("/api")
	
	// 注册各模块路由
	RegisterAuthRoutes(api, handlers.Auth)
	RegisterUserRoutes(api, handlers.User)
	RegisterSystemRoutes(api, handlers.System)
	RegisterFileRoutes(api, handlers.File)
	
	// 健康检查路由
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
			"message": "Web Panel Go API is running",
		})
	})
	
	// 根路径重定向到健康检查
	r.GET("/", func(c *gin.Context) {
		c.Redirect(302, "/health")
	})
}
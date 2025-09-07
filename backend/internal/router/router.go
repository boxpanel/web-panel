package router

import (
	"web-panel-go/internal/config"
	"web-panel-go/internal/handler"
	"web-panel-go/internal/middleware"
	"web-panel-go/internal/service"
	"web-panel-go/internal/websocket"

	"github.com/gin-gonic/gin"
)

// Setup 设置路由
func Setup(cfg *config.Config, services *service.Services, wsManager *websocket.WebSocketManager) *gin.Engine {
	// 设置Gin模式
	if cfg.System.Mode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 创建Gin引擎
	r := gin.New()

	// 设置基础中间件
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(middleware.CORS())

	// 初始化处理器
	handlers := handler.NewHandlers(services)

	// 创建API路由组
	api := r.Group("/api")

	// 注册路由
	handler.RegisterAuthRoutes(api, handlers.Auth)
	handler.RegisterUserRoutes(api, handlers.User)
	handler.RegisterSystemRoutes(api, handlers.System)
	handler.RegisterFileRoutes(api, handlers.File)

	// 注册WebSocket路由
	r.GET("/ws", middleware.AuthMiddleware(services.Auth), wsManager.HandleWebSocket)

	return r
}
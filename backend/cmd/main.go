package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"web-panel-go/internal/config"
	"web-panel-go/internal/database"
	"web-panel-go/internal/logger"
	"web-panel-go/internal/router"
	"web-panel-go/internal/service"
	"web-panel-go/internal/websocket"
)

func main() {
	fmt.Println("开始启动Web Panel Go版本...")
	
	// 初始化配置
	fmt.Println("正在加载配置...")
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}
	fmt.Println("配置加载成功")

	// 初始化日志
	fmt.Println("正在初始化日志...")
	fmt.Printf("日志配置: %+v\n", cfg.Log)
	fmt.Printf("系统配置: %+v\n", cfg.System)
	err = logger.Init(&cfg.Log, &cfg.System)
	if err != nil {
		fmt.Printf("日志初始化失败: %v\n", err)
		log.Fatalf("日志初始化失败: %v", err)
	}
	fmt.Println("日志初始化成功")
	logger.Logger.Info("Web Panel Go 版本启动中...")

	// 初始化数据库
	fmt.Println("正在初始化数据库...")
	db, err := database.Init(cfg.Database)
	if err != nil {
		fmt.Printf("数据库初始化失败: %v\n", err)
		logger.Logger.Fatalf("数据库初始化失败: %v", err)
	}
	fmt.Println("数据库初始化成功")
	defer database.Close()

	// 初始化服务层
	services := service.NewServices(db, cfg)

	// 初始化WebSocket管理器
	wsManager := websocket.NewWebSocketManager()
	go wsManager.Run()

	// 启动系统监控定时任务
	go startSystemMonitor(services.System, wsManager)

	// 初始化路由
	r := router.Setup(cfg, services, wsManager)

	// 创建HTTP服务器
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.System.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 启动服务器
	go func() {
		fmt.Printf("服务器启动在端口: %d\n", cfg.System.Port)
		logger.Logger.Infof("服务器启动在端口: %d", cfg.System.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Logger.Fatalf("服务器启动失败: %v", err)
		}
	}()

	// 优雅关闭
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("服务器正在关闭...")
	logger.Logger.Info("服务器正在关闭...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		fmt.Printf("服务器强制关闭: %v\n", err)
		logger.Logger.Fatalf("服务器强制关闭: %v", err)
	}

	fmt.Println("服务器已关闭")
	logger.Logger.Info("服务器已关闭")
}

// startSystemMonitor 启动系统监控定时任务
func startSystemMonitor(systemService *service.SystemService, wsManager *websocket.WebSocketManager) {
	ticker := time.NewTicker(5 * time.Second) // 每5秒更新一次
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// 获取系统统计信息
			stats, err := systemService.GetSystemOverview()
			if err != nil {
				logger.Error("获取系统统计信息失败", "error", err)
				continue
			}

			// 广播系统统计信息给所有WebSocket客户端
			wsManager.BroadcastSystemStats(stats)
		}
	}
}
package middleware

import (
	"fmt"
	"net/http"
	"time"

	"web-panel-go/internal/config"
	"web-panel-go/internal/logger"

	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// SetupMiddlewares 设置中间件
func SetupMiddlewares(r *gin.Engine, cfg *config.Config) {
	// 恢复中间件
	r.Use(gin.Recovery())

	// 日志中间件
	r.Use(LoggerMiddleware())

	// CORS中间件
	r.Use(CORSMiddleware(cfg.Security.CORSOrigins))

	// Gzip压缩中间件
	r.Use(gzip.Gzip(gzip.DefaultCompression))

	// 限流中间件
	if cfg.Security.RateLimit.MaxRequests > 0 {
		r.Use(RateLimitMiddleware(cfg.Security.RateLimit))
	}

	// 安全头中间件
	r.Use(SecurityHeadersMiddleware())
}

// LoggerMiddleware 日志中间件
func LoggerMiddleware() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		// 记录请求日志
		logger.LogRequest(
			param.Method,
			param.Path,
			param.ClientIP,
			param.StatusCode,
			param.Latency.String(),
			param.Request.UserAgent(),
		)

		// 返回格式化的日志字符串
		return fmt.Sprintf("%s - [%s] \"%s %s %s\" %d %d \"%s\" \"%s\" %s\n",
			param.ClientIP,
			param.TimeStamp.Format("02/Jan/2006:15:04:05 -0700"),
			param.Method,
			param.Path,
			param.Request.Proto,
			param.StatusCode,
			param.BodySize,
			param.Request.Referer(),
			param.Request.UserAgent(),
			param.Latency,
		)
	})
}

// CORS CORS中间件（简化版本）
func CORS() gin.HandlerFunc {
	return CORSMiddleware([]string{"*"})
}

// CORSMiddleware CORS中间件
func CORSMiddleware(allowedOrigins []string) gin.HandlerFunc {
	config := cors.DefaultConfig()

	if len(allowedOrigins) > 0 {
		config.AllowOrigins = allowedOrigins
	} else {
		// 开发环境允许所有来源
		config.AllowAllOrigins = true
	}

	config.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization", "X-Requested-With"}
	config.ExposeHeaders = []string{"Content-Length", "Content-Type"}
	config.AllowCredentials = true
	config.MaxAge = 12 * time.Hour

	return cors.New(config)
}

// RateLimitMiddleware 限流中间件
func RateLimitMiddleware(cfg config.RateLimit) gin.HandlerFunc {
	// 简单的内存限流实现
	// 生产环境建议使用Redis等外部存储
	clientMap := make(map[string][]time.Time)

	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		now := time.Now()

		// 清理过期记录
		if requests, exists := clientMap[clientIP]; exists {
			var validRequests []time.Time
			for _, reqTime := range requests {
				if now.Sub(reqTime) < cfg.Window {
					validRequests = append(validRequests, reqTime)
				}
			}
			clientMap[clientIP] = validRequests
		}

		// 检查请求数量
		if len(clientMap[clientIP]) >= cfg.MaxRequests {
			logger.Warn("请求频率过高", "client_ip", clientIP, "requests", len(clientMap[clientIP]))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"code":    http.StatusTooManyRequests,
				"message": "请求频率过高，请稍后再试",
			})
			c.Abort()
			return
		}

		// 记录当前请求
		clientMap[clientIP] = append(clientMap[clientIP], now)

		c.Next()
	}
}

// SecurityHeadersMiddleware 安全头中间件
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 防止点击劫持
		c.Header("X-Frame-Options", "DENY")

		// 防止MIME类型嗅探
		c.Header("X-Content-Type-Options", "nosniff")

		// XSS保护
		c.Header("X-XSS-Protection", "1; mode=block")

		// 引用策略
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")

		// 内容安全策略
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:")

		// HSTS (仅在HTTPS时)
		if c.Request.TLS != nil {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		c.Next()
	}
}

// ErrorHandlerMiddleware 错误处理中间件
func ErrorHandlerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// 处理错误
		if len(c.Errors) > 0 {
			err := c.Errors.Last()
			logger.Error("请求处理错误", "error", err.Error(), "path", c.Request.URL.Path, "method", c.Request.Method)

			// 根据错误类型返回不同的状态码
			statusCode := http.StatusInternalServerError
			if err.Type == gin.ErrorTypeBind {
				statusCode = http.StatusBadRequest
			}

			c.JSON(statusCode, gin.H{
				"code":    statusCode,
				"message": "请求处理失败",
				"error":   err.Error(),
			})
		}
	}
}

// RequestIDMiddleware 请求ID中间件
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = fmt.Sprintf("%d", time.Now().UnixNano())
		}

		c.Set("request_id", requestID)
		c.Header("X-Request-ID", requestID)

		c.Next()
	}
}

// HealthCheckMiddleware 健康检查中间件
func HealthCheckMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.URL.Path == "/health" {
			c.JSON(http.StatusOK, gin.H{
				"status":    "ok",
				"timestamp": time.Now().Unix(),
				"version":   "1.0.0",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
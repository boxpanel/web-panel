package logger

import (
	"os"
	"path/filepath"
	"time"

	"github.com/sirupsen/logrus"
	"gopkg.in/natefinch/lumberjack.v2"

	"web-panel-go/internal/config"
)

var Logger *logrus.Logger

// Init 初始化日志系统
func Init(cfg *config.LogConfig, systemCfg *config.SystemConfig) error {
	Logger = logrus.New()

	// 设置日志级别
	level, err := logrus.ParseLevel(cfg.Level)
	if err != nil {
		level = logrus.InfoLevel
	}
	Logger.SetLevel(level)

	// 设置日志格式
	if cfg.Format == "json" {
		Logger.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: time.RFC3339,
		})
	} else {
		Logger.SetFormatter(&logrus.TextFormatter{
			FullTimestamp:   true,
			TimestampFormat: "2006-01-02 15:04:05",
		})
	}

	// 设置输出
	if cfg.Output == "file" {
		// 确保日志目录存在
		logDir := systemCfg.LogDir
		if logDir == "" {
			logDir = "logs"
		}
		if err := os.MkdirAll(logDir, 0755); err != nil {
			return err
		}

		// 配置日志轮转
		lumberjackLogger := &lumberjack.Logger{
			Filename:   filepath.Join(logDir, "app.log"),
			MaxSize:    cfg.MaxSize,    // MB
			MaxBackups: cfg.MaxBackups, // 保留文件数
			MaxAge:     cfg.MaxAge,     // 天数
			Compress:   cfg.Compress,   // 压缩
		}

		Logger.SetOutput(lumberjackLogger)
	} else {
		Logger.SetOutput(os.Stdout)
	}

	return nil
}

// Debug 记录调试日志
func Debug(msg string, args ...interface{}) {
	Logger.WithFields(logrus.Fields{"args": args}).Debug(msg)
}

// Info 记录信息日志
func Info(msg string, args ...interface{}) {
	Logger.WithFields(logrus.Fields{"args": args}).Info(msg)
}

// Warn 记录警告日志
func Warn(msg string, args ...interface{}) {
	Logger.WithFields(logrus.Fields{"args": args}).Warn(msg)
}

// Error 记录错误日志
func Error(msg string, args ...interface{}) {
	Logger.WithFields(logrus.Fields{"args": args}).Error(msg)
}

// Fatal 记录致命错误日志并退出程序
func Fatal(msg string, args ...interface{}) {
	Logger.WithFields(logrus.Fields{"args": args}).Fatal(msg)
}

// GetLogger 获取日志记录器实例
func GetLogger() *logrus.Logger {
	return Logger
}

// LogRequest 记录HTTP请求日志
func LogRequest(method, path, clientIP string, statusCode int, latency string, userAgent string) {
	Logger.WithFields(logrus.Fields{
		"method":     method,
		"path":       path,
		"client_ip":  clientIP,
		"status_code": statusCode,
		"latency":    latency,
		"user_agent": userAgent,
	}).Info("HTTP Request")
}

// LogError 记录错误日志
func LogError(err error, context string, args ...interface{}) {
	Logger.WithFields(logrus.Fields{
		"error": err,
		"args":  args,
	}).Error(context)
}

// LogAuth 记录认证相关日志
func LogAuth(action, username, clientIP string, success bool, reason string) {
	Logger.WithFields(logrus.Fields{
		"action":    action,
		"username":  username,
		"client_ip": clientIP,
		"success":   success,
		"reason":    reason,
	}).Info("Authentication")
}

// LogSystem 记录系统操作日志
func LogSystem(action, resource, operator string, details map[string]interface{}) {
	fields := logrus.Fields{
		"action":   action,
		"resource": resource,
		"operator": operator,
	}

	for k, v := range details {
		fields[k] = v
	}

	Logger.WithFields(fields).Info("System Operation")
}
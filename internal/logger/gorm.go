package logger

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

// GormLogger GORM日志适配器
type GormLogger struct {
	SlowThreshold time.Duration
	LogLevel      gormLogger.LogLevel
}

// NewGormLogger 创建GORM日志适配器
func NewGormLogger() gormLogger.Interface {
	return &GormLogger{
		SlowThreshold: 200 * time.Millisecond,
		LogLevel:      gormLogger.Info,
	}
}

// LogMode 设置日志级别
func (l *GormLogger) LogMode(level gormLogger.LogLevel) gormLogger.Interface {
	newLogger := *l
	newLogger.LogLevel = level
	return &newLogger
}

// Info 信息日志
func (l *GormLogger) Info(ctx context.Context, msg string, data ...interface{}) {
	if l.LogLevel >= gormLogger.Info {
		Info(fmt.Sprintf(msg, data...))
	}
}

// Warn 警告日志
func (l *GormLogger) Warn(ctx context.Context, msg string, data ...interface{}) {
	if l.LogLevel >= gormLogger.Warn {
		Warn(fmt.Sprintf(msg, data...))
	}
}

// Error 错误日志
func (l *GormLogger) Error(ctx context.Context, msg string, data ...interface{}) {
	if l.LogLevel >= gormLogger.Error {
		Error(fmt.Sprintf(msg, data...))
	}
}

// Trace SQL执行日志
func (l *GormLogger) Trace(ctx context.Context, begin time.Time, fc func() (sql string, rowsAffected int64), err error) {
	if l.LogLevel <= gormLogger.Silent {
		return
	}

	elapsed := time.Since(begin)
	sql, rows := fc()

	switch {
	case err != nil && l.LogLevel >= gormLogger.Error && !errors.Is(err, gorm.ErrRecordNotFound):
		Error("SQL执行错误",
			"error", err,
			"elapsed", elapsed,
			"rows", rows,
			"sql", sql)
	case elapsed > l.SlowThreshold && l.SlowThreshold != 0 && l.LogLevel >= gormLogger.Warn:
		Warn("慢SQL查询",
			"elapsed", elapsed,
			"rows", rows,
			"sql", sql)
	case l.LogLevel == gormLogger.Info:
		Info("SQL执行",
			"elapsed", elapsed,
			"rows", rows,
			"sql", sql)
	}
}
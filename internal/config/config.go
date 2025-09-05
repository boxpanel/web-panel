package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/viper"
)

// Config 应用配置结构
type Config struct {
	System     SystemConfig     `mapstructure:"system"`
	Database   DatabaseConfig   `mapstructure:"database"`
	Auth       AuthConfig       `mapstructure:"auth"`
	Security   SecurityConfig   `mapstructure:"security"`
	Log        LogConfig        `mapstructure:"log"`
	Monitoring MonitoringConfig `mapstructure:"monitoring"`
	WebSocket  WebSocketConfig  `mapstructure:"websocket"`
}

// SystemConfig 系统配置
type SystemConfig struct {
	Port      int    `mapstructure:"port"`
	Mode      string `mapstructure:"mode"`
	BaseDir   string `mapstructure:"base_dir"`
	UploadDir string `mapstructure:"upload_dir"`
	LogDir    string `mapstructure:"log_dir"`
	DataDir   string `mapstructure:"data_dir"`
	BackupDir string `mapstructure:"backup_dir"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Type            string        `mapstructure:"type"`
	Path            string        `mapstructure:"path"`
	MaxIdleConns    int           `mapstructure:"max_idle_conns"`
	MaxOpenConns    int           `mapstructure:"max_open_conns"`
	ConnMaxLifetime time.Duration `mapstructure:"conn_max_lifetime"`
}

// AuthConfig 认证配置
type AuthConfig struct {
	JWTSecret  string        `mapstructure:"jwt_secret"`
	JWTExpire  time.Duration `mapstructure:"jwt_expire"`
	BcryptCost int           `mapstructure:"bcrypt_cost"`
}

// SecurityConfig 安全配置
type SecurityConfig struct {
	CORSOrigins []string   `mapstructure:"cors_origins"`
	RateLimit   RateLimit  `mapstructure:"rate_limit"`
	CSRFEnabled bool       `mapstructure:"csrf_enabled"`
}

// RateLimit 限流配置
type RateLimit struct {
	Window      time.Duration `mapstructure:"window"`
	MaxRequests int           `mapstructure:"max_requests"`
}

// LogConfig 日志配置
type LogConfig struct {
	Level      string `mapstructure:"level"`
	Format     string `mapstructure:"format"`
	Output     string `mapstructure:"output"`
	MaxSize    int    `mapstructure:"max_size"`
	MaxBackups int    `mapstructure:"max_backups"`
	MaxAge     int    `mapstructure:"max_age"`
	Compress   bool   `mapstructure:"compress"`
}

// MonitoringConfig 监控配置
type MonitoringConfig struct {
	MetricsEnabled       bool          `mapstructure:"metrics_enabled"`
	HealthCheckInterval  time.Duration `mapstructure:"health_check_interval"`
	SystemInfoCache      time.Duration `mapstructure:"system_info_cache"`
}

// WebSocketConfig WebSocket配置
type WebSocketConfig struct {
	Enabled         bool   `mapstructure:"enabled"`
	Path            string `mapstructure:"path"`
	ReadBufferSize  int    `mapstructure:"read_buffer_size"`
	WriteBufferSize int    `mapstructure:"write_buffer_size"`
	CheckOrigin     bool   `mapstructure:"check_origin"`
}

// Load 加载配置
func Load() (*Config, error) {
	v := viper.New()

	// 设置配置文件名和路径
	v.SetConfigName("app")
	v.SetConfigType("yaml")
	v.AddConfigPath("./config")
	v.AddConfigPath("../config")
	v.AddConfigPath("/opt/web-panel-go/config")

	// 设置环境变量前缀
	v.SetEnvPrefix("WPG")
	v.AutomaticEnv()

	// 设置默认值
	setDefaults(v)

	// 读取配置文件
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			// 配置文件未找到，使用默认值
			fmt.Println("配置文件未找到，使用默认配置")
		} else {
			return nil, fmt.Errorf("读取配置文件失败: %w", err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("解析配置失败: %w", err)
	}

	// 创建必要的目录
	if err := createDirectories(&cfg); err != nil {
		return nil, fmt.Errorf("创建目录失败: %w", err)
	}

	return &cfg, nil
}

// setDefaults 设置默认配置值
func setDefaults(v *viper.Viper) {
	v.SetDefault("system.port", 3001)
	v.SetDefault("system.mode", "production")
	v.SetDefault("system.base_dir", "./")
	v.SetDefault("system.upload_dir", "./uploads")
	v.SetDefault("system.log_dir", "./logs")
	v.SetDefault("system.data_dir", "./data")
	v.SetDefault("system.backup_dir", "./backup")

	v.SetDefault("database.type", "sqlite")
	v.SetDefault("database.path", "./data/database.sqlite")
	v.SetDefault("database.max_idle_conns", 10)
	v.SetDefault("database.max_open_conns", 100)
	v.SetDefault("database.conn_max_lifetime", "1h")

	v.SetDefault("auth.jwt_secret", "your-secret-key-change-in-production")
	v.SetDefault("auth.jwt_expire", "24h")
	v.SetDefault("auth.bcrypt_cost", 12)

	v.SetDefault("log.level", "info")
	v.SetDefault("log.format", "json")
	v.SetDefault("log.output", "file")
	v.SetDefault("log.max_size", 100)
	v.SetDefault("log.max_backups", 10)
	v.SetDefault("log.max_age", 30)
	v.SetDefault("log.compress", true)

	v.SetDefault("websocket.enabled", true)
	v.SetDefault("websocket.path", "/ws")
	v.SetDefault("websocket.read_buffer_size", 1024)
	v.SetDefault("websocket.write_buffer_size", 1024)
	v.SetDefault("websocket.check_origin", false)
}

// createDirectories 创建必要的目录
func createDirectories(cfg *Config) error {
	dirs := []string{
		cfg.System.UploadDir,
		cfg.System.LogDir,
		cfg.System.DataDir,
		cfg.System.BackupDir,
		filepath.Dir(cfg.Database.Path),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("创建目录 %s 失败: %w", dir, err)
		}
	}

	return nil
}
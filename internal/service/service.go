package service

import (
	"web-panel-go/internal/config"

	"gorm.io/gorm"
)

// Services 服务集合
type Services struct {
	Auth   *AuthService
	User   *UserService
	System *SystemService
	File   *FileService
}

// NewServices 创建服务集合实例
func NewServices(db *gorm.DB, cfg *config.Config) *Services {
	return &Services{
		Auth:   NewAuthService(db, cfg),
		User:   NewUserService(db),
		System: NewSystemService(db),
		File:   NewFileService(db),
	}
}
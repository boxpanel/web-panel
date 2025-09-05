package database

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"web-panel-go/internal/config"
	"web-panel-go/internal/logger"
	"web-panel-go/internal/model"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

var db *gorm.DB

// Init 初始化数据库连接
func Init(cfg config.DatabaseConfig) (*gorm.DB, error) {
	// 确保数据库目录存在
	dataDir := filepath.Dir(cfg.Path)
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("创建数据库目录失败: %w", err)
	}

	// 配置GORM日志
	gormLog := logger.NewGormLogger()

	// 使用modernc.org/sqlite驱动（纯Go实现，无需CGO）
	var err error
	db, err = gorm.Open(sqlite.Open(cfg.Path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}

	// 获取底层sql.DB对象进行连接池配置
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("获取数据库连接失败: %w", err)
	}

	// 设置连接池参数
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetConnMaxLifetime(cfg.ConnMaxLifetime * time.Second)

	// 自动迁移数据库表
	fmt.Println("开始数据库迁移...")
	if err := autoMigrate(); err != nil {
		fmt.Printf("数据库迁移详细错误: %v\n", err)
		return nil, fmt.Errorf("数据库迁移失败: %w", err)
	}
	fmt.Println("数据库迁移成功")

	// 初始化默认数据
	if err := initDefaultData(); err != nil {
		return nil, fmt.Errorf("初始化默认数据失败: %w", err)
	}

	logger.Info("数据库初始化成功", "path", cfg.Path)
	return db, nil
}

// autoMigrate 自动迁移数据库表
func autoMigrate() error {
	models := []interface{}{
		&model.User{},
		&model.Role{},
		&model.Permission{},
		&model.UserRole{},
		&model.RolePermission{},
		&model.Session{},
		&model.AuditLog{},
		&model.SystemConfig{},
		&model.FileInfo{},
		&model.ProcessInfo{},
	}
	
	for i, model := range models {
		fmt.Printf("迁移模型 %d: %T\n", i+1, model)
		if err := db.AutoMigrate(model); err != nil {
			fmt.Printf("迁移模型 %T 失败: %v\n", model, err)
			return err
		}
		fmt.Printf("迁移模型 %T 成功\n", model)
	}
	
	return nil
}

// initDefaultData 初始化默认数据
func initDefaultData() error {
	// 初始化默认权限
	if err := initDefaultPermissions(); err != nil {
		return fmt.Errorf("初始化默认权限失败: %w", err)
	}

	// 初始化默认角色
	if err := initDefaultRoles(); err != nil {
		return fmt.Errorf("初始化默认角色失败: %w", err)
	}

	// 初始化默认管理员用户
	if err := initDefaultAdmin(); err != nil {
		return fmt.Errorf("初始化默认管理员失败: %w", err)
	}

	return nil
}

// initDefaultPermissions 初始化默认权限
func initDefaultPermissions() error {
	permissions := []model.Permission{
		{Name: model.PermissionUserView, DisplayName: "查看用户", Resource: "user", Action: "view", IsSystem: true},
		{Name: model.PermissionUserCreate, DisplayName: "创建用户", Resource: "user", Action: "create", IsSystem: true},
		{Name: model.PermissionUserUpdate, DisplayName: "更新用户", Resource: "user", Action: "update", IsSystem: true},
		{Name: model.PermissionUserDelete, DisplayName: "删除用户", Resource: "user", Action: "delete", IsSystem: true},
		{Name: model.PermissionRoleView, DisplayName: "查看角色", Resource: "role", Action: "view", IsSystem: true},
		{Name: model.PermissionRoleCreate, DisplayName: "创建角色", Resource: "role", Action: "create", IsSystem: true},
		{Name: model.PermissionRoleUpdate, DisplayName: "更新角色", Resource: "role", Action: "update", IsSystem: true},
		{Name: model.PermissionRoleDelete, DisplayName: "删除角色", Resource: "role", Action: "delete", IsSystem: true},
		{Name: model.PermissionSystemView, DisplayName: "查看系统信息", Resource: "system", Action: "view", IsSystem: true},
		{Name: model.PermissionSystemMonitor, DisplayName: "系统监控", Resource: "system", Action: "monitor", IsSystem: true},
		{Name: model.PermissionSystemConfig, DisplayName: "系统配置", Resource: "system", Action: "config", IsSystem: true},
		{Name: model.PermissionFileView, DisplayName: "查看文件", Resource: "file", Action: "view", IsSystem: true},
		{Name: model.PermissionFileCreate, DisplayName: "创建文件", Resource: "file", Action: "create", IsSystem: true},
		{Name: model.PermissionFileUpdate, DisplayName: "更新文件", Resource: "file", Action: "update", IsSystem: true},
		{Name: model.PermissionFileDelete, DisplayName: "删除文件", Resource: "file", Action: "delete", IsSystem: true},
		{Name: model.PermissionFileUpload, DisplayName: "上传文件", Resource: "file", Action: "upload", IsSystem: true},
		{Name: model.PermissionAuditView, DisplayName: "查看审计日志", Resource: "audit", Action: "view", IsSystem: true},
	}

	for _, permission := range permissions {
		var count int64
		db.Model(&model.Permission{}).Where("name = ?", permission.Name).Count(&count)
		if count == 0 {
			if err := db.Create(&permission).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

// initDefaultRoles 初始化默认角色
func initDefaultRoles() error {
	roles := []model.Role{
		{Name: model.RoleAdmin, DisplayName: "超级管理员", Description: "拥有所有权限的超级管理员", IsSystem: true, Status: model.RoleStatusActive},
		{Name: model.RoleUser, DisplayName: "普通用户", Description: "普通用户角色", IsSystem: true, Status: model.RoleStatusActive},
		{Name: model.RoleModerator, DisplayName: "版主", Description: "版主角色", IsSystem: true, Status: model.RoleStatusActive},
		{Name: model.RoleGuest, DisplayName: "访客", Description: "访客角色", IsSystem: true, Status: model.RoleStatusActive},
	}

	for _, role := range roles {
		var count int64
		db.Model(&model.Role{}).Where("name = ?", role.Name).Count(&count)
		if count == 0 {
			if err := db.Create(&role).Error; err != nil {
				return err
			}
		}
	}

	// 为管理员角色分配所有权限
	var adminRole model.Role
	if err := db.Where("name = ?", model.RoleAdmin).First(&adminRole).Error; err != nil {
		return err
	}

	var permissions []model.Permission
	if err := db.Find(&permissions).Error; err != nil {
		return err
	}

	for _, permission := range permissions {
		var count int64
		db.Model(&model.RolePermission{}).Where("role_id = ? AND permission_id = ?", adminRole.ID, permission.ID).Count(&count)
		if count == 0 {
			rolePermission := model.RolePermission{
				RoleID:       adminRole.ID,
				PermissionID: permission.ID,
			}
			if err := db.Create(&rolePermission).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

// initDefaultAdmin 初始化默认管理员用户
func initDefaultAdmin() error {
	// 检查是否已存在管理员用户
	var count int64
	if err := db.Model(&model.User{}).Where("username = ?", "admin").Count(&count).Error; err != nil {
		return fmt.Errorf("检查管理员用户失败: %w", err)
	}

	// 如果没有管理员用户，创建默认管理员
	if count == 0 {
		adminUser := &model.User{
			Username: "admin",
			Email:    "admin@localhost",
			Nickname: "系统管理员",
			Status:   model.UserStatusActive,
		}

		// 设置默认密码 (需要在User模型中实现SetPassword方法)
		adminUser.Password = "$2a$10$N9qo8uLOickgx2ZMRZoMye.IjPFvmRaN7eU9h/.OFGOyDoBKXukdK" // admin123的bcrypt哈希

		if err := db.Create(adminUser).Error; err != nil {
			return fmt.Errorf("创建默认管理员失败: %w", err)
		}

		// 为管理员分配管理员角色
		var adminRole model.Role
		if err := db.Where("name = ?", model.RoleAdmin).First(&adminRole).Error; err != nil {
			return fmt.Errorf("查找管理员角色失败: %w", err)
		}

		userRole := model.UserRole{
			UserID: adminUser.ID,
			RoleID: adminRole.ID,
		}
		if err := db.Create(&userRole).Error; err != nil {
			return fmt.Errorf("分配管理员角色失败: %w", err)
		}

		logger.Info("创建默认管理员用户", "username", "admin", "password", "admin123")
	}

	return nil
}

// GetDB 获取数据库实例
func GetDB() *gorm.DB {
	return db
}

// Close 关闭数据库连接
func Close() error {
	if db != nil {
		sqlDB, err := db.DB()
		if err != nil {
			return err
		}
		return sqlDB.Close()
	}
	return nil
}

// Transaction 执行事务
func Transaction(fn func(*gorm.DB) error) error {
	return db.Transaction(fn)
}

// Paginate 分页查询
func Paginate(page, pageSize int) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		if page <= 0 {
			page = 1
		}
		if pageSize <= 0 {
			pageSize = 10
		}
		if pageSize > 100 {
			pageSize = 100
		}

		offset := (page - 1) * pageSize
		return db.Offset(offset).Limit(pageSize)
	}
}

// HealthCheck 数据库健康检查
func HealthCheck() error {
	if db == nil {
		return fmt.Errorf("数据库连接未初始化")
	}

	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("获取数据库连接失败: %w", err)
	}

	return sqlDB.Ping()
}
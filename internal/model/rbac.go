package model

import (
	"time"

	"gorm.io/gorm"
)

// UserStatus 用户状态
type UserStatus int

const (
	UserStatusInactive UserStatus = 0 // 禁用
	UserStatusActive   UserStatus = 1 // 启用
	UserStatusBlocked  UserStatus = 2 // 封禁
)

// String 返回用户状态字符串
func (s UserStatus) String() string {
	switch s {
	case UserStatusInactive:
		return "禁用"
	case UserStatusActive:
		return "启用"
	case UserStatusBlocked:
		return "封禁"
	default:
		return "未知"
	}
}

// User 用户模型
type User struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	Username  string         `json:"username" gorm:"uniqueIndex;size:50;not null" validate:"required,min=3,max=50"`
	Email     string         `json:"email" gorm:"uniqueIndex;size:100;not null" validate:"required,email"`
	Password  string         `json:"-" gorm:"size:255;not null"`
	Nickname  string         `json:"nickname" gorm:"size:50"`
	Avatar    string         `json:"avatar" gorm:"size:255"`
	Phone     string         `json:"phone" gorm:"size:20"`
	Status    UserStatus     `json:"status" gorm:"default:1"`
	LastLogin *time.Time     `json:"last_login"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`

	// 关联关系
	Roles    []Role    `json:"roles,omitempty" gorm:"many2many:user_roles;"`
	Sessions []Session `json:"sessions,omitempty" gorm:"foreignKey:UserID"`
}

// TableName 指定表名
func (User) TableName() string {
	return "users"
}

// BeforeCreate GORM钩子：创建前
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.Status == 0 {
		u.Status = UserStatusActive
	}
	return nil
}

// IsActive 检查用户是否激活
func (u *User) IsActive() bool {
	return u.Status == UserStatusActive
}

// IsBlocked 检查用户是否被封禁
func (u *User) IsBlocked() bool {
	return u.Status == UserStatusBlocked
}

// HasRole 检查用户是否拥有指定角色
func (u *User) HasRole(roleName string) bool {
	for _, role := range u.Roles {
		if role.Name == roleName {
			return true
		}
	}
	return false
}

// IsAdmin 检查用户是否为管理员
func (u *User) IsAdmin() bool {
	return u.HasRole(RoleAdmin)
}

// HasPermission 检查用户是否拥有指定权限
func (u *User) HasPermission(permissionName string) bool {
	for _, role := range u.Roles {
		if role.HasPermission(permissionName) {
			return true
		}
	}
	return false
}

// Role 角色模型
type Role struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Name        string         `json:"name" gorm:"uniqueIndex;size:50;not null" validate:"required,min=2,max=50"`
	DisplayName string         `json:"display_name" gorm:"size:100"`
	Description string         `json:"description" gorm:"size:255"`
	IsSystem    bool           `json:"is_system" gorm:"default:false"` // 系统角色不可删除
	Status      RoleStatus     `json:"status" gorm:"default:1"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`

	// 关联关系
	Users       []User       `json:"users,omitempty" gorm:"many2many:user_roles;"`
	Permissions []Permission `json:"permissions,omitempty" gorm:"many2many:role_permissions;"`
}

// RoleStatus 角色状态
type RoleStatus int

const (
	RoleStatusInactive RoleStatus = 0 // 禁用
	RoleStatusActive   RoleStatus = 1 // 启用
)

// String 返回角色状态字符串
func (s RoleStatus) String() string {
	switch s {
	case RoleStatusInactive:
		return "禁用"
	case RoleStatusActive:
		return "启用"
	default:
		return "未知"
	}
}

// TableName 指定表名
func (Role) TableName() string {
	return "roles"
}

// IsActive 检查角色是否启用
func (r *Role) IsActive() bool {
	return r.Status == RoleStatusActive
}

// HasPermission 检查角色是否拥有指定权限
func (r *Role) HasPermission(permissionName string) bool {
	for _, permission := range r.Permissions {
		if permission.Name == permissionName {
			return true
		}
	}
	return false
}

// Permission 权限模型
type Permission struct {
	ID          uint           `json:"id" gorm:"primaryKey"`
	Name        string         `json:"name" gorm:"uniqueIndex;size:100;not null" validate:"required,min=2,max=100"`
	DisplayName string         `json:"display_name" gorm:"size:100"`
	Description string         `json:"description" gorm:"size:255"`
	Resource    string         `json:"resource" gorm:"size:50;index"` // 资源类型
	Action      string         `json:"action" gorm:"size:50;index"`   // 操作类型
	IsSystem    bool           `json:"is_system" gorm:"default:false"` // 系统权限不可删除
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`

	// 关联关系
	Roles []Role `json:"roles,omitempty" gorm:"many2many:role_permissions;"`
}

// TableName 指定表名
func (Permission) TableName() string {
	return "permissions"
}

// UserRole 用户角色关联表
type UserRole struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"not null;index"`
	RoleID    uint      `json:"role_id" gorm:"not null;index"`
	CreatedAt time.Time `json:"created_at"`

	// 关联关系
	User User `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Role Role `json:"role,omitempty" gorm:"foreignKey:RoleID"`
}

// TableName 指定表名
func (UserRole) TableName() string {
	return "user_roles"
}

// RolePermission 角色权限关联表
type RolePermission struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	RoleID       uint      `json:"role_id" gorm:"not null;index"`
	PermissionID uint      `json:"permission_id" gorm:"not null;index"`
	CreatedAt    time.Time `json:"created_at"`

	// 关联关系
	Role       Role       `json:"role,omitempty" gorm:"foreignKey:RoleID"`
	Permission Permission `json:"permission,omitempty" gorm:"foreignKey:PermissionID"`
}

// TableName 指定表名
func (RolePermission) TableName() string {
	return "role_permissions"
}

// 预定义角色
const (
	RoleAdmin     = "admin"     // 超级管理员
	RoleUser      = "user"      // 普通用户
	RoleModerator = "moderator" // 版主
	RoleGuest     = "guest"     // 访客
)

// 预定义权限
const (
	// 用户管理权限
	PermissionUserView   = "user:view"   // 查看用户
	PermissionUserCreate = "user:create" // 创建用户
	PermissionUserUpdate = "user:update" // 更新用户
	PermissionUserDelete = "user:delete" // 删除用户

	// 角色管理权限
	PermissionRoleView   = "role:view"   // 查看角色
	PermissionRoleCreate = "role:create" // 创建角色
	PermissionRoleUpdate = "role:update" // 更新角色
	PermissionRoleDelete = "role:delete" // 删除角色

	// 权限管理权限
	PermissionPermissionView   = "permission:view"   // 查看权限
	PermissionPermissionCreate = "permission:create" // 创建权限
	PermissionPermissionUpdate = "permission:update" // 更新权限
	PermissionPermissionDelete = "permission:delete" // 删除权限

	// 系统管理权限
	PermissionSystemView    = "system:view"    // 查看系统信息
	PermissionSystemMonitor = "system:monitor" // 系统监控
	PermissionSystemConfig  = "system:config"  // 系统配置

	// 文件管理权限
	PermissionFileView   = "file:view"   // 查看文件
	PermissionFileCreate = "file:create" // 创建文件
	PermissionFileUpdate = "file:update" // 更新文件
	PermissionFileDelete = "file:delete" // 删除文件
	PermissionFileUpload = "file:upload" // 上传文件

	// 审计日志权限
	PermissionAuditView = "audit:view" // 查看审计日志
)
package model

import (
	"time"
)

// Session 会话模型
type Session struct {
	ID        string    `json:"id" gorm:"primaryKey;size:128"`
	UserID    uint      `json:"user_id" gorm:"not null;index"`
	Token     string    `json:"-" gorm:"uniqueIndex;not null;size:512"`
	IPAddress string    `json:"ip_address" gorm:"size:45"`
	UserAgent string    `json:"user_agent" gorm:"size:512"`
	ExpiresAt time.Time `json:"expires_at" gorm:"not null;index"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName 指定表名
func (Session) TableName() string {
	return "sessions"
}

// IsExpired 检查会话是否过期
func (s *Session) IsExpired() bool {
	return time.Now().After(s.ExpiresAt)
}

// AuditLog 审计日志模型
type AuditLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    *uint     `json:"user_id" gorm:"index"`
	Action    string    `json:"action" gorm:"not null;size:100"`
	Resource  string    `json:"resource" gorm:"size:100"`
	Details   string    `json:"details" gorm:"type:text"`
	IPAddress string    `json:"ip_address" gorm:"size:45"`
	UserAgent string    `json:"user_agent" gorm:"size:512"`
	Status    string    `json:"status" gorm:"size:20;default:success"`
	CreatedAt time.Time `json:"created_at" gorm:"index"`
}

// TableName 指定表名
func (AuditLog) TableName() string {
	return "audit_logs"
}

// SystemConfig 系统配置模型
type SystemConfig struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Key         string    `json:"key" gorm:"uniqueIndex;not null;size:100"`
	Value       string    `json:"value" gorm:"type:text"`
	Description string    `json:"description" gorm:"size:255"`
	Category    string    `json:"category" gorm:"size:50;index"`
	IsPublic    bool      `json:"is_public" gorm:"default:false"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName 指定表名
func (SystemConfig) TableName() string {
	return "system_configs"
}

// FileInfo 文件信息模型
type FileInfo struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name" gorm:"not null;size:255"`
	Path        string    `json:"path" gorm:"not null;size:1000;index"`
	Size        int64     `json:"size" gorm:"default:0"`
	FileType    string    `json:"file_type" gorm:"size:20"`
	FileExt     string    `json:"file_ext" gorm:"size:10"`
	IsDirectory bool      `json:"is_directory" gorm:"default:false"`
	Permissions string    `json:"permissions" gorm:"size:10"`
	Owner       string    `json:"owner" gorm:"size:50"`
	Group       string    `json:"group" gorm:"size:50"`
	Hidden      bool      `json:"hidden" gorm:"default:false"`
	ModTime     time.Time `json:"mod_time"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName 指定表名
func (FileInfo) TableName() string {
	return "file_infos"
}

// ProcessInfo 进程信息模型
type ProcessInfo struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	PID         int32     `json:"pid" gorm:"not null;index"`
	Name        string    `json:"name" gorm:"not null;size:255"`
	Cmdline     string    `json:"cmdline" gorm:"type:text"`
	Status      string    `json:"status" gorm:"size:20"`
	CPUPercent  float64   `json:"cpu_percent" gorm:"default:0"`
	MemoryMB    float64   `json:"memory_mb" gorm:"default:0"`
	CreateTime  time.Time `json:"create_time"`
	Username    string    `json:"username" gorm:"size:50"`
	IsRunning   bool      `json:"is_running" gorm:"default:true"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// TableName 指定表名
func (ProcessInfo) TableName() string {
	return "process_infos"
}

// SystemStats 系统统计信息（不存储到数据库）
type SystemStats struct {
	CPU    CPUStats    `json:"cpu"`
	Memory MemoryStats `json:"memory"`
	Disk   DiskStats   `json:"disk"`
	Load   LoadStats   `json:"load"`
	Uptime int64       `json:"uptime"`
}

// CPUStats CPU统计信息
type CPUStats struct {
	UsagePercent float64   `json:"usage_percent"`
	Cores        int       `json:"cores"`
	PerCore      []float64 `json:"per_core"`
}

// MemoryStats 内存统计信息
type MemoryStats struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Free        uint64  `json:"free"`
	UsedPercent float64 `json:"used_percent"`
	SwapTotal   uint64  `json:"swap_total"`
	SwapUsed    uint64  `json:"swap_used"`
	SwapFree    uint64  `json:"swap_free"`
}

// DiskStats 磁盘统计信息
type DiskStats struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Free        uint64  `json:"free"`
	UsedPercent float64 `json:"used_percent"`
}

// LoadStats 系统负载信息
type LoadStats struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

// NetworkStats 网络统计信息
type NetworkStats struct {
	BytesSent   uint64 `json:"bytes_sent"`
	BytesRecv   uint64 `json:"bytes_recv"`
	PacketsSent uint64 `json:"packets_sent"`
	PacketsRecv uint64 `json:"packets_recv"`
}

// APIResponse 通用API响应结构
type APIResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// PaginatedResponse 分页响应结构
type PaginatedResponse struct {
	Code     int         `json:"code"`
	Message  string      `json:"message"`
	Data     interface{} `json:"data"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	Size     int         `json:"size"`
	PageSize int         `json:"page_size"`
}

// ErrorResponse 错误响应
type ErrorResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

// 用户相关请求响应结构体

// CreateUserRequest 创建用户请求
type CreateUserRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Nickname string `json:"nickname" binding:"omitempty,max=50"`
	Phone    string `json:"phone" binding:"omitempty,max=20"`
	RoleIDs  []uint `json:"role_ids" binding:"required"`
}

// UpdateUserRequest 更新用户请求
type UpdateUserRequest struct {
	Username string `json:"username" binding:"omitempty,min=3,max=50"`
	Email    string `json:"email" binding:"omitempty,email"`
	Nickname string `json:"nickname" binding:"omitempty,max=50"`
	Phone    string `json:"phone" binding:"omitempty,max=20"`
	Status   *UserStatus `json:"status"`
	RoleIDs  []uint `json:"role_ids"`
}

// ChangePasswordRequest 修改密码请求
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ChangeUserStatusRequest 修改用户状态请求
type ChangeUserStatusRequest struct {
	Status UserStatus `json:"status" binding:"required"`
}

// ResetPasswordRequest 重置密码请求
type ResetPasswordRequest struct {
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse 登录响应
type LoginResponse struct {
	Token     string                 `json:"token"`
	ExpiresAt int64                  `json:"expires_at"`
	User      map[string]interface{} `json:"user"`
}

// CreateRoleRequest 创建角色请求
type CreateRoleRequest struct {
	Name           string `json:"name" binding:"required,min=2,max=50"`
	DisplayName    string `json:"display_name" binding:"required,max=100"`
	Description    string `json:"description" binding:"omitempty,max=255"`
	PermissionIDs  []uint `json:"permission_ids"`
}

// UpdateRoleRequest 更新角色请求
type UpdateRoleRequest struct {
	DisplayName   string      `json:"display_name" binding:"omitempty,max=100"`
	Description   string      `json:"description" binding:"omitempty,max=255"`
	Status        *RoleStatus `json:"status"`
	PermissionIDs []uint      `json:"permission_ids"`
}

// CreateDirectoryRequest 创建目录请求
type CreateDirectoryRequest struct {
	Path string `json:"path" binding:"required"`
	Name string `json:"name" binding:"required"`
}

// FileContentResponse 文件内容响应
type FileContentResponse struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// KillProcessRequest 终止进程请求
type KillProcessRequest struct {
	PID int32 `json:"pid" binding:"required"`
}

// DeleteFileRequest 删除文件请求
type DeleteFileRequest struct {
	Path string `json:"path" binding:"required"`
}

// RenameFileRequest 重命名文件请求
type RenameFileRequest struct {
	OldPath string `json:"old_path" binding:"required"`
	NewPath string `json:"new_path" binding:"required"`
}

// SaveFileContentRequest 保存文件内容请求
type SaveFileContentRequest struct {
	Path    string `json:"path" binding:"required"`
	Content string `json:"content"`
}
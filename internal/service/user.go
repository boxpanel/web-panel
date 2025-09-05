package service

import (
	"errors"
	"fmt"

	"web-panel-go/internal/database"
	"web-panel-go/internal/logger"
	"web-panel-go/internal/model"

	"gorm.io/gorm"
)

// UserService 用户服务
type UserService struct {
	db *gorm.DB
}

// NewUserService 创建用户服务实例
func NewUserService(db *gorm.DB) *UserService {
	return &UserService{db: db}
}

// GetUsers 获取用户列表
func (s *UserService) GetUsers(page, pageSize int, search string) ([]model.User, int64, error) {
	var users []model.User
	var total int64

	query := s.db.Model(&model.User{})

	// 搜索条件
	if search != "" {
		query = query.Where("username LIKE ? OR email LIKE ?", "%"+search+"%", "%"+search+"%")
	}

	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("获取用户总数失败: %w", err)
	}

	// 分页查询
	if err := query.Scopes(database.Paginate(page, pageSize)).Find(&users).Error; err != nil {
		return nil, 0, fmt.Errorf("查询用户列表失败: %w", err)
	}

	return users, total, nil
}

// GetUserByID 根据ID获取用户
func (s *UserService) GetUserByID(id uint) (*model.User, error) {
	var user model.User
	if err := s.db.First(&user, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, fmt.Errorf("查询用户失败: %w", err)
	}
	return &user, nil
}

// GetUserByUsername 根据用户名获取用户
func (s *UserService) GetUserByUsername(username string) (*model.User, error) {
	var user model.User
	if err := s.db.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, fmt.Errorf("查询用户失败: %w", err)
	}
	return &user, nil
}

// GetUserByEmail 根据邮箱获取用户
func (s *UserService) GetUserByEmail(email string) (*model.User, error) {
	var user model.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, fmt.Errorf("查询用户失败: %w", err)
	}
	return &user, nil
}

// CreateUser 创建用户
func (s *UserService) CreateUser(req *model.CreateUserRequest, operatorID uint, clientIP, userAgent string) (*model.User, error) {
	// 检查用户名是否已存在
	var existingUser model.User
	if err := s.db.Where("username = ?", req.Username).First(&existingUser).Error; err == nil {
		return nil, errors.New("用户名已存在")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("检查用户名失败: %w", err)
	}

	// 检查邮箱是否已存在
	if err := s.db.Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		return nil, errors.New("邮箱已存在")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("检查邮箱失败: %w", err)
	}

	// 创建用户
	user := &model.User{
		Username: req.Username,
		Email:    req.Email,
		Nickname: req.Nickname,
		Phone:    req.Phone,
		Status:   model.UserStatusActive,
	}

	// 设置密码
	if err := user.SetPassword(req.Password); err != nil {
		return nil, fmt.Errorf("设置密码失败: %w", err)
	}

	// 保存到数据库
	if err := s.db.Create(user).Error; err != nil {
		return nil, fmt.Errorf("创建用户失败: %w", err)
	}

	// 分配角色
	if len(req.RoleIDs) > 0 {
		for _, roleID := range req.RoleIDs {
			userRole := &model.UserRole{
				UserID: user.ID,
				RoleID: roleID,
			}
			if err := s.db.Create(userRole).Error; err != nil {
				logger.Error("分配角色失败", "error", err, "user_id", user.ID, "role_id", roleID)
			}
		}
	}

	// 记录审计日志
	s.logAuditAction(operatorID, "create_user", "user", fmt.Sprintf("创建用户: %s", user.Username), clientIP, userAgent, "success")

	logger.Info("创建用户成功", "username", user.Username, "operator", operatorID)
	return user, nil
}

// UpdateUser 更新用户
func (s *UserService) UpdateUser(id uint, req *model.UpdateUserRequest, operatorID uint, clientIP, userAgent string) (*model.User, error) {
	// 获取用户
	user, err := s.GetUserByID(id)
	if err != nil {
		return nil, err
	}

	// 检查用户名是否已被其他用户使用
	if req.Username != "" && req.Username != user.Username {
		var existingUser model.User
		if err := s.db.Where("username = ? AND id != ?", req.Username, id).First(&existingUser).Error; err == nil {
			return nil, errors.New("用户名已存在")
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("检查用户名失败: %w", err)
		}
		user.Username = req.Username
	}

	// 检查邮箱是否已被其他用户使用
	if req.Email != "" && req.Email != user.Email {
		var existingUser model.User
		if err := s.db.Where("email = ? AND id != ?", req.Email, id).First(&existingUser).Error; err == nil {
			return nil, errors.New("邮箱已存在")
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("检查邮箱失败: %w", err)
		}
		user.Email = req.Email
	}

	// 更新其他字段
	if req.Nickname != "" {
		user.Nickname = req.Nickname
	}
	if req.Phone != "" {
		user.Phone = req.Phone
	}
	if req.Status != nil {
		user.Status = *req.Status
	}

	// 更新角色
	if len(req.RoleIDs) > 0 {
		// 删除现有角色
		if err := s.db.Where("user_id = ?", user.ID).Delete(&model.UserRole{}).Error; err != nil {
			logger.Error("删除用户角色失败", "error", err, "user_id", user.ID)
		}
		// 添加新角色
		for _, roleID := range req.RoleIDs {
			userRole := &model.UserRole{
				UserID: user.ID,
				RoleID: roleID,
			}
			if err := s.db.Create(userRole).Error; err != nil {
				logger.Error("分配角色失败", "error", err, "user_id", user.ID, "role_id", roleID)
			}
		}
	}

	// 保存更新
	if err := s.db.Save(user).Error; err != nil {
		return nil, fmt.Errorf("更新用户失败: %w", err)
	}

	// 记录审计日志
	s.logAuditAction(operatorID, "update_user", "user", fmt.Sprintf("更新用户: %s", user.Username), clientIP, userAgent, "success")

	logger.Info("更新用户成功", "username", user.Username, "operator", operatorID)
	return user, nil
}

// DeleteUser 删除用户
func (s *UserService) DeleteUser(id uint, operatorID uint, clientIP, userAgent string) error {
	// 获取用户
	user, err := s.GetUserByID(id)
	if err != nil {
		return err
	}

	// 不能删除自己
	if id == operatorID {
		return errors.New("不能删除自己")
	}

	// 软删除用户
	if err := s.db.Delete(user).Error; err != nil {
		return fmt.Errorf("删除用户失败: %w", err)
	}

	// 删除用户的所有会话
	if err := s.db.Where("user_id = ?", id).Delete(&model.Session{}).Error; err != nil {
		logger.Error("删除用户会话失败", "error", err)
	}

	// 记录审计日志
	s.logAuditAction(operatorID, "delete_user", "user", fmt.Sprintf("删除用户: %s", user.Username), clientIP, userAgent, "success")

	logger.Info("删除用户成功", "username", user.Username, "operator", operatorID)
	return nil
}

// ToggleUserStatus 切换用户状态
func (s *UserService) ToggleUserStatus(id uint, operatorID uint, clientIP, userAgent string) (*model.User, error) {
	// 获取用户
	user, err := s.GetUserByID(id)
	if err != nil {
		return nil, err
	}

	// 不能禁用自己
	if id == operatorID {
		return nil, errors.New("不能禁用自己")
	}

	// 切换状态
	if user.Status == model.UserStatusActive {
		user.Status = model.UserStatusInactive
	} else {
		user.Status = model.UserStatusActive
	}

	// 保存更新
	if err := s.db.Save(user).Error; err != nil {
		return nil, fmt.Errorf("更新用户状态失败: %w", err)
	}

	// 如果禁用用户，删除其所有会话
	if user.Status == model.UserStatusInactive {
		if err := s.db.Where("user_id = ?", id).Delete(&model.Session{}).Error; err != nil {
			logger.Error("删除用户会话失败", "error", err)
		}
	}

	// 记录审计日志
	status := "启用"
	if user.Status == model.UserStatusInactive {
		status = "禁用"
	}
	s.logAuditAction(operatorID, "toggle_user_status", "user", fmt.Sprintf("%s用户: %s", status, user.Username), clientIP, userAgent, "success")

	logger.Info("切换用户状态成功", "username", user.Username, "status", user.IsActive, "operator", operatorID)
	return user, nil
}

// ChangeUserStatus 修改用户状态
func (s *UserService) ChangeUserStatus(id uint, status model.UserStatus, operatorID uint, clientIP, userAgent string) (*model.User, error) {
	// 获取用户
	user, err := s.GetUserByID(id)
	if err != nil {
		return nil, err
	}

	// 更新状态
	user.Status = status
	if err := s.db.Save(user).Error; err != nil {
		return nil, fmt.Errorf("更新用户状态失败: %w", err)
	}

	// 记录审计日志
	statusStr := "启用"
	if status == model.UserStatusInactive {
		statusStr = "禁用"
	}
	s.logAuditAction(operatorID, "修改用户状态", "用户", fmt.Sprintf("用户ID: %d, 状态: %s", id, statusStr), clientIP, userAgent, "成功")

	return user, nil
}

// ResetUserPassword 重置用户密码
func (s *UserService) ResetUserPassword(id uint, newPassword string, operatorID uint, clientIP, userAgent string) error {
	// 获取用户
	user, err := s.GetUserByID(id)
	if err != nil {
		return err
	}

	// 更新密码
	user.Password = newPassword
	if err := s.db.Save(user).Error; err != nil {
		return fmt.Errorf("重置用户密码失败: %w", err)
	}

	// 记录审计日志
	s.logAuditAction(operatorID, "重置用户密码", "用户", fmt.Sprintf("用户ID: %d", id), clientIP, userAgent, "成功")

	return nil
}

// GetUserStats 获取用户统计信息
func (s *UserService) GetUserStats() (map[string]interface{}, error) {
	var totalUsers int64
	var activeUsers int64
	var inactiveUsers int64

	// 获取总用户数
	if err := s.db.Model(&model.User{}).Count(&totalUsers).Error; err != nil {
		return nil, fmt.Errorf("获取总用户数失败: %w", err)
	}

	// 获取活跃用户数
	if err := s.db.Model(&model.User{}).Where("status = ?", model.UserStatusActive).Count(&activeUsers).Error; err != nil {
		return nil, fmt.Errorf("获取活跃用户数失败: %w", err)
	}

	// 获取非活跃用户数
	if err := s.db.Model(&model.User{}).Where("status = ?", model.UserStatusInactive).Count(&inactiveUsers).Error; err != nil {
		return nil, fmt.Errorf("获取非活跃用户数失败: %w", err)
	}

	return map[string]interface{}{
		"total":    totalUsers,
		"active":   activeUsers,
		"inactive": inactiveUsers,
	}, nil
}

// logAuditAction 记录审计日志
func (s *UserService) logAuditAction(userID uint, action, resource, details, clientIP, userAgent, status string) {
	auditLog := &model.AuditLog{
		UserID:    &userID,
		Action:    action,
		Resource:  resource,
		Details:   details,
		IPAddress: clientIP,
		UserAgent: userAgent,
		Status:    status,
	}

	if err := s.db.Create(auditLog).Error; err != nil {
		logger.Error("记录审计日志失败", "error", err)
	}
}
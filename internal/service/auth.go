package service

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"web-panel-go/internal/config"
	"web-panel-go/internal/logger"
	"web-panel-go/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// AuthService 认证服务
type AuthService struct {
	db     *gorm.DB
	config *config.Config
}

// NewAuthService 创建认证服务实例
func NewAuthService(db *gorm.DB, cfg *config.Config) *AuthService {
	return &AuthService{
		db:     db,
		config: cfg,
	}
}

// JWTClaims JWT声明
type JWTClaims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// Login 用户登录
func (s *AuthService) Login(req *model.LoginRequest, clientIP, userAgent string) (*model.LoginResponse, error) {
	// 查找用户
	var user model.User
	if err := s.db.Where("username = ? OR email = ?", req.Username, req.Username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			logger.LogAuth("login", req.Username, clientIP, false, "用户不存在")
			return nil, errors.New("用户名或密码错误")
		}
		return nil, fmt.Errorf("查询用户失败: %w", err)
	}

	// 检查用户是否激活
	if !user.IsActive() {
		logger.LogAuth("login", user.Username, clientIP, false, "用户已被禁用")
		return nil, errors.New("用户已被禁用")
	}

	// 验证密码
	if err := user.CheckPassword(req.Password); err != nil {
		logger.LogAuth("login", user.Username, clientIP, false, "密码错误")
		return nil, errors.New("用户名或密码错误")
	}

	// 生成JWT令牌
	token, expiresAt, err := s.GenerateToken(&user)
	if err != nil {
		return nil, fmt.Errorf("生成令牌失败: %w", err)
	}

	// 更新最后登录时间
	user.UpdateLastLogin()
	if err := s.db.Save(&user).Error; err != nil {
		logger.Error("更新用户最后登录时间失败", "error", err)
	}

	// 创建会话记录
	session := &model.Session{
		ID:        generateSessionID(),
		UserID:    user.ID,
		Token:     token,
		IPAddress: clientIP,
		UserAgent: userAgent,
		ExpiresAt: time.Unix(expiresAt, 0),
	}

	if err := s.db.Create(session).Error; err != nil {
		logger.Error("创建会话记录失败", "error", err)
	}

	// 记录审计日志
	s.logAuditAction(user.ID, "login", "user", "用户登录", clientIP, userAgent, "success")

	logger.LogAuth("login", user.Username, clientIP, true, "登录成功")

	return &model.LoginResponse{
		Token:     token,
		ExpiresAt: expiresAt,
		User:      user.ToSafeJSON(),
	}, nil
}

// Logout 用户登出
func (s *AuthService) Logout(token string, userID uint, clientIP, userAgent string) error {
	// 删除会话记录
	if err := s.db.Where("token = ? AND user_id = ?", token, userID).Delete(&model.Session{}).Error; err != nil {
		logger.Error("删除会话记录失败", "error", err)
	}

	// 记录审计日志
	s.logAuditAction(userID, "logout", "user", "用户登出", clientIP, userAgent, "success")

	return nil
}

// GenerateToken 生成JWT令牌
func (s *AuthService) GenerateToken(user *model.User) (string, int64, error) {
	expiresAt := time.Now().Add(s.config.Auth.JWTExpire).Unix()

	claims := &JWTClaims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.GetRole(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Unix(expiresAt, 0)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "web-panel-go",
			Subject:   strconv.Itoa(int(user.ID)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.config.Auth.JWTSecret))
	if err != nil {
		return "", 0, err
	}

	return tokenString, expiresAt, nil
}

// ValidateToken 验证JWT令牌
func (s *AuthService) ValidateToken(tokenString string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("意外的签名方法: %v", token.Header["alg"])
		}
		return []byte(s.config.Auth.JWTSecret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		// 检查会话是否存在且未过期
		var session model.Session
		if err := s.db.Where("token = ? AND user_id = ? AND expires_at > ?", tokenString, claims.UserID, time.Now()).First(&session).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, errors.New("会话不存在或已过期")
			}
			return nil, fmt.Errorf("查询会话失败: %w", err)
		}

		return claims, nil
	}

	return nil, errors.New("无效的令牌")
}

// GetUserByID 根据ID获取用户
func (s *AuthService) GetUserByID(userID uint) (*model.User, error) {
	var user model.User
	if err := s.db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("用户不存在")
		}
		return nil, fmt.Errorf("查询用户失败: %w", err)
	}

	if !user.IsActive() {
		return nil, errors.New("用户已被禁用")
	}

	return &user, nil
}

// ChangePassword 修改密码
func (s *AuthService) ChangePassword(userID uint, req *model.ChangePasswordRequest, clientIP, userAgent string) error {
	// 获取用户
	user, err := s.GetUserByID(userID)
	if err != nil {
		return err
	}

	// 验证旧密码
	if err := user.CheckPassword(req.OldPassword); err != nil {
		s.logAuditAction(userID, "change_password", "user", "修改密码失败：旧密码错误", clientIP, userAgent, "failed")
		return errors.New("旧密码错误")
	}

	// 设置新密码
	if err := user.SetPassword(req.NewPassword); err != nil {
		return fmt.Errorf("设置新密码失败: %w", err)
	}

	// 保存用户
	if err := s.db.Save(user).Error; err != nil {
		return fmt.Errorf("保存用户失败: %w", err)
	}

	// 删除所有会话（强制重新登录）
	if err := s.db.Where("user_id = ?", userID).Delete(&model.Session{}).Error; err != nil {
		logger.Error("删除用户会话失败", "error", err)
	}

	// 记录审计日志
	s.logAuditAction(userID, "change_password", "user", "修改密码成功", clientIP, userAgent, "success")

	return nil
}

// CleanExpiredSessions 清理过期会话
func (s *AuthService) CleanExpiredSessions() error {
	result := s.db.Where("expires_at < ?", time.Now()).Delete(&model.Session{})
	if result.Error != nil {
		return fmt.Errorf("清理过期会话失败: %w", result.Error)
	}

	if result.RowsAffected > 0 {
		logger.Info("清理过期会话", "count", result.RowsAffected)
	}

	return nil
}

// logAuditAction 记录审计日志
func (s *AuthService) logAuditAction(userID uint, action, resource, details, clientIP, userAgent, status string) {
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

// generateSessionID 生成会话ID
func generateSessionID() string {
	return fmt.Sprintf("sess_%d_%d", time.Now().UnixNano(), time.Now().Unix())
}
package model

import (
	"errors"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// User 用户模型的辅助方法

// SetPassword 设置密码（加密）
func (u *User) SetPassword(password string) error {
	if len(password) < 6 {
		return errors.New("密码长度不能少于6位")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	u.Password = string(hashed)
	return nil
}

// CheckPassword 验证密码
func (u *User) CheckPassword(password string) error {
	return bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password))
}

// UpdateLastLogin 更新最后登录时间
func (u *User) UpdateLastLogin() {
	now := time.Now()
	u.LastLogin = &now
}

// GetRole 获取用户角色
func (u *User) GetRole() string {
	if len(u.Roles) > 0 {
		return u.Roles[0].Name
	}
	return "user"
}

// ToSafeJSON 返回安全的用户信息（不包含密码）
func (u *User) ToSafeJSON() map[string]interface{} {
	return map[string]interface{}{
		"id":         u.ID,
		"username":   u.Username,
		"email":      u.Email,
		"nickname":   u.Nickname,
		"avatar":     u.Avatar,
		"phone":      u.Phone,
		"status":     u.Status,
		"last_login": u.LastLogin,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	}
}
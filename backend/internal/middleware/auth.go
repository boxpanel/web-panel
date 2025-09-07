package middleware

import (
	"net/http"
	"strings"

	"web-panel-go/internal/logger"
	"web-panel-go/internal/model"
	"web-panel-go/internal/service"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware 认证中间件
func AuthMiddleware(authService *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取Authorization头
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, model.ErrorResponse{
				Code:    http.StatusUnauthorized,
				Message: "缺少认证令牌",
			})
			c.Abort()
			return
		}

		// 检查Bearer前缀
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, model.ErrorResponse{
				Code:    http.StatusUnauthorized,
				Message: "无效的认证令牌格式",
			})
			c.Abort()
			return
		}

		// 提取令牌
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == "" {
			c.JSON(http.StatusUnauthorized, model.ErrorResponse{
				Code:    http.StatusUnauthorized,
				Message: "认证令牌为空",
			})
			c.Abort()
			return
		}

		// 验证令牌
		claims, err := authService.ValidateToken(token)
		if err != nil {
			logger.Warn("令牌验证失败", "error", err.Error(), "ip", c.ClientIP())
			c.JSON(http.StatusUnauthorized, model.ErrorResponse{
				Code:    http.StatusUnauthorized,
				Message: "认证令牌无效或已过期",
				Error:   err.Error(),
			})
			c.Abort()
			return
		}

		// 获取用户信息
		user, err := authService.GetUserByID(claims.UserID)
		if err != nil {
			logger.Warn("获取用户信息失败", "user_id", claims.UserID, "error", err.Error())
			c.JSON(http.StatusUnauthorized, model.ErrorResponse{
				Code:    http.StatusUnauthorized,
				Message: "用户不存在或已被禁用",
			})
			c.Abort()
			return
		}

		// 将用户信息和令牌存储到上下文
		c.Set("user", user)
		c.Set("user_id", user.ID)
		c.Set("username", user.Username)
		c.Set("user_role", user.GetRole())
		c.Set("token", token)

		c.Next()
	}
}

// RequireRole 角色权限中间件
func RequireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, model.ErrorResponse{
				Code:    http.StatusUnauthorized,
				Message: "未认证的用户",
			})
			c.Abort()
			return
		}

		u := user.(*model.User)
		userRole := u.GetRole()

		// 检查用户角色
		for _, role := range roles {
			if userRole == role {
				c.Next()
				return
			}
		}

		// 管理员拥有所有权限
		if userRole == model.RoleAdmin {
			c.Next()
			return
		}

		logger.Warn("用户权限不足", "user_id", u.ID, "user_role", u.GetRole(), "required_roles", roles)
		c.JSON(http.StatusForbidden, model.ErrorResponse{
			Code:    http.StatusForbidden,
			Message: "权限不足",
		})
		c.Abort()
	}
}

// RequirePermission 权限检查中间件
func RequirePermission(permissions ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, model.ErrorResponse{
				Code:    http.StatusUnauthorized,
				Message: "未认证的用户",
			})
			c.Abort()
			return
		}

		u := user.(*model.User)

		// 管理员拥有所有权限
		if u.IsAdmin() {
			c.Next()
			return
		}

		// 检查用户权限
		for _, permission := range permissions {
			if u.HasPermission(permission) {
				c.Next()
				return
			}
		}

		logger.Warn("用户权限不足", "user_id", u.ID, "required_permissions", permissions)
		c.JSON(http.StatusForbidden, model.ErrorResponse{
			Code:    http.StatusForbidden,
			Message: "权限不足",
		})
		c.Abort()
	}
}

// AdminOnly 仅管理员中间件
func AdminOnly() gin.HandlerFunc {
	return RequireRole("admin")
}

// GetCurrentUser 获取当前用户
func GetCurrentUser(c *gin.Context) (*model.User, bool) {
	user, exists := c.Get("user")
	if !exists {
		return nil, false
	}
	return user.(*model.User), true
}

// GetCurrentUserID 获取当前用户ID
func GetCurrentUserID(c *gin.Context) (uint, bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		return 0, false
	}
	return userID.(uint), true
}

// GetCurrentToken 获取当前令牌
func GetCurrentToken(c *gin.Context) (string, bool) {
	token, exists := c.Get("token")
	if !exists {
		return "", false
	}
	return token.(string), true
}
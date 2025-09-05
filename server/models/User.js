const bcrypt = require('bcryptjs');
const database = require('../utils/database');

// 用户模型类
class User {
  constructor(data) {
    this.id = data.id;
    this.username = data.username;
    this.email = data.email;
    this.password = data.password; // 已加密的密码
    this.role = data.role || 'user';
    this.permissions = data.permissions || [];
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.lastLogin = data.lastLogin;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  // 验证密码
  async validatePassword(password) {
    return await bcrypt.compare(password, this.password);
  }

  // 更新最后登录时间
  updateLastLogin() {
    this.lastLogin = new Date();
    this.updatedAt = new Date();
  }

  // 转换为安全的JSON对象（不包含密码）
  toSafeJSON() {
    const { password, ...safeData } = this;
    return safeData;
  }

  // 检查用户是否有特定权限
  hasPermission(permission) {
    if (this.role === 'admin') {
      return true; // 管理员拥有所有权限
    }
    return this.permissions.includes(permission);
  }

  // 检查用户角色
  hasRole(role) {
    return this.role === role;
  }

  // 保存用户到数据库
  async save() {
    try {
      this.updatedAt = new Date();
      if (this.id) {
        // 更新现有用户
        await database.run(
          `UPDATE users SET username = ?, email = ?, password = ?, role = ?, 
           status = ?, last_login = ?, updated_at = ? WHERE id = ?`,
          [this.username, this.email, this.password, this.role, 
           this.isActive ? 'active' : 'inactive', this.lastLogin, this.updatedAt, this.id]
        );
      } else {
        // 创建新用户
        this.createdAt = new Date();
        const result = await database.run(
          `INSERT INTO users (username, email, password, role, status, last_login, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [this.username, this.email, this.password, this.role, 
           this.isActive ? 'active' : 'inactive', this.lastLogin, this.createdAt, this.updatedAt]
        );
        this.id = result.id;
      }
      return true;
    } catch (error) {
      console.error('保存用户失败:', error);
      return false;
    }
  }

  // 静态方法：根据用户名查找用户
  static async findByUsername(username) {
    try {
      const row = await database.get('SELECT * FROM users WHERE username = ?', [username]);
      return row ? new User({
        ...row,
        isActive: row.status === 'active',
        lastLogin: row.last_login ? new Date(row.last_login) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }) : null;
    } catch (error) {
      console.error('查找用户失败:', error);
      return null;
    }
  }

  // 静态方法：根据ID查找用户
  static async findById(id) {
    try {
      const row = await database.get('SELECT * FROM users WHERE id = ?', [id]);
      return row ? new User({
        ...row,
        isActive: row.status === 'active',
        lastLogin: row.last_login ? new Date(row.last_login) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }) : null;
    } catch (error) {
      console.error('查找用户失败:', error);
      return null;
    }
  }

  // 静态方法：根据邮箱查找用户
  static async findByEmail(email) {
    try {
      const row = await database.get('SELECT * FROM users WHERE email = ?', [email]);
      return row ? new User({
        ...row,
        isActive: row.status === 'active',
        lastLogin: row.last_login ? new Date(row.last_login) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }) : null;
    } catch (error) {
      console.error('查找用户失败:', error);
      return null;
    }
  }

  // 静态方法：创建新用户
  static async create(userData) {
    try {
      // 检查用户名是否已存在
      const existingUser = await this.findByUsername(userData.username);
      if (existingUser) {
        throw new Error('用户名已存在');
      }
      
      // 检查邮箱是否已存在
      if (userData.email) {
        const existingEmail = await this.findByEmail(userData.email);
        if (existingEmail) {
          throw new Error('邮箱已存在');
        }
      }
      
      // 加密密码
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      // 创建新用户
      const newUser = new User({
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        role: userData.role || 'user',
        permissions: userData.permissions || [],
        isActive: userData.isActive !== undefined ? userData.isActive : true
      });
      
      const success = await newUser.save();
      
      if (success) {
        return newUser;
      } else {
        throw new Error('创建用户失败');
      }
    } catch (error) {
      console.error('创建用户失败:', error);
      throw error;
    }
  }

  // 静态方法：更新用户
  static async update(id, updateData) {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new Error('用户不存在');
      }
      
      // 检查用户名冲突
      if (updateData.username && updateData.username !== user.username) {
        const existingUser = await this.findByUsername(updateData.username);
        if (existingUser && existingUser.id !== id) {
          throw new Error('用户名已存在');
        }
      }
      
      // 检查邮箱冲突
      if (updateData.email && updateData.email !== user.email) {
        const existingEmail = await this.findByEmail(updateData.email);
        if (existingEmail && existingEmail.id !== id) {
          throw new Error('邮箱已存在');
        }
      }
      
      // 更新用户数据
      if (updateData.username !== undefined) user.username = updateData.username;
      if (updateData.email !== undefined) user.email = updateData.email;
      if (updateData.password) {
        user.password = await bcrypt.hash(updateData.password, 10);
      }
      if (updateData.role !== undefined) user.role = updateData.role;
      if (updateData.permissions !== undefined) user.permissions = updateData.permissions;
      if (updateData.isActive !== undefined) user.isActive = updateData.isActive;
      
      const success = await user.save();
      
      if (success) {
        return user;
      } else {
        throw new Error('更新用户失败');
      }
    } catch (error) {
      console.error('更新用户失败:', error);
      throw error;
    }
  }

  // 静态方法：删除用户
  static async delete(id) {
    try {
      const user = await this.findById(id);
      if (!user) {
        throw new Error('用户不存在');
      }
      
      await database.run('DELETE FROM users WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('删除用户失败:', error);
      throw error;
    }
  }

  // 静态方法：获取所有用户
  static async getAll() {
    try {
      const rows = await database.all('SELECT * FROM users ORDER BY created_at DESC');
      return rows.map(row => new User({
        ...row,
        isActive: row.status === 'active',
        lastLogin: row.last_login ? new Date(row.last_login) : null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }));
    } catch (error) {
      console.error('获取用户列表失败:', error);
      return [];
    }
  }

  // 静态方法：验证用户登录
  static async authenticate(username, password) {
    const user = await this.findByUsername(username);
    
    if (!user) {
      throw new Error('用户不存在');
    }
    
    if (!user.isActive) {
      throw new Error('用户账户已被禁用');
    }
    
    const isValid = await user.validatePassword(password);
    
    if (!isValid) {
      throw new Error('密码错误');
    }
    
    // 更新最后登录时间
    user.updateLastLogin();
    await user.save();
    
    return user;
  }

  // 静态方法：初始化默认管理员用户
  static async initializeDefaultAdmin() {
    try {
      const rows = await database.all('SELECT * FROM users WHERE role = ?', ['admin']);
      
      // 检查是否已有管理员用户
      if (rows.length === 0) {
        await this.create({
          username: 'admin',
          email: 'admin@localhost',
          password: 'admin123',
          role: 'admin',
          permissions: ['*'] // 所有权限
        });
        console.log('默认管理员用户已创建: admin/admin123');
      }
    } catch (error) {
      console.error('创建默认管理员用户失败:', error);
    }
  }

  // 静态方法：获取用户统计信息
  static async getStats() {
    try {
      const users = await this.getAll();
      
      return {
        total: users.length,
        active: users.filter(user => user.isActive).length,
        inactive: users.filter(user => !user.isActive).length,
        admins: users.filter(user => user.role === 'admin').length,
        users: users.filter(user => user.role === 'user').length,
        recentLogins: users.filter(user => {
          if (!user.lastLogin) return false;
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          return new Date(user.lastLogin) > dayAgo;
        }).length
      };
    } catch (error) {
      console.error('获取用户统计信息失败:', error);
      return {
        total: 0,
        active: 0,
        inactive: 0,
        admins: 0,
        users: 0,
        recentLogins: 0
      };
    }
  }
}

// 权限常量
User.PERMISSIONS = {
  SYSTEM_VIEW: 'system:view',
  SYSTEM_MANAGE: 'system:manage',
  PROCESS_VIEW: 'process:view',
  PROCESS_MANAGE: 'process:manage',
  FILE_VIEW: 'file:view',
  FILE_MANAGE: 'file:manage',
  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_MANAGE: 'settings:manage'
};

// 角色常量
User.ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
};

module.exports = User;
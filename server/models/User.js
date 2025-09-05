const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// 用户数据文件路径
const USERS_FILE = path.join(__dirname, '../data/users.json');
const DATA_DIR = path.join(__dirname, '../data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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

  // 静态方法：加载所有用户
  static loadUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        const usersData = JSON.parse(data);
        return usersData.map(userData => new User(userData));
      }
      return [];
    } catch (error) {
      console.error('加载用户数据失败:', error);
      return [];
    }
  }

  // 静态方法：保存所有用户
  static saveUsers(users) {
    try {
      const usersData = users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        password: user.password,
        role: user.role,
        permissions: user.permissions,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));
      
      fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2));
      return true;
    } catch (error) {
      console.error('保存用户数据失败:', error);
      return false;
    }
  }

  // 静态方法：根据用户名查找用户
  static findByUsername(username) {
    const users = this.loadUsers();
    return users.find(user => user.username === username);
  }

  // 静态方法：根据ID查找用户
  static findById(id) {
    const users = this.loadUsers();
    return users.find(user => user.id === id);
  }

  // 静态方法：根据邮箱查找用户
  static findByEmail(email) {
    const users = this.loadUsers();
    return users.find(user => user.email === email);
  }

  // 静态方法：创建新用户
  static async create(userData) {
    const users = this.loadUsers();
    
    // 检查用户名是否已存在
    if (users.find(user => user.username === userData.username)) {
      throw new Error('用户名已存在');
    }
    
    // 检查邮箱是否已存在
    if (userData.email && users.find(user => user.email === userData.email)) {
      throw new Error('邮箱已存在');
    }
    
    // 生成新的用户ID
    const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    // 创建新用户
    const newUser = new User({
      id: newId,
      username: userData.username,
      email: userData.email,
      password: hashedPassword,
      role: userData.role || 'user',
      permissions: userData.permissions || [],
      isActive: userData.isActive !== undefined ? userData.isActive : true
    });
    
    users.push(newUser);
    
    if (this.saveUsers(users)) {
      return newUser;
    } else {
      throw new Error('创建用户失败');
    }
  }

  // 静态方法：更新用户
  static async update(id, updateData) {
    const users = this.loadUsers();
    const userIndex = users.findIndex(user => user.id === id);
    
    if (userIndex === -1) {
      throw new Error('用户不存在');
    }
    
    const user = users[userIndex];
    
    // 检查用户名冲突
    if (updateData.username && updateData.username !== user.username) {
      if (users.find(u => u.username === updateData.username && u.id !== id)) {
        throw new Error('用户名已存在');
      }
      user.username = updateData.username;
    }
    
    // 检查邮箱冲突
    if (updateData.email && updateData.email !== user.email) {
      if (users.find(u => u.email === updateData.email && u.id !== id)) {
        throw new Error('邮箱已存在');
      }
      user.email = updateData.email;
    }
    
    // 更新密码
    if (updateData.password) {
      user.password = await bcrypt.hash(updateData.password, 10);
    }
    
    // 更新其他字段
    if (updateData.role !== undefined) user.role = updateData.role;
    if (updateData.permissions !== undefined) user.permissions = updateData.permissions;
    if (updateData.isActive !== undefined) user.isActive = updateData.isActive;
    
    user.updatedAt = new Date();
    
    if (this.saveUsers(users)) {
      return user;
    } else {
      throw new Error('更新用户失败');
    }
  }

  // 静态方法：删除用户
  static delete(id) {
    const users = this.loadUsers();
    const userIndex = users.findIndex(user => user.id === id);
    
    if (userIndex === -1) {
      throw new Error('用户不存在');
    }
    
    users.splice(userIndex, 1);
    
    if (this.saveUsers(users)) {
      return true;
    } else {
      throw new Error('删除用户失败');
    }
  }

  // 静态方法：获取所有用户
  static getAll() {
    return this.loadUsers();
  }

  // 静态方法：验证用户登录
  static async authenticate(username, password) {
    const user = this.findByUsername(username);
    
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
    const users = this.loadUsers();
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      users[userIndex] = user;
      this.saveUsers(users);
    }
    
    return user;
  }

  // 静态方法：初始化默认管理员用户
  static async initializeDefaultAdmin() {
    const users = this.loadUsers();
    
    // 检查是否已有管理员用户
    const adminExists = users.some(user => user.role === 'admin');
    
    if (!adminExists) {
      try {
        await this.create({
          username: 'admin',
          email: 'admin@localhost',
          password: 'admin123',
          role: 'admin',
          permissions: ['*'] // 所有权限
        });
        console.log('默认管理员用户已创建: admin/admin123');
      } catch (error) {
        console.error('创建默认管理员用户失败:', error);
      }
    }
  }

  // 静态方法：获取用户统计信息
  static getStats() {
    const users = this.loadUsers();
    
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
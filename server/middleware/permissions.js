const User = require('../models/User');

// 权限检查中间件
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证用户'
      });
    }

    // 获取用户完整信息
    const user = User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查用户是否激活
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: '用户账户已被禁用'
      });
    }

    // 检查权限
    if (!user.hasPermission(permission)) {
      return res.status(403).json({
        success: false,
        message: '权限不足',
        required: permission
      });
    }

    // 将完整用户信息添加到请求对象
    req.userInfo = user;
    next();
  };
};

// 角色检查中间件
const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证用户'
      });
    }

    const user = User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: '用户账户已被禁用'
      });
    }

    if (!user.hasRole(role)) {
      return res.status(403).json({
        success: false,
        message: '角色权限不足',
        required: role,
        current: user.role
      });
    }

    req.userInfo = user;
    next();
  };
};

// 多权限检查中间件（需要所有权限）
const requireAllPermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证用户'
      });
    }

    const user = User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: '用户账户已被禁用'
      });
    }

    const missingPermissions = permissions.filter(permission => !user.hasPermission(permission));
    if (missingPermissions.length > 0) {
      return res.status(403).json({
        success: false,
        message: '权限不足',
        missing: missingPermissions
      });
    }

    req.userInfo = user;
    next();
  };
};

// 多权限检查中间件（需要任一权限）
const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证用户'
      });
    }

    const user = User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: '用户账户已被禁用'
      });
    }

    const hasAnyPermission = permissions.some(permission => user.hasPermission(permission));
    if (!hasAnyPermission) {
      return res.status(403).json({
        success: false,
        message: '权限不足',
        required: permissions
      });
    }

    req.userInfo = user;
    next();
  };
};

// 管理员权限检查
const requireAdmin = requireRole(User.ROLES.ADMIN);

// 用户自己或管理员权限检查
const requireSelfOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: '未认证用户'
    });
  }

  const user = User.findById(req.user.id);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: '用户不存在'
    });
  }

  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: '用户账户已被禁用'
    });
  }

  const targetUserId = parseInt(req.params.id || req.params.userId);
  const isAdmin = user.hasRole(User.ROLES.ADMIN);
  const isSelf = user.id === targetUserId;

  if (!isAdmin && !isSelf) {
    return res.status(403).json({
      success: false,
      message: '只能访问自己的信息或需要管理员权限'
    });
  }

  req.userInfo = user;
  req.isAdmin = isAdmin;
  req.isSelf = isSelf;
  next();
};

// 权限装饰器工厂
const createPermissionDecorator = (permission) => {
  return (target, propertyKey, descriptor) => {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(req, res, next) {
      const middleware = requirePermission(permission);
      middleware(req, res, (err) => {
        if (err) return next(err);
        return originalMethod.call(this, req, res, next);
      });
    };
    
    return descriptor;
  };
};

// 权限验证工具函数
const checkPermission = (user, permission) => {
  if (!user || !user.isActive) {
    return false;
  }
  return user.hasPermission(permission);
};

// 获取用户权限列表
const getUserPermissions = (user) => {
  if (!user || !user.isActive) {
    return [];
  }
  
  if (user.role === User.ROLES.ADMIN) {
    return Object.values(User.PERMISSIONS);
  }
  
  return user.permissions || [];
};

// 权限常量映射
const PERMISSION_DESCRIPTIONS = {
  [User.PERMISSIONS.SYSTEM_VIEW]: '查看系统信息',
  [User.PERMISSIONS.SYSTEM_MANAGE]: '管理系统设置',
  [User.PERMISSIONS.PROCESS_VIEW]: '查看进程信息',
  [User.PERMISSIONS.PROCESS_MANAGE]: '管理系统进程',
  [User.PERMISSIONS.FILE_VIEW]: '查看文件',
  [User.PERMISSIONS.FILE_MANAGE]: '管理文件',
  [User.PERMISSIONS.USER_VIEW]: '查看用户信息',
  [User.PERMISSIONS.USER_MANAGE]: '管理用户',
  [User.PERMISSIONS.SETTINGS_VIEW]: '查看设置',
  [User.PERMISSIONS.SETTINGS_MANAGE]: '管理设置'
};

// 角色权限映射
const ROLE_PERMISSIONS = {
  [User.ROLES.ADMIN]: Object.values(User.PERMISSIONS),
  [User.ROLES.USER]: [
    User.PERMISSIONS.SYSTEM_VIEW,
    User.PERMISSIONS.PROCESS_VIEW,
    User.PERMISSIONS.FILE_VIEW,
    User.PERMISSIONS.FILE_MANAGE
  ],
  [User.ROLES.VIEWER]: [
    User.PERMISSIONS.SYSTEM_VIEW,
    User.PERMISSIONS.PROCESS_VIEW,
    User.PERMISSIONS.FILE_VIEW
  ]
};

// 获取角色默认权限
const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role] || [];
};

// 权限验证中间件组合
const permissions = {
  // 系统相关
  viewSystem: requirePermission(User.PERMISSIONS.SYSTEM_VIEW),
  manageSystem: requirePermission(User.PERMISSIONS.SYSTEM_MANAGE),
  
  // 进程相关
  viewProcess: requirePermission(User.PERMISSIONS.PROCESS_VIEW),
  manageProcess: requirePermission(User.PERMISSIONS.PROCESS_MANAGE),
  
  // 文件相关
  viewFile: requirePermission(User.PERMISSIONS.FILE_VIEW),
  manageFile: requirePermission(User.PERMISSIONS.FILE_MANAGE),
  
  // 用户相关
  viewUser: requirePermission(User.PERMISSIONS.USER_VIEW),
  manageUser: requirePermission(User.PERMISSIONS.USER_MANAGE),
  
  // 设置相关
  viewSettings: requirePermission(User.PERMISSIONS.SETTINGS_VIEW),
  manageSettings: requirePermission(User.PERMISSIONS.SETTINGS_MANAGE),
  
  // 角色相关
  admin: requireAdmin,
  selfOrAdmin: requireSelfOrAdmin
};

module.exports = {
  requirePermission,
  requireRole,
  requireAllPermissions,
  requireAnyPermission,
  requireAdmin,
  requireSelfOrAdmin,
  createPermissionDecorator,
  checkPermission,
  getUserPermissions,
  getRolePermissions,
  permissions,
  PERMISSION_DESCRIPTIONS,
  ROLE_PERMISSIONS
};
const express = require('express');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { permissions, getUserPermissions, getRolePermissions } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

// 获取所有用户（仅管理员）
router.get('/', authenticateToken, permissions.viewUser, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, role, status } = req.query;
  
  let users = User.getAll();
  
  // 搜索过滤
  if (search) {
    const searchLower = search.toLowerCase();
    users = users.filter(user => 
      user.username.toLowerCase().includes(searchLower) ||
      (user.email && user.email.toLowerCase().includes(searchLower))
    );
  }
  
  // 角色过滤
  if (role) {
    users = users.filter(user => user.role === role);
  }
  
  // 状态过滤
  if (status) {
    const isActive = status === 'active';
    users = users.filter(user => user.isActive === isActive);
  }
  
  // 分页
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + parseInt(limit);
  const paginatedUsers = users.slice(startIndex, endIndex);
  
  res.json({
    success: true,
    data: {
      users: paginatedUsers.map(user => user.toSafeJSON()),
      pagination: {
        current: parseInt(page),
        pageSize: parseInt(limit),
        total: users.length,
        totalPages: Math.ceil(users.length / limit)
      }
    }
  });
}));

// 获取单个用户信息
router.get('/:id', authenticateToken, permissions.selfOrAdmin, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const user = User.findById(userId);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用户不存在'
    });
  }
  
  res.json({
    success: true,
    data: {
      user: user.toSafeJSON(),
      permissions: getUserPermissions(user)
    }
  });
}));

// 创建新用户（仅管理员）
router.post('/', authenticateToken, permissions.manageUser, asyncHandler(async (req, res) => {
  const { username, email, password, role, permissions: userPermissions, isActive } = req.body;
  
  // 验证必填字段
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: '用户名和密码不能为空'
    });
  }
  
  // 验证角色
  if (role && !Object.values(User.ROLES).includes(role)) {
    return res.status(400).json({
      success: false,
      message: '无效的用户角色'
    });
  }
  
  try {
    const newUser = await User.create({
      username,
      email,
      password,
      role: role || User.ROLES.USER,
      permissions: userPermissions || getRolePermissions(role || User.ROLES.USER),
      isActive: isActive !== undefined ? isActive : true
    });
    
    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: {
        user: newUser.toSafeJSON()
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}));

// 更新用户信息
router.put('/:id', authenticateToken, permissions.selfOrAdmin, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const { username, email, role, permissions: userPermissions, isActive } = req.body;
  const currentUser = req.userInfo;
  
  // 检查用户是否存在
  const targetUser = User.findById(userId);
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: '用户不存在'
    });
  }
  
  // 非管理员用户只能修改自己的基本信息
  if (!req.isAdmin && req.user.id !== userId) {
    return res.status(403).json({
      success: false,
      message: '权限不足'
    });
  }
  
  const updateData = {};
  
  // 普通用户只能修改邮箱
  if (!req.isAdmin) {
    if (email !== undefined) updateData.email = email;
  } else {
    // 管理员可以修改所有字段
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) {
      if (!Object.values(User.ROLES).includes(role)) {
        return res.status(400).json({
          success: false,
          message: '无效的用户角色'
        });
      }
      updateData.role = role;
    }
    if (userPermissions !== undefined) updateData.permissions = userPermissions;
    if (isActive !== undefined) updateData.isActive = isActive;
  }
  
  try {
    const updatedUser = await User.update(userId, updateData);
    
    res.json({
      success: true,
      message: '用户信息更新成功',
      data: {
        user: updatedUser.toSafeJSON()
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}));

// 删除用户（仅管理员）
router.delete('/:id', authenticateToken, permissions.manageUser, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const currentUser = req.userInfo;
  
  // 不能删除自己
  if (currentUser.id === userId) {
    return res.status(400).json({
      success: false,
      message: '不能删除自己的账户'
    });
  }
  
  // 检查用户是否存在
  const targetUser = User.findById(userId);
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: '用户不存在'
    });
  }
  
  try {
    await User.delete(userId);
    
    res.json({
      success: true,
      message: '用户删除成功'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}));

// 重置用户密码（仅管理员）
router.post('/:id/reset-password', authenticateToken, permissions.manageUser, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const { newPassword } = req.body;
  
  if (!newPassword) {
    return res.status(400).json({
      success: false,
      message: '新密码不能为空'
    });
  }
  
  // 检查用户是否存在
  const targetUser = User.findById(userId);
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: '用户不存在'
    });
  }
  
  try {
    await User.update(userId, { password: newPassword });
    
    res.json({
      success: true,
      message: '密码重置成功'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}));

// 启用/禁用用户（仅管理员）
router.patch('/:id/status', authenticateToken, permissions.manageUser, asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  const { isActive } = req.body;
  const currentUser = req.userInfo;
  
  // 不能禁用自己
  if (currentUser.id === userId && isActive === false) {
    return res.status(400).json({
      success: false,
      message: '不能禁用自己的账户'
    });
  }
  
  // 检查用户是否存在
  const targetUser = User.findById(userId);
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: '用户不存在'
    });
  }
  
  try {
    const updatedUser = await User.update(userId, { isActive });
    
    res.json({
      success: true,
      message: `用户已${isActive ? '启用' : '禁用'}`,
      data: {
        user: updatedUser.toSafeJSON()
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}));

// 获取用户统计信息（仅管理员）
router.get('/stats/overview', authenticateToken, permissions.viewUser, (req, res) => {
  const stats = User.getStats();
  
  res.json({
    success: true,
    data: stats
  });
});

// 获取可用角色列表
router.get('/roles/list', authenticateToken, permissions.viewUser, (req, res) => {
  const roles = Object.entries(User.ROLES).map(([key, value]) => ({
    key,
    value,
    permissions: getRolePermissions(value)
  }));
  
  res.json({
    success: true,
    data: {
      roles
    }
  });
});

// 获取可用权限列表
router.get('/permissions/list', authenticateToken, permissions.viewUser, (req, res) => {
  const permissions = Object.entries(User.PERMISSIONS).map(([key, value]) => ({
    key,
    value,
    description: value.replace(':', ' - ')
  }));
  
  res.json({
    success: true,
    data: {
      permissions
    }
  });
});

// 批量操作用户（仅管理员）
router.post('/batch', authenticateToken, permissions.manageUser, asyncHandler(async (req, res) => {
  const { action, userIds } = req.body;
  const currentUser = req.userInfo;
  
  if (!action || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: '操作类型和用户ID列表不能为空'
    });
  }
  
  // 不能对自己执行批量操作
  if (userIds.includes(currentUser.id)) {
    return res.status(400).json({
      success: false,
      message: '不能对自己执行批量操作'
    });
  }
  
  const results = {
    success: [],
    failed: []
  };
  
  try {
    for (const userId of userIds) {
      try {
        const user = User.findById(parseInt(userId));
        if (!user) {
          results.failed.push({ userId, reason: '用户不存在' });
          continue;
        }
        
        switch (action) {
          case 'activate':
            await User.update(parseInt(userId), { isActive: true });
            results.success.push({ userId, action: '启用' });
            break;
          case 'deactivate':
            await User.update(parseInt(userId), { isActive: false });
            results.success.push({ userId, action: '禁用' });
            break;
          case 'delete':
            await User.delete(parseInt(userId));
            results.success.push({ userId, action: '删除' });
            break;
          default:
            results.failed.push({ userId, reason: '无效的操作类型' });
        }
      } catch (error) {
        results.failed.push({ userId, reason: error.message });
      }
    }
    
    res.json({
      success: true,
      message: '批量操作完成',
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '批量操作失败',
      error: error.message
    });
  }
}));

module.exports = router;
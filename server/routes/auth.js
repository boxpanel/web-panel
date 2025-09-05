const express = require('express');
const User = require('../models/User');
const { authenticateToken, generateToken } = require('../middleware/auth');
const { permissions } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

// 用户登录
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: '用户名和密码不能为空'
    });
  }

  try {
    // 验证用户凭据
    const user = await User.authenticate(username, password);
    
    // 生成JWT token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: user.toSafeJSON()
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
}));

// 用户注册（仅管理员可用）
router.post('/register', authenticateToken, permissions.manageUser, asyncHandler(async (req, res) => {
  const { username, email, password, role, permissions: userPermissions } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: '用户名和密码不能为空'
    });
  }

  try {
    const newUser = await User.create({
      username,
      email,
      password,
      role: role || 'user',
      permissions: userPermissions || []
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

// 验证token
router.get('/verify', authenticateToken, (req, res) => {
  const userData = User.findById(req.user.id);
  
  if (!userData || !userData.isActive) {
    return res.status(401).json({
      success: false,
      message: '用户不存在或已被禁用'
    });
  }

  const user = new User(userData);
  res.json({
    success: true,
    message: 'Token有效',
    user: user.toSafeJSON()
  });
});

// 获取当前用户信息
router.get('/profile', authenticateToken, (req, res) => {
  const user = User.findById(req.user.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用户不存在'
    });
  }

  res.json({
    success: true,
    data: {
      user: user.toSafeJSON()
    }
  });
});

// 更新当前用户信息
router.put('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    const updateData = {};
    
    if (email) {
      updateData.email = email;
    }
    
    // 如果要更改密码，需要验证当前密码
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: '更改密码需要提供当前密码'
        });
      }
      
      const user = User.findById(userId);
      const isValidPassword = await user.validatePassword(currentPassword);
      
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          message: '当前密码错误'
        });
      }
      
      updateData.password = newPassword;
    }

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

// 用户登出（客户端处理，服务端记录）
router.post('/logout', authenticateToken, (req, res) => {
  // 在实际应用中，可以在这里记录登出日志或处理token黑名单
  res.json({
    success: true,
    message: '登出成功'
  });
});

// 修改密码
router.post('/change-password', authenticateToken, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: '当前密码和新密码不能为空'
    });
  }

  try {
    const user = User.findById(userId);
    const isValidPassword = await user.validatePassword(currentPassword);
    
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: '当前密码错误'
      });
    }

    await User.update(userId, { password: newPassword });

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}));

module.exports = router;
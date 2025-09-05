const fs = require('fs');
const path = require('path');

// 错误日志记录
const logError = (error, req) => {
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, 'error.log');
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  };

  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
};

// 全局错误处理中间件
const errorHandler = (error, req, res, next) => {
  // 记录错误日志
  console.error('Error occurred:', error);
  logError(error, req);

  // 默认错误响应
  let statusCode = 500;
  let message = '服务器内部错误';
  let details = null;

  // 根据错误类型设置响应
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = '请求参数验证失败';
    details = error.message;
  } else if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = '认证失败';
  } else if (error.name === 'ForbiddenError') {
    statusCode = 403;
    message = '权限不足';
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    message = '资源未找到';
  } else if (error.code === 'ENOENT') {
    statusCode = 404;
    message = '文件或目录不存在';
  } else if (error.code === 'EACCES') {
    statusCode = 403;
    message = '权限不足，无法访问文件或目录';
  } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
    statusCode = 503;
    message = '系统资源不足';
  } else if (error.code === 'ENOSPC') {
    statusCode = 507;
    message = '磁盘空间不足';
  }

  // 在开发环境中包含错误堆栈
  const response = {
    success: false,
    message,
    error: {
      name: error.name,
      code: error.code
    }
  };

  if (details) {
    response.details = details;
  }

  // 在开发环境中包含完整的错误信息
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = error.stack;
    response.error.message = error.message;
  }

  res.status(statusCode).json(response);
};

// 404处理中间件
const notFoundHandler = (req, res, next) => {
  const error = new Error(`路径 ${req.originalUrl} 未找到`);
  error.name = 'NotFoundError';
  error.statusCode = 404;
  next(error);
};

// 异步错误捕获包装器
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 自定义错误类
class AppError extends Error {
  constructor(message, statusCode = 500, name = 'AppError') {
    super(message);
    this.name = name;
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// 验证错误
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'ValidationError');
    this.details = details;
  }
}

// 认证错误
class UnauthorizedError extends AppError {
  constructor(message = '认证失败') {
    super(message, 401, 'UnauthorizedError');
  }
}

// 权限错误
class ForbiddenError extends AppError {
  constructor(message = '权限不足') {
    super(message, 403, 'ForbiddenError');
  }
}

// 资源未找到错误
class NotFoundError extends AppError {
  constructor(message = '资源未找到') {
    super(message, 404, 'NotFoundError');
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError
};
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

// Import routes
const authRoutes = require('./routes/auth');
const systemRoutes = require('./routes/system');
const processRoutes = require('./routes/process');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/users');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');
const User = require('./models/User');
const database = require('./utils/database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  path: '/ws'
});

const PORT = process.env.PORT || 3001;

// Create necessary directories
const uploadsDir = path.join(__dirname, '../uploads');
const logsDir = path.join(__dirname, '../logs');
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(morgan('combined'));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../client/build')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/system', authenticateToken, systemRoutes);
app.use('/api/process', authenticateToken, processRoutes);
app.use('/api/files', authenticateToken, fileRoutes);
app.use('/api/users', authenticateToken, userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// WebSocket connection for real-time updates
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  // Send system stats every 5 seconds
  const interval = setInterval(async () => {
    try {
      const si = require('systeminformation');
      const [cpu, mem, fsSize] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize()
      ]);
      
      ws.send(JSON.stringify({
        type: 'system-stats',
        data: {
          cpu: cpu.currentLoad,
          memory: {
            used: mem.used,
            total: mem.total,
            percentage: (mem.used / mem.total) * 100
          },
          disk: fsSize.map(disk => ({
            fs: disk.fs,
            used: disk.used,
            size: disk.size,
            percentage: (disk.used / disk.size) * 100
          }))
        }
      }));
    } catch (error) {
      console.error('Error sending system stats:', error);
    }
  }, 5000);
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
    clearInterval(interval);
  });
});

// Catch all handler for React Router (only for non-API routes)
app.get('*', (req, res) => {
  // Only serve React app for non-API routes
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on port ${PORT}`);
  
  try {
    // Initialize database
    await database.init();
    console.log('Database initialized successfully');
    
    // Initialize default admin user
    await User.initializeDefaultAdmin();
    console.log('Default admin user initialized');
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
});

module.exports = app;
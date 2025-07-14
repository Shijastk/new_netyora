process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const http = require('http');
const socketService = require('./utils/socket');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./utils/errorHandler');
const { checkEnvVars, featureFlags } = require('./utils/envCheck');
const requestLogger = require('./middleware/requestLogger');
const { securityMiddleware } = require('./middleware/securityMiddleware');
const colors = require('colors');
const { trackActivity } = require('./middleware/activityTracker');
const videoSessionRoutes = require('./routes/videoSessionRoutes');
const autoDeletionService = require('./utils/autoDeletionService');

// Function to create a status message
const createStatusMessage = (title, content) => {
  return `
╔════════════════════════════════════════════════════════════╗
║ ${title.padEnd(60)} ║
╠════════════════════════════════════════════════════════════╣
║ ${content.padEnd(60)} ║
╚════════════════════════════════════════════════════════════╝
`;
};

// Check .env and set feature flags
const debugEnv = checkEnvVars();
logger.info(colors.green('✓ Environment variables checked and feature flags set'));

const app = express();

// Add JSON body parsing middleware
app.use(express.json());
const server = http.createServer(app);

// Increase server header size limits
server.maxHeaderSize = 64 * 1024; // 64KB header limit
logger.info(colors.green('✓ Express and HTTP server initialized'));

// Initialize Socket.IO
socketService.initialize(server);
logger.info(colors.green('✓ Socket.IO server initialized'));

// Enhanced Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
logger.info(colors.green('✓ Helmet security middleware configured'));

const allowedOrigin = process.env.CLIENT_URL || 'https://peppy-madeleine-72c4a8.netlify.app';

console.log('\n==============================');
console.log('  \x1b[42m\x1b[30m FRONTEND CORS ALLOWED: \x1b[0m');
console.log(`  \x1b[36m${allowedOrigin}\x1b[0m`);
console.log('==============================\n');

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
logger.info(colors.green('✓ CORS middleware configured'));

// Performance Middleware
app.use(compression());

// Increase header size limits to prevent 431 errors
app.use((req, res, next) => {
  // Set header size limits
  req.setMaxListeners(0);
  res.setMaxListeners(0);
  
  // Check for large headers that might cause 431 errors
  const headerSize = JSON.stringify(req.headers).length;
  if (headerSize > 8192) { // 8KB header limit
    logger.warn(`Large headers detected: ${headerSize} bytes`);
  }
  
  // Increase header size limits
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length']);
    if (contentLength > 10 * 1024 * 1024) { // 10MB limit
      return res.status(413).json({ error: 'Request entity too large' });
    }
  }
  
  next();
});

// NO GLOBAL JSON PARSING - Only apply to specific routes that need it
app.use(morgan('dev', { stream: logger.stream }));
logger.info(colors.green('✓ Performance middleware configured'));

// Security and logging middleware
app.use(securityMiddleware);
app.use(requestLogger);
logger.info(colors.green('✓ Security and request logging middleware configured'));

// Add activity tracking middleware globally
app.use(trackActivity());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    logger.info(colors.green('✓ Connected to MongoDB'));
    console.log(createStatusMessage('MongoDB Status', colors.green('Connected successfully')));
  })
  .catch((error) => {
    logger.error(colors.red('✗ MongoDB connection error:'), error);
    console.log(createStatusMessage('MongoDB Error', colors.red(error.message)));
    process.exit(1);
  });

// Cloudinary Configuration
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Verify Cloudinary connection
cloudinary.api.ping()
  .then(() => {
    logger.info(colors.green('✓ Connected to Cloudinary'));
    console.log(createStatusMessage('Cloudinary Status', colors.green('Connected successfully')));
    
    // Start auto-deletion service after Cloudinary is connected
    autoDeletionService.start();
    logger.info(colors.green('✓ Auto-deletion service started'));
  })
  .catch((error) => {
    logger.error(colors.red('✗ Cloudinary connection error:'), error);
    console.log(createStatusMessage('Cloudinary Error', colors.red(error.message)));
    process.exit(1);
  });



// Redis Configuration (if using Redis)
if (process.env.REDIS_URL) {
  const Redis = require('ioredis');
  const redis = new Redis(process.env.REDIS_URL);
  redis.on('connect', () => {
    logger.info(colors.green('✓ Connected to Redis'));
    console.log(createStatusMessage('Redis Status', colors.green('Connected successfully')));
  });
  redis.on('error', (error) => {
    logger.error(colors.red('✗ Redis connection error:'), error);
    console.log(createStatusMessage('Redis Error', colors.red(error.message)));
    process.exit(1);
  });
}

// Test endpoint for debugging JSON parsing
app.get('/api/test-json', (req, res) => {
  console.log('Test endpoint hit - Method:', req.method);
  console.log('Test endpoint hit - Headers:', req.headers);
  console.log('Test endpoint hit - Body:', req.body);
  res.json({ message: 'GET request successful', method: req.method, hasBody: !!req.body });
});

// Test endpoint for file uploads
app.post('/api/test-upload', (req, res) => {
  console.log('File upload test endpoint hit');
  console.log('Files:', req.files);
  console.log('File:', req.file);
  console.log('Body:', req.body);
  res.json({ 
    message: 'File upload test successful', 
    hasFiles: !!req.files, 
    hasFile: !!req.file,
    bodyKeys: Object.keys(req.body || {})
  });
});

// Test endpoint with multer to verify FormData handling
const { single } = require('./middleware/upload');
app.post('/api/test-multer', single('file'), (req, res) => {
  console.log('Multer test endpoint hit');
  console.log('File:', req.file);
  console.log('Body:', req.body);
  res.json({ 
    message: 'Multer test successful', 
    hasFile: !!req.file,
    fileName: req.file?.originalname,
    bodyKeys: Object.keys(req.body || {})
  });
});

// Test endpoint for simple file upload
app.post('/api/test-simple-upload', (req, res) => {
  console.log('Simple upload test endpoint hit');
  console.log('Headers:', req.headers);
  console.log('Body length:', req.body?.length || 'No body');
  res.json({ 
    message: 'Simple upload test successful',
    contentType: req.headers['content-type'],
    bodyLength: req.body?.length || 0
  });
});

// Health Check Endpoint
app.get('/api/health', (req, res) => {
    const health = {
      status: 'ok',
    mongodb: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      host: mongoose.connection.host,
      name: mongoose.connection.name
    },
    timestamp: new Date()
    };
    res.json(health);
});

// Welcome message at root
app.get('/', (req, res) => {
  res.send('<h1>Welcome to Netyora application</h1>');
});



// Feature flag middleware
app.use((req, res, next) => {
  req.featureFlags = featureFlags;
  next();
});
logger.info(colors.green('✓ Feature flags middleware configured'));

// API Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/skills', require('./routes/skillRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/communities', require('./routes/communityRoutes'));
app.use('/api/communities', require('./routes/communityPostRoutes'));
app.use('/api/posts', require('./routes/postRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/activities', require('./routes/activityRoutes'));
app.use('/api/swapcards', require('./routes/swapCardRoutes'));
app.use('/api/transactions', require('./routes/transactionRoutes'));
app.use('/api/saved-searches', require('./routes/savedSearchRoutes'));
app.use('/api/recommendations', require('./routes/recommendationRoutes'));
app.use('/api/ratings', require('./routes/ratingRoutes'));
app.use('/api/badges', require('./routes/badgeRoutes'));
app.use('/api/video-session', videoSessionRoutes);
logger.info(colors.green('✓ API routes configured'));

// 404 Handler
app.use(notFound);

// Handle JSON parsing errors specifically
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('JSON parsing error:', err);
    return res.status(400).json({ 
      error: 'Invalid JSON in request body',
      details: 'The request body contains invalid JSON format'
    });
  }
  next(err);
});

// Global Error Handler
app.use(errorHandler);

// Handle 431 errors specifically
app.use((err, req, res, next) => {
  if (err.code === 'HPE_HEADER_OVERFLOW' || err.status === 431) {
    logger.error('431 Request Header Fields Too Large:', {
      url: req.url,
      method: req.method,
      headers: Object.keys(req.headers),
      headerSize: JSON.stringify(req.headers).length
    });
    return res.status(431).json({ 
      error: 'Request Header Fields Too Large',
      message: 'The request headers are too large. Please try again with smaller headers.'
    });
  }
  next(err);
});
logger.info(colors.green('✓ Error handlers configured'));

// Apply upload error handling middleware
const { handleUploadError } = require('./middleware/uploadMiddleware');
app.use(handleUploadError);

// Graceful Shutdown
const gracefulShutdown = async () => {
  logger.info(colors.yellow('⚠ Received shutdown signal'));
  try {
    // Stop auto-deletion service
    autoDeletionService.stop();
    logger.info(colors.green('✓ Auto-deletion service stopped'));
    
    await mongoose.connection.close();
    logger.info(colors.green('✓ MongoDB connection closed'));
    if (process.env.REDIS_URL) {
      await redis.quit();
      logger.info(colors.green('✓ Redis connection closed'));
    }
    process.exit(0);
  } catch (error) {
    logger.error(colors.red('✗ Error during graceful shutdown:'), error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
logger.info(colors.green('✓ Shutdown handlers configured'));

const startServer = async () => {
  try {
    const ports = [5000, 5001, 5002, 5003, 5004];
    
    for (const port of ports) {
      try {
        await new Promise((resolve, reject) => {
          server.listen(port, () => {
            const serverStatus = `
╔════════════════════════════════════════════════════════════╗
║ Server Status                                              ║
╠════════════════════════════════════════════════════════════╣
║ ${colors.green('✓ Server running on port')} ${colors.cyan(port.toString())}                    ║
║ ${colors.green('✓ All services initialized')}                          ║
║ ${colors.yellow('Environment:')} ${colors.cyan(process.env.NODE_ENV || 'development')}         ║
║ ${colors.yellow('MongoDB:')} ${colors.cyan(mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected')} ║
║ ${colors.yellow('Cloudinary:')} ${colors.cyan('Connected')}                    ║
║ ${colors.yellow('Redis:')} ${colors.cyan(process.env.REDIS_URL ? 'Connected' : 'Not configured')} ║
╚════════════════════════════════════════════════════════════╝
            `;
            console.log(serverStatus);
            resolve();
          }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
              logger.warn(colors.yellow(`⚠ Port ${port} is in use, trying next port...`));
              resolve();
            } else {
              reject(err);
            }
          });
        });
        return;
      } catch (err) {
        if (err.code !== 'EADDRINUSE') {
          throw err;
        }
      }
    }
    
    throw new Error('All ports are in use');
  } catch (error) {
    logger.error(colors.red('✗ Server error:'), error);
    console.log(createStatusMessage('Server Error', colors.red(error.message)));
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(colors.red('✗ Unhandled Promise Rejection:'), err);
  console.log(createStatusMessage('Unhandled Error', colors.red(err.message)));
  // Close server & exit process
  server.close(() => process.exit(1));
});

startServer();

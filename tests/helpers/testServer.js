const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const { validateInput } = require('../../middleware/validationMiddleware');
const { errorHandler } = require('../../middleware/errorMiddleware');
const { requestLogger } = require('../../middleware/requestLogger');
const { securityMiddleware } = require('../../middleware/securityMiddleware');

// Import routes
const userRoutes = require('../../routes/userRoutes');
const skillRoutes = require('../../routes/skillRoutes');
const postRoutes = require('../../routes/postRoutes');
const chatRoutes = require('../../routes/chatRoutes');
const communityRoutes = require('../../routes/communityRoutes');
const eventRoutes = require('../../routes/eventRoutes');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.MONGODB_URI = 'mongodb+srv://shijas:Shijas9072@cluster0.zrdoj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
process.env.ENABLE_RATE_LIMITING = 'true';
process.env.ENABLE_CACHING = 'true';
process.env.ENABLE_LOGGING = 'true';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'debug';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.UPLOAD_DIR = 'uploads/test';
process.env.MAX_FILE_SIZE = '5242880';
process.env.ALLOWED_FILE_TYPES = 'image/jpeg,image/png,image/gif';

// Create test app with all middleware and routes
function createTestApp() {
  const app = express();

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cors());
  app.use(helmet());
  app.use(compression());
  app.use(morgan('dev'));

  // Security middleware
  app.use(securityMiddleware);

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Request logging
  app.use(requestLogger);

  // API routes
  app.use('/api/users', userRoutes);
  app.use('/api/skills', skillRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/communities', communityRoutes);
  app.use('/api/events', eventRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
}

// Connect to test database
async function connectTestDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to test database');
  } catch (error) {
    console.error('Test database connection error:', error);
    throw error;
  }
}

// Disconnect from test database
async function disconnectTestDB() {
  try {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    console.log('Disconnected from test database');
  } catch (error) {
    console.error('Test database disconnection error:', error);
    throw error;
  }
}

// Clear test database
async function clearTestDB() {
  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany();
    }
    console.log('Test database cleared');
  } catch (error) {
    console.error('Error clearing test database:', error);
    throw error;
  }
}

module.exports = {
  createTestApp,
  connectTestDB,
  disconnectTestDB,
  clearTestDB
}; 
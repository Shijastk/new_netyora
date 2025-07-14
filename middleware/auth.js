const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Activity = require('../models/Activity');
const logger = require('../utils/logger');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    // Track login activity
    if (req.path === '/login' && req.method === 'POST') {
      await Activity.create({
        user: user._id,
        type: 'login',
        message: `User login: ${user.username}`,
        description: `User logged in successfully`,
        metadata: {
          username: user.username,
          loginMethod: 'token'
        }
      });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = auth;

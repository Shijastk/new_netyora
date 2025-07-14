const logger = require('../utils/logger');

// Middleware to validate required fields in req.body
exports.validateInput = (fields) => (req, res, next) => {
  try {
    for (const field of fields) {
      if (Array.isArray(field)) {
        // At least one of the alternatives must be present
        if (!field.some(f => req.body[f])) {
          return res.status(400).json({ 
            error: `At least one of ${field.join(', ')} is required.` 
          });
        }
      } else {
        if (!req.body[field]) {
          return res.status(400).json({ error: `${field} is required.` });
        }
      }
    }
    next();
  } catch (error) {
    logger.error('Validation error:', error);
    res.status(500).json({ error: 'Error validating input' });
  }
};

// Middleware to validate MongoDB ObjectId
exports.validateObjectId = (req, res, next) => {
  const { id } = req.params;
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  next();
};

// Middleware to validate email format
exports.validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Middleware to validate password strength
exports.validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
  return passwordRegex.test(password);
}; 
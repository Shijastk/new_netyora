// Middleware to validate required fields in req.body
const validateInput = (requiredFields) => {
  return (req, res, next) => {
    try {
      // For login route
      if (req.path === '/login') {
        const { email, username, identifier, password } = req.body;
        
        if (!password) {
          return res.status(400).json({ error: 'Password is required.' });
        }

        if (!email && !username && !identifier) {
          return res.status(400).json({ 
            error: 'Please provide either an identifier (email or username), email, or username.' 
          });
        }

        return next();
      }

      // For other routes
      if (!requiredFields || !Array.isArray(requiredFields)) {
        return next();
      }

      for (const field of requiredFields) {
        if (!req.body[field]) {
          return res.status(400).json({ error: `${field} is required.` });
        }
      }

      next();
    } catch (error) {
      console.error('Validation error:', error);
      res.status(500).json({ error: 'Error validating input' });
    }
  };
};

module.exports = validateInput;

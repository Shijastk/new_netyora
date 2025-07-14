const logger = require('../utils/logger');

const responseHandler = (req, res, next) => {
  // Success response
  res.success = function(data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  };

  // Error response
  res.error = function(message = 'Error', statusCode = 400, errors = null) {
    logger.error('API Error:', {
      path: req.path,
      method: req.method,
      message,
      errors
    });

    return res.status(statusCode).json({
      success: false,
      message,
      errors
    });
  };

  // Pagination response
  res.paginate = function(data, page, limit, total) {
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  };

  next();
};

module.exports = responseHandler; 
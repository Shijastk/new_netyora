const logger = require('./logger');

// 404 Not Found Middleware
function notFound(req, res, next) {
  res.status(404);
  res.json({ error: `Not Found - ${req.originalUrl}` });
}

// Centralized Error Handler
function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack });
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
}

module.exports = { notFound, errorHandler };

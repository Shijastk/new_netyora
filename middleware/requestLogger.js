const logger = require('../utils/logger');
const { getSystemInfo } = require('../utils/systemInfo');

// Generate a unique request ID
const generateRequestId = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

// Request logger middleware
const requestLogger = (req, res, next) => {
  // Generate request ID
  const requestId = generateRequestId();
  req.requestId = requestId;

  // Get request start time
  const startTime = Date.now();

  // Log request details
  const requestLog = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    query: req.query,
    headers: {
      ...req.headers,
      authorization: req.headers.authorization ? '[REDACTED]' : undefined
    },
    ip: req.ip,
    userAgent: req.get('user-agent'),
    systemInfo: getSystemInfo()
  };

  logger.info('Incoming request:', requestLog);

  // Log response details when the response is sent
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const responseLog = {
      requestId,
      timestamp: new Date().toISOString(),
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      headers: res.getHeaders()
    };

    logger.info('Response sent:', responseLog);
  });
  
  next();
};

module.exports = requestLogger; 
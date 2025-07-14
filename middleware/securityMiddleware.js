const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// List of known good origins
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  // Add your production domains here
];

// List of blocked IPs (in-memory for testing)
const blockedIPs = new Set();
const BLOCK_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// API-specific rate limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 30 requests per minute
  message: 'Too many API requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Request validation middleware
const validateRequest = (req, res, next) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    const origin = req.headers.origin;
    const userAgent = req.headers['user-agent'];

    // Check if IP is blocked
    if (blockedIPs.has(ip)) {
      logger.warn('Blocked request from blocked IP:', { ip, path: req.path });
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate origin
    if (origin && !allowedOrigins.includes(origin)) {
      logger.warn('Request from unauthorized origin:', { origin, ip, path: req.path });
      return res.status(403).json({ error: 'Unauthorized origin' });
    }

    // Validate user agent
    if (!userAgent || userAgent === '') {
      logger.warn('Request with missing user agent:', { ip, path: req.path });
      return res.status(403).json({ error: 'Invalid request' });
    }

    // Check for suspicious patterns
    if (isSuspiciousRequest(req)) {
      logger.warn('Suspicious request detected:', {
        ip,
        path: req.path,
        headers: req.headers
      });
      blockIP(ip);
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  } catch (error) {
    logger.error('Error in validateRequest middleware:', error);
    next(error);
  }
};

// Function to detect suspicious requests
const isSuspiciousRequest = (req) => {
  const suspiciousPatterns = [
    // Check for common attack patterns
    /\.\.\//, // Directory traversal
    /<script>/, // XSS attempts
    /exec\(/, // Command injection
    /union\s+select/i, // SQL injection
    /eval\(/i, // Code injection
  ];

  // Check URL and body for suspicious patterns
  const requestString = JSON.stringify({
    url: req.url,
    body: req.body,
    query: req.query
  });

  return suspiciousPatterns.some(pattern => pattern.test(requestString));
};

// Function to block an IP
const blockIP = (ip) => {
  blockedIPs.add(ip);
  // Auto-unblock after block duration
  setTimeout(() => {
    blockedIPs.delete(ip);
  }, BLOCK_DURATION);
};

// Function to unblock an IP
const unblockIP = (ip) => {
  blockedIPs.delete(ip);
};

// Security middleware
const securityMiddleware = async (req, res, next) => {
  try {
    // Check if IP is blocked
    const clientIP = req.ip;
    if (blockedIPs.has(clientIP)) {
      return res.status(403).json({ error: 'IP address is blocked' });
    }

    // Apply rate limiting
    await limiter(req, res, (err) => {
      if (err) {
        logger.error('Rate limit error:', err);
        return res.status(500).json({ error: 'Rate limit error' });
      }
    });

    // Block IP if too many requests
    if (res.statusCode === 429) {
      blockIP(clientIP);
    }

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");

    next();
  } catch (error) {
    logger.error('Security middleware error:', error);
    next(error);
  }
};

// Export all middleware functions
module.exports = {
  securityMiddleware,
  apiLimiter,
  validateRequest,
  blockIP,
  unblockIP
}; 
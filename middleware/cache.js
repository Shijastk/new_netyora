const redisClient = require('../utils/redis');
const logger = require('../utils/logger');

const cache = (duration) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }

    const key = `cache:${req.originalUrl || req.url}`;

    try {
      const cachedResponse = await redisClient.get(key);

      if (cachedResponse) {
        return res.json(JSON.parse(cachedResponse));
      }

      // Store original res.json
      const originalJson = res.json;

      // Override res.json method
      res.json = function (body) {
        // Store in cache
        redisClient.setEx(key, duration, JSON.stringify(body))
          .catch(err => logger.error('Cache set error:', err));

        // Call original method
        return originalJson.call(this, body);
      };

      next();
    } catch (err) {
      logger.error('Cache middleware error:', err);
      next();
    }
  };
};

module.exports = cache; 
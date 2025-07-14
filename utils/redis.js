const Redis = require('redis');
const logger = require('./logger');

const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD
});

redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
redisClient.on('connect', () => logger.info('Redis Client Connected'));
redisClient.on('ready', () => logger.info('Redis Client Ready'));
redisClient.on('end', () => logger.info('Redis Client Connection Ended'));

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    logger.error('Redis Connection Error:', err);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await redisClient.quit();
});

process.on('SIGINT', async () => {
  await redisClient.quit();
});

module.exports = redisClient; 
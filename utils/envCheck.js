const logger = require('./logger');

// Define required environment variables for each feature
const featureRequirements = {
  jwt: ['JWT_SECRET'],
  cloudinary: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
  redis: ['REDIS_URL']
};

// Check if all required environment variables are present
const checkEnvVars = (feature) => {
  const required = featureRequirements[feature] || [];
  const missing = required.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    logger.warn(`Feature '${feature}' disabled. Missing env vars: ${missing.join(', ')}`);
    return false;
  }
  return true;
};

// Feature flags object
const featureFlags = {
  jwt: checkEnvVars('jwt'),
  cloudinary: checkEnvVars('cloudinary'),
  redis: checkEnvVars('redis')
};

// Log enabled features
logger.info('Enabled features:', Object.entries(featureFlags)
  .filter(([_, enabled]) => enabled)
  .map(([feature]) => feature)
);

module.exports = {
  featureFlags,
  checkEnvVars
};

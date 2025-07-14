const Activity = require('../models/Activity');
const logger = require('../utils/logger');

// Track like activity
const trackLike = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    // Create activity record for the like
    await Activity.create({
      user: userId,
      type: 'like',
      message: `Liked a post`,
      description: `User liked post ${postId}`,
      metadata: {
        postId,
        action: 'like'
      }
    });

    next();
  } catch (err) {
    logger.error('Error tracking like activity:', err);
    next(); // Continue even if activity tracking fails
  }
};

// Track unlike activity
const trackUnlike = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    // Create activity record for the unlike
    await Activity.create({
      user: userId,
      type: 'unlike',
      message: `Unliked a post`,
      description: `User unliked post ${postId}`,
      metadata: {
        postId,
        action: 'unlike'
      }
    });

    next();
  } catch (err) {
    logger.error('Error tracking unlike activity:', err);
    next(); // Continue even if activity tracking fails
  }
};

module.exports = {
  trackLike,
  trackUnlike
}; 
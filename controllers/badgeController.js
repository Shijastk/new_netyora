const User = require('../models/User');
const Post = require('../models/Post');
const Activity = require('../models/Activity');
const logger = require('../utils/logger');

// Badge definitions with criteria
const BADGE_DEFINITIONS = {
  'first_post': {
    name: 'First Post',
    description: 'Created your first post',
    icon: '📝',
    criteria: async (userId) => {
      const postCount = await Post.countDocuments({ user: userId });
      return postCount >= 1;
    }
  },
  'prolific_writer': {
    name: 'Prolific Writer',
    description: 'Created 10 posts',
    icon: '✍️',
    criteria: async (userId) => {
      const postCount = await Post.countDocuments({ user: userId });
      return postCount >= 10;
    }
  },
  'community_leader': {
    name: 'Community Leader',
    description: 'Created 25 posts',
    icon: '👑',
    criteria: async (userId) => {
      const postCount = await Post.countDocuments({ user: userId });
      return postCount >= 25;
    }
  },
  'first_follower': {
    name: 'First Follower',
    description: 'Gained your first follower',
    icon: '👥',
    criteria: async (userId) => {
      const user = await User.findById(userId);
      return user.followers.length >= 1;
    }
  },
  'popular_user': {
    name: 'Popular User',
    description: 'Gained 10 followers',
    icon: '🌟',
    criteria: async (userId) => {
      const user = await User.findById(userId);
      return user.followers.length >= 10;
    }
  },
  'influencer': {
    name: 'Influencer',
    description: 'Gained 50 followers',
    icon: '💫',
    criteria: async (userId) => {
      const user = await User.findById(userId);
      return user.followers.length >= 50;
    }
  },
  'active_user': {
    name: 'Active User',
    description: 'Logged in for 7 consecutive days',
    icon: '🔥',
    criteria: async (userId) => {
      // This would need to be tracked in user activity
      // For now, we'll use a simple criteria
      const activityCount = await Activity.countDocuments({ 
        user: userId, 
        type: 'login',
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });
      return activityCount >= 7;
    }
  },
  'skill_master': {
    name: 'Skill Master',
    description: 'Added 5 skills to your profile',
    icon: '🎯',
    criteria: async (userId) => {
      const user = await User.findById(userId).populate('skills');
      return user.skills.length >= 5;
    }
  },
  'helpful_user': {
    name: 'Helpful User',
    description: 'Received 5 likes on your posts',
    icon: '👍',
    criteria: async (userId) => {
      const posts = await Post.find({ user: userId });
      const totalLikes = posts.reduce((sum, post) => sum + (post.likes?.length || 0), 0);
      return totalLikes >= 5;
    }
  },
  'conversation_starter': {
    name: 'Conversation Starter',
    description: 'Received 10 comments on your posts',
    icon: '💬',
    criteria: async (userId) => {
      const posts = await Post.find({ user: userId });
      const totalComments = posts.reduce((sum, post) => sum + (post.comments?.length || 0), 0);
      return totalComments >= 10;
    }
  }
};

// Award a badge to a user
const awardBadge = async (userId, badgeId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return false;

    // Check if user already has this badge
    const hasBadge = user.badges.some(badge => badge.name === badgeId);
    if (hasBadge) return false;

    const badgeDef = BADGE_DEFINITIONS[badgeId];
    if (!badgeDef) return false;

    // Check if user meets criteria
    const meetsCriteria = await badgeDef.criteria(userId);
    if (!meetsCriteria) return false;

    // Award the badge
    user.badges.push({
      name: badgeId,
      earnedAt: new Date()
    });

    await user.save();

    // Create activity record
    await Activity.create({
      user: userId,
      type: 'badge_earned',
      message: `Earned badge: ${badgeDef.name}`,
      referenceId: userId,
      referenceType: 'User',
      metadata: {
        badgeId: badgeId,
        badgeName: badgeDef.name,
        badgeDescription: badgeDef.description,
        badgeIcon: badgeDef.icon
      }
    });

    return true;
  } catch (error) {
    logger.error('Error awarding badge:', error);
    return false;
  }
};

// Check and award badges for a user
exports.checkAndAwardBadges = async (userId) => {
  try {
    const awardedBadges = [];
    
    for (const [badgeId, badgeDef] of Object.entries(BADGE_DEFINITIONS)) {
      const wasAwarded = await awardBadge(userId, badgeId);
      if (wasAwarded) {
        awardedBadges.push({
          id: badgeId,
          name: badgeDef.name,
          description: badgeDef.description,
          icon: badgeDef.icon
        });
      }
    }

    return awardedBadges;
  } catch (error) {
    logger.error('Error checking badges:', error);
    return [];
  }
};

// GET /api/badges - Get all available badges
exports.getBadges = async (req, res) => {
  try {
    const badges = Object.entries(BADGE_DEFINITIONS).map(([id, badge]) => ({
      id,
      name: badge.name,
      description: badge.description,
      icon: badge.icon
    }));

    res.json({
      success: true,
      data: badges
    });
  } catch (error) {
    logger.error('Error getting badges:', error);
    res.status(500).json({ error: 'Error retrieving badges' });
  }
};

// GET /api/badges/user/:userId - Get user's badges
exports.getUserBadges = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('badges');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Map user badges to include badge definitions
    const userBadges = user.badges.map(badge => {
      const badgeDef = BADGE_DEFINITIONS[badge.name];
      return {
        id: badge.name,
        name: badgeDef ? badgeDef.name : badge.name,
        description: badgeDef ? badgeDef.description : '',
        icon: badgeDef ? badgeDef.icon : '🏆',
        earnedAt: badge.earnedAt
      };
    });

    res.json({
      success: true,
      data: userBadges
    });
  } catch (error) {
    logger.error('Error getting user badges:', error);
    res.status(500).json({ error: 'Error retrieving user badges' });
  }
};

// POST /api/badges/check - Check and award badges for current user
exports.checkBadges = async (req, res) => {
  try {
    const awardedBadges = await exports.checkAndAwardBadges(req.user._id);
    
    res.json({
      success: true,
      data: {
        awardedBadges,
        message: awardedBadges.length > 0 
          ? `Congratulations! You earned ${awardedBadges.length} new badge(s)!`
          : 'No new badges earned'
      }
    });
  } catch (error) {
    logger.error('Error checking badges:', error);
    res.status(500).json({ error: 'Error checking badges' });
  }
};

// GET /api/badges/statistics - Get badge statistics
exports.getBadgeStatistics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const badgeStats = {};

    for (const [badgeId, badgeDef] of Object.entries(BADGE_DEFINITIONS)) {
      const usersWithBadge = await User.countDocuments({
        'badges.name': badgeId
      });

      badgeStats[badgeId] = {
        name: badgeDef.name,
        description: badgeDef.description,
        icon: badgeDef.icon,
        totalEarned: usersWithBadge,
        percentage: totalUsers > 0 ? Math.round((usersWithBadge / totalUsers) * 100) : 0
      };
    }

    res.json({
      success: true,
      data: {
        totalUsers,
        badgeStats
      }
    });
  } catch (error) {
    logger.error('Error getting badge statistics:', error);
    res.status(500).json({ error: 'Error retrieving badge statistics' });
  }
};

// POST /api/badges/award/:userId/:badgeId - Manually award a badge (admin only)
exports.awardBadgeManually = async (req, res) => {
  try {
    const { userId, badgeId } = req.params;
    
    // Check if badge exists
    if (!BADGE_DEFINITIONS[badgeId]) {
      return res.status(400).json({ error: 'Invalid badge ID' });
    }

    const wasAwarded = await awardBadge(userId, badgeId);
    
    if (wasAwarded) {
      const badgeDef = BADGE_DEFINITIONS[badgeId];
      res.json({
        success: true,
        data: {
          message: `Badge "${badgeDef.name}" awarded successfully`,
          badge: {
            id: badgeId,
            name: badgeDef.name,
            description: badgeDef.description,
            icon: badgeDef.icon
          }
        }
      });
    } else {
      res.status(400).json({ 
        error: 'Badge could not be awarded. User may already have it or not meet criteria.' 
      });
    }
  } catch (error) {
    logger.error('Error manually awarding badge:', error);
    res.status(500).json({ error: 'Error awarding badge' });
  }
}; 
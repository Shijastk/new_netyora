const User = require('../models/User');
const Skill = require('../models/Skill');
const SwapCard = require('../models/SwapCard');
const Post = require('../models/Post');
const logger = require('../utils/logger');
const recommendationService = require('../services/recommendationService');

// GET /api/recommendations/profiles - Get recommended profiles (no auth required)
exports.getRecommendedProfiles = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const userId = req.user?._id || null; // Optional user ID

    logger.info('Getting recommended profiles', { userId, limit, page });

    const recommendations = await recommendationService.getProfileRecommendations(
      userId,
      parseInt(limit),
      parseInt(page)
    );

    res.json({
      success: true,
      data: recommendations.profiles || recommendations.items,
      pagination: recommendations.pagination,
      metadata: recommendations.metadata
    });
  } catch (error) {
    logger.error('Error getting recommended profiles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommended profiles'
    });
  }
};

// GET /api/recommendations/swaps - Get recommended swap cards (no auth required)
exports.getRecommendedSwaps = async (req, res) => {
  try {
    const { limit = 10, page = 1, category } = req.query;
    const userId = req.user?._id || null; // Optional user ID

    logger.info('Getting recommended swaps', { userId, limit, page, category });

    const recommendations = await recommendationService.getSwapRecommendations(
      userId,
      parseInt(limit),
      parseInt(page),
      category
    );

    res.json({
      success: true,
      data: recommendations.swaps || recommendations.items,
      pagination: recommendations.pagination,
      metadata: recommendations.metadata
    });
  } catch (error) {
    logger.error('Error getting recommended swaps:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommended swaps'
    });
  }
};

// GET /api/recommendations/posts - Get recommended posts (no auth required)
exports.getRecommendedPosts = async (req, res) => {
  try {
    const { limit = 10, page = 1, community } = req.query;
    const userId = req.user?._id || null; // Optional user ID

    logger.info('Getting recommended posts', { userId, limit, page, community });

    const recommendations = await recommendationService.getPostRecommendations(
      userId,
      parseInt(limit),
      parseInt(page),
      community
    );

    res.json({
      success: true,
      data: recommendations.posts || recommendations.items,
      pagination: recommendations.pagination,
      metadata: recommendations.metadata
    });
  } catch (error) {
    logger.error('Error getting recommended posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommended posts'
    });
  }
};

// GET /api/recommendations/skills - Get recommended skills to learn (no auth required)
exports.getRecommendedSkills = async (req, res) => {
  try {
    const { limit = 10, category } = req.query;
    const userId = req.user?._id || null; // Optional user ID

    logger.info('Getting recommended skills', { userId, limit, category });

    const recommendations = await recommendationService.getSkillRecommendations(
      userId,
      parseInt(limit),
      category
    );

    res.json({
      success: true,
      data: recommendations.skills || recommendations.items,
      metadata: recommendations.metadata
    });
  } catch (error) {
    logger.error('Error getting recommended skills:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommended skills'
    });
  }
};

// GET /api/recommendations/dashboard - Get all recommendations for dashboard (no auth required)
exports.getDashboardRecommendations = async (req, res) => {
  try {
    const userId = req.user?._id || null; // Optional user ID

    logger.info('Getting dashboard recommendations', { userId });

    const recommendations = await recommendationService.getDashboardRecommendations(userId);

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    logger.error('Error getting dashboard recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard recommendations'
    });
  }
};

// GET /api/recommendations/explore - Get exploration recommendations (no auth required)
exports.getExplorationRecommendations = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const userId = req.user?._id || null; // Optional user ID

    logger.info('Getting exploration recommendations', { userId, limit });

    const recommendations = await recommendationService.getExplorationRecommendations(
      userId,
      parseInt(limit)
    );

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    logger.error('Error getting exploration recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get exploration recommendations'
    });
  }
};

// POST /api/recommendations/feedback - Provide feedback on recommendations (auth required)
exports.provideRecommendationFeedback = async (req, res) => {
  try {
    const { type, itemId, rating, feedback } = req.body;
    const userId = req.user._id; // Required user ID

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required for feedback'
      });
    }

    logger.info('Recording recommendation feedback', { 
      userId, 
      type, 
      itemId, 
      rating 
    });

    await recommendationService.recordFeedback(
      userId,
      type,
      itemId,
      rating,
      feedback
    );

    res.json({
      success: true,
      message: 'Feedback recorded successfully'
    });
  } catch (error) {
    logger.error('Error recording recommendation feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record feedback'
    });
  }
}; 
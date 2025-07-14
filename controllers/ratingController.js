const Rating = require('../models/Rating');
const User = require('../models/User');
const Skill = require('../models/Skill');
const SwapCard = require('../models/SwapCard');
const Post = require('../models/Post');
const Community = require('../models/Community');
const sanitizeInput = require('../utils/sanitizeInput');
const logger = require('../utils/logger');

// POST /api/ratings - Create a new rating
exports.createRating = async (req, res) => {
  try {
    const {
      ratedItem,
      itemType,
      rating,
      review,
      categories,
      context = 'general',
      isAnonymous = false,
      metadata
    } = sanitizeInput(req.body);

    // Validate required fields
    if (!ratedItem || !itemType || !rating) {
      return res.status(400).json({
        success: false,
        error: 'ratedItem, itemType, and rating are required'
      });
    }

    // Validate rating value
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5'
      });
    }

    // Validate itemType
    const validItemTypes = ['user', 'skill', 'swap', 'post', 'community', 'video_session'];
    if (!validItemTypes.includes(itemType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid itemType'
      });
    }

    // Check if user has already rated this item
    const existingRating = await Rating.findOne({
      rater: req.user._id,
      ratedItem,
      itemType
    });

    if (existingRating) {
      return res.status(400).json({
        success: false,
        error: 'You have already rated this item'
      });
    }

    // Verify the item exists
    let itemExists = false;
    switch (itemType) {
      case 'user':
        itemExists = await User.findById(ratedItem);
        break;
      case 'skill':
        itemExists = await Skill.findById(ratedItem);
        break;
      case 'swap':
        itemExists = await SwapCard.findById(ratedItem);
        break;
      case 'post':
        itemExists = await Post.findById(ratedItem);
        break;
      case 'community':
        itemExists = await Community.findById(ratedItem);
        break;
    }

    if (!itemExists) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    // Create the rating
    const newRating = await Rating.create({
      rater: req.user._id,
      ratedItem,
      itemType,
      rating,
      review,
      categories,
      context,
      isAnonymous,
      metadata,
      isVerified: context === 'video_session' || context === 'swap_completed'
    });

    // Populate rater info (if not anonymous)
    if (!isAnonymous) {
      await newRating.populate('rater', 'firstName lastName username avatar');
    }

    logger.info('Rating created', {
      raterId: req.user._id,
      ratedItem,
      itemType,
      rating,
      context
    });

    res.status(201).json({
      success: true,
      data: newRating.getFormattedRating()
    });
  } catch (error) {
    logger.error('Error creating rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create rating'
    });
  }
};

// GET /api/ratings - Get ratings with filtering
exports.getRatings = async (req, res) => {
  try {
    const {
      itemId,
      itemType,
      raterId,
      context,
      status = 'approved',
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { status };
    
    if (itemId) query.ratedItem = itemId;
    if (itemType) query.itemType = itemType;
    if (raterId) query.rater = raterId;
    if (context) query.context = context;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get ratings with pagination
    const ratings = await Rating.find(query)
      .populate('rater', 'firstName lastName username avatar')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Rating.countDocuments(query);

    // Format response
    const formattedRatings = ratings.map(rating => rating.getFormattedRating());

    res.json({
      success: true,
      data: formattedRatings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error getting ratings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ratings'
    });
  }
};

// GET /api/ratings/:id - Get specific rating
exports.getRating = async (req, res) => {
  try {
    const rating = await Rating.findById(req.params.id)
      .populate('rater', 'firstName lastName username avatar');

    if (!rating) {
      return res.status(404).json({
        success: false,
        error: 'Rating not found'
      });
    }

    res.json({
      success: true,
      data: rating.getFormattedRating()
    });
  } catch (error) {
    logger.error('Error getting rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get rating'
    });
  }
};

// PUT /api/ratings/:id - Update rating
exports.updateRating = async (req, res) => {
  try {
    const { rating, review, categories } = sanitizeInput(req.body);

    const existingRating = await Rating.findById(req.params.id);

    if (!existingRating) {
      return res.status(404).json({
        success: false,
        error: 'Rating not found'
      });
    }

    // Only the rater can update their rating
    if (existingRating.rater.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this rating'
      });
    }

    // Update fields
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          error: 'Rating must be between 1 and 5'
        });
      }
      existingRating.rating = rating;
    }

    if (review !== undefined) {
      existingRating.review = review;
    }

    if (categories !== undefined) {
      existingRating.categories = categories;
    }

    existingRating.updatedAt = new Date();
    await existingRating.save();

    await existingRating.populate('rater', 'firstName lastName username avatar');

    logger.info('Rating updated', {
      ratingId: req.params.id,
      raterId: req.user._id
    });

    res.json({
      success: true,
      data: existingRating.getFormattedRating()
    });
  } catch (error) {
    logger.error('Error updating rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update rating'
    });
  }
};

// DELETE /api/ratings/:id - Delete rating
exports.deleteRating = async (req, res) => {
  try {
    const rating = await Rating.findById(req.params.id);

    if (!rating) {
      return res.status(404).json({
        success: false,
        error: 'Rating not found'
      });
    }

    // Only the rater or admin can delete the rating
    if (rating.rater.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this rating'
      });
    }

    await Rating.findByIdAndDelete(req.params.id);

    logger.info('Rating deleted', {
      ratingId: req.params.id,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Rating deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting rating:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete rating'
    });
  }
};

// GET /api/ratings/stats/:itemId - Get rating statistics for an item
exports.getRatingStats = async (req, res) => {
  try {
    const { itemType } = req.query;
    const { itemId } = req.params;

    if (!itemType) {
      return res.status(400).json({
        success: false,
        error: 'itemType is required'
      });
    }

    const stats = await Rating.aggregate([
      { $match: { ratedItem: itemId, itemType: itemType, status: 'approved' } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 },
          ratingDistribution: {
            $push: '$rating'
          }
        }
      }
    ]);

    if (stats.length === 0) {
      return res.json({
        success: true,
        data: {
          averageRating: 0,
          totalRatings: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        }
      });
    }

    const { averageRating, totalRatings, ratingDistribution } = stats[0];
    
    // Calculate rating distribution
    const distribution = {
      1: ratingDistribution.filter(r => r === 1).length,
      2: ratingDistribution.filter(r => r === 2).length,
      3: ratingDistribution.filter(r => r === 3).length,
      4: ratingDistribution.filter(r => r === 4).length,
      5: ratingDistribution.filter(r => r === 5).length
    };

    res.json({
      success: true,
      data: {
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        ratingDistribution: distribution
      }
    });
  } catch (error) {
    logger.error('Error getting rating stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get rating statistics'
    });
  }
};

// POST /api/ratings/bulk - Create multiple ratings (for admin use)
exports.createBulkRatings = async (req, res) => {
  try {
    const { ratings } = req.body;

    if (!Array.isArray(ratings) || ratings.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ratings array is required'
      });
    }

    const createdRatings = [];
    const errors = [];

    for (const ratingData of ratings) {
      try {
        const {
          ratedItem,
          itemType,
          rating,
          review,
          categories,
          context = 'general',
          isAnonymous = false,
          metadata
        } = ratingData;

        // Validate required fields
        if (!ratedItem || !itemType || !rating) {
          errors.push({ item: ratedItem, error: 'Missing required fields' });
          continue;
        }

        // Create rating
        const newRating = await Rating.create({
          rater: req.user._id,
          ratedItem,
          itemType,
          rating,
          review,
          categories,
          context,
          isAnonymous,
          metadata
        });

        createdRatings.push(newRating);
      } catch (error) {
        errors.push({ item: ratingData.ratedItem, error: error.message });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        created: createdRatings.length,
        errors: errors.length,
        details: errors
      }
    });
  } catch (error) {
    logger.error('Error creating bulk ratings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bulk ratings'
    });
  }
};

// GET /api/ratings/my-ratings - Get current user's ratings
exports.getMyRatings = async (req, res) => {
  try {
    const {
      itemType,
      context,
      page = 1,
      limit = 20
    } = req.query;

    const query = { rater: req.user._id };
    
    if (itemType) query.itemType = itemType;
    if (context) query.context = context;

    const skip = (page - 1) * limit;

    const ratings = await Rating.find(query)
      .populate('ratedItem', 'title name username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rating.countDocuments(query);

    const formattedRatings = ratings.map(rating => ({
      ...rating.getFormattedRating(),
      ratedItem: rating.ratedItem
    }));

    res.json({
      success: true,
      data: formattedRatings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error getting my ratings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get my ratings'
    });
  }
}; 
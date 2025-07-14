const Activity = require('../models/Activity');
const User = require('../models/User');
const sanitizeInput = require('../utils/sanitizeInput');
const logger = require('../utils/logger');

// POST /api/activities - Create new activity
exports.createActivity = async (req, res, next) => {
  try {
    const { type, refId, details } = sanitizeInput(req.body);
    
    if (!type) {
      return res.status(400).json({ error: 'Activity type is required.' });
    }

    const activity = await Activity.create({
      user: req.user._id,
      type,
      refId,
      details
    });

    // Add activity to user's activity array
    await User.findByIdAndUpdate(req.user._id, {
      $push: { activity: activity._id }
    });

    res.status(201).json(activity);
  } catch (err) {
    logger.error('Error creating activity:', err);
    next(err);
  }
};

// GET /api/activities
exports.getActivities = async (req, res) => {
  try {
    const {
      userId,
      type,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    // Filter by userId (either from token or query param)
    if (userId) {
      query.user = userId;
    } else {
      query.user = req.user._id;
    }

    // Filter by type
    if (type) {
      query.type = type;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get activities with pagination
    const activities = await Activity.find(query)
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'username email firstName lastName avatar')
      .populate({
        path: 'referenceId',
        select: 'title content username email'
      });

    // Get total count for pagination
    const total = await Activity.countDocuments(query);

    // Get activity statistics
    const stats = await Activity.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          lastActivity: { $max: '$createdAt' }
        }
      }
    ]);

    // Get user's activity summary
    const user = await User.findById(query.user)
      .select('activity hiddenActivity')
      .populate({
        path: 'activity',
        select: 'type status createdAt',
        options: { sort: { createdAt: -1 }, limit: 5 }
      });

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        },
        stats: stats.reduce((acc, curr) => {
          acc[curr._id] = {
            count: curr.count,
            lastActivity: curr.lastActivity
          };
          return acc;
        }, {}),
        summary: {
          totalActivities: user.activity.length,
          hiddenActivities: user.hiddenActivity.length,
          recentActivities: user.activity
        }
      }
    });
  } catch (err) {
    logger.error('Error getting activities:', err);
    res.status(500).json({ error: 'Error retrieving activities' });
  }
};

// GET /api/activities/:id
exports.getActivity = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id)
      .populate('user', 'username email firstName lastName avatar')
      .populate({
        path: 'referenceId',
        select: 'title content username email'
      });

    if (!activity) {
      return res
        .status(404)
        .json({ error: "Activity not found", details: err.message });
    }

    res.json(activity);
  } catch (err) {
    logger.error('Error getting activity:', err);
    res
      .status(500)
      .json({ error: "Error retrieving activity", details: err.message });
  }
};

// PUT /api/activities/:id
exports.updateActivity = async (req, res) => {
  try {
    const { status, message } = sanitizeInput(req.body);
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found or unauthorized.' });
    }

    // Validate status if provided
    if (status && !['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }

    // Update activity fields
    if (status) activity.status = status;
    if (message) activity.message = message;

    // Save the updated activity
    await activity.save();

    // Create an activity record for the update
    await Activity.create({
      user: req.user._id,
      type: 'activity_hide',
      status: 'completed',
      message: `Updated activity: ${activity.type}`,
      referenceId: activity._id,
      referenceType: 'Activity',
      metadata: {
        previousStatus: activity.status,
        updatedFields: {
          status: status || undefined,
          message: message || undefined
        }
      }
    });

    res.json({
      message: 'Activity updated successfully',
      activity
    });
  } catch (err) {
    logger.error('Error updating activity:', err);
    res.status(500).json({ 
      error: 'Error updating activity',
      details: err.message 
    });
  }
};

// DELETE /api/activities/:id
exports.deleteActivity = async (req, res) => {
  try {
    // Find the activity and ensure it belongs to the user
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found or unauthorized.' });
    }

    // Remove from user's activity array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { 
        activity: activity._id,
        hiddenActivity: activity._id // Also remove from hidden activities if present
      }
    });

    // Delete the activity
    await activity.deleteOne();

    // Create an activity record for the deletion
    await Activity.create({
      user: req.user._id,
      type: 'activity_hide', // Using activity_hide since it's a valid type
      status: 'completed',
      message: `Deleted activity: ${activity.type}`,
      metadata: {
        deletedActivityType: activity.type,
        deletedActivityMessage: activity.message,
        deletedAt: new Date()
      }
    });

    res.json({ 
      message: 'Activity deleted successfully',
      activityId: activity._id
    });
  } catch (err) {
    logger.error('Error deleting activity:', err);
    res.status(500).json({ 
      error: 'Error deleting activity',
      details: err.message 
    });
  }
};

// POST /api/activities/:id/hide - Hide activity
exports.hideActivity = async (req, res) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found or unauthorized.' });
    }

    // Add to user's hidden activities
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { hiddenActivity: activity._id }
    });

    // Create an activity record for hiding
    await Activity.create({
      user: req.user._id,
      type: 'activity_hide',
      status: 'completed',
      message: `Hidden activity: ${activity.type}`,
      referenceId: activity._id,
      referenceType: 'Activity',
      metadata: {
        activityType: activity.type,
        activityMessage: activity.message
      }
    });

    res.json({ 
      message: 'Activity hidden successfully',
      activityId: activity._id
    });
  } catch (err) {
    logger.error('Error hiding activity:', err);
    res.status(500).json({ 
      error: 'Error hiding activity',
      details: err.message 
    });
  }
};

// POST /api/activities/:id/unhide - Unhide activity
exports.unhideActivity = async (req, res) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found or unauthorized.' });
    }

    // Remove from user's hidden activities
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { hiddenActivity: activity._id }
    });

    // Create an activity record for unhiding
    await Activity.create({
      user: req.user._id,
      type: 'activity_show',
      status: 'completed',
      message: `Unhidden activity: ${activity.type}`,
      referenceId: activity._id,
      referenceType: 'Activity',
      metadata: {
        activityType: activity.type,
        activityMessage: activity.message
      }
    });

    res.json({ 
      message: 'Activity unhidden successfully',
      activityId: activity._id
    });
  } catch (err) {
    logger.error('Error unhiding activity:', err);
    res.status(500).json({ 
      error: 'Error unhiding activity',
      details: err.message 
    });
  }
};

// GET /api/activities/stats
exports.getActivityStats = async (req, res) => {
  try {
    const { userId } = req.query;
    const query = userId ? { user: userId } : { user: req.user._id };

    const stats = await Activity.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            type: '$type',
            status: '$status'
          },
          count: { $sum: 1 },
          lastActivity: { $max: '$createdAt' }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count',
              lastActivity: '$lastActivity'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);

    // Get user's activity summary
    const user = await User.findById(query.user)
      .select('activity hiddenActivity')
      .populate({
        path: 'activity',
        select: 'type status createdAt',
        options: { sort: { createdAt: -1 }, limit: 5 }
      });

    res.json({
      success: true,
      data: {
        stats,
        summary: {
          totalActivities: user.activity.length,
          hiddenActivities: user.hiddenActivity.length,
          recentActivities: user.activity
        }
      }
    });
  } catch (err) {
    logger.error('Error getting activity stats:', err);
    res.status(500).json({ error: 'Error retrieving activity statistics' });
  }
};

// GET /api/activities/learning-progress
exports.getLearningProgress = async (req, res) => {
  try {
    const userId = req.user._id;
    const [
      communitiesJoined,
      communitiesCreated,
      eventsJoined,
      eventsCreated,
      swapsCompleted,
      postsCreated,
      user
    ] = await Promise.all([
      Activity.countDocuments({ user: userId, type: 'community_join' }),
      Activity.countDocuments({ user: userId, type: 'community_create' }),
      Activity.countDocuments({ user: userId, type: 'event_join' }),
      Activity.countDocuments({ user: userId, type: 'event_create' }),
      Activity.countDocuments({ user: userId, type: 'swap_complete' }),
      Activity.countDocuments({ user: userId, type: 'post_create' }),
      User.findById(userId).select('credits')
    ]);
    res.json({
      success: true,
      data: {
        communitiesJoined,
        communitiesCreated,
        eventsJoined,
        eventsCreated,
        swapsCompleted,
        postsCreated,
        pointsEarned: user && user.credits ? user.credits : 0
      }
    });
  } catch (err) {
    logger.error('Error getting learning progress:', err);
    res.status(500).json({ error: 'Failed to get learning progress', details: err.message });
  }
};

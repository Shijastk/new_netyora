const Notification = require('../models/Notification');
const NotificationSettings = require('../models/NotificationSettings');
const sanitizeInput = require('../utils/sanitizeInput');
const logger = require('../utils/logger');
const User = require('../models/User');
const mongoose = require('mongoose');

// Helper function to create notifications
const createNotification = async (userId, type, title, message, refId = null, details = {}) => {
  try {
    // Check user's notification settings
    const settings = await NotificationSettings.findOne({ user: userId });
    
    // If settings don't exist or in-app notifications are disabled, don't create notification
    if (!settings || !settings.inApp?.enabled || !settings.inApp?.types?.[type]) {
      return null;
    }

    const notification = await Notification.create({
      user: userId,
      type,
      title,
      message,
      refId,
      details,
      read: false
    });

    logger.info('Notification created', {
      userId,
      type,
      notificationId: notification._id
    });

    return notification;
  } catch (error) {
    logger.error('Error creating notification:', error);
    return null;
  }
};

// GET /api/notifications - List/filter/paginate notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const { type, read, page = 1, limit = 20, sort = '-createdAt' } = req.query;
    const filter = { user: req.user._id };
    if (type) filter.type = type;
    if (read !== undefined) filter.read = read === 'true';
    
    const notifications = await Notification.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(Number(limit));
    
    // Get unread count
    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      read: false
    });
    
    res.json({
      notifications,
      unreadCount,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: await Notification.countDocuments(filter)
      }
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/notifications/:id/read - Mark single notification as read
exports.markRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found.' });
    res.json(notification);
  } catch (err) {
    next(err);
  }
};

// PUT /api/notifications/bulk - Mark all read, delete old
exports.bulkAction = async (req, res, next) => {
  try {
    const { action } = sanitizeInput(req.body);
    if (action === 'markAllRead') {
      await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
      return res.json({ markedAllRead: true });
    }
    if (action === 'deleteOld') {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await Notification.deleteMany({ user: req.user._id, createdAt: { $lt: cutoff } });
      return res.json({ deletedOld: true });
    }
    res.status(400).json({ error: 'Invalid action.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/notifications/settings - Get notification settings
exports.getSettings = async (req, res, next) => {
  try {
    let settings = await NotificationSettings.findOne({ user: req.user._id });
    
    // If settings don't exist, create default settings
    if (!settings) {
      settings = await NotificationSettings.create({ user: req.user._id });
    }
    
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

// PUT /api/notifications/settings - Update notification settings
exports.updateSettings = async (req, res, next) => {
  try {
    let updates = sanitizeInput(req.body);
    
    // Remove any fields that shouldn't be updated
    const allowedFields = ['email', 'push', 'inApp', 'quietHours', 'preferences'];
    updates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});
    
    // Validate email frequency if provided
    if (updates.email?.frequency && !['immediate', 'daily', 'weekly'].includes(updates.email.frequency)) {
      return res.status(400).json({ error: 'Invalid email frequency.' });
    }

    // Validate quiet hours if provided
    if (updates.quietHours) {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (updates.quietHours.start && !timeRegex.test(updates.quietHours.start)) {
        return res.status(400).json({ error: 'Invalid quiet hours start time.' });
      }
      if (updates.quietHours.end && !timeRegex.test(updates.quietHours.end)) {
        return res.status(400).json({ error: 'Invalid quiet hours end time.' });
      }
    }

    // Update settings
    const settings = await NotificationSettings.findOneAndUpdate(
      { user: req.user._id },
      { $set: updates },
      { new: true, upsert: true }
    );

    logger.info('Notification settings updated:', {
      userId: req.user._id,
      updates: Object.keys(updates)
    });

    res.json(settings);
  } catch (err) {
    logger.error('Error updating notification settings:', err);
    next(err);
  }
};

// PUT /api/notifications/settings/reset - Reset notification settings to defaults
exports.resetSettings = async (req, res, next) => {
  try {
    // Create a new settings object without _id
    const defaultSettings = {
      email: {
        enabled: true,
        frequency: 'immediate',
        types: {
          likes: true,
          comments: true,
          swapRequests: true,
          messages: true,
          events: true,
          mentions: true,
          follows: true
        }
      },
      push: {
        enabled: true,
        types: {
          likes: true,
          comments: true,
          swapRequests: true,
          messages: true,
          events: true,
          mentions: true,
          follows: true
        }
      },
      inApp: {
        enabled: true,
        types: {
          likes: true,
          comments: true,
          swapRequests: true,
          messages: true,
          events: true,
          mentions: true,
          follows: true
        }
      },
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
        timezone: 'UTC'
      },
      preferences: {
        showPreview: true,
        soundEnabled: true,
        vibrationEnabled: true,
        desktopNotifications: true
      }
    };

    // Update settings without modifying _id
    const settings = await NotificationSettings.findOneAndUpdate(
      { user: req.user._id },
      { $set: defaultSettings },
      { new: true, upsert: true }
    );
    
    logger.info('Notification settings reset to defaults:', {
      userId: req.user._id
    });

    res.json(settings);
  } catch (err) {
    logger.error('Error resetting notification settings:', err);
    next(err);
  }
};

// PUT /api/notifications/settings/type - Update specific notification type settings
exports.updateTypeSettings = async (req, res, next) => {
  try {
    const { type, channel, enabled } = sanitizeInput(req.body);
    
    if (!type || !channel || enabled === undefined) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (!['email', 'push', 'inApp'].includes(channel)) {
      return res.status(400).json({ error: 'Invalid channel.' });
    }

    if (!['likes', 'comments', 'swapRequests', 'messages', 'events', 'mentions', 'follows'].includes(type)) {
      return res.status(400).json({ error: 'Invalid notification type.' });
    }

    const updatePath = `${channel}.types.${type}`;
    const settings = await NotificationSettings.findOneAndUpdate(
      { user: req.user._id },
      { $set: { [updatePath]: enabled } },
      { new: true }
    );

    logger.info('Notification type settings updated:', {
      userId: req.user._id,
      type,
      channel,
      enabled
    });

    res.json(settings);
  } catch (err) {
    next(err);
  }
};

// Helper function to check if notification should be sent based on user settings
exports.shouldSendNotification = async (userId, type, channel = 'inApp') => {
  try {
    const settings = await NotificationSettings.findOne({ user: userId });
    if (!settings) return true; // Default to true if no settings found

    // Check if channel is enabled
    if (!settings[channel]?.enabled) return false;

    // Check if specific type is enabled for the channel
    return settings[channel]?.types?.[type] ?? true;
  } catch (err) {
    logger.error('Error checking notification settings:', err);
    return true; // Default to true on error
  }
};

// Export the helper function for use in other controllers
module.exports = {
  getNotifications: exports.getNotifications,
  markRead: exports.markRead,
  bulkAction: exports.bulkAction,
  getSettings: exports.getSettings,
  updateSettings: exports.updateSettings,
  resetSettings: exports.resetSettings,
  updateTypeSettings: exports.updateTypeSettings,
  shouldSendNotification: exports.shouldSendNotification,
  createNotification, // Export the helper function
};

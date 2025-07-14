const Activity = require('../models/Activity');
const User = require('../models/User');
const logger = require('../utils/logger');

// Activity types mapping
const ACTIVITY_TYPES = {
  AUTH: {
    LOGIN: 'login',
    LOGOUT: 'logout',
    REGISTER: 'register'
  },
  POST: {
    CREATE: 'post_create',
    UPDATE: 'post_update',
    DELETE: 'post_delete',
    LIKE: 'post_like',
    UNLIKE: 'post_unlike',
    COMMENT: 'post_comment'
  },
  PROFILE: {
    UPDATE: 'profile_update',
    SKILL_ADD: 'skill_add',
    SKILL_REMOVE: 'skill_remove'
  },
  SWAP: {
    REQUEST: 'swap_request',
    ACCEPT: 'swap_accept',
    REJECT: 'swap_reject',
    COMPLETE: 'swap_complete'
  },
  COMMUNITY: {
    JOIN: 'community_join',
    LEAVE: 'community_leave',
    CREATE: 'community_create'
  },
  EVENT: {
    CREATE: 'event_create',
    JOIN: 'event_join',
    LEAVE: 'event_leave'
  }
};

// Get device information from request
const getDeviceInfo = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection.remoteAddress;
  
  // Basic device detection
  const isMobile = /Mobile|Android|iPhone/i.test(userAgent);
  const isTablet = /Tablet|iPad/i.test(userAgent);
  const isDesktop = !isMobile && !isTablet;

  return {
    deviceId: req.headers['x-device-id'] || 'unknown',
    deviceType: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
    browser: userAgent.split(' ')[0] || 'unknown',
    os: userAgent.split('(')[1]?.split(')')[0] || 'unknown',
    ip,
    lastActive: new Date(),
    active: true
  };
};

// Activity type mapping
const activityTypes = {
  // Auth routes
  'POST /api/users/register': 'register',
  'POST /api/users/login': 'login',
  'POST /api/users/logout': 'logout',
  
  // Profile routes
  'PUT /api/users/profile': 'profile_update',
  'DELETE /api/users/profile': 'profile_delete',
  
  // Social routes
  'POST /api/users/follow/:id': 'follow',
  'POST /api/users/block/:id': 'block',
  
  // Post routes
  'POST /api/posts': 'post_create',
  'PUT /api/posts/:id': 'post_edit',
  'DELETE /api/posts/:id': 'post_delete',
  'POST /api/posts/:id/like': 'post_like',
  'DELETE /api/posts/:id/like': 'post_unlike',
  
  // Comment routes
  'POST /api/posts/:id/comments': 'comment_create',
  'PUT /api/comments/:id': 'comment_edit',
  'DELETE /api/comments/:id': 'comment_delete',
  'POST /api/comments/:id/like': 'comment_like',
  'DELETE /api/comments/:id/like': 'comment_unlike',
  
  // Session routes
  'DELETE /api/users/sessions/:deviceId': 'session_terminate'
};

// Generate activity message based on type and request data
const generateActivityMessage = (type, req, res) => {
  const messages = {
    register: `Successfully registered new account with username: ${req.body.username}`,
    login: `Successfully logged in as ${req.body.email}`,
    logout: 'Successfully logged out',
    profile_update: `Updated profile information: ${Object.keys(req.body).join(', ')}`,
    profile_delete: 'Successfully deleted account',
    follow: `Started following user: ${req.params.id}`,
    block: `Blocked user: ${req.params.id}`,
    post_create: 'Created a new post',
    post_edit: `Updated post: ${req.params.id}`,
    post_delete: `Deleted post: ${req.params.id}`,
    post_like: `Liked post: ${req.params.id}`,
    post_unlike: `Unliked post: ${req.params.id}`,
    comment_create: `Added comment to post: ${req.params.id}`,
    comment_edit: `Updated comment: ${req.params.id}`,
    comment_delete: `Deleted comment: ${req.params.id}`,
    comment_like: `Liked comment: ${req.params.id}`,
    comment_unlike: `Unliked comment: ${req.params.id}`,
    session_terminate: `Terminated session on device: ${req.params.deviceId}`
  };

  return messages[type] || `Performed ${type} action`;
};

// Main activity tracking middleware
const trackActivity = () => {
  return async (req, res, next) => {
    // Store original res.json
    const originalJson = res.json;

    // Override res.json
    res.json = async function(data) {
      try {
        // Only track successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const route = `${req.method} ${req.route?.path || req.path}`;
          const activityType = activityTypes[route];

          if (activityType && req.user?._id) {
            // Create activity record
            const activity = await Activity.create({
              user: req.user._id,
              type: activityType,
              status: 'completed',
              message: generateActivityMessage(activityType, req, res),
              referenceId: req.params.id || null,
              referenceType: getReferenceType(activityType),
              device: getDeviceInfo(req),
              metadata: {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode
              }
            });

            // Update user's activity array
            await User.findByIdAndUpdate(req.user._id, {
              $push: { activity: activity._id }
            });

            // Update device information
            const deviceInfo = getDeviceInfo(req);
            await User.findByIdAndUpdate(req.user._id, {
              $push: {
                devices: {
                  $each: [deviceInfo],
                  $slice: -5 // Keep only last 5 devices
                }
              }
            });
          }
        }
      } catch (error) {
        logger.error('Error tracking activity:', error);
      }

      // Call original res.json
      return originalJson.call(this, data);
    };

    next();
  };
};

// Helper to determine reference type
const getReferenceType = (activityType) => {
  const typeMap = {
    follow: 'User',
    block: 'User',
    post_create: 'Post',
    post_edit: 'Post',
    post_delete: 'Post',
    post_like: 'Post',
    post_unlike: 'Post',
    comment_create: 'Comment',
    comment_edit: 'Comment',
    comment_delete: 'Comment',
    comment_like: 'Comment',
    comment_unlike: 'Comment'
  };

  return typeMap[activityType] || null;
};

module.exports = {
  ACTIVITY_TYPES,
  trackActivity,
  getDeviceInfo,
  generateActivityMessage
}; 
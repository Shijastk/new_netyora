const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      // User activities
      'register', 'login', 'logout', 'profile_update', 'profile_delete', 'avatar_update',
      // Social activities
      'follow', 'unfollow', 'block', 'unblock',
      // Post activities
      'post_create', 'post_edit', 'post_delete', 'post_like', 'post_unlike',
      // Comment activities
      'comment_create', 'comment_edit', 'comment_delete', 'comment_like', 'comment_unlike',
      // Skill activities
      'skill_created', 'skill_updated', 'skill_deleted',
      // Community activities
      'community_create', 'community_join', 'community_leave', 'community_update',
      // Event activities
      'event_create', 'event_join', 'event_leave',
      // Session activities
      'session_start', 'session_end', 'session_terminate',
      // Badge activities
      'badge_earned',
      // Activity management
      'activity_update', 'activity_hide', 'activity_show'
    ]
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  message: {
    type: String,
    required: false,
    default: ''
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'referenceType'
  },
  referenceType: {
    type: String,
    enum: ['User', 'Post', 'Comment', 'Activity', 'Session', 'Skill', 'Community']
  },
  device: {
    type: {
      deviceId: String,
      deviceType: String,
      browser: String,
      os: String,
      ip: String
    }
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better query performance
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });
activitySchema.index({ status: 1, createdAt: -1 });
activitySchema.index({ referenceId: 1, referenceType: 1 });

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;

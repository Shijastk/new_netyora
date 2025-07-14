const mongoose = require('mongoose');

const notificationSettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Email notification preferences
  email: {
    enabled: { type: Boolean, default: true },
    frequency: { 
      type: String, 
      enum: ['immediate', 'daily', 'weekly'],
      default: 'immediate'
    },
    types: {
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      swapRequests: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      follows: { type: Boolean, default: true }
    }
  },
  // Push notification preferences
  push: {
    enabled: { type: Boolean, default: true },
    types: {
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      swapRequests: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      follows: { type: Boolean, default: true }
    }
  },
  // In-app notification preferences
  inApp: {
    enabled: { type: Boolean, default: true },
    types: {
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      swapRequests: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      events: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      follows: { type: Boolean, default: true }
    }
  },
  // Quiet hours settings
  quietHours: {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '22:00' }, // 24-hour format
    end: { type: String, default: '08:00' },   // 24-hour format
    timezone: { type: String, default: 'UTC' }
  },
  // Additional preferences
  preferences: {
    showPreview: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    vibrationEnabled: { type: Boolean, default: true },
    desktopNotifications: { type: Boolean, default: true }
  }
}, { timestamps: true });

// Add indexes for better query performance
notificationSettingsSchema.index({ user: 1 });

module.exports = mongoose.model('NotificationSettings', notificationSettingsSchema); 
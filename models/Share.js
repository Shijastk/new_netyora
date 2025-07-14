const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['internal', 'facebook', 'twitter', 'linkedin', 'whatsapp', 'telegram', 'email', 'copy_link']
  },
  message: {
    type: String,
    maxlength: 500
  },
  shareUrl: {
    type: String,
    required: true
  },
  shareCount: {
    type: Number,
    default: 1
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    referrer: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
shareSchema.index({ post: 1, platform: 1 });
shareSchema.index({ user: 1, createdAt: -1 });
shareSchema.index({ platform: 1, createdAt: -1 });

module.exports = mongoose.model('Share', shareSchema); 
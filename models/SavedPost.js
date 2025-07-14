const mongoose = require('mongoose');

const savedPostSchema = new mongoose.Schema({
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
  savedAt: {
    type: Date,
    default: Date.now
  },
  category: {
    type: String,
    default: 'general',
    enum: ['general', 'learning', 'inspiration', 'reference', 'favorite']
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate saves
savedPostSchema.index({ user: 1, post: 1 }, { unique: true });

// Indexes for better query performance
savedPostSchema.index({ user: 1, category: 1 });
savedPostSchema.index({ user: 1, savedAt: -1 });
savedPostSchema.index({ post: 1 });

module.exports = mongoose.model('SavedPost', savedPostSchema); 
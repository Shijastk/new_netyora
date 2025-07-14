const mongoose = require('mongoose');

const recommendationFeedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['profile', 'swap', 'post', 'skill'],
    required: true
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  feedback: {
    type: String,
    maxlength: 500
  },
  metadata: {
    algorithm: String,
    weights: mongoose.Schema.Types.Mixed,
    score: Number,
    category: String,
    tags: [String]
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

// Compound index for efficient queries
recommendationFeedbackSchema.index({ user: 1, type: 1, createdAt: -1 });
recommendationFeedbackSchema.index({ type: 1, rating: 1, createdAt: -1 });

module.exports = mongoose.model('RecommendationFeedback', recommendationFeedbackSchema); 
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  // Who is giving the rating
  rater: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // What is being rated
  ratedItem: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  // Type of item being rated
  itemType: {
    type: String,
    enum: ['user', 'skill', 'swap', 'post', 'community', 'video_session'],
    required: true,
    index: true
  },
  // Rating value (1-5 stars)
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  // Optional review text
  review: {
    type: String,
    maxlength: 1000,
    trim: true
  },
  // Rating categories (for detailed ratings)
  categories: {
    communication: { type: Number, min: 1, max: 5 },
    punctuality: { type: Number, min: 1, max: 5 },
    quality: { type: Number, min: 1, max: 5 },
    helpfulness: { type: Number, min: 1, max: 5 },
    professionalism: { type: Number, min: 1, max: 5 }
  },
  // Context of the rating (e.g., "video_session", "swap_completed")
  context: {
    type: String,
    enum: ['video_session', 'swap_completed', 'skill_exchange', 'general', 'community_interaction'],
    default: 'general'
  },
  // Metadata for additional context
  metadata: {
    sessionId: String,
    swapId: String,
    skillId: String,
    duration: Number, // in minutes
    platform: String, // "web", "mobile"
    location: String
  },
  // Whether the rating is anonymous
  isAnonymous: {
    type: Boolean,
    default: false
  },
  // Whether the rating is verified (e.g., from a completed transaction)
  isVerified: {
    type: Boolean,
    default: false
  },
  // Status of the rating
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'hidden'],
    default: 'approved'
  },
  // Admin/mod notes
  adminNotes: {
    type: String,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound indexes for efficient queries
ratingSchema.index({ ratedItem: 1, itemType: 1, status: 1 });
ratingSchema.index({ rater: 1, ratedItem: 1, itemType: 1 }, { unique: true });
ratingSchema.index({ itemType: 1, rating: 1, createdAt: -1 });
ratingSchema.index({ context: 1, createdAt: -1 });

// Pre-save middleware to update the related item's average rating
ratingSchema.pre('save', async function(next) {
  try {
    // Update the related item's average rating
    await this.constructor.updateAverageRating(this.ratedItem, this.itemType);
    next();
  } catch (error) {
    next(error);
  }
});

// Static method to update average rating for an item
ratingSchema.statics.updateAverageRating = async function(itemId, itemType) {
  try {
    const stats = await this.aggregate([
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

    if (stats.length > 0) {
      const { averageRating, totalRatings, ratingDistribution } = stats[0];
      
      // Calculate rating distribution
      const distribution = {
        1: ratingDistribution.filter(r => r === 1).length,
        2: ratingDistribution.filter(r => r === 2).length,
        3: ratingDistribution.filter(r => r === 3).length,
        4: ratingDistribution.filter(r => r === 4).length,
        5: ratingDistribution.filter(r => r === 5).length
      };

      // Update the related model based on itemType
      let Model;
      switch (itemType) {
        case 'user':
          Model = require('./User');
          break;
        case 'skill':
          Model = require('./Skill');
          break;
        case 'swap':
          Model = require('./SwapCard');
          break;
        case 'post':
          Model = require('./Post');
          break;
        case 'community':
          Model = require('./Community');
          break;
        default:
          return;
      }

      await Model.findByIdAndUpdate(itemId, {
        $set: {
          rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
          totalRatings: totalRatings,
          ratingDistribution: distribution
        }
      });
    }
  } catch (error) {
    console.error('Error updating average rating:', error);
  }
};

// Instance method to get formatted rating
ratingSchema.methods.getFormattedRating = function() {
  return {
    id: this._id,
    rating: this.rating,
    review: this.review,
    categories: this.categories,
    context: this.context,
    isAnonymous: this.isAnonymous,
    isVerified: this.isVerified,
    createdAt: this.createdAt,
    rater: this.isAnonymous ? null : this.rater
  };
};

module.exports = mongoose.model('Rating', ratingSchema); 
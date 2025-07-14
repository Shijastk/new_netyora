const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
}, { timestamps: true });

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  replies: [replySchema],
}, { timestamps: true });

// Image schema for better organization
const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  thumbnailUrl: { type: String },
  publicId: { type: String }, // Cloudinary public ID
  fileName: { type: String },
  fileSize: { type: Number },
  width: { type: Number },
  height: { type: Number },
  alt: { type: String },
}, { _id: false });

const postSchema = new mongoose.Schema({
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: String,
  // Support multiple images with metadata
  images: [imageSchema],
  // Legacy media field for backward compatibility
  media: [{ type: String }], // Cloudinary URLs
  // Tags for categorization
  tags: [{ type: String, index: true }],
  // New post type field
  postType: {
    type: String,
    enum: ['Learning update', 'Ask Question', 'Share Tips', 'Study Groups'],
    required: function() { return this.isNew; }
  },
  // Post privacy/visibility: public, private
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  // Likes by users
  likes: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    likedAt: { type: Date, default: Date.now }
  }],
  // Comments with nested replies
  comments: [commentSchema],
  // Optionally pin or flag a post
  pinned: { type: Boolean, default: false },
  flagged: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);

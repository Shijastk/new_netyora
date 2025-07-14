const mongoose = require('mongoose');

const qaAnswerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  voters: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vote: { type: String, enum: ['upvote', 'downvote'] },
    votedAt: { type: Date, default: Date.now }
  }],
  isAccepted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const qaSchema = new mongoose.Schema({
  question: String,
  questionAuthor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  voters: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vote: { type: String, enum: ['upvote', 'downvote'] },
    votedAt: { type: Date, default: Date.now }
  }],
  answers: [qaAnswerSchema],
  tags: [{ type: String }],
  isResolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const debateCommentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  vote: { type: String, enum: ['agree', 'disagree'] },
  createdAt: { type: Date, default: Date.now },
});

const debateSchema = new mongoose.Schema({
  topic: String,
  comments: [debateCommentSchema],
  createdAt: { type: Date, default: Date.now },
});

const communitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  bannedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  pendingPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
  qa: [qaSchema],
  debates: [debateSchema],
  rules: String,
  joinRule: { type: String, enum: ['open', 'request', 'invite-only'], default: 'open' },
  image: { type: String },
  avatar: { type: String },
  headerImage: { type: String },
  joinRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  tags: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('Community', communitySchema);

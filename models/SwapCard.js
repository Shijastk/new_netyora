const mongoose = require('mongoose');

const swapCardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  offeredSkill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill' },
  desiredSkill: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill' },
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, enum: ['service', 'product'], required: true },
  status: { type: String, enum: ['open', 'closed', 'matched'], default: 'open', required: true },
  tags: [{ type: String, index: true }],
  location: {
    city: { type: String, required: true },
    country: { type: String, required: true }
  },
  availability: { type: String, enum: ['online', 'offline', 'video'], required: true },
  availableTimes: [{ day: String, from: String, to: String }],
  images: [{ type: String }], // Optionally attach images/screenshots
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  views: { type: Number, default: 0 },
  isFeatured: { type: Boolean, default: false },
  expiryDate: { type: Date },
  extraData: { type: mongoose.Schema.Types.Mixed }, // For any extra info
}, { timestamps: true });

module.exports = mongoose.model('SwapCard', swapCardSchema);

const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String, index: true },
  tags: [{ type: String, index: true }],
  media: [{ type: String }], // Cloudinary URLs
  availability: { type: String, enum: ['available', 'busy'], default: 'available' },
  rating: { type: Number, min: 0, max: 5, default: 0 },
  experienceLevel: { type: String, enum: ['beginner', 'intermediate', 'expert'], default: 'beginner' },
  duration: { type: String }, // e.g., "1 hour"
  isLookingFor: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('Skill', skillSchema);

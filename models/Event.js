const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community' },
  title: { type: String, required: true },
  description: String,
  date: { type: Date, required: true },
  location: String, // For offline
  virtual: { type: Boolean, default: false },
  virtualLink: String, // Link for virtual event
  rsvp: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);

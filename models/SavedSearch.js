const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  query: String,
  filters: {
    category: String,
    location: String,
    rating: Number,
    // Add more filters as needed
  },
  name: String,
}, { timestamps: true });

module.exports = mongoose.model('SavedSearch', savedSearchSchema);

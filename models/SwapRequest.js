const mongoose = require('mongoose');

const swapRequestSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  swapCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'SwapCard', required: true, index: true },
  proposedSwapCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'SwapCard' }, // optional, for counter-offers
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled', 'ongoing', 'completed'],
    default: 'pending',
  },
  notes: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('SwapRequest', swapRequestSchema);

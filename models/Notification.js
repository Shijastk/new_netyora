const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { 
    type: String, 
    enum: [
      'like', 
      'comment', 
      'swap_request', 
      'follow', 
      'mention', 
      'event_invite', 
      'video_schedule',
      'image_deleted',
      'file_deleted',
      'image_shared',
      'file_shared'
    ] 
  },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  context: String, // e.g., "Post: Web Dev Tips"
  read: { type: Boolean, default: false },
  action: String, // e.g., "View Post"
  // Additional fields for file/image notifications
  metadata: {
    fileName: String,
    fileType: String,
    chatId: mongoose.Schema.Types.ObjectId,
    messageId: mongoose.Schema.Types.ObjectId,
    deletionReason: String, // "auto_deletion", "manual_deletion"
    sharedAt: Date,
    expiresAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String },
  type: { 
    type: String, 
    enum: ['text', 'file', 'image', 'pdf', 'document', 'video_invite', 'video_invitation', 'system', 'voice'],
    default: 'text' 
  },
  videoSession: {
    roomId: { type: String },
    bannerUrl: { type: String },
    joinUrl: { type: String },
  },
  invitationData: { type: mongoose.Schema.Types.Mixed },
  metadata: { type: mongoose.Schema.Types.Mixed }, // For system message metadata
  // Voice message fields
  voiceMessage: {
    fileUrl: { type: String },
    duration: { type: Number },
    fileSize: { type: Number }
  },
  // File message fields
  fileMessage: {
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    fileType: { type: String },
    mimeType: { type: String },
    publicId: { type: String },
    expiresAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    thumbnailUrl: { type: String }, // Optional - not sent from backend
    width: { type: Number }, // Optional - not sent from backend
    height: { type: Number }, // Optional - not sent from backend
    downloadedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track users who downloaded
  },
  timestamp: { type: Date, default: Date.now },
});

// Custom validation for fileMessage - only required for file-related message types
messageSchema.pre('validate', function(next) {
  const fileTypes = ['file', 'image', 'pdf', 'document'];
  
  if (fileTypes.includes(this.type)) {
    // For file-related messages, validate that fileMessage has required fields
    if (!this.fileMessage || 
        !this.fileMessage.fileUrl || 
        !this.fileMessage.fileName || 
        !this.fileMessage.fileSize || 
        !this.fileMessage.fileType) {
      return next(new Error(`File message validation failed: Missing required fields for message type '${this.type}'`));
    }
  } else {
    // For non-file messages, remove fileMessage if it exists but is empty
    if (this.fileMessage && (!this.fileMessage.fileUrl || !this.fileMessage.fileName)) {
      this.fileMessage = undefined;
    }
  }
  
  next();
});

const chatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  type: { type: String, enum: ['personal', 'group', 'community'], default: 'personal' },
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community' },
  messages: [messageSchema],
  lastMessage: { type: String },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Group chat fields
  title: { type: String },
  avatar: { type: String }, // URL to group avatar image
}, { timestamps: true });

// Ensure unique personal chat between two users
chatSchema.index(
  { participants: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'personal' } }
);

module.exports = mongoose.model('Chat', chatSchema);

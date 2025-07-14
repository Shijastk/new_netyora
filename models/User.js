const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ObjectId } = require("mongoose").Types;
const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  ip: String,
  lastLogin: Date,
  active: { type: Boolean, default: true },
});

const badgeSchema = new mongoose.Schema({
  name: String,
  earnedAt: Date,
});

const contactSchema = new mongoose.Schema({
  email: { type: String },
  phone: { type: String },
  visibility: { type: String, enum: ['public', 'private'], default: 'private' },
});

const locationSchema = new mongoose.Schema({
  city: String,
  country: { type: String, index: true },
});

const onlineStatusSchema = new mongoose.Schema({
  isOnline: { type: Boolean, default: false },
  status: { type: String, enum: ['online', 'offline', 'away', 'busy'], default: 'offline' },
  lastSeen: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  firstName: String,
  lastName: String,
  avatar: String,
  avatarThumbnail: String,
  avatarSmall: String,
  banner: String,
  bio: String,
  about: { type: String }, // About me section
  skills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],
  lookingFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Skill',
  }],
  location: locationSchema,
  contact: contactSchema,
  timeZone: { type: String },
  language: { type: String },
  onlineStatus: { type: onlineStatusSchema, default: () => ({}) },
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blocked: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  privacy: {
    profile: { type: String, enum: ['public', 'private'], default: 'public' },
  },
  activity: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Activity'
  }],
  hiddenActivity: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Activity'
  }],
  completion: { type: Number, default: 0 },
  badges: [badgeSchema],
  credits: { type: Number, default: 0, min: 0 },
  devices: [{
    deviceId: String,
    deviceType: String,
    browser: String,
    os: String,
    ip: String,
    lastActive: Date,
    active: Boolean
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update online status method
userSchema.methods.updateOnlineStatus = async function(isOnline, status = 'offline') {
  this.onlineStatus = {
    isOnline: isOnline,
    status: status,
    lastSeen: new Date()
  };
  return await this.save();
};

// Get display name method
userSchema.methods.getDisplayName = function() {
  if (this.firstName || this.lastName) {
    return `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  return this.username;
};

// Get avatar URL method
userSchema.methods.getAvatarUrl = function(size = 'full') {
  if (this.avatar) {
    // Return appropriate avatar size
    switch (size) {
      case 'small':
        return this.avatarSmall || this.avatarThumbnail || this.avatar;
      case 'thumbnail':
        return this.avatarThumbnail || this.avatar;
      case 'full':
      default:
        return this.avatar;
    }
  }
  return this.gender === 'female' ? '/IMAGES/female.png' : '/IMAGES/male.jpg';
};

module.exports = mongoose.model('User', userSchema);

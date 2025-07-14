const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { featureFlags } = require('../utils/envCheck');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const sanitizeInput = require('../utils/sanitizeInput');
const Activity = require('../models/Activity');
const { createActivity } = require('../middleware/activityTracker');
const SwapRequest = require('../models/SwapRequest');
const cloudinary = require('../utils/cloudinary');

// Helper: Generate JWT
function generateToken(userId) {
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET is not set in environment variables');
    throw new Error('JWT_SECRET missing. Auth disabled.');
  }
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}
console.log(process.env.JWT_SECRET,"pd");

// Helper function to create activity
const createUserActivity = async (userId, type, message, description, metadata = {}) => {
  try {
    await Activity.create({
      user: userId,
      type,
      message,
      description,
      metadata
    });
  } catch (err) {
    logger.error(`Error creating ${type} activity:`, err);
  }
};

// POST /api/users/register
exports.registerUser = async (req, res, next) => {
  try {
    const { email, password, username, firstName, lastName } = req.body;
    
    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required.' });
    }

    // Check if user already exists
    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return res.status(409).json({ error: 'Email or username already in use.' });
    }

    // Create new user
    const user = await User.create({
      email,
      password,
      username,
      firstName,
      lastName
    });

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    // Track registration activity
    await createUserActivity(
      user._id,
      'register',
      `New user registration: ${username}`,
      `Successfully registered new account with username: ${username} and email: ${email}`,
      { username, email }
    );

    // Return user data and token
    res.status(201).json({
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName
      },
      token
    });
  } catch (err) {
    logger.error('Registration error:', err);
    res.status(500).json({ error: 'Error creating user account' });
  }
};

// POST /api/users/login
exports.login = async (req, res) => {
  try {
    const { email, username, identifier, password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    // Find user by email, username, or identifier
    let user;
    if (email) {
        user = await User.findOne({ email }).select('+password');
    } else if (username) {
        user = await User.findOne({ username }).select('+password');
    } else if (identifier) {
      user = await User.findOne({
        $or: [{ email: identifier }, { username: identifier }]
      }).select('+password');
    } else {
        return res.status(400).json({ 
          error: 'Please provide either an identifier (email or username), email, or username.' 
        });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Generate JWT token
      const token = generateToken(user._id);

    // Track login activity
    await createUserActivity(
      user._id,
      'login',
      `User login: ${user.username}`,
      `User logged in successfully`,
      {
        username: user.username,
        loginMethod: email ? 'email' : username ? 'username' : 'identifier'
      }
    );

    // Return user data and token
      res.json({
        user: { 
        _id: user._id,
          email: user.email, 
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar
        },
        token
      });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Error logging in.', details: err.message, stack: err.stack });
  }
};

// GET /api/users/profile/:id
exports.getProfile = async (req, res) => {
  try {
    const Post = require('../models/Post');
    
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate({
        path: 'skills',
        select: 'title description category tags media availability rating experienceLevel duration isLookingFor',
      })
      .populate({
        path: 'lookingFor',
        select: 'title description category tags media availability rating experienceLevel duration isLookingFor',
      })
      .populate({
        path: 'followers',
        select: 'firstName lastName avatar',
      })
      .populate({
        path: 'following',
        select: 'firstName lastName avatar',
      });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Respect privacy settings
    if (user.privacy && user.privacy.profile === 'private' && 
        (!req.user || req.user._id.toString() !== user._id.toString())) {
      return res.status(403).json({ error: 'Profile is private.' });
    }

    // Calculate post count
    const postsCount = await Post.countDocuments({ user: user._id });
    
    console.log(user,"user profile");
    res.json({
      _id: user._id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar || "",
      banner: user.banner,
      bio: user.bio,
      about: user.about,
      skills: user.skills,
      lookingFor: user.lookingFor,
      location: user.location,
      contact: user.privacy?.profile === "public" ? user.contact : undefined,
      timeZone: user.timeZone,
      language: user.language,
      followers: user.followers,
      following: user.following,
      privacy: user.privacy,
      badges: user.badges,
      credits: user.credits,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      completion: user.completion,
      postsCount: postsCount,
    });
    
  } catch (err) {
    logger.error('Get profile error:', err);
    res.status(500).json({ error: 'Error fetching profile' });
  }
};


// PUT /api/users/profile
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const fs = require('fs');

exports.updateProfile = async (req, res) => {
  try {
    const updates = sanitizeInput(req.body);
    
    // Remove any fields that shouldn't be updated directly
    delete updates.password;
    delete updates.email;
    delete updates.username; // Disable username updates
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Handle nested objects
    if (updates.location) {
      updates.location = {
        city: updates.location.city,
        country: updates.location.country
      };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Track profile update activity
    const updateFields = Object.keys(updates).join(', ');
    await createUserActivity(
      user._id,
      'profile_update',
      `Profile updated: ${updateFields}`,
      `Successfully updated profile fields: ${updateFields}`,
      { updatedFields: updateFields }
    );

    res.json({
      _id: user._id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      banner: user.banner,
      bio: user.bio,
      about: user.about,
      skills: user.skills,
      lookingFor: user.lookingFor,
      location: user.location,
      contact: user.contact,
      timeZone: user.timeZone,
      language: user.language,
      privacy: user.privacy,
      badges: user.badges,
      credits: user.credits
    });
  } catch (err) {
    logger.error('Profile update error:', err);
    res.status(500).json({ error: 'Error updating profile' });
  }
};

// POST /api/users/follow/:id
exports.followUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.user._id === targetId) {
      return res.status(400).json({ error: 'Cannot follow yourself.' });
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if already following
    if (req.user.following.includes(targetId)) {
      return res.status(400).json({ error: 'Already following this user.' });
    }

    // Update following and followers
    await User.findByIdAndUpdate(req.user._id, {
      $push: { following: targetId }
    });
    await User.findByIdAndUpdate(targetId, {
      $push: { followers: req.user._id }
    });

    // Track follow activity
    await createUserActivity(
      req.user._id,
      'follow',
      `Started following ${targetUser.username}`,
      `User started following ${targetUser.username}`,
      { targetUserId: targetId, targetUsername: targetUser.username }
    );

    // Check for badge awards for the target user (they gained a follower)
    const badgeController = require('../controllers/badgeController');
    await badgeController.checkAndAwardBadges(targetId);

    res.json({ message: 'Successfully followed user.' });
  } catch (err) {
    logger.error('Follow user error:', err);
    res.status(500).json({ error: 'Error following user' });
  }
};

// POST /api/users/block/:id
exports.blockUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.user._id === targetId) {
      return res.status(400).json({ error: 'Cannot block yourself.' });
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Update blocked users
    await User.findByIdAndUpdate(req.user._id, {
      $push: { blocked: targetId }
    });

    // Remove from following/followers if exists
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { following: targetId }
    });
    await User.findByIdAndUpdate(targetId, {
      $pull: { followers: req.user._id }
    });

    // Track block activity
    await createUserActivity(
      req.user._id,
      'block',
      `Blocked user ${targetUser.username}`,
      `User blocked ${targetUser.username}`,
      { targetUserId: targetId, targetUsername: targetUser.username }
    );

    res.json({ message: 'Successfully blocked user.' });
  } catch (err) {
    logger.error('Block user error:', err);
    res.status(500).json({ error: 'Error blocking user' });
  }
};

// GET /api/users/activity
exports.getActivity = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('activity')
      .select('activity hiddenActivity');
    res.json({ activity: user.activity, hidden: user.hiddenActivity });
  } catch (err) {
    logger.error('Get activity error:', err);
    res.status(500).json({ error: 'Error retrieving activity' });
  }
};

// PUT /api/users/activity/hide/:id
exports.hideActivity = async (req, res) => {
  try {
    const activityId = req.params.id;
    
    // Add activity to hidden activities
    await User.findByIdAndUpdate(req.user._id, {
      $push: { hiddenActivity: activityId }
    });

    // Track hide activity
    await createUserActivity(
      req.user._id,
      'hide_activity',
      'Hidden an activity',
      'User hid an activity from their feed',
      { activityId }
    );

    res.json({ message: 'Activity hidden successfully.' });
  } catch (err) {
    logger.error('Hide activity error:', err);
    res.status(500).json({ error: 'Error hiding activity' });
  }
};

// GET /api/users/sessions
exports.getSessions = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('devices');
    res.json({ devices: user.devices });
  } catch (err) {
    logger.error('Get sessions error:', err);
    res.status(500).json({ error: 'Error retrieving sessions' });
  }
};

// DELETE /api/users/sessions/:deviceId
exports.terminateSession = async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    // Update device status
    await User.findByIdAndUpdate(req.user._id, {
      $set: { 'devices.$[elem].active': false },
      $currentDate: { 'devices.$[elem].lastActive': true }
    }, {
      arrayFilters: [{ 'elem.deviceId': deviceId }]
    });

    // Track session termination
    await createUserActivity(
      req.user._id,
      'session_terminate',
      'Terminated a session',
      'User terminated an active session',
      { deviceId }
    );

    res.json({ message: 'Session terminated successfully.' });
  } catch (err) {
    logger.error('Terminate session error:', err);
    res.status(500).json({ error: 'Error terminating session' });
  }
};

// GET /api/users/profiles
exports.getAllProfiles = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      skills,
      location,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query filter
    const filter = {};
    
    // Search filter
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } }
      ];
    }

    // Skills filter
    if (skills) {
      filter['skills.category'] = { $regex: skills, $options: 'i' };
    }

    // Location filter
    if (location) {
      filter.location = { $regex: location, $options: 'i' };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get users with pagination and filtering
    const users = await User.find(filter)
      .select('-password -email -contact -devices -blocked -hiddenActivity')
      .populate({
        path: 'skills',
        select: 'title description category tags media availability rating experienceLevel duration isLookingFor',
        match: skills ? { category: { $regex: skills, $options: 'i' } } : {}
      })
      .populate({
        path: 'lookingFor',
        select: 'title description category tags media availability rating experienceLevel duration isLookingFor'
      })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    // Format response
    const formattedUsers = users.map(user => {
      const userObj = user.toObject();
      
      // Ensure avatar has default value
      if (!userObj.avatar) {
        userObj.avatar = userObj.gender === 'female' ? '/IMAGES/female.png' : '/IMAGES/male.jpg';
      }

      // Add display name
      userObj.displayName = (userObj.firstName || userObj.lastName) 
        ? `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim() 
        : userObj.username;

      return userObj;
    });

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        },
        filters: {
          search,
          skills,
          location,
          sortBy,
          sortOrder
        }
      }
    });
  } catch (err) {
    logger.error('Get all profiles error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching profiles' 
    });
  }
};

// DELETE /api/users/profile
exports.deleteProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Track profile deletion activity with detailed message
    await createUserActivity(
      req.user._id, 
      'profile_delete', 
      `Successfully deleted account for user: ${user.username} (${user.email})`,
      null
    );

    await User.findByIdAndDelete(req.user._id);
    res.json({ success: true, message: 'Account successfully deleted' });
  } catch (err) {
    logger.error('Profile deletion error:', err);
    res.status(500).json({ error: 'Error deleting profile' });
  }
};

// GET /users/:userId/swaps - Get user's swap history
exports.getUserSwapHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    const swaps = await SwapRequest.find({
      $and: [
        { status: 'completed' },
        { $or: [ { sender: userId }, { receiver: userId } ] }
      ]
    })
      .populate('sender', 'username avatar')
      .populate('receiver', 'username avatar')
      .populate('swapCardId')
      .populate('proposedSwapCardId')
      .skip(Number(offset)).limit(Number(limit));
    res.json({ success: true, data: swaps });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching swap history' });
  }
};

// GET /api/users/search?query=... - List/search users for chat creation
exports.searchUsersForChat = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user._id;

    // Get blocked users
    const currentUser = await User.findById(userId).select('blocked');
    const blockedIds = currentUser.blocked || [];

    // Build search filter
    const searchFilter = {
      _id: { $ne: userId, $nin: blockedIds },
      $or: [
        { username: { $regex: query || '', $options: 'i' } },
        { firstName: { $regex: query || '', $options: 'i' } },
        { lastName: { $regex: query || '', $options: 'i' } }
      ]
    };

    let users = await User.find(searchFilter)
      .select('username firstName lastName avatar')
      .limit(30);

    // Ensure firstName/lastName fallback and avatar default
    users = users.map(user => {
      const u = user.toObject();
      u.displayName = (u.firstName || u.lastName) ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : u.username;
      if (!u.avatar) {
        u.avatar = u.gender === 'female' ? '/IMAGES/female.png' : '/IMAGES/male.jpg';
      }
      return u;
    });

    res.json(users);
  } catch (err) {
    logger.error('User search for chat error:', err);
    res.status(500).json({ error: 'Error searching users' });
  }
};

// POST /api/users/unfollow/:id
exports.unfollowUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.user._id === targetId) {
      return res.status(400).json({ error: 'Cannot unfollow yourself.' });
    }

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if not following
    if (!req.user.following.includes(targetId)) {
      return res.status(400).json({ error: 'You are not following this user.' });
    }

    // Update following and followers
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { following: targetId }
    });
    await User.findByIdAndUpdate(targetId, {
      $pull: { followers: req.user._id }
    });

    // Track unfollow activity
    await createUserActivity(
      req.user._id,
      'unfollow',
      `Unfollowed ${targetUser.username}`,
      `User unfollowed ${targetUser.username}`,
      { targetUserId: targetId, targetUsername: targetUser.username }
    );

    res.json({ message: 'Successfully unfollowed user.' });
  } catch (err) {
    logger.error('Unfollow user error:', err);
    res.status(500).json({ error: 'Error unfollowing user' });
  }
};

// POST /api/users/upload-avatar - Upload user avatar
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    const cloudinary = require('cloudinary').v2;
    const fs = require('fs');
    const path = require('path');

    // Validate image file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid file type. Only image files are allowed.' });
    }

    // Check file size (max 5MB)
    if (req.file.size > 5 * 1024 * 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }

    // Upload to Cloudinary with optimization
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'user-avatars',
      transformation: [
        { width: 300, height: 300, crop: 'thumb', gravity: 'auto' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ],
      eager: [
        { width: 150, height: 150, crop: 'thumb', gravity: 'auto' },
        { width: 50, height: 50, crop: 'thumb', gravity: 'auto' }
      ],
      eager_async: true
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Update user's avatar in database
    const User = require('../models/User');
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 
        avatar: result.secure_url,
        avatarThumbnail: result.eager?.[0]?.secure_url || result.secure_url,
        avatarSmall: result.eager?.[1]?.secure_url || result.secure_url
      },
      { new: true }
    ).select('username firstName lastName avatar avatarThumbnail avatarSmall');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Create activity record
    const Activity = require('../models/Activity');
    await Activity.create({
      user: req.user._id,
      type: 'avatar_update',
      message: 'Updated profile avatar',
      referenceId: req.user._id,
      referenceType: 'User',
      metadata: {
        action: 'updated',
        oldAvatar: req.user.avatar || 'none',
        newAvatar: result.secure_url
      }
    });

    res.json({
      message: 'Avatar uploaded successfully',
      avatar: result.secure_url,
      avatarThumbnail: result.eager?.[0]?.secure_url || result.secure_url,
      avatarSmall: result.eager?.[1]?.secure_url || result.secure_url,
      user: updatedUser
    });

  } catch (error) {
    // Clean up file if upload failed
    if (req.file && req.file.path) {
      const fs = require('fs');
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to cleanup file:', cleanupError);
      }
    }

    console.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Failed to upload avatar. Please try again.' });
  }
};


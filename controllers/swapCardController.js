const SwapCard = require('../models/SwapCard');
const sanitizeInput = require('../utils/sanitizeInput');
const male =  "";
const female =  "";
const SwapRequest = require('../models/SwapRequest');
const User = require('../models/User');
const Chat = require('../models/Chat');
const videoSessionController = require('./videoSessionController');
const chatController = require('./chatController');
const logger = require('../utils/logger');

// Simple in-memory cache for swap requests (per user, per endpoint)
const swapRequestCache = {
  inbox: new Map(), // key: userId+status+offset+limit, value: { data, expires }
  outbox: new Map()
};

function getCacheKey(userId, status, offset, limit) {
  return `${userId || ''}|${status || ''}|${offset || 0}|${limit || 10}`;
}

// Create a new swap card
exports.createSwapCard = async (req, res, next) => {
  try {
    const data = sanitizeInput(req.body);
    data.user = req.user.id;

    // Fetch user location from profile
    const user = await User.findById(req.user.id);
    if (!user || !user.location || !user.location.city || !user.location.country) {
      return res.status(400).json({ error: 'User profile must have a valid location (city and country).' });
    }
    data.location = {
      city: user.location.city,
      country: user.location.country
    };

    // Check for duplicate (using user profile location)
    const duplicate = await SwapCard.findOne({
      user: data.user,
      title: data.title,
      description: data.description,
      type: data.type,
      'location.city': data.location.city,
      'location.country': data.location.country,
      availability: data.availability
    });
    if (duplicate) {
      return res.status(409).json({
        error: 'Duplicate swap card: You have already created a card with the same details.'
      });
    }
    const swapCard = await SwapCard.create(data);
    res.status(201).json(swapCard);
  } catch (err) {
    if (err.name === 'ValidationError') {
      // Build a user-friendly error message
      const messages = Object.values(err.errors).map(e => e.message || e.properties?.message || e.path + ' is required.');
      return res.status(400).json({
        error: 'Validation failed',
        details: messages
      });
    }
    next(err);
  }
};

// Get all swap cards (fast version, no requestCount/requestedUsers)
exports.getSwapCards = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.tags) filter.tags = { $in: req.query.tags.split(',') };
    if (req.query.city) filter['location.city'] = req.query.city;
    if (req.query.country) filter['location.country'] = req.query.country;
    if (req.query.user) filter.user = req.query.user;
    if (req.query.featured) filter.isFeatured = req.query.featured === 'true';

    // Only select and populate essential fields
    const swapCards = await SwapCard.find(filter)
      .select('_id user offeredSkill desiredSkill title description type status tags location availability images createdAt')
      .populate('user', 'username firstName lastName avatar')
      .populate('offeredSkill', 'title')
      .populate('desiredSkill', 'title')
      .sort('-createdAt')
      .lean();

    res.json(swapCards);
  } catch (err) {
    next(err);
  }
};

// Get a single swap card by ID
exports.getSwapCard = async (req, res, next) => {
  try {
    let swapCard = await SwapCard.findById(req.params.id)
      .populate('user', 'username firstName lastName avatar')
      .populate('offeredSkill', 'title')
      .populate('desiredSkill', 'title');
    if (!swapCard) {
      return res.status(404).json({
        error: `Swap card not found for ID: ${req.params.id}`
      });
    }
    // Ensure avatar is always present
    if (swapCard.user && !swapCard.user.avatar) {
      if (swapCard.user.gender === 'female') {
        swapCard.user.avatar = '../../public/IMAGES/female.jpg';
      } else {
        swapCard.user.avatar = '../../public""';
      }
    }
    // Optionally increment views
    swapCard.views = (swapCard.views || 0) + 1;
    await swapCard.save();
    res.json(swapCard);
  } catch (err) {
    next(err);
  }
};

// Like/unlike a swap card
exports.likeSwapCard = async (req, res, next) => {
  try {
    const swapCard = await SwapCard.findById(req.params.id);
    if (!swapCard) return res.status(404).json({ error: 'Swap card not found.' });
    const idx = swapCard.likes.indexOf(req.user.id);
    if (idx === -1) {
      swapCard.likes.push(req.user.id);
    } else {
      swapCard.likes.splice(idx, 1);
    }
    await swapCard.save();
    res.json({ liked: idx === -1 });
  } catch (err) {
    next(err);
  }
};

// Feature/unfeature a swap card (admin/moderator)
exports.featureSwapCard = async (req, res, next) => {
  try {
    const swapCard = await SwapCard.findByIdAndUpdate(
      req.params.id,
      { isFeatured: req.body.isFeatured },
      { new: true }
    );
    if (!swapCard) return res.status(404).json({ error: 'Swap card not found.' });
    res.json(swapCard);
  } catch (err) {
    next(err);
  }
};

// Delete a swap card
exports.deleteSwapCard = async (req, res, next) => {
  try {
    const swapCard = await SwapCard.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!swapCard) return res.status(404).json({ error: 'Swap card not found or unauthorized.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Update a swap card
exports.updateSwapCard = async (req, res, next) => {
  try {
    const swapCard = await SwapCard.findById(req.params.id);
    if (!swapCard) {
      return res.status(404).json({ error: `Swap card not found for ID: ${req.params.id}` });
    }
    // Only the owner can update
    if (swapCard.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this swap card.' });
    }
    // Update fields
    Object.assign(swapCard, req.body);
    await swapCard.save();
    res.json({ success: true, data: swapCard });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message || e.properties?.message || e.path + ' is required.');
      return res.status(400).json({
        error: 'Validation failed',
        details: messages
      });
    }
    next(err);
  }
};

// --- Swap Request Management ---

// GET /swapcards/requests/inbox (optimized for card display, minimal fields, with cache)
exports.getSwapRequestsInbox = async (req, res, next) => {
  try {
    const { status, limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;
    const cacheKey = getCacheKey(userId, status, offset, limit);
    const now = Date.now();
    const cached = swapRequestCache.inbox.get(cacheKey);
    if (cached && cached.expires > now) {
      return res.json({ success: true, data: cached.data, cached: true });
    }
    const filter = { receiver: userId };
    if (status) filter.status = status;
    const requests = await SwapRequest.find(filter)
      .select('_id sender receiver swapCardId status notes createdAt')
      .populate('sender', 'username firstName lastName avatar')
      .populate('receiver', 'username firstName lastName avatar')
      .populate({
        path: 'swapCardId',
        select: '_id title type location user description availability',
      })
      .sort('-createdAt')
      .skip(Number(offset)).limit(Number(limit))
      .lean();

    // Format for card display
    const data = requests.map(req => ({
      _id: req._id,
      status: req.status,
      createdAt: req.createdAt,
      sender: req.sender ? {
        _id: req.sender._id,
        username: req.sender.username,
        firstName: req.sender.firstName,
        lastName: req.sender.lastName,
        avatar: req.sender.avatar,
        name: `${req.sender.firstName || ''} ${req.sender.lastName || ''}`.trim() || req.sender.username
      } : undefined,
      receiver: req.receiver ? {
        _id: req.receiver._id,
        username: req.receiver.username,
        firstName: req.receiver.firstName,
        lastName: req.receiver.lastName,
        avatar: req.receiver.avatar,
        name: `${req.receiver.firstName || ''} ${req.receiver.lastName || ''}`.trim() || req.receiver.username
      } : undefined,
      swapCardId: req.swapCardId ? {
        _id: req.swapCardId._id,
        title: req.swapCardId.title,
        type: req.swapCardId.type,
        location: req.swapCardId.location,
        user: req.swapCardId.user,
        description: req.swapCardId.description,
        availability: req.swapCardId.availability
      } : undefined,
      notes: req.notes
    }));
    swapRequestCache.inbox.set(cacheKey, { data, expires: now + 5000 }); // cache for 5 seconds
    res.json({ success: true, data, cached: false });
  } catch (err) { next(err); }
};

// GET /swapcards/requests/outbox (optimized for card display, minimal fields, with cache)
exports.getSwapRequestsOutbox = async (req, res, next) => {
  try {
    const { status, limit = 10, offset = 0 } = req.query;
    const userId = req.user.id;
    const cacheKey = getCacheKey(userId, status, offset, limit);
    const now = Date.now();
    const cached = swapRequestCache.outbox.get(cacheKey);
    if (cached && cached.expires > now) {
      return res.json({ success: true, data: cached.data, cached: true });
    }
    const filter = { sender: userId };
    if (status) filter.status = status;
    const requests = await SwapRequest.find(filter)
      .select('_id sender receiver swapCardId status notes createdAt')
      .populate('sender', 'username firstName lastName avatar')
      .populate('receiver', 'username firstName lastName avatar')
      .populate({
        path: 'swapCardId',
        select: '_id title type location user description availability',
      })
      .sort('-createdAt')
      .skip(Number(offset)).limit(Number(limit))
      .lean();

    // Format for card display
    const data = requests.map(req => ({
      _id: req._id,
      status: req.status,
      createdAt: req.createdAt,
      sender: req.sender ? {
        _id: req.sender._id,
        username: req.sender.username,
        firstName: req.sender.firstName,
        lastName: req.sender.lastName,
        avatar: req.sender.avatar,
        name: `${req.sender.firstName || ''} ${req.sender.lastName || ''}`.trim() || req.sender.username
      } : undefined,
      receiver: req.receiver ? {
        _id: req.receiver._id,
        username: req.receiver.username,
        firstName: req.receiver.firstName,
        lastName: req.receiver.lastName,
        avatar: req.receiver.avatar,
        name: `${req.receiver.firstName || ''} ${req.receiver.lastName || ''}`.trim() || req.receiver.username
      } : undefined,
      swapCardId: req.swapCardId ? {
        _id: req.swapCardId._id,
        title: req.swapCardId.title,
        type: req.swapCardId.type,
        location: req.swapCardId.location,
        user: req.swapCardId.user,
        description: req.swapCardId.description,
        availability: req.swapCardId.availability
      } : undefined,
      notes: req.notes
    }));
    swapRequestCache.outbox.set(cacheKey, { data, expires: now + 5000 }); // cache for 5 seconds
    res.json({ success: true, data, cached: false });
  } catch (err) { next(err); }
};

// PUT /swapcards/requests/bulk
exports.bulkUpdateSwapRequests = async (req, res, next) => {
  try {
    const { requestIds, action } = req.body;
    if (!Array.isArray(requestIds) || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    const status = action === 'accept' ? 'accepted' : 'rejected';
    const result = await SwapRequest.updateMany(
      { _id: { $in: requestIds }, receiver: req.user.id },
      { $set: { status } }
    );
    res.json({ success: true, modifiedCount: result.nModified || result.modifiedCount });
  } catch (err) { next(err); }
};

// POST /swapcards/requests (send a swap request)
exports.sendSwapRequest = async (req, res, next) => {
  try {
    const { receiver, swapCardId, proposedSwapCardId, notes } = req.body;
    if (!receiver || !swapCardId) {
      return res.status(400).json({ error: 'Receiver and swapCardId are required' });
    }
    if (receiver === req.user.id || receiver === req.user._id?.toString()) {
      return res.status(400).json({ error: 'Sender and receiver must be different users.' });
    }
    const swapRequest = await SwapRequest.create({
      sender: req.user.id,
      receiver,
      swapCardId,
      proposedSwapCardId,
      notes: sanitizeInput(notes),
    });
    res.status(201).json({ success: true, data: swapRequest });
  } catch (err) { next(err); }
};

// PUT /swapcards/requests/:id (update a swap request)
exports.updateSwapRequest = async (req, res, next) => {
  try {
    const { status } = req.body;
    const swapRequest = await SwapRequest.findById(req.params.id);
    if (!swapRequest) return res.status(404).json({ error: 'Swap request not found' });
    if (swapRequest.receiver.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this swap request' });
    }
    swapRequest.status = status;
    await swapRequest.save();
    res.json({ success: true, data: swapRequest });
  } catch (err) { next(err); }
};

// GET /swapcards/requests/:id (get swap request by ID)
exports.getSwapRequestById = async (req, res, next) => {
  try {
    const swapRequest = await SwapRequest.findById(req.params.id)
      .populate('sender', 'username avatar')
      .populate('receiver', 'username avatar')
      .populate('swapCardId')
      .populate('proposedSwapCardId');
    if (!swapRequest) return res.status(404).json({ error: 'Swap request not found' });
    res.json({ success: true, data: swapRequest });
  } catch (err) { next(err); }
};

// --- Enhanced Search/Filters ---
// GET /swapcards/search
exports.searchSwapCards = async (req, res, next) => {
  try {
    const { type, availability, radius, sort, limit = 20, offset = 0, lat, lng } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (availability) filter.availability = availability;
    // Geolocation filter (stub, implement with geospatial index in production)
    // if (radius && lat && lng) { ... }
    let query = SwapCard.find(filter)
      .populate('user', 'username avatar')
      .skip(Number(offset)).limit(Number(limit));
    if (sort === 'rating') query = query.sort('-rating');
    else if (sort === 'newest') query = query.sort('-createdAt');
    const cards = await query;
    res.json({ success: true, data: cards });
  } catch (err) { next(err); }
};

// --- Suggested Matches (stub) ---
exports.getSuggestedSwapCards = async (req, res, next) => {
  // TODO: Implement matching algorithm, Redis caching
  res.json({ success: true, data: [], message: 'Suggested matches feature coming soon.' });
};

// --- Analytics (stub) ---
exports.getSwapCardsAnalytics = async (req, res, next) => {
  // TODO: Implement admin analytics
  res.json({ success: true, data: {}, message: 'Analytics feature coming soon.' });
};

exports.createVideoSessionForSwap = async (req, res) => {
  try {
    console.log('Creating video session for swap:', req.params);
    
  // Use swapId as the roomID for the video session
  const { swapId } = req.params;
  const userID = req.user ? req.user.id : req.body.userID; // Use authenticated user or fallback
  if (!userID) {
    return res.status(400).json({ error: 'userID is required' });
  }

    console.log('User ID:', userID, 'Swap ID:', swapId);

  // Find the swap request to get both users
  const SwapRequest = require('../models/SwapRequest');
  const swapRequest = await SwapRequest.findById(swapId);
  if (!swapRequest) {
    return res.status(404).json({ error: 'Swap request not found' });
  }

    console.log('Swap request found:', {
      sender: swapRequest.sender,
      receiver: swapRequest.receiver,
      status: swapRequest.status
    });

  // Generate the ZEGOCLOUD token
  req.body.userID = userID;
  req.body.roomID = swapId;
    
  // Call the ZEGOCLOUD token generator
  const videoSessionController = require('./videoSessionController');
  let tokenResponse;
  await new Promise((resolve) => {
    // Mock res object to capture the response
    const mockRes = {
      json: (data) => { tokenResponse = data; resolve(); },
      status: (code) => ({ json: (data) => { tokenResponse = data; resolve(); } })
    };
    videoSessionController.getZegoToken(req, mockRes);
  });
    
  if (!tokenResponse || tokenResponse.error) {
      console.error('Failed to generate ZEGOCLOUD token:', tokenResponse);
    return res.status(500).json({ error: 'Failed to generate ZEGOCLOUD token' });
  }

    console.log('ZEGOCLOUD token generated successfully');

    // Send the video session invitation to the chat
    try {
      const bannerUrl = '/IMAGES/video-call-banner.jpg'; // Use local banner image
  const joinUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/video-session/${swapId}`;
      
      console.log('Sending video session invite to chat');
  await chatController.sendVideoSessionInvite(
    swapRequest.sender,
    swapRequest.receiver,
    swapId,
    bannerUrl,
    joinUrl,
    userID
  );
      
      console.log('Video session invite sent successfully');
      
      // Add join notification automatically
      try {
        const User = require('../models/User');
        const user = await User.findById(userID);
        const userName = user?.firstName || user?.username || 'User';
        
        await chatController.addJoinNotification(
          chat._id.toString(),
          userID,
          swapId,
          userName
        );
        console.log('Join notification added automatically for swap');
      } catch (notificationError) {
        console.error('Failed to add join notification for swap:', notificationError);
        // Don't fail the entire request if notification fails
      }
    } catch (chatError) {
      console.error('Failed to send video session invite to chat:', chatError);
      // Don't fail the entire request if chat invite fails, but log the error
    }

  res.json({
    ...tokenResponse,
      message: 'Video session started successfully.',
      swapId: swapId,
      participants: [swapRequest.sender, swapRequest.receiver]
    });
  } catch (error) {
    console.error('Error creating video session:', error);
    res.status(500).json({ 
      error: 'Failed to create video session',
      details: error.message || 'Unknown error'
    });
  }
};

// Cancel video session for swap
exports.cancelVideoSessionForSwap = async (req, res) => {
  try {
    const { swapId } = req.params;
    const { userId, userID, roomId } = req.body;
    
    // Handle both userId and userID (frontend sends userID)
    const actualUserId = userId || userID;
    
    console.log('Cancelling swap video session:', { swapId, actualUserId, roomId });
    console.log('Request user:', req.user);
    console.log('Request body:', req.body);
    
    if (!actualUserId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Find the swap request
    const SwapRequest = require('../models/SwapRequest');
    const swapRequest = await SwapRequest.findById(swapId);
    if (!swapRequest) {
      console.log('Swap request not found for ID:', swapId);
      return res.status(404).json({ error: 'Swap request not found' });
    }

    console.log('Found swap request:', {
      sender: swapRequest.sender,
      receiver: swapRequest.receiver,
      status: swapRequest.status
    });

    // Check if user is a participant in the swap
    const isParticipant = swapRequest.sender.toString() === actualUserId || 
                         swapRequest.receiver.toString() === actualUserId;
    
    console.log('User participation check:', {
      actualUserId,
      sender: swapRequest.sender.toString(),
      receiver: swapRequest.receiver.toString(),
      isParticipant
    });
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this swap' });
    }

    // Find or create chat between the two users
    let chat = await Chat.findOne({
      type: 'personal',
      participants: { 
        $all: [swapRequest.sender, swapRequest.receiver],
        $size: 2 
      }
    });

    if (chat) {
      // Find and update video invitation messages to mark as cancelled
      const updatedMessages = chat.messages.map(message => {
        if (message.type === 'video_invitation') {
          try {
            const invitationData = JSON.parse(message.content);
            if (invitationData.roomId === roomId) {
              invitationData.status = 'cancelled';
              invitationData.isActive = false;
              message.content = JSON.stringify(invitationData);
              message.invitationData = invitationData;
            }
          } catch (error) {
            console.error('Error parsing invitation data:', error);
          }
        }
        return message;
      });

      chat.messages = updatedMessages;
      chat.lastMessage = 'Video session cancelled';
      chat.updatedAt = new Date();
      
      // Validate the chat before saving to handle any schema issues
      try {
        await chat.save();
      } catch (validationError) {
        console.error('Chat validation error:', validationError);
        
        // If there's a validation error, try to clean up invalid message types
        if (validationError.name === 'ValidationError' && validationError.errors['messages']) {
          console.log('Attempting to clean up invalid message types...');
          
          // Filter out messages with invalid types
          const validMessages = chat.messages.filter(message => {
            const validTypes = ['text', 'file', 'video_invite', 'video_invitation', 'system', 'voice'];
            return validTypes.includes(message.type);
          });
          
          chat.messages = validMessages;
          
          // Try saving again
          try {
            await chat.save();
            console.log('Successfully cleaned up invalid message types');
          } catch (cleanupError) {
            console.error('Failed to clean up invalid message types:', cleanupError);
            return res.status(500).json({ 
              error: 'Failed to cancel video session due to data corruption',
              details: 'Please contact support'
            });
          }
        } else {
          throw validationError;
        }
      }

      // Add cancellation notification
      const User = require('../models/User');
      const user = await User.findById(actualUserId);
      const userName = user?.firstName || user?.username || 'User';
      
      await chatController.addCancelNotification(chat._id.toString(), actualUserId, roomId, userName);
    }

    logger.info(`Swap video session cancelled for swap ${swapId}, room ${roomId} by user ${actualUserId}`);
    res.json({ success: true, message: 'Video session cancelled successfully' });
    
  } catch (error) {
    console.error('Error cancelling swap video session:', error);
    res.status(500).json({ 
      error: 'Failed to cancel video session',
      details: error.message || 'Unknown error'
    });
  }
};

// End swap video call
exports.endSwapVideoCall = async (req, res) => {
  try {
    const { swapId } = req.params;
    const { userID, roomId } = req.body;
    
    if (!userID || !roomId) {
      return res.status(400).json({ error: 'userID and roomId are required' });
    }

    console.log('Ending swap video call:', { swapId, userID, roomId });

    // Find the swap request
    const SwapRequest = require('../models/SwapRequest');
    const swapRequest = await SwapRequest.findById(swapId);
    if (!swapRequest) {
      return res.status(404).json({ error: 'Swap request not found' });
    }

    // Find chat between the two users
    let chat = await Chat.findOne({
      type: 'personal',
      participants: { 
        $all: [swapRequest.sender, swapRequest.receiver],
        $size: 2 
      }
    });

    if (chat) {
      // Get user details
      const User = require('../models/User');
      const user = await User.findById(userID);
      const userName = user?.firstName || user?.username || 'User';

      // Add call ended notification
      await chatController.addCallEndedNotification(chat._id.toString(), userID, roomId, userName);
    }

    logger.info(`Swap video call ended for swap ${swapId}, room ${roomId} by user ${userID}`);
    res.json({ success: true, message: 'Swap video call ended successfully' });
    
  } catch (error) {
    console.error('Error ending swap video call:', error);
    res.status(500).json({ 
      error: 'Failed to end swap video call',
      details: error.message || 'Unknown error'
    });
  }
};

// Timeout swap video call invitation
exports.timeoutSwapVideoCall = async (req, res) => {
  try {
    const { swapId } = req.params;
    const { roomId } = req.body;
    
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    console.log('Timing out swap video call invitation:', { swapId, roomId });

    // Find the swap request
    const SwapRequest = require('../models/SwapRequest');
    const swapRequest = await SwapRequest.findById(swapId);
    if (!swapRequest) {
      return res.status(404).json({ error: 'Swap request not found' });
    }

    // Find chat between the two users
    let chat = await Chat.findOne({
      type: 'personal',
      participants: { 
        $all: [swapRequest.sender, swapRequest.receiver],
        $size: 2 
      }
    });

    if (chat) {
      // Add timeout notification
      await chatController.addTimeoutNotification(chat._id.toString(), roomId);
    }

    logger.info(`Swap video call invitation timed out for swap ${swapId}, room ${roomId}`);
    res.json({ success: true, message: 'Swap video call invitation timed out' });
    
  } catch (error) {
    console.error('Error timing out swap video call:', error);
    res.status(500).json({ 
      error: 'Failed to timeout swap video call',
      details: error.message || 'Unknown error'
    });
  }
};

const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { featureFlags } = require('../utils/envCheck');
const logger = require('../utils/logger');
const sanitizeInput = require('../utils/sanitizeInput');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const cloudinary = require('cloudinary').v2;
const videoSessionController = require('./videoSessionController');
const fs = require('fs');
const autoDeletionService = require('../utils/autoDeletionService');
const Notification = require('../models/Notification');
const axios = require('axios');
const http = require('http');
const https = require('https');

// Get all chats for user with pagination (optimized for speed and size)
exports.getChats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { limit = 20, cursor, search } = req.query;
    // Build query
    const query = { participants: userId };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'participants.username': { $regex: search, $options: 'i' } },
        { 'participants.firstName': { $regex: search, $options: 'i' } },
        { 'participants.lastName': { $regex: search, $options: 'i' } }
      ];
    }
    if (cursor && cursor !== 'null' && cursor !== 'undefined' && cursor !== '') {
      if (mongoose.Types.ObjectId.isValid(cursor)) {
        query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
      }
    }
    // Only select essential fields for chat list
    const chats = await Chat.find(query)
      .select('_id type title avatar participants lastMessage updatedAt readBy messages')
      .populate('participants', 'username firstName lastName avatar gender')
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit) + 1)
      .lean();
    const hasMore = chats.length > parseInt(limit);
    const nextCursor = hasMore ? chats[parseInt(limit) - 1]._id : null;
    const chatsToReturn = hasMore ? chats.slice(0, parseInt(limit)) : chats;
    // Only send unreadCount, not all messages
    const processedChats = chatsToReturn.map(chat => {
      const unreadCount = Array.isArray(chat.messages)
        ? chat.messages.filter(msg =>
            !chat.readBy.includes(msg.sender?.toString?.()) &&
            msg.sender?.toString?.() !== userId.toString()
          ).length
        : 0;
      return {
        _id: chat._id,
        type: chat.type,
        title: chat.title,
        avatar: chat.avatar,
        participants: chat.participants,
        lastMessage: chat.lastMessage,
        unreadCount,
        updatedAt: chat.updatedAt
      };
    });
    res.json({
      chats: processedChats,
      pagination: {
        hasMore,
        nextCursor,
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    logger.error('Get chats error:', err);
    next(err);
  }
};

// GET /api/chat/:chatId - Get specific chat
exports.getChat = async (req, res, next) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('participants', 'username firstName lastName avatar gender onlineStatus')
      .populate('community', 'name');

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found.' });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant._id.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }

    // Populate last message sender if exists
    if (chat.messages.length > 0) {
      await chat.populate('messages.sender', 'username avatar');
    }

    // Ensure avatar is always present for each participant
    if (chat && chat.participants) {
      chat.participants.forEach(user => {
        if (!user.avatar) {
          if (user.gender === 'female') {
            user.avatar = '../../public/IMAGES/female.jpg';
          } else {
            user.avatar = '../../public/IMAGES/male.jpg';
          }
        }
        
        // Ensure onlineStatus is always present
        if (!user.onlineStatus) {
          user.onlineStatus = {
            isOnline: false,
            lastSeen: new Date(),
            status: 'offline'
          };
        }
      });
    }

    res.json(chat);
  } catch (err) {
    logger.error('Get chat error:', err);
    next(err);
  }
};

// POST /api/chat - Create new chat (personal/group)
exports.createChat = async (req, res, next) => {
  try {
    // Log incoming request body and headers for debugging
    console.log('createChat req.headers:', req.headers);
    console.log('createChat req.body:', req.body);

    // Handle both JSON and FormData
    let recipient, type, community, title, participants;
    const isFormData = req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data');
    if (isFormData) {
      if (!req.body) {
        return res.status(400).json({ error: 'Missing request body' });
      }
      recipient = req.body.recipient;
      type = req.body.type;
      community = req.body.community;
      title = req.body.title;
      participants = req.body.participants ? JSON.parse(req.body.participants) : [];
    } else {
      // Always parse as JSON
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Missing or invalid request body' });
      }
      const data = sanitizeInput(req.body);
      recipient = data.recipient;
      type = data.type;
      community = data.community;
      title = data.title;
      participants = data.participants;
    }
    
    // For personal chats, we only need the recipient
    if (type === 'personal') {
      if (!recipient) {
        return res.status(400).json({ error: 'Recipient is required for personal chat.' });
      }

      // Validate recipient ID format
      if (!mongoose.Types.ObjectId.isValid(recipient)) {
        return res.status(400).json({ error: 'Invalid recipient ID format.' });
      }

      // Prevent self-chatting
      if (recipient === req.user._id.toString()) {
        return res.status(400).json({ error: 'Cannot create a chat with yourself.' });
      }

      // Verify recipient exists in database
      const recipientUser = await User.findById(recipient);
      if (!recipientUser) {
        return res.status(404).json({ error: 'Recipient user not found.' });
      }

      // Check if chat already exists between these users
      const existingChat = await Chat.findOne({
        type: 'personal',
        participants: { 
          $all: [req.user._id, new mongoose.Types.ObjectId(recipient)],
          $size: 2 
        }
      });

      if (existingChat) {
        await existingChat.populate('participants', 'username firstName lastName avatar gender');
        return res.json(existingChat);
      }

      // Create new personal chat with both users as participants
      const chat = await Chat.create({
        participants: [req.user._id, new mongoose.Types.ObjectId(recipient)],
        type: 'personal',
        readBy: [req.user._id] // Initialize readBy with current user
      });

      // Populate participant details
      await chat.populate('participants', 'username firstName lastName avatar gender');
      return res.status(201).json(chat);
    }

    // For group chats
    if (type === 'group') {
      if (!title || !participants || participants.length === 0) {
        return res.status(400).json({ error: 'Title and participants are required for group chat.' });
      }

      // Add current user to participants if not already included
      if (!participants.includes(req.user._id.toString())) {
        participants.push(req.user._id.toString());
      }

      // Validate all participant IDs
      for (const participantId of participants) {
        if (!mongoose.Types.ObjectId.isValid(participantId)) {
          return res.status(400).json({ error: 'Invalid participant ID format.' });
        }
      }

      // Verify all participants exist
      const participantUsers = await User.find({ _id: { $in: participants } });
      if (participantUsers.length !== participants.length) {
        return res.status(404).json({ error: 'One or more participants not found.' });
      }

      // Create group chat
      const chatData = {
        participants: participants.map(id => new mongoose.Types.ObjectId(id)),
        type: 'group',
        title: title,
        readBy: [req.user._id]
      };

      // Handle avatar upload for group chats
      if (req.file) {
        try {
          const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'group-avatars',
            width: 200,
            height: 200,
            crop: 'fill'
          });
          chatData.avatar = result.secure_url;
          
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
        } catch (uploadError) {
          console.error('Avatar upload error:', uploadError);
          // Continue without avatar if upload fails
        }
      }

      const chat = await Chat.create(chatData);
      await chat.populate('participants', 'username firstName lastName avatar gender');
      return res.status(201).json(chat);
    }

    res.status(400).json({ error: 'Invalid chat type.' });
  } catch (err) {
    logger.error('Create chat error:', err);
    next(err);
  }
};

// POST /api/chat/message/:chatId - Send text message
exports.sendMessage = async (req, res, next) => {
  try {
    const { content, type = 'text', invitationData } = sanitizeInput(req.body);
    
    if (!content && type !== 'file' && type !== 'image' && type !== 'document' && type !== 'pdf') {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found.' });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }

    const message = {
      sender: req.user._id,
      content: content,
      type: type,
      timestamp: new Date()
    };

    // Add invitation data for video invitations
    if (type === 'video_invitation' && invitationData) {
      message.invitationData = invitationData;
    }

    chat.messages.push(message);
    
    // Set appropriate last message text
    if (type === 'video_invitation') {
      chat.lastMessage = 'Video call invitation sent';
    } else if (type === 'file') {
      chat.lastMessage = 'File sent';
    } else if (type === 'image') {
      chat.lastMessage = 'Image sent';
    } else if (type === 'document') {
      chat.lastMessage = 'Document sent';
    } else if (type === 'pdf') {
      chat.lastMessage = 'PDF sent';
    } else {
      chat.lastMessage = content;
    }
    
    // Update readBy to include current user
    if (!chat.readBy.includes(req.user._id)) {
      chat.readBy.push(req.user._id);
    }
    
    await chat.save();

    // Populate the last message with sender details
    const populatedChat = await Chat.findById(chat._id)
      .populate('messages.sender', 'username avatar')
      .populate('participants', 'username avatar');

    const lastMessage = populatedChat.messages[populatedChat.messages.length - 1];

    res.status(201).json(lastMessage);
  } catch (err) {
    logger.error('Send message error:', err);
    next(err);
  }
};

// POST /api/chat/message/:chatId/file - Send file/image message
exports.sendFileMessage = async (req, res, next) => {
  try {
    console.log('--- sendFileMessage Debug ---');
    console.log('req.file:', req.file);
    console.log('req.body:', req.body);
    console.log('req.headers:', req.headers);
    console.log('Content-Type:', req.headers['content-type']);
    
    // For FormData requests, use filename as content
    const content = req.file?.originalname || 'File uploaded';
    const type = 'file';
    
    if (!req.file) {
      console.log('No file found in request');
      return res.status(400).json({ error: 'File is required.' });
    }

    console.log('File found:', req.file.originalname);

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found.' });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }

    // Determine file type
    let fileType = 'file';
    if (req.file.mimetype.startsWith('image/')) {
      fileType = 'image';
    } else if (req.file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (req.file.mimetype.includes('document') || req.file.mimetype.includes('word')) {
      fileType = 'document';
    }

    const message = {
      sender: req.user._id,
      content: content,
      type: fileType,
      timestamp: new Date()
    };

    // Handle file upload
    try {
      const cloudinary = require('cloudinary').v2;
      
      let uploadOptions = {
        folder: 'chat-files',
        resource_type: 'auto'
        // Do NOT set type: 'authenticated' or 'private' here. Default is public.
      };

      // Special handling for images
      if (fileType === 'image') {
        uploadOptions.folder = 'chat-images';
        uploadOptions.transformation = [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ];
        // Do NOT set type: 'authenticated' or 'private' here. Default is public.
      }

      // Upload file to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, uploadOptions);

      // Set minimal file message data - only essential info
      message.fileMessage = {
        fileUrl: result.secure_url || '', // Only the hosted path
        fileName: req.file.originalname || 'Unknown file',
        fileSize: req.file.size || 0,
        fileType: fileType || 'file',
        mimeType: req.file.mimetype || '',
        publicId: result.public_id || '',
        expiresAt: autoDeletionService.setFileExpiration(),
        isDeleted: false
      };
      // No conditional logic for images/pdfs here, always set the above fields for all file types.

      // For images, only store basic info - no thumbnail or dimensions
      if (fileType === 'image') {
        // Remove thumbnail and dimension data to reduce payload
        // message.fileMessage.thumbnailUrl = result.secure_url.replace('/upload/', '/upload/c_thumb,w_300,h_300/');
        // message.fileMessage.width = result.width;
        // message.fileMessage.height = result.height;
      } else if (fileType === 'pdf') {
        // Remove thumbnail for PDFs too
        // message.fileMessage.thumbnailUrl = result.secure_url.replace('/upload/', '/upload/c_thumb,w_300,h_300/');
      }

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      // Create notification for file sharing
      await createFileSharedNotification(chat, message, req.user);

    } catch (uploadError) {
      logger.error('File upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file.' });
    }

    chat.messages.push(message);
    
    // Set appropriate last message text
    if (fileType === 'image') {
      chat.lastMessage = 'Image sent';
    } else if (fileType === 'pdf') {
      chat.lastMessage = 'PDF sent';
    } else if (fileType === 'document') {
      chat.lastMessage = 'Document sent';
    } else {
      chat.lastMessage = 'File sent';
    }
    
    // Update readBy to include current user
    if (!chat.readBy.includes(req.user._id)) {
      chat.readBy.push(req.user._id);
    }
    
    await chat.save();

    // Populate the last message with sender details
    const populatedChat = await Chat.findById(chat._id)
      .populate('messages.sender', 'username avatar')
      .populate('participants', 'username avatar');

    const lastMessage = populatedChat.messages[populatedChat.messages.length - 1];

    res.status(201).json(lastMessage);
  } catch (err) {
    logger.error('Send file message error:', err);
    next(err);
  }
};

// Helper function to create image shared notification
const createImageSharedNotification = async (chat, message, sender) => {
  try {
    const notifications = chat.participants
      .filter(participantId => participantId.toString() !== sender._id.toString())
      .map(participantId => ({
        user: participantId,
        type: 'image_shared',
        sender: sender._id,
        context: `Chat: ${chat.title || 'Personal Chat'}`,
        action: 'View Image',
        metadata: {
          fileName: message.imageMessage.fileName,
          fileType: 'image',
          chatId: chat._id,
          messageId: message._id,
          sharedAt: new Date(),
          expiresAt: message.imageMessage.expiresAt
        }
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (error) {
    logger.error('Error creating image shared notification:', error);
  }
};

// Helper function to create file shared notification
const createFileSharedNotification = async (chat, message, sender) => {
  try {
    const notifications = chat.participants
      .filter(participantId => participantId.toString() !== sender._id.toString())
      .map(participantId => ({
        user: participantId,
        type: 'file_shared',
        sender: sender._id,
        context: `Chat: ${chat.title || 'Personal Chat'}`,
        action: 'View File',
        metadata: {
          fileName: message.fileMessage.fileName,
          fileType: message.fileMessage.fileType,
          chatId: chat._id,
          messageId: message._id,
          sharedAt: new Date(),
          expiresAt: message.fileMessage.expiresAt
        }
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (error) {
    logger.error('Error creating file shared notification:', error);
  }
};

// GET /api/chat/message/:chatId/:messageId/download - Download file on demand
exports.downloadFile = async (req, res, next) => {
  try {
    const { chatId, messageId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found.' });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }

    // Find the message
    const message = chat.messages.id(messageId);
    if (!message || !message.fileMessage) {
      return res.status(404).json({ error: 'File message not found.' });
    }

    // Check if file is deleted or expired
    if (message.fileMessage.isDeleted || (message.fileMessage.expiresAt && new Date() > message.fileMessage.expiresAt)) {
      return res.status(404).json({ error: 'File has been deleted or expired.' });
    }

    // Check if user has already downloaded
    if (message.fileMessage.downloadedBy && message.fileMessage.downloadedBy.includes(req.user._id)) {
      return res.status(403).json({ error: 'You have already downloaded this file.' });
    }

    // Download the file from remote and stream to client (force IPv4, support http/https)
    const fileUrl = message.fileMessage.fileUrl;
    const fileName = message.fileMessage.fileName || 'downloaded-file';
    const fileType = message.fileMessage.mimeType || 'application/octet-stream';

    // Set cache headers for faster repeated downloads
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    let agent;
    if (fileUrl.startsWith('https://')) {
      agent = new https.Agent({ family: 4 });
    } else if (fileUrl.startsWith('http://')) {
      agent = new http.Agent({ family: 4 });
    } else {
      agent = undefined;
    }
    try {
      const response = await axios.get(fileUrl, { responseType: 'stream', httpAgent: agent, httpsAgent: agent, timeout: 10000 });
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', fileType);
      response.data.pipe(res);
      // After streaming, record the user as having downloaded
      response.data.on('end', async () => {
        message.fileMessage.downloadedBy = message.fileMessage.downloadedBy || [];
        message.fileMessage.downloadedBy.push(req.user._id);
        await chat.save();
      });
    } catch (err) {
      // If axios fails (e.g., ETIMEDOUT), fallback to redirect
      logger.error('Download file error (stream failed, fallback to redirect):', err);
      // Optionally, you can record the download here as well
      message.fileMessage.downloadedBy = message.fileMessage.downloadedBy || [];
      message.fileMessage.downloadedBy.push(req.user._id);
      await chat.save();
      return res.redirect(fileUrl);
    }
  } catch (err) {
    logger.error('Download file error (outer catch):', err);
    return res.status(500).json({ error: 'Failed to download file. Please try again later.' });
  }
};

// POST /api/chat/typing/:chatId - Typing indicator (stub)
exports.typing = async (req, res, next) => {
  try {
    // TODO: Emit Socket.IO typing event
    res.json({ typing: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/chat/read/:chatId - Mark as read
exports.markAsRead = async (req, res, next) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found.' });
    if (!chat.readBy.includes(req.user.id)) {
      chat.readBy.push(req.user.id);
      await chat.save();
    }
    res.json({ read: true });
  } catch (err) {
    next(err);
  }
};

// GET /api/chat/:chatId/messages - Get messages for a chat (optimized, paginated, minimal fields)
exports.getMessages = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { limit = 20, before } = req.query; // 'before' is a message _id for pagination
    const chat = await Chat.findById(chatId).select('messages participants').lean();
    if (!chat) return res.status(404).json({ error: 'Chat not found.' });
    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }
    let messages = chat.messages || [];
    // Sort messages by timestamp descending
    messages = messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    // If paginating, only return messages before the given _id
    if (before && mongoose.Types.ObjectId.isValid(before)) {
      const beforeIndex = messages.findIndex(m => m._id.toString() === before);
      if (beforeIndex !== -1) {
        messages = messages.slice(beforeIndex + 1);
      }
    }
    // Return only the latest 'limit' messages
    const paginatedMessages = messages.slice(0, parseInt(limit));
    // Only return essential fields for each message
    const minimalMessages = paginatedMessages.reverse().map(m => ({
      _id: m._id,
      sender: m.sender,
      content: m.content,
      type: m.type,
      timestamp: m.timestamp,
      fileMessage: m.fileMessage ? {
        fileUrl: m.fileMessage.fileUrl,
        fileName: m.fileMessage.fileName,
        fileSize: m.fileMessage.fileSize,
        fileType: m.fileMessage.fileType,
        mimeType: m.fileMessage.mimeType,
        publicId: m.fileMessage.publicId,
        expiresAt: m.fileMessage.expiresAt,
        isDeleted: m.fileMessage.isDeleted,
        downloadedBy: m.fileMessage.downloadedBy || []
      } : undefined,
      invitationData: m.invitationData,
      // Add more fields if needed by frontend
    }));
    res.json({
      messages: minimalMessages,
      pagination: {
        hasMore: messages.length > parseInt(limit),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    logger.error('Get messages error:', err);
    next(err);
  }
};

// DELETE /api/chat/:chatId - Delete a chat
exports.deleteChat = async (req, res, next) => {
  try {
    const chat = await Chat.findOneAndDelete({ _id: req.params.chatId, participants: req.user._id });
    if (!chat) return res.status(404).json({ error: 'Chat not found or unauthorized.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// PUT /api/chat/message/:chatId/:messageId - Edit a message
exports.editMessage = async (req, res, next) => {
  try {
    const { content } = sanitizeInput(req.body);
    
    if (!content) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found.' });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }

    // Find and update the message
    const message = chat.messages.id(req.params.messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    // Check if user is the sender
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only edit your own messages.' });
    }

    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    
    await chat.save();

    // Populate the updated message with sender details
    await chat.populate('messages.sender', 'username avatar');
    const updatedMessage = chat.messages.id(req.params.messageId);

    res.json(updatedMessage);
  } catch (err) {
    logger.error('Edit message error:', err);
    next(err);
  }
};

// DELETE /api/chat/message/:chatId/:messageId - Delete a message
exports.deleteMessage = async (req, res, next) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found.' });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }

    // Find the message
    const message = chat.messages.id(req.params.messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    // Check if user is the sender
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Can only delete your own messages.' });
    }

    // Remove the message
    message.remove();
    await chat.save();

    res.json({ success: true });
  } catch (err) {
    logger.error('Delete message error:', err);
    next(err);
  }
};

// DELETE /api/chat/message/:chatId/:messageId/file - Delete file/image from message
exports.deleteMessageFile = async (req, res, next) => {
  try {
    const result = await autoDeletionService.deleteMessageFile(
      req.params.chatId, 
      req.params.messageId, 
      req.user._id
    );

    if (result) {
      res.json({ success: true, message: 'File deleted successfully' });
    } else {
      res.status(404).json({ error: 'No file found to delete' });
    }
  } catch (err) {
    logger.error('Delete message file error:', err);
    next(err);
  }
};

// GET /api/chat/online-users - Get online users
exports.getOnlineUsers = async (req, res, next) => {
  try {
    const onlineUsers = await User.find({ 
      'onlineStatus.isOnline': true 
    }).select('username avatar onlineStatus');
    
    res.json(onlineUsers);
  } catch (err) {
    next(err);
  }
};

// POST /api/chat/:chatId/video-session - Create video session for chat
exports.createVideoSessionForChat = async (req, res, next) => {
  // Add a simple test response first
  console.log('Video session endpoint hit');
  console.log('Request params:', req.params);
  console.log('Request body:', req.body);
  console.log('User:', req.user);
  
  // Test response to see if endpoint is working
  if (req.params.chatId === 'test') {
    return res.json({
      roomId: 'test_room_123',
      userId: req.user._id.toString(),
      token: 'test_token',
      appID: 1234567890,
      chatId: 'test',
      participants: [],
      createdAt: new Date(),
      joinUrl: '/video-session/test_room_123',
      status: 'active'
    });
  }
  
  try {
    console.log('Creating video session for chatId:', req.params.chatId);
    console.log('User ID:', req.user._id);

    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      console.log('Chat not found:', req.params.chatId);
      return res.status(404).json({ error: 'Chat not found.' });
    }

    console.log('Chat found:', chat._id, 'Participants:', chat.participants);

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      console.log('User not participant:', req.user._id);
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }

    console.log('User is participant, proceeding with video session creation');

    // Generate room ID for the video session
    const roomId = `chat_${req.params.chatId}_${Date.now()}`;
    const userId = req.user._id.toString();

    console.log('Generated roomId:', roomId, 'userId:', userId);

    // Generate ZEGOCLOUD token
    const { generateToken04 } = require('../server/zegoServerAssistant');
    const ZEGOCLOUD_APP_ID = Number(process.env.ZEGOCLOUD_APP_ID) || 1234567890; // Fallback for testing
    const ZEGOCLOUD_SERVER_SECRET = process.env.ZEGOCLOUD_SERVER_SECRET || 'test_secret_key_32_chars_long_123'; // Fallback for testing (32 chars)

    console.log('ZEGOCLOUD_APP_ID:', ZEGOCLOUD_APP_ID);
    console.log('ZEGOCLOUD_SERVER_SECRET length:', ZEGOCLOUD_SERVER_SECRET.length);

    if (!ZEGOCLOUD_APP_ID || !ZEGOCLOUD_SERVER_SECRET) {
      logger.warn('ZEGOCLOUD environment variables not set, using fallback values');
    }

    try {
      const effectiveTimeInSeconds = 3600; // 1 hour
      console.log('Generating token with params:', {
        appId: ZEGOCLOUD_APP_ID,
        userId: userId,
        secretLength: ZEGOCLOUD_SERVER_SECRET.length,
        effectiveTimeInSeconds: effectiveTimeInSeconds,
        roomId: roomId
      });

      const token = generateToken04(
        ZEGOCLOUD_APP_ID,
        userId,
        ZEGOCLOUD_SERVER_SECRET,
        effectiveTimeInSeconds,
        roomId
      );

      console.log('Token generated successfully, length:', token.length);

      const videoSession = {
        roomId: roomId,
        userId: userId,
        token: token,
        appID: ZEGOCLOUD_APP_ID,
        chatId: req.params.chatId,
        participants: chat.participants.map(p => p.toString()),
        createdAt: new Date(),
        joinUrl: `/video-session/${roomId}`,
        status: 'active'
      };

      logger.info(`Video session created successfully: ${roomId} for chat: ${req.params.chatId}`);
      console.log('Sending video session response:', videoSession);
      
      // Add join notification automatically
      try {
        const userName = req.user.firstName || req.user.username || 'User';
        await exports.addJoinNotification(
          req.params.chatId,
          req.user._id.toString(),
          roomId,
          userName
        );
        console.log('Join notification added automatically');
      } catch (notificationError) {
        console.error('Failed to add join notification:', notificationError);
        // Don't fail the video session creation if notification fails
      }
      
      res.json(videoSession);
    } catch (tokenError) {
      logger.error('Token generation error:', tokenError);
      console.error('Token generation error details:', tokenError);
      res.status(500).json({ 
        error: 'Failed to generate video session token',
        details: tokenError.message || 'Unknown error'
      });
    }
  } catch (err) {
    logger.error('Create video session error:', err);
    console.error('Create video session error details:', err);
    res.status(500).json({ 
      error: 'Failed to create video session',
      details: err.message || 'Unknown error'
    });
  }
};

// PATCH /api/chat/:chatId - Update chat (for group chats)
exports.updateChat = async (req, res, next) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found.' });
    }

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === req.user._id.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat.' });
    }

    // Only allow updates for group chats
    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'Can only update group chats.' });
    }

    const { title, participants } = req.body;

    if (title) {
      chat.title = title;
    }

    if (participants && Array.isArray(participants)) {
      // Validate all participant IDs
      for (const participantId of participants) {
        if (!mongoose.Types.ObjectId.isValid(participantId)) {
          return res.status(400).json({ error: 'Invalid participant ID format.' });
        }
      }

      // Verify all participants exist
      const participantUsers = await User.find({ _id: { $in: participants } });
      if (participantUsers.length !== participants.length) {
        return res.status(404).json({ error: 'One or more participants not found.' });
      }

      chat.participants = participants.map(id => new mongoose.Types.ObjectId(id));
    }

    // Handle avatar upload
    if (req.file) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'group-avatars',
          width: 200,
          height: 200,
          crop: 'fill'
        });
        chat.avatar = result.secure_url;
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
      } catch (uploadError) {
        console.error('Avatar upload error:', uploadError);
        // Continue without avatar if upload fails
      }
    }

    await chat.save();
    await chat.populate('participants', 'username firstName lastName avatar gender');

    res.json(chat);
  } catch (err) {
    logger.error('Update chat error:', err);
    next(err);
  }
};

// Send video session invite to chat
exports.sendVideoSessionInvite = async (senderId, receiverId, swapId, bannerUrl, joinUrl, userID) => {
  try {
    console.log('Sending video session invite:', { senderId, receiverId, swapId, joinUrl, userID });
    
    // Find or create a chat between the two users
    let chat = await Chat.findOne({
      type: 'personal',
      participants: { 
        $all: [senderId, receiverId],
        $size: 2 
      }
    });

    if (!chat) {
      console.log('Creating new chat for video session invite');
      // Create a new chat if it doesn't exist
      chat = await Chat.create({
        participants: [senderId, receiverId],
        type: 'personal',
        readBy: [senderId]
      });
    }

    // Create video invitation data
    const invitationData = {
      roomId: swapId,
      title: "Swap Video Session",
      description: "Join the video session to discuss the swap details",
      bannerImage: bannerUrl || "/IMAGES/video-call-banner.jpg",
      maxParticipants: 2,
      participants: [],
      isActive: true,
      createdBy: senderId,
      createdAt: new Date().toISOString(),
      chatId: chat._id.toString(),
      swapId: swapId,
      joinUrl: joinUrl
    };

    // Create the video invitation message
    const videoInviteMessage = {
      sender: senderId,
      content: JSON.stringify(invitationData),
      type: 'video_invitation',
      invitationData: invitationData,
      timestamp: new Date()
    };

    // Add message to chat
    chat.messages.push(videoInviteMessage);
    chat.lastMessage = 'Video session invitation sent';
    chat.updatedAt = new Date();
    await chat.save();

    // Populate sender details for the response
    await chat.populate('messages.sender', 'username avatar');
    
    logger.info(`Video session invite sent for swap ${swapId} between users ${senderId} and ${receiverId}`);
    console.log('Video session invite message added to chat:', chat._id);
    
    return chat;
  } catch (err) {
    logger.error('Send video session invite error:', err);
    console.error('Send video session invite error details:', err);
    throw err;
  }
};

// Send regular video session invite to chat
exports.sendRegularVideoSessionInvite = async (senderId, chatId, invitationData) => {
  try {
    console.log('Sending regular video session invite:', { senderId, chatId });
    
    // Find the chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Check if sender is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === senderId.toString()
    );

    if (!isParticipant) {
      throw new Error('Not a participant in this chat');
    }

    // Create the video invitation message
    const videoInviteMessage = {
      sender: senderId,
      content: JSON.stringify(invitationData),
      type: 'video_invitation',
      invitationData: invitationData,
      timestamp: new Date()
    };

    // Add message to chat
    chat.messages.push(videoInviteMessage);
    chat.lastMessage = 'Video session invitation sent';
    chat.updatedAt = new Date();
    await chat.save();

    // Populate sender details for the response
    await chat.populate('messages.sender', 'username avatar');
    
    logger.info(`Regular video session invite sent for chat ${chatId} by user ${senderId}`);
    console.log('Regular video session invite message added to chat:', chat._id);
    
    return chat;
  } catch (err) {
    logger.error('Send regular video session invite error:', err);
    console.error('Send regular video session invite error details:', err);
    throw err;
  }
};

// Add join notification message to chat
exports.addJoinNotification = async (chatId, userId, roomId, userName) => {
  try {
    console.log('Adding join notification:', { chatId, userId, roomId, userName });
    
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Create join notification message
    const joinMessage = {
      sender: userId,
      content: `🎥 ${userName} joined the video session`,
      type: 'system',
      timestamp: new Date(),
      metadata: {
        action: 'joined_video',
        roomId: roomId,
        userId: userId,
        userName: userName
      }
    };

    // Add message to chat
    chat.messages.push(joinMessage);
    chat.lastMessage = `${userName} joined video session`;
    chat.updatedAt = new Date();
    await chat.save();

    // Populate sender details for the response
    await chat.populate('messages.sender', 'username avatar');
    
    logger.info(`Join notification added for chat ${chatId}, user ${userName} joined room ${roomId}`);
    console.log('Join notification message added to chat:', chat._id);
    
    return chat;
  } catch (err) {
    logger.error('Add join notification error:', err);
    console.error('Add join notification error details:', err);
    throw err;
  }
};

// Route handler for join notification
exports.addJoinNotificationRoute = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userID, userName, roomId } = req.body;
    
    if (!userID || !userName || !roomId) {
      return res.status(400).json({ error: 'userID, userName, and roomId are required' });
    }
    
    await exports.addJoinNotification(chatId, userID, roomId, userName);
    res.json({ success: true, message: 'Join notification added' });
  } catch (error) {
    console.error('Add join notification route error:', error);
    res.status(500).json({ error: 'Failed to add join notification' });
  }
};

// Add leave notification message to chat
exports.addLeaveNotification = async (chatId, userId, roomId, userName) => {
  try {
    console.log('Adding leave notification:', { chatId, userId, roomId, userName });
    
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Create leave notification message
    const leaveMessage = {
      sender: userId,
      content: `👋 ${userName} left the video session`,
      type: 'system',
      timestamp: new Date(),
      metadata: {
        action: 'left_video',
        roomId: roomId,
        userId: userId,
        userName: userName
      }
    };

    // Add message to chat
    chat.messages.push(leaveMessage);
    chat.lastMessage = `${userName} left video session`;
    chat.updatedAt = new Date();
    await chat.save();

    // Check if video session should be auto-terminated
    const shouldTerminate = await exports.checkVideoSessionTermination(chatId, roomId);
    if (shouldTerminate) {
      console.log('Video session auto-terminated after user left');
    }

    // Populate sender details for the response
    await chat.populate('messages.sender', 'username avatar');
    
    logger.info(`Leave notification added for chat ${chatId}, user ${userName} left room ${roomId}`);
    console.log('Leave notification message added to chat:', chat._id);
    
    return chat;
  } catch (err) {
    logger.error('Add leave notification error:', err);
    console.error('Add leave notification error details:', err);
    throw err;
  }
};

// Route handler for leave notification
exports.addLeaveNotificationRoute = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userID, userName, roomId } = req.body;
    
    if (!userID || !userName || !roomId) {
      return res.status(400).json({ error: 'userID, userName, and roomId are required' });
    }
    
    await exports.addLeaveNotification(chatId, userID, roomId, userName);
    res.json({ success: true, message: 'Leave notification added' });
  } catch (error) {
    console.error('Add leave notification route error:', error);
    res.status(500).json({ error: 'Failed to add leave notification' });
  }
};

// Cancel video session for chat
exports.cancelVideoSession = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { userId, userID, roomId } = req.body;
    
    // Handle both userId and userID (frontend sends userID)
    const actualUserId = userId || userID;
    
    console.log('Cancelling video session:', { chatId, actualUserId, roomId });
    console.log('Request user:', req.user);
    console.log('Request body:', req.body);
    
    if (!actualUserId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const chat = await Chat.findById(chatId);
    if (!chat) {
      console.log('Chat not found for ID:', chatId);
      return res.status(404).json({ error: 'Chat not found' });
    }

    console.log('Found chat:', {
      participants: chat.participants,
      type: chat.type
    });

    // Check if user is a participant
    const isParticipant = chat.participants.some(
      participant => participant.toString() === actualUserId.toString()
    );

    console.log('User participation check:', {
      actualUserId,
      participants: chat.participants.map(p => p.toString()),
      isParticipant
    });

    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this chat' });
    }

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
    
    await exports.addCancelNotification(chatId, actualUserId, roomId, userName);

    logger.info(`Video session cancelled for chat ${chatId}, room ${roomId} by user ${userName}`);
    res.json({ success: true, message: 'Video session cancelled successfully' });
    
  } catch (err) {
    logger.error('Cancel video session error:', err);
    console.error('Cancel video session error details:', err);
    res.status(500).json({ error: 'Failed to cancel video session' });
  }
};

exports.endVideoCall = (req, res) => {
  res.json({ message: 'endVideoCall not implemented' });
};
exports.timeoutVideoCall = (req, res) => {
  res.json({ message: 'timeoutVideoCall not implemented' });
};
exports.checkVideoSessionTerminationRoute = (req, res) => {
  res.json({ message: 'checkVideoSessionTerminationRoute not implemented' });
};
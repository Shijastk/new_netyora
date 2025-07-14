const socketIO = require('socket.io');
const logger = require('./logger');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
  }

  initialize(server) {
    try {
      this.io = socketIO(server, {
        cors: {
          origin: process.env.CLIENT_URL || 'http://localhost:3000',
          methods: ['GET', 'POST'],
          credentials: true
        }
      });

      this.io.use(async (socket, next) => {
        try {
          const token = socket.handshake.auth.token;
          if (!token) {
            return next(new Error('Authentication error: No token provided'));
          }

          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const user = await User.findById(decoded.id).select('-password');
          
          if (!user) {
            return next(new Error('Authentication error: User not found'));
          }

          socket.user = user;
          next();
        } catch (error) {
          logger.error('Socket authentication error:', error);
          next(new Error('Authentication error: Invalid token'));
        }
      });

      this.io.on('connection', async (socket) => {
        logger.info(`New client connected: ${socket.id} for user: ${socket.user?.username}`);

        // Handle user authentication and online status
        socket.on('authenticate', async (data) => {
          try {
            if (socket.user && socket.user._id) {
              // Update user's online status
              const user = await User.findById(socket.user._id);
              if (user) {
                try {
                  await user.updateOnlineStatus(true, 'online');
                } catch (error) {
                  logger.error('Error updating online status:', error);
                  // Fallback: manually update the onlineStatus field
                  user.onlineStatus = {
                    isOnline: true,
                    status: 'online',
                    lastSeen: new Date()
                  };
                  await user.save();
                }
                
                this.connectedUsers.set(socket.user._id.toString(), {
                  socketId: socket.id,
                  userId: socket.user._id.toString(),
                  username: socket.user.username,
                  lastSeen: new Date()
                });

                // Broadcast user online status to all connected clients
                this.io.emit('userOnlineStatus', {
                  userId: socket.user._id.toString(),
                  isOnline: true,
                  status: 'online',
                  lastSeen: new Date()
                });

                logger.info(`User ${socket.user.username} is now online`);
              }
            }
          } catch (error) {
            logger.error('Error updating online status:', error);
          }
        });

        // Handle user status change (away, busy, etc.)
        socket.on('updateStatus', async (data) => {
          try {
            if (socket.user && socket.user._id) {
              const { status } = data;
              const user = await User.findById(socket.user._id);
              if (user) {
                try {
                  await user.updateOnlineStatus(true, status);
                } catch (error) {
                  logger.error('Error updating user status:', error);
                  // Fallback: manually update the onlineStatus field
                  user.onlineStatus = {
                    isOnline: true,
                    status: status,
                    lastSeen: new Date()
                  };
                  await user.save();
                }
                
                // Broadcast status change to all connected clients
                this.io.emit('userOnlineStatus', {
                  userId: socket.user._id.toString(),
                  isOnline: true,
                  status: status,
                  lastSeen: new Date()
                });
              }
            }
          } catch (error) {
            logger.error('Error updating user status:', error);
          }
        });

        // --- ROOM-BASED CHAT EVENTS ---
        // Join a chat room
        socket.on('joinChat', ({ chatId }) => {
          socket.join(chatId);
          logger.info(`Socket ${socket.id} joined chat room ${chatId}`);
        });
        
        // Leave a chat room
        socket.on('leaveChat', ({ chatId }) => {
          socket.leave(chatId);
          logger.info(`Socket ${socket.id} left chat room ${chatId}`);
        });
        
        // Send a message to a chat room
        socket.on('sendMessage', async ({ chatId, content, type }) => {
          try {
            // You may want to persist the message to DB here
            const message = {
              chatId,
              content,
              type: type || 'text',
              sender: {
                _id: socket.user._id,
                username: socket.user.username,
                avatar: socket.user.avatar
              },
              timestamp: new Date().toISOString(),
            };
            this.io.to(chatId).emit('message', message);
            logger.info(`Socket ${socket.id} sent message to chat ${chatId}`);
          } catch (error) {
            logger.error('Error sending message:', error);
          }
        });

        // Handle typing notifications (room-based)
        socket.on('typing', ({ chatId, isTyping }) => {
          socket.to(chatId).emit('typing', {
            userId: socket.user._id,
            username: socket.user.username,
            isTyping
          });
        });

        // --- VOICE MESSAGE EVENTS ---
        // Start voice recording
        socket.on('startVoiceRecording', ({ chatId }) => {
          this.io.to(chatId).emit('voiceRecordingStarted', {
            chatId,
            sender: {
              _id: socket.user._id,
              username: socket.user.username,
              firstName: socket.user.firstName,
              lastName: socket.user.lastName,
              avatar: socket.user.avatar
            },
            timestamp: new Date().toISOString(),
          });
          logger.info(`Socket ${socket.id} started voice recording in chat ${chatId}`);
        });

        // Stop voice recording
        socket.on('stopVoiceRecording', ({ chatId }) => {
          this.io.to(chatId).emit('voiceRecordingStopped', {
            chatId,
            sender: {
              _id: socket.user._id,
              username: socket.user.username,
              firstName: socket.user.firstName,
              lastName: socket.user.lastName,
              avatar: socket.user.avatar
            },
            timestamp: new Date().toISOString(),
          });
          logger.info(`Socket ${socket.id} stopped voice recording in chat ${chatId}`);
        });

        // Send voice message
        socket.on('sendVoiceMessage', ({ chatId, message, duration }) => {
          const voiceMessage = {
            ...message,
            chatId,
            type: 'voice',
            duration,
            sender: {
              _id: socket.user._id,
              username: socket.user.username,
              firstName: socket.user.firstName,
              lastName: socket.user.lastName,
              avatar: socket.user.avatar
            },
            timestamp: new Date().toISOString(),
          };
          this.io.to(chatId).emit('voiceMessage', voiceMessage);
          logger.info(`Socket ${socket.id} sent voice message to chat ${chatId}`);
        });

        // Voice message played
        socket.on('voiceMessagePlayed', ({ chatId, messageId }) => {
          this.io.to(chatId).emit('voiceMessagePlayed', {
            chatId,
            messageId,
            playedBy: {
              _id: socket.user._id,
              username: socket.user.username
            },
            timestamp: new Date().toISOString(),
          });
          logger.info(`Socket ${socket.id} marked voice message as played in chat ${chatId}`);
        });

        // Handle user presence
        socket.on('presence', (data) => {
          const { status } = data;
          socket.broadcast.emit('user_presence', {
            userId: socket.user._id,
            status
          });
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
          try {
            if (socket.user && socket.user._id) {
              // Update user's offline status
              const user = await User.findById(socket.user._id);
              if (user) {
                try {
                  await user.updateOnlineStatus(false, 'offline');
                } catch (error) {
                  logger.error('Error updating offline status:', error);
                  // Fallback: manually update the onlineStatus field
                  user.onlineStatus = {
                    isOnline: false,
                    status: 'offline',
                    lastSeen: new Date()
                  };
                  await user.save();
                }
                this.connectedUsers.delete(socket.user._id.toString());

                // Broadcast user offline status to all connected clients
                this.io.emit('userOnlineStatus', {
                  userId: socket.user._id.toString(),
                  isOnline: false,
                  status: 'offline',
                  lastSeen: new Date()
                });

                logger.info(`User ${socket.user.username} is now offline`);
              }
            }
          } catch (error) {
            logger.error('Error updating offline status:', error);
          }
        });
      });

      logger.info('Socket.IO server initialized');
      return this.io;
    } catch (error) {
      logger.error('Error initializing Socket.IO:', error);
      throw error;
    }
  }

  // Get socket instance
  getIO() {
    if (!this.io) {
      throw new Error('Socket.IO not initialized');
    }
    return this.io;
  }

  // Send message to specific user
  sendToUser(userId, event, data) {
    const userData = this.connectedUsers.get(userId);
    if (userData) {
      this.io.to(userData.socketId).emit(event, data);
      logger.info(`Event ${event} sent to user ${userId}`);
    } else {
      logger.warn(`Failed to send event ${event}: User ${userId} not online`);
    }
  }

  // Broadcast message to all users
  broadcast(event, data) {
    this.io.emit(event, data);
    logger.info(`Event ${event} broadcasted to all users`);
  }

  // Get online users
  getOnlineUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService; 
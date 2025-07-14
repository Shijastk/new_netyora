const Chat = require('../models/Chat');
const Notification = require('../models/Notification');
const cloudinary = require('cloudinary').v2;
const logger = require('./logger');

class AutoDeletionService {
  constructor() {
    this.isRunning = false;
    this.interval = null;
  }

  // Start the auto-deletion service
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    // Check for expired files every hour
    this.interval = setInterval(() => {
      this.processExpiredFiles();
    }, 60 * 60 * 1000); // 1 hour
    
    logger.info('Auto-deletion service started');
  }

  // Stop the auto-deletion service
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('Auto-deletion service stopped');
  }

  // Process expired files and images
  async processExpiredFiles() {
    try {
      const now = new Date();
      
      // Find chats with expired images
      const chatsWithExpiredImages = await Chat.find({
        'messages.imageMessage.expiresAt': { $lte: now },
        'messages.imageMessage.isDeleted': false
      });

      // Find chats with expired files
      const chatsWithExpiredFiles = await Chat.find({
        'messages.fileMessage.expiresAt': { $lte: now },
        'messages.fileMessage.isDeleted': false
      });

      logger.info(`Found ${chatsWithExpiredImages.length} chats with expired images and ${chatsWithExpiredFiles.length} chats with expired files`);

      // Process expired images
      for (const chat of chatsWithExpiredImages) {
        await this.processExpiredImages(chat);
      }

      // Process expired files
      for (const chat of chatsWithExpiredFiles) {
        await this.processExpiredFiles(chat);
      }

    } catch (error) {
      logger.error('Error processing expired files:', error);
    }
  }

  // Process expired images in a chat
  async processExpiredImages(chat) {
    try {
      const now = new Date();
      let hasChanges = false;

      for (const message of chat.messages) {
        if (message.imageMessage && 
            message.imageMessage.expiresAt && 
            message.imageMessage.expiresAt <= now && 
            !message.imageMessage.isDeleted) {
          
          // Delete from Cloudinary
          if (message.imageMessage.publicId) {
            try {
              await cloudinary.uploader.destroy(message.imageMessage.publicId);
              logger.info(`Deleted image from Cloudinary: ${message.imageMessage.publicId}`);
            } catch (cloudinaryError) {
              logger.error(`Error deleting image from Cloudinary: ${cloudinaryError.message}`);
            }
          }

          // Mark as deleted
          message.imageMessage.isDeleted = true;
          hasChanges = true;

          // Create notification for participants
          await this.createDeletionNotification(chat, message, 'image_deleted');
        }
      }

      if (hasChanges) {
        await chat.save();
        logger.info(`Updated chat ${chat._id} with deleted images`);
      }

    } catch (error) {
      logger.error(`Error processing expired images for chat ${chat._id}:`, error);
    }
  }

  // Process expired files in a chat
  async processExpiredFiles(chat) {
    try {
      const now = new Date();
      let hasChanges = false;

      for (const message of chat.messages) {
        if (message.fileMessage && 
            message.fileMessage.expiresAt && 
            message.fileMessage.expiresAt <= now && 
            !message.fileMessage.isDeleted) {
          
          // Delete from Cloudinary
          if (message.fileMessage.publicId) {
            try {
              await cloudinary.uploader.destroy(message.fileMessage.publicId);
              logger.info(`Deleted file from Cloudinary: ${message.fileMessage.publicId}`);
            } catch (cloudinaryError) {
              logger.error(`Error deleting file from Cloudinary: ${cloudinaryError.message}`);
            }
          }

          // Mark as deleted
          message.fileMessage.isDeleted = true;
          hasChanges = true;

          // Create notification for participants
          await this.createDeletionNotification(chat, message, 'file_deleted');
        }
      }

      if (hasChanges) {
        await chat.save();
        logger.info(`Updated chat ${chat._id} with deleted files`);
      }

    } catch (error) {
      logger.error(`Error processing expired files for chat ${chat._id}:`, error);
    }
  }

  // Create deletion notification for chat participants
  async createDeletionNotification(chat, message, notificationType) {
    try {
      const notifications = chat.participants.map(participantId => ({
        user: participantId,
        type: notificationType,
        sender: message.sender,
        context: `Chat: ${chat.title || 'Personal Chat'}`,
        action: 'View Chat',
        metadata: {
          fileName: message.imageMessage?.fileName || message.fileMessage?.fileName,
          fileType: message.imageMessage ? 'image' : message.fileMessage?.fileType,
          chatId: chat._id,
          messageId: message._id,
          deletionReason: 'auto_deletion',
          expiresAt: message.imageMessage?.expiresAt || message.fileMessage?.expiresAt
        }
      }));

      await Notification.insertMany(notifications);
      logger.info(`Created ${notifications.length} deletion notifications for chat ${chat._id}`);

    } catch (error) {
      logger.error('Error creating deletion notifications:', error);
    }
  }

  // Set expiration for image message (1 week)
  setImageExpiration() {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7); // 1 week
    return expirationDate;
  }

  // Set expiration for file message (1 month)
  setFileExpiration() {
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + 1); // 1 month
    return expirationDate;
  }

  // Manual deletion of a specific message
  async deleteMessageFile(chatId, messageId, userId) {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }

      const message = chat.messages.id(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user is participant
      if (!chat.participants.includes(userId)) {
        throw new Error('Not a participant in this chat');
      }

      let deleted = false;

      // Delete image if exists
      if (message.imageMessage && !message.imageMessage.isDeleted) {
        if (message.imageMessage.publicId) {
          await cloudinary.uploader.destroy(message.imageMessage.publicId);
        }
        message.imageMessage.isDeleted = true;
        deleted = true;
      }

      // Delete file if exists
      if (message.fileMessage && !message.fileMessage.isDeleted) {
        if (message.fileMessage.publicId) {
          await cloudinary.uploader.destroy(message.fileMessage.publicId);
        }
        message.fileMessage.isDeleted = true;
        deleted = true;
      }

      if (deleted) {
        await chat.save();
        await this.createDeletionNotification(chat, message, 'file_deleted');
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Error manually deleting message file:', error);
      throw error;
    }
  }
}

module.exports = new AutoDeletionService(); 
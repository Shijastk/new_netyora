// scripts/fix-invalid-file-messages.js
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Netyora', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const Chat = require('../models/Chat');

async function fixInvalidFileMessages() {
  try {
    console.log('Starting to fix invalid file messages...');
    
    // Find all chats with messages that have fileMessage but missing required fields or are text messages
    const chats = await Chat.find({
      'messages': {
        $elemMatch: {
          'fileMessage': { $exists: true }
        }
      }
    });

    console.log(`Found ${chats.length} chats with messages containing fileMessage`);

    let updatedChats = 0;
    let removedMessages = 0;

    for (const chat of chats) {
      let chatModified = false;
      
      // Check each message in the chat
      for (let i = 0; i < chat.messages.length; i++) {
        const message = chat.messages[i];
        const fileTypes = ['file', 'image', 'pdf', 'document'];
        const isFileType = fileTypes.includes(message.type);
        const hasRequiredFields = message.fileMessage && message.fileMessage.fileUrl && message.fileMessage.fileName;
        // Remove fileMessage if not a file type or missing required fields
        if (!isFileType && message.fileMessage) {
          console.log(`Removing fileMessage from non-file type message ${message._id} in chat ${chat._id}`);
          message.fileMessage = undefined;
          chatModified = true;
          removedMessages++;
        } else if (isFileType && message.fileMessage && !hasRequiredFields) {
          console.log(`Removing incomplete fileMessage from file type message ${message._id} in chat ${chat._id}`);
          message.fileMessage = undefined;
          chatModified = true;
          removedMessages++;
        }
      }
      
      if (chatModified) {
        await chat.save();
        updatedChats++;
        console.log(`Updated chat ${chat._id}`);
      }
    }

    console.log(`\nSummary:`);
    console.log(`- Updated ${updatedChats} chat(s) with cleaned file messages`);
    console.log(`- Removed ${removedMessages} invalid or unnecessary fileMessage objects`);
    
    if (updatedChats === 0) {
      console.log('No invalid file messages found. Database is clean!');
    }

  } catch (error) {
    console.error('Error fixing invalid file messages:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed');
  }
}

// Run the fix
fixInvalidFileMessages(); 
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('./logger');

// Migration script to initialize onlineStatus for existing users
async function migrateOnlineStatus() {
  try {
    console.log('Starting onlineStatus migration...');
    
    // Find all users without onlineStatus field or with empty onlineStatus
    const usersToUpdate = await User.find({
      $or: [
        { onlineStatus: { $exists: false } },
        { onlineStatus: null },
        { 'onlineStatus.isOnline': { $exists: false } }
      ]
    });
    
    console.log(`Found ${usersToUpdate.length} users to update`);
    
    let updatedCount = 0;
    
    for (const user of usersToUpdate) {
      try {
        // Initialize onlineStatus if it doesn't exist
        if (!user.onlineStatus) {
          user.onlineStatus = {
            isOnline: false,
            status: 'offline',
            lastSeen: new Date()
          };
        } else {
          // Ensure all required fields exist
          user.onlineStatus.isOnline = user.onlineStatus.isOnline || false;
          user.onlineStatus.status = user.onlineStatus.status || 'offline';
          user.onlineStatus.lastSeen = user.onlineStatus.lastSeen || new Date();
        }
        
        await user.save();
        updatedCount++;
        
        if (updatedCount % 100 === 0) {
          console.log(`Updated ${updatedCount} users...`);
        }
      } catch (error) {
        console.error(`Error updating user ${user._id}:`, error);
      }
    }
    
    console.log(`Migration completed. Updated ${updatedCount} users.`);
    
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  // Connect to MongoDB
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Netyora', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log('Connected to MongoDB');
    await migrateOnlineStatus();
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { migrateOnlineStatus }; 
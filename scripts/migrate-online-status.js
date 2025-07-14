#!/usr/bin/env node

const mongoose = require('mongoose');
const { migrateOnlineStatus } = require('../utils/migrateOnlineStatus');

// Load environment variables
require('dotenv').config();

async function runMigration() {
  try {
    console.log('Starting online status migration...');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Netyora';
    console.log('Connecting to MongoDB:', mongoUri);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB successfully');
    
    // Run the migration
    await migrateOnlineStatus();
    
    console.log('Migration completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration(); 
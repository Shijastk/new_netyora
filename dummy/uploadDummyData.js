// Script to upload extended dummy data to MongoDB for Netyora backend
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dummy = require('./dummyData');

const User = require('../models/User');
const Skill = require('../models/Skill');
const SwapRequest = require('../models/SwapRequest');
const Chat = require('../models/Chat');
const Community = require('../models/Community');
const Post = require('../models/Post');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const Transaction = require('../models/Transaction');
const SavedSearch = require('../models/SavedSearch');
const SwapCard = require('../models/SwapCard');

function mapPlaceholders(arr, map) {
  if (!arr) return arr;
  return JSON.parse(JSON.stringify(arr).replace(/USER_ID_(\d+)/g, (_, n) => map.users[n - 1])
    .replace(/SKILL_ID_(\d+)/g, (_, n) => map.skills[n - 1])
    .replace(/COMMUNITY_ID_(\d+)/g, (_, n) => map.communities[n - 1])
    .replace(/POST_ID_(\d+)/g, (_, n) => map.posts[n - 1])
    .replace(/EVENT_ID_(\d+)/g, (_, n) => map.events[n - 1])
    .replace(/ACTIVITY_ID_(\d+)/g, (_, n) => map.activities[n - 1])
    .replace(/SWAP_ID_(\d+)/g, (_, n) => map.swapRequests[n - 1]))
}

async function uploadDummyData() {
  await mongoose.connect(
    "mongodb+srv://shijas:Shijas9072@cluster0.zrdoj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    { useNewUrlParser: true, useUnifiedTopology: true }
  );
  console.log('Connected to MongoDB');
  // Clear collections
  await Promise.all([
    User.deleteMany({}), Skill.deleteMany({}), SwapRequest.deleteMany({}), Chat.deleteMany({}),
    Community.deleteMany({}), Post.deleteMany({}), Event.deleteMany({}), Notification.deleteMany({}),
    Activity.deleteMany({}), Transaction.deleteMany({}), SavedSearch.deleteMany({}), SwapCard.deleteMany({})
  ]);
  console.log('Cleared all collections');

  // Insert users (let pre-save hook hash passwords)
  const users = await Promise.all(dummy.users.map(async (u) => {
    return User.create(u);
  }));
  console.log('Inserted users');

  // Insert skills (assign user IDs)
  const skills = await Skill.insertMany(dummy.skills.map((s, i) => ({ ...s, user: users.find(u => u._id == s.user) ? s.user : users[0]._id })));
  console.log('Inserted skills');

  // Map for placeholder replacement
  const idMap = {
    users: users.map(u => u._id.toString()),
    skills: skills.map(s => s._id.toString()),
    communities: [],
    posts: [],
    events: [],
    activities: [],
    swapRequests: []
  };

  // Insert communities
  const communities = await Community.insertMany(mapPlaceholders(dummy.communities, idMap));
  idMap.communities = communities.map(c => c._id.toString());
  console.log('Inserted communities');

  // Insert posts
  const posts = await Post.insertMany(mapPlaceholders(dummy.posts, idMap));
  idMap.posts = posts.map(p => p._id.toString());
  console.log('Inserted posts');

  // Insert events
  const events = await Event.insertMany(mapPlaceholders(dummy.events, idMap));
  idMap.events = events.map(e => e._id.toString());
  console.log('Inserted events');

  // Insert swapRequests
  const swapRequests = await SwapRequest.insertMany(mapPlaceholders(dummy.swapRequests, idMap));
  idMap.swapRequests = swapRequests.map(s => s._id.toString());
  console.log('Inserted swapRequests');

  // Insert activities
  const activities = await Activity.insertMany(mapPlaceholders(dummy.activities, idMap));
  idMap.activities = activities.map(a => a._id.toString());
  console.log('Inserted activities');

  // Insert chats
  await Chat.insertMany(mapPlaceholders(dummy.chats, idMap));
  console.log('Inserted chats');

  // Insert notifications
  await Notification.insertMany(mapPlaceholders(dummy.notifications, idMap));
  console.log('Inserted notifications');

  // Insert transactions
  await Transaction.insertMany(mapPlaceholders(dummy.transactions, idMap));
  console.log('Inserted transactions');

  // Insert saved searches
  await SavedSearch.insertMany(mapPlaceholders(dummy.savedSearches, idMap));
  console.log('Inserted saved searches');

  // Insert swap cards
  if (dummy.swapCards) {
    await SwapCard.insertMany(mapPlaceholders(dummy.swapCards, idMap));
    console.log('Inserted swap cards');
  }

  await mongoose.disconnect();
  console.log('Dummy data upload complete!');
}

uploadDummyData().catch(err => {
  console.error('Error uploading dummy data:', err);
  process.exit(1);
});

const Community = require('../models/Community');
const Post = require('../models/Post');
const Event = require('../models/Event');
const Activity = require('../models/Activity');
const { featureFlags } = require('../utils/envCheck');
const { logger } = require('../utils/logger');
const sanitizeInput = require('../utils/sanitizeInput');
const { single, handleUploadError, validateFileType, processUploadedFiles } = require('../middleware/uploadMiddleware');
const User = require('../models/User');

// Helper function to safely get ObjectId from potentially populated fields
const getObjectId = (field) => {
  if (!field) return null;
  return typeof field === 'object' ? field._id : field;
};

// Helper function to safely compare ObjectIds
const compareObjectIds = (id1, id2) => {
  const objId1 = getObjectId(id1);
  const objId2 = getObjectId(id2);
  return objId1 && objId2 && objId1.toString() === objId2.toString();
};

// POST /api/communities - Create community
exports.createCommunity = async (req, res, next) => {
  try {
    const { name, description, rules, joinRule, tags } = sanitizeInput(req.body);
    
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    
    const communityData = {
      name,
      description,
      admin: req.user.id,
      members: [req.user.id],
      rules,
      joinRule,
      tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
    };
    
    const community = await Community.create(communityData);

    // Create activity record for community creation
    await Activity.create({
      user: req.user._id,
      type: 'community_create',
      message: `Created community: ${community.name}`,
      referenceId: community._id,
      referenceType: 'Community',
      metadata: {
        communityName: community.name,
        communityDescription: community.description,
        joinRule: community.joinRule,
        tags: community.tags,
        action: 'created'
      }
    });

    res.status(201).json(community);
  } catch (err) {
    next(err);
  }
};

// GET /api/communities/:id - Get single community
exports.getCommunityById = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id)
      .populate('members', 'username firstName lastName avatar bio')
      .populate('admin', 'username firstName lastName avatar bio');
    
    if (!community) {
      return res.status(404).json({ error: 'Community not found.' });
    }
    
    res.json(community);
  } catch (err) {
    next(err);
  }
};

// PUT /api/communities/:id - Update community (admin only)
exports.updateCommunity = async (req, res, next) => {
  try {
    const { name, description, rules, joinRule, tags } = sanitizeInput(req.body);
    const community = await Community.findById(req.params.id);
    
    if (!community) {
      return res.status(404).json({ error: 'Community not found.' });
    }
    
    // Check if user is admin
    if (community.admin.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Only admin can update community.' });
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (rules !== undefined) updateData.rules = rules;
    if (joinRule !== undefined) updateData.joinRule = joinRule;
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    
    const updatedCommunity = await Community.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('members', 'username firstName lastName avatar bio')
     .populate('admin', 'username firstName lastName avatar bio');
    
    // Create activity record for community update
    await Activity.create({
      user: req.user._id,
      type: 'community_update',
      message: `Updated community: ${updatedCommunity.name}`,
      referenceId: updatedCommunity._id,
      referenceType: 'Community',
      metadata: {
        communityName: updatedCommunity.name,
        communityDescription: updatedCommunity.description,
        joinRule: updatedCommunity.joinRule,
        tags: updatedCommunity.tags,
        action: 'updated'
      }
    });
    
    res.json(updatedCommunity);
  } catch (err) {
    next(err);
  }
};

// GET /api/communities - List/search communities (detailed for card view)
exports.getCommunities = async (req, res, next) => {
  try {
    const { name, skill, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (name) filter.name = new RegExp(name, 'i');
    // TODO: filter by skill
    const communities = await Community.find(filter)
      .select('_id name description image avatar headerImage createdAt members admin')
      .populate('members', 'username firstName lastName avatar bio')
      .populate('admin', 'username firstName lastName avatar bio')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    // Format for card view
    const formatted = communities.map(c => ({
      _id: c._id,
      name: c.name,
      description: c.description,
      image: c.image,
      avatar: c.avatar || '',
      headerImage: c.headerImage || '',
      createdAt: c.createdAt,
      admin: c.admin,
      members: c.members,
      memberCount: c.members.length,
    }));
    res.json(formatted);
  } catch (err) {
    next(err);
  }
};

// POST /api/communities/:id/join - Join/request to join
exports.joinCommunity = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (community.members.includes(req.user.id)) {
      return res.status(400).json({ error: 'Already a member.' });
    }
    if (community.joinRule === 'open') {
      community.members.push(req.user.id);
      await community.save();

      // Create activity record for joining community
      await Activity.create({
        user: req.user._id,
        type: 'community_join',
        message: `Joined community: ${community.name}`,
        referenceId: community._id,
        referenceType: 'Community',
        metadata: {
          communityName: community.name,
          communityDescription: community.description,
          joinRule: community.joinRule,
          action: 'joined'
        }
      });

      return res.json({ joined: true });
    }
    // TODO: handle request/invite-only logic
    res.json({ requested: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/communities/:id/leave - Leave community
exports.leaveCommunity = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    
    // Check if user is a member
    if (!community.members.includes(req.user.id)) {
      return res.status(400).json({ error: 'Not a member of this community.' });
    }

    // Check if user is admin (admin cannot leave, must transfer admin role first)
    if (community.admin.toString() === req.user.id.toString()) {
      return res.status(400).json({ error: 'Admin cannot leave community. Transfer admin role first.' });
    }

    // Remove user from members
    community.members = community.members.filter(memberId => memberId.toString() !== req.user.id.toString());
    await community.save();

    // Create activity record for leaving community
    await Activity.create({
      user: req.user._id,
      type: 'community_leave',
      message: `Left community: ${community.name}`,
      referenceId: community._id,
      referenceType: 'Community',
      metadata: {
        communityName: community.name,
        communityDescription: community.description,
        action: 'left'
      }
    });

    res.json({ left: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/communities/:id/post - Create post
exports.createPost = async (req, res, next) => {
  try {
    const { content, media, tags, visibility, postType } = sanitizeInput(req.body);
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }
    const post = await Post.create({
      community: community._id,
      user: req.user.id,
      content,
      media,
      tags,
      visibility,
      postType,
    });
    community.posts.push(post._id);
    await community.save();
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
};

// PUT /api/communities/:id/post/:postId - Edit post
exports.editPost = async (req, res, next) => {
  try {
    const updates = sanitizeInput(req.body);
    const post = await Post.findOneAndUpdate({ _id: req.params.postId, user: req.user.id }, updates, { new: true });
    if (!post) return res.status(404).json({ error: 'Post not found or unauthorized.' });
    res.json(post);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/communities/:id/post/:postId - Delete post
exports.deletePost = async (req, res, next) => {
  try {
    const post = await Post.findOneAndDelete({ _id: req.params.postId, user: req.user.id });
    if (!post) return res.status(404).json({ error: 'Post not found or unauthorized.' });
    await Community.findByIdAndUpdate(req.params.id, { $pull: { posts: req.params.postId } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/communities/:id/event - Create event
exports.createEvent = async (req, res, next) => {
  try {
    const { title, description, date, location, virtual, virtualLink } = sanitizeInput(req.body);
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }
    const event = await Event.create({
      community: community._id,
      title,
      description,
      date,
      location,
      virtual,
      virtualLink,
    });
    community.events.push(event._id);
    await community.save();
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
};

// Moderation: Approve/reject posts, ban/unban members
exports.moderate = async (req, res, next) => {
  try {
    const { action, postId, userId } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    
    // Check if admin exists and handle both ObjectId and populated object
    const adminId = getObjectId(community.admin);
    
    if (!adminId || !compareObjectIds(adminId, req.user.id)) {
      return res.status(403).json({ error: 'Only admin can moderate.' });
    }
    if (action === 'approvePost' && postId) {
      // Move post from pendingPosts to posts
      community.posts.push(postId);
      community.pendingPosts = community.pendingPosts.filter(id => id.toString() !== postId);
      await community.save();
      return res.json({ approved: true });
    }
    if (action === 'rejectPost' && postId) {
      // Remove from pendingPosts
      community.pendingPosts = community.pendingPosts.filter(id => id.toString() !== postId);
      await community.save();
      return res.json({ rejected: true });
    }
    if (action === 'ban' && userId) {
      if (!community.bannedMembers.includes(userId)) {
        community.bannedMembers.push(userId);
        community.members = community.members.filter(id => id.toString() !== userId);
        await community.save();
      }
      return res.json({ banned: true });
    }
    if (action === 'unban' && userId) {
      community.bannedMembers = community.bannedMembers.filter(id => id.toString() !== userId);
      await community.save();
      return res.json({ unbanned: true });
    }
    res.status(400).json({ error: 'Invalid moderation action.' });
  } catch (err) {
    next(err);
  }
};

// Enhanced Q&A voting system
exports.voteQuestion = async (req, res, next) => {
  try {
    const { qaId, voteType } = req.body; // voteType: 'upvote' or 'downvote'
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }

    const qaItem = community.qa.id(qaId);
    if (!qaItem) return res.status(404).json({ error: 'Question not found.' });

    // Check if user already voted
    const existingVoteIndex = qaItem.voters.findIndex(v => 
      compareObjectIds(v.user, req.user.id)
    );
    
    if (existingVoteIndex > -1) {
      const existingVote = qaItem.voters[existingVoteIndex];
      
      if (existingVote.vote === voteType) {
        // Remove vote if clicking same button
        qaItem.voters.splice(existingVoteIndex, 1);
        if (voteType === 'upvote') {
          qaItem.upvotes = Math.max(0, qaItem.upvotes - 1);
        } else {
          qaItem.downvotes = Math.max(0, qaItem.downvotes - 1);
        }
      } else {
        // Change vote type
        existingVote.vote = voteType;
        existingVote.votedAt = new Date();
        
        if (voteType === 'upvote') {
          qaItem.upvotes += 1;
          qaItem.downvotes = Math.max(0, qaItem.downvotes - 1);
        } else {
          qaItem.downvotes += 1;
          qaItem.upvotes = Math.max(0, qaItem.upvotes - 1);
        }
      }
    } else {
      // New vote
      qaItem.voters.push({
        user: req.user.id,
        vote: voteType,
        votedAt: new Date()
      });
      
      if (voteType === 'upvote') {
        qaItem.upvotes += 1;
      } else {
        qaItem.downvotes += 1;
      }
    }

    await community.save();
    
    // Return updated QA data in the expected format
    const populatedCommunity = await Community.findById(community._id)
      .populate('qa.questionAuthor', 'username firstName lastName avatar')
      .populate('qa.answers.user', 'username firstName lastName avatar');
    
    const updatedQA = populatedCommunity.qa.id(qaId);
    const transformedQA = {
      _id: updatedQA._id,
      question: updatedQA.question,
      user: updatedQA.questionAuthor,
      createdAt: updatedQA.createdAt,
      tags: updatedQA.tags || [],
      upvotes: updatedQA.upvotes || 0,
      downvotes: updatedQA.downvotes || 0,
      isResolved: updatedQA.isResolved || false,
      answers: (updatedQA.answers || []).map(answer => ({
        _id: answer._id,
        content: answer.content,
        user: answer.user,
        createdAt: answer.createdAt,
        upvotes: answer.upvotes || 0,
        downvotes: answer.downvotes || 0,
        isAccepted: answer.isAccepted || false,
        voters: answer.voters || []
      })),
      voters: updatedQA.voters || []
    };
    
    res.json(transformedQA);
  } catch (err) {
    console.error('Error voting on question:', err);
    next(err);
  }
};

exports.voteAnswer = async (req, res, next) => {
  try {
    const { qaId, answerId, voteType } = req.body; // voteType: 'upvote' or 'downvote'
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }

    const qaItem = community.qa.id(qaId);
    if (!qaItem) return res.status(404).json({ error: 'Question not found.' });

    const answer = qaItem.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found.' });

    // Check if user already voted
    const existingVoteIndex = answer.voters.findIndex(v => 
      compareObjectIds(v.user, req.user.id)
    );
    
    if (existingVoteIndex > -1) {
      const existingVote = answer.voters[existingVoteIndex];
      
      if (existingVote.vote === voteType) {
        // Remove vote if clicking same button
        answer.voters.splice(existingVoteIndex, 1);
        if (voteType === 'upvote') {
          answer.upvotes = Math.max(0, answer.upvotes - 1);
        } else {
          answer.downvotes = Math.max(0, answer.downvotes - 1);
        }
      } else {
        // Change vote type
        existingVote.vote = voteType;
        existingVote.votedAt = new Date();
        
        if (voteType === 'upvote') {
          answer.upvotes += 1;
          answer.downvotes = Math.max(0, answer.downvotes - 1);
        } else {
          answer.downvotes += 1;
          answer.upvotes = Math.max(0, answer.upvotes - 1);
        }
      }
    } else {
      // New vote
      answer.voters.push({
        user: req.user.id,
        vote: voteType,
        votedAt: new Date()
      });
      
      if (voteType === 'upvote') {
        answer.upvotes += 1;
      } else {
        answer.downvotes += 1;
      }
    }

    await community.save();
    
    // Return updated QA data in the expected format
    const populatedCommunity = await Community.findById(community._id)
      .populate('qa.questionAuthor', 'username firstName lastName avatar')
      .populate('qa.answers.user', 'username firstName lastName avatar');
    
    const updatedQA = populatedCommunity.qa.id(qaId);
    const transformedQA = {
      _id: updatedQA._id,
      question: updatedQA.question,
      user: updatedQA.questionAuthor,
      createdAt: updatedQA.createdAt,
      tags: updatedQA.tags || [],
      upvotes: updatedQA.upvotes || 0,
      downvotes: updatedQA.downvotes || 0,
      isResolved: updatedQA.isResolved || false,
      answers: (updatedQA.answers || []).map(answer => ({
        _id: answer._id,
        content: answer.content,
        user: answer.user,
        createdAt: answer.createdAt,
        upvotes: answer.upvotes || 0,
        downvotes: answer.downvotes || 0,
        isAccepted: answer.isAccepted || false,
        voters: answer.voters || []
      })),
      voters: updatedQA.voters || []
    };
    
    res.json(transformedQA);
  } catch (err) {
    console.error('Error voting on answer:', err);
    next(err);
  }
};

exports.acceptAnswer = async (req, res, next) => {
  try {
    const { qaId, answerId } = req.params; // Get from URL params instead of body
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });

    const qaItem = community.qa.id(qaId);
    if (!qaItem) return res.status(404).json({ error: 'Question not found.' });

    // Check if questionAuthor exists and handle both ObjectId and populated object
    const questionAuthorId = getObjectId(qaItem.questionAuthor);
    
    if (!questionAuthorId) {
      return res.status(400).json({ error: 'Question author not found.' });
    }

    // Only question author can accept answers
    if (!compareObjectIds(questionAuthorId, req.user.id)) {
      return res.status(403).json({ error: 'Only question author can accept answers.' });
    }

    const answer = qaItem.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found.' });

    // Unaccept all other answers first
    qaItem.answers.forEach(ans => {
      ans.isAccepted = false;
    });

    // Accept the selected answer
    answer.isAccepted = true;
    qaItem.isResolved = true;

    await community.save();
    
    // Return updated QA data in the expected format
    const populatedCommunity = await Community.findById(community._id)
      .populate('qa.questionAuthor', 'username firstName lastName avatar')
      .populate('qa.answers.user', 'username firstName lastName avatar');
    
    const updatedQA = populatedCommunity.qa.id(qaId);
    const transformedQA = {
      _id: updatedQA._id,
      question: updatedQA.question,
      user: updatedQA.questionAuthor,
      createdAt: updatedQA.createdAt,
      tags: updatedQA.tags || [],
      upvotes: updatedQA.upvotes || 0,
      downvotes: updatedQA.downvotes || 0,
      isResolved: updatedQA.isResolved || false,
      answers: (updatedQA.answers || []).map(answer => ({
        _id: answer._id,
        content: answer.content,
        user: answer.user,
        createdAt: answer.createdAt,
        upvotes: answer.upvotes || 0,
        downvotes: answer.downvotes || 0,
        isAccepted: answer.isAccepted || false,
        voters: answer.voters || []
      })),
      voters: updatedQA.voters || []
    };
    
    res.json(transformedQA);
  } catch (err) {
    next(err);
  }
};

// Enhanced Q&A: Post question, answer, upvote, list with sorting
exports.qa = async (req, res, next) => {
  try {
    const { question, answer, qaId, tags, sortBy = 'newest' } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }

    if (question) {
      // Post a new question
      const newQA = {
        question, 
        questionAuthor: req.user.id,
        answers: [],
        tags: Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
        upvotes: 0,
        downvotes: 0,
        voters: [],
        createdAt: new Date()
      };
      
      community.qa.push(newQA);
      await community.save();
      
      // Return the newly created QA with populated user data
      const populatedCommunity = await Community.findById(community._id)
        .populate('qa.questionAuthor', 'username firstName lastName avatar');
      
      const createdQA = populatedCommunity.qa[populatedCommunity.qa.length - 1];
      const transformedQA = {
        _id: createdQA._id,
        question: createdQA.question,
        user: createdQA.questionAuthor,
        createdAt: createdQA.createdAt,
        tags: createdQA.tags || [],
        upvotes: createdQA.upvotes || 0,
        downvotes: createdQA.downvotes || 0,
        isResolved: createdQA.isResolved || false,
        answers: [],
        voters: []
      };
      
      return res.json(transformedQA);
    }

    if (answer && qaId) {
      // Post an answer to a question
      const qaItem = community.qa.id(qaId);
      if (!qaItem) return res.status(404).json({ error: 'Q&A not found.' });
      
      const newAnswer = {
        user: req.user.id, 
        content: answer,
        upvotes: 0,
        downvotes: 0,
        voters: [],
        isAccepted: false,
        createdAt: new Date()
      };
      
      qaItem.answers.push(newAnswer);
      await community.save();
      
      // Return the updated QA with populated data
      const populatedCommunity = await Community.findById(community._id)
        .populate('qa.questionAuthor', 'username firstName lastName avatar')
        .populate('qa.answers.user', 'username firstName lastName avatar');
      
      const updatedQA = populatedCommunity.qa.id(qaId);
      const transformedQA = {
        _id: updatedQA._id,
        question: updatedQA.question,
        user: updatedQA.questionAuthor,
        createdAt: updatedQA.createdAt,
        tags: updatedQA.tags || [],
        upvotes: updatedQA.upvotes || 0,
        downvotes: updatedQA.downvotes || 0,
        isResolved: updatedQA.isResolved || false,
        answers: (updatedQA.answers || []).map(answer => ({
          _id: answer._id,
          content: answer.content,
          user: answer.user,
          createdAt: answer.createdAt,
          upvotes: answer.upvotes || 0,
          downvotes: answer.downvotes || 0,
          isAccepted: answer.isAccepted || false,
          voters: answer.voters || []
        })),
        voters: updatedQA.voters || []
      };
      
      return res.json(transformedQA);
    }

    // If no question or answer provided, return all Q&A (this should be handled by GET /qa)
    res.status(400).json({ error: 'Question or answer required.' });
  } catch (err) {
    console.error('Error in Q&A operation:', err);
    next(err);
  }
};

// GET /api/communities/:id - Get single community by ID (with populated details)
exports.getCommunityById = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id)
      .populate('admin', 'username firstName lastName avatar bio')
      .populate('members', 'username firstName lastName avatar bio')
      .populate({
        path: 'posts',
        select: 'content createdAt user',
        populate: { path: 'user', select: 'username firstName lastName avatar' }
      })
      .populate('events');
    if (!community) {
      return res.status(404).json({ error: 'Community not found.' });
    }
    res.json(community);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/communities/:id/image - Upload/change community image
exports.uploadCommunityImage = async (req, res, next) => {
  try {
    if (!req.file || !req.processedFiles || !req.processedFiles[0]) {
      return res.status(400).json({ error: 'No image uploaded.' });
    }
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    
    // Check if admin exists and handle both ObjectId and populated object
    const adminId = getObjectId(community.admin);
    
    if (!adminId || !compareObjectIds(adminId, req.user.id)) {
      return res.status(403).json({ error: 'Only admin can change community image.' });
    }
    community.image = req.processedFiles[0].url;
    await community.save();
    res.json({ image: community.image });
  } catch (err) {
    next(err);
  }
};

// GET /api/communities/:id/members - Get members with selected details
exports.getCommunityMembers = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id).populate('members', 'username firstName lastName avatar bio');
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    res.json(community.members);
  } catch (err) {
    next(err);
  }
};

// POST /api/communities/:id/join-request - Request to join a community
exports.requestToJoinCommunity = async (req, res, next) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (community.members.includes(req.user.id)) {
      return res.status(400).json({ error: 'Already a member.' });
    }
    if (community.joinRequests.includes(req.user.id)) {
      return res.status(400).json({ error: 'Join request already sent.' });
    }
    if (community.joinRule === 'open') {
      community.members.push(req.user.id);
      await community.save();
      return res.json({ joined: true });
    } else if (community.joinRule === 'request') {
      community.joinRequests.push(req.user.id);
      await community.save();
      return res.json({ requested: true });
    } else {
      return res.status(403).json({ error: 'Community is invite-only.' });
    }
  } catch (err) {
    next(err);
  }
};

// POST /api/communities/:id/approve-request - Approve a join request (admin only)
exports.approveJoinRequest = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    
    // Check if admin exists and handle both ObjectId and populated object
    const adminId = getObjectId(community.admin);
    
    if (!adminId || !compareObjectIds(adminId, req.user.id)) {
      return res.status(403).json({ error: 'Only admin can approve join requests.' });
    }
    if (!community.joinRequests.includes(userId)) {
      return res.status(400).json({ error: 'No such join request.' });
    }
    community.members.push(userId);
    community.joinRequests = community.joinRequests.filter(id => id.toString() !== userId);
    await community.save();
    res.json({ approved: true });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/communities/:id/avatar - Upload/change community avatar (admin only)
exports.uploadCommunityAvatar = async (req, res, next) => {
  try {
    if (!req.file || !req.processedFiles || !req.processedFiles[0]) {
      return res.status(400).json({ error: 'No avatar uploaded.' });
    }
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    
    // Check if admin exists and handle both ObjectId and populated object
    const adminId = getObjectId(community.admin);
    
    if (!adminId || !compareObjectIds(adminId, req.user.id)) {
      return res.status(403).json({ error: 'Only admin can change community avatar.' });
    }
    community.avatar = req.processedFiles[0].url;
    await community.save();
    res.json({ avatar: community.avatar });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/communities/:id/header-image - Upload/change community header image (admin only)
exports.uploadCommunityHeaderImage = async (req, res, next) => {
  try {
    if (!req.file || !req.processedFiles || !req.processedFiles[0]) {
      return res.status(400).json({ error: 'No header image uploaded.' });
    }
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    
    // Check if admin exists and handle both ObjectId and populated object
    const adminId = getObjectId(community.admin);
    
    if (!adminId || !compareObjectIds(adminId, req.user.id)) {
      return res.status(403).json({ error: 'Only admin can change community header image.' });
    }
    community.headerImage = req.processedFiles[0].url;
    await community.save();
    res.json({ headerImage: community.headerImage });
  } catch (err) {
    next(err);
  }
};

// Debates: Start debate, add comment, vote, list
exports.debate = async (req, res, next) => {
  try {
    const { topic, comment, debateId, vote } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }
    if (topic) {
      // Start a new debate
      community.debates.push({ topic, comments: [] });
      await community.save();
      return res.json({ debate: true });
    }
    if (comment && debateId && vote) {
      // Add a comment to a debate
      const debateItem = community.debates.id(debateId);
      if (!debateItem) return res.status(404).json({ error: 'Debate not found.' });
      debateItem.comments.push({ user: req.user.id, content: comment, vote });
      await community.save();
      return res.json({ comment: true });
    }
    // List all debates
    res.json(community.debates);
  } catch (err) {
    next(err);
  }
};

exports.voteDebate = async (req, res, next) => {
  try {
    const { debateId, commentId, vote } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }
    const debateItem = community.debates.id(debateId);
    if (!debateItem) return res.status(404).json({ error: 'Debate not found.' });
    const comment = debateItem.comments.id(commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    comment.vote = vote; // Overwrite previous vote
    await community.save();
    res.json({ voted: true });
  } catch (err) {
    next(err);
  }
};

// GET endpoint for fetching QA data with sorting and filtering
exports.getQA = async (req, res, next) => {
  try {
    const { sortBy = 'newest', filter, search, page = 1, limit = 10 } = req.query;
    const community = await Community.findById(req.params.id)
      .populate('qa.questionAuthor', 'username firstName lastName avatar')
      .populate('qa.answers.user', 'username firstName lastName avatar')
      .populate('qa.voters.user', 'username firstName lastName avatar')
      .populate('qa.answers.voters.user', 'username firstName lastName avatar');

    if (!community) {
      return res.status(404).json({ error: 'Community not found.' });
    }

    let qaList = [...community.qa];

    // Transform QA data to match frontend expectations
    const transformedQA = qaList.map(qa => ({
      _id: qa._id,
      question: qa.question,
      user: qa.questionAuthor, // Map questionAuthor to user
      createdAt: qa.createdAt,
      tags: qa.tags || [],
      upvotes: qa.upvotes || 0,
      downvotes: qa.downvotes || 0,
      isResolved: qa.isResolved || false,
      answers: (qa.answers || []).map(answer => ({
        _id: answer._id,
        content: answer.content,
        user: answer.user,
        createdAt: answer.createdAt,
        upvotes: answer.upvotes || 0,
        downvotes: answer.downvotes || 0,
        isAccepted: answer.isAccepted || false,
        voters: answer.voters || []
      })),
      voters: qa.voters || []
    }));

    // Apply sorting
    switch (sortBy) {
      case 'votes':
        transformedQA.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
        break;
      case 'newest':
        transformedQA.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'unanswered':
        transformedQA = transformedQA.filter(qa => qa.answers.length === 0);
        break;
      case 'resolved':
        transformedQA = transformedQA.filter(qa => qa.isResolved);
        break;
    }

    // Apply search filter
    if (search) {
      transformedQA = transformedQA.filter(qa => 
        qa.question.toLowerCase().includes(search.toLowerCase()) ||
        qa.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Pagination
    const total = transformedQA.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedQA = transformedQA.slice(startIndex, endIndex);

    res.json(paginatedQA);
  } catch (err) {
    console.error('Error fetching QA data:', err);
    next(err);
  }
};

// Update question
exports.updateQuestion = async (req, res, next) => {
  try {
    const { qaId } = req.params;
    const { question, tags } = req.body;
    const community = await Community.findById(req.params.id);
    
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }

    const qaItem = community.qa.id(qaId);
    if (!qaItem) return res.status(404).json({ error: 'Question not found.' });

    // Check if user is the question author
    if (!compareObjectIds(qaItem.questionAuthor, req.user.id)) {
      return res.status(403).json({ error: 'Only question author can edit questions.' });
    }

    // Update the question
    if (question) qaItem.question = question;
    if (tags) {
      qaItem.tags = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    }

    await community.save();
    
    // Return updated QA data in the expected format
    const populatedCommunity = await Community.findById(community._id)
      .populate('qa.questionAuthor', 'username firstName lastName avatar')
      .populate('qa.answers.user', 'username firstName lastName avatar');
    
    const updatedQA = populatedCommunity.qa.id(qaId);
    const transformedQA = {
      _id: updatedQA._id,
      question: updatedQA.question,
      user: updatedQA.questionAuthor,
      createdAt: updatedQA.createdAt,
      tags: updatedQA.tags || [],
      upvotes: updatedQA.upvotes || 0,
      downvotes: updatedQA.downvotes || 0,
      isResolved: updatedQA.isResolved || false,
      answers: (updatedQA.answers || []).map(answer => ({
        _id: answer._id,
        content: answer.content,
        user: answer.user,
        createdAt: answer.createdAt,
        upvotes: answer.upvotes || 0,
        downvotes: answer.downvotes || 0,
        isAccepted: answer.isAccepted || false,
        voters: answer.voters || []
      })),
      voters: updatedQA.voters || []
    };
    
    res.json(transformedQA);
  } catch (err) {
    console.error('Error updating question:', err);
    next(err);
  }
};

// Delete question
exports.deleteQuestion = async (req, res, next) => {
  try {
    const { qaId } = req.params;
    const community = await Community.findById(req.params.id);
    
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (!community.members.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a member.' });
    }

    const qaItem = community.qa.id(qaId);
    if (!qaItem) return res.status(404).json({ error: 'Question not found.' });

    // Check if user is the question author or community admin
    const adminId = getObjectId(community.admin);
    const isAdmin = adminId && compareObjectIds(adminId, req.user.id);
    const isAuthor = compareObjectIds(qaItem.questionAuthor, req.user.id);
    
    if (!isAdmin && !isAuthor) {
      return res.status(403).json({ error: 'Only question author or admin can delete questions.' });
    }

    // Remove the question
    community.qa = community.qa.filter(qa => qa._id.toString() !== qaId);
    await community.save();
    
    res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting question:', err);
    next(err);
  }
};

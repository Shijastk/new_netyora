const Post = require('../models/Post');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const mongoose = require('mongoose');
const { featureFlags } = require('../utils/envCheck');
const sanitizeInput = require('../utils/sanitizeInput');
const logger = require('../utils/logger');

// Helper to get userId from like entry (handles both ObjectId and {user, likedAt})
function getLikeUserId(like) {
  if (!like) return undefined;
  if (typeof like === 'object' && like.user) return like.user.toString();
  if (typeof like === 'object' && like._id) return like._id.toString();
  return like.toString();
}

// Helper function to create notification
const createNotification = async (data) => {
  try {
    // Verify MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      logger.error('MongoDB not connected. Current state:', mongoose.connection.readyState);
      return null;
    }

    // Validate required fields
    if (!data.userId || !data.type || !data.senderId) {
      logger.error('Missing required fields for notification:', data);
      return null;
    }

    // Create notification document
    const notification = new Notification({
      user: data.userId,
      type: data.type,
      sender: data.sender.id,
      context: data.context || '',
      action: data.action || 'View',
      read: false
    });

    // Save to database with timeout
    const savedNotification = await Promise.race([
      notification.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Notification save timeout')), 5000)
      )
    ]);

    logger.info('Notification saved to MongoDB:', {
      id: savedNotification._id,
      type: savedNotification.type,
      user: savedNotification.user,
      sender: savedNotification.sender
    });

    // Verify the notification was actually saved
    const verifyNotification = await Notification.findById(savedNotification._id);
    if (!verifyNotification) {
      logger.error('Notification verification failed - not found in database');
      return null;
    }

    return savedNotification;
  } catch (error) {
    logger.error('Error creating notification:', {
      error: error.message,
      stack: error.stack,
      data: data
    });
    return null;
  }
};

// GET /api/posts - List/search posts
exports.getPosts = async (req, res, next) => {
  try {
    const { 
      community, 
      user, 
      tags, 
      page = 1, 
      limit = 10, 
      sort = '-createdAt',
      userCity,
      userCountry 
    } = req.query;
    
    const filter = {};
    if (community) filter.community = community;
    if (user) {
      filter.user = user;
    } else {
      filter.user = { $ne: null };
    }
    if (tags) filter.tags = { $in: tags.split(',') };

    // Get posts with location-based prioritization
    let posts = [];
    let totalPosts = 0;

    if (userCity && userCountry) {
      // First, try to get posts from the same city/country
      const locationFilter = {
        ...filter,
        'user.location.city': userCity,
        'user.location.country': userCountry
      };

      const localPosts = await Post.find(locationFilter)
        .select('_id content user createdAt likes comments postType media tags community')
        .populate('user', 'username firstName lastName')
        .populate('community', 'name')
        .populate('likes.user', 'avatar firstName lastName')
        .populate('comments.user', 'username firstName lastName avatar')
        .populate('comments.replies.user', 'username firstName lastName avatar')
        .sort(sort)
        .limit(parseInt(limit) * 2) // Get more to mix with global posts
        .lean();

      // Then get global posts to fill the remaining slots
      const globalFilter = {
        ...filter,
        $or: [
          { 'user.location.city': { $ne: userCity } },
          { 'user.location.country': { $ne: userCountry } },
          { 'user.location.city': { $exists: false } },
          { 'user.location.country': { $exists: false } }
        ]
      };

      const globalPosts = await Post.find(globalFilter)
        .select('_id content user createdAt likes comments postType media tags community')
        .populate('user', 'username firstName lastName')
        .populate('community', 'name')
        .populate('likes.user', 'avatar firstName lastName')
        .populate('comments.user', 'username firstName lastName avatar')
        .populate('comments.replies.user', 'username firstName lastName avatar')
        .sort(sort)
        .limit(parseInt(limit) * 2)
        .lean();

      // Mix local and global posts (prioritize local)
      const localCount = Math.min(localPosts.length, Math.ceil(parseInt(limit) * 0.7));
      const globalCount = parseInt(limit) - localCount;
      
      posts = [
        ...localPosts.slice(0, localCount),
        ...globalPosts.slice(0, globalCount)
      ];

      totalPosts = await Post.countDocuments(filter);
    } else {
      // No location provided, get regular posts
      posts = await Post.find(filter)
        .select('_id content user createdAt likes comments postType media tags community')
        .populate('user', 'username firstName lastName avatar')
        .populate('community', 'name')
        .populate('likes.user', 'avatar firstName lastName')
        .populate('comments.user', 'username firstName lastName avatar')
        .populate('comments.replies.user', 'username firstName lastName avatar')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean();

      totalPosts = await Post.countDocuments(filter);
    }

    const postsWithNonNullUser = posts.filter(post => post.user);

    res.json({
        posts: postsWithNonNullUser.map(post => {
            const postObj = post;
            postObj.postType = postObj.postType || '';
            postObj.likes = (postObj.likes || []).map(like => ({
                userId: like.user?._id || like.user,
                avatar: like.user?.avatar || '',
                firstName: like.user?.firstName || '',
                lastName: like.user?.lastName || '',
                likedAt: like.likedAt
            }));
            postObj.user = postObj.user && typeof postObj.user === 'object' ? {
              _id: postObj.user._id,
              username: postObj.user.username,
              firstName: postObj.user.firstName,
              lastName: postObj.user.lastName,
              avatar: postObj.user.avatar || '',
              location: postObj.user.location
            } : postObj.user;
            postObj.comments = (postObj.comments || []).map((comment) => ({
              _id: comment._id,
              content: comment.content,
              createdAt: comment.createdAt || "",
              updatedAt: comment.updatedAt || "",
              user:
                comment.user && typeof comment.user === "object"
                  ? {
                      _id: comment.user._id,
                      username: comment.user.username,
                      firstName: comment.user.firstName,
                      lastName: comment.user.lastName,
                      avatar: comment.user.avatar || ""
                    }
                  : comment.user,
              replies: (comment.replies || []).map((reply) => ({
                _id: reply._id,
                content: reply.content,
                createdAt: reply.createdAt,
                updatedAt: reply.updatedAt,
                user:
                  reply.user && typeof reply.user === "object"
                    ? {
                        _id: reply.user._id,
                        username: reply.user.username,
                        firstName: reply.user.firstName,
                        lastName: reply.user.lastName,
                        avatar: reply.user.avatar || ""
                      }
                    : reply.user,
              })),
            }));
            return postObj;
        }),
        totalPages: Math.ceil(totalPosts / limit),
        currentPage: parseInt(page),
        locationBased: !!(userCity && userCountry)
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/posts/:id - Get single post
exports.getPostById = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('user', 'username firstName lastName avatar')
      .populate('community', 'name')
      .populate('likes.user', 'avatar firstName lastName')
      .populate('comments.user', 'username firstName lastName avatar')
      .populate('comments.replies.user', 'username firstName lastName avatar');
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const postObj = post.toObject();
    postObj.postType = postObj.postType || '';
    postObj.likes = (postObj.likes || []).map(like => ({
      userId: like.user?._id || like.user,
      avatar: like.user?.avatar || '',
      firstName: like.user?.firstName || '',
      lastName: like.user?.lastName || '',
      likedAt: like.likedAt
    }));
    postObj.user = postObj.user && typeof postObj.user === 'object' ? {
      _id: postObj.user._id,
      username: postObj.user.username,
      firstName: postObj.user.firstName,
      lastName: postObj.user.lastName,
      avatar: postObj.user.avatar || ''
    } : postObj.user;
    postObj.comments = (postObj.comments || []).map(comment => ({
      _id: comment._id,
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      user: comment.user && typeof comment.user === 'object' ? {
        _id: comment.user._id,
        username: comment.user.username,
        firstName: comment.user.firstName,
        lastName: comment.user.lastName,
        avatar: comment.user.avatar || ''
      } : comment.user,
      replies: (comment.replies || []).map(reply => ({
        _id: reply._id,
        content: reply.content,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        user: reply.user && typeof reply.user === 'object' ? {
          _id: reply.user._id,
          username: reply.user.username,
          firstName: reply.user.firstName,
          lastName: reply.user.lastName,
          avatar: reply.user.avatar || ''
        } : reply.user
      }))
    }));
    res.json(postObj);
  } catch (err) {
    next(err);
  }
};

// POST /api/posts - Create text-only post
exports.createPost = async (req, res, next) => {
  try {
    const { community, content, postType, tags, visibility } = sanitizeInput(req.body);
    const allowedPostTypes = [
      'Learning update',
      'Ask Question',
      'Share Tips',
      'Study Groups'
    ];
    if (!postType || !allowedPostTypes.includes(postType)) {
      return res.status(200).json({
        error: 'postType is required and must be one of: ' + allowedPostTypes.join(', '),
        postType: ''
      });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required for text posts.' });
    }
    
    logger.info('Creating text post:', {
      userId: req.user._id,
      content: content.substring(0, 50) + '...',
      postType,
      tags
    });

    let post;
    try {
      post = await Post.create({
        community,
        user: req.user._id,
        content,
        tags,
        postType,
        visibility,
      });
    } catch (err) {
      if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    logger.info('Text post created successfully:', {
      postId: post._id,
      postType
    });

    // Create activity record for post creation
    await Activity.create({
      user: req.user._id,
      type: 'post_create',
      message: `Created a new ${postType.toLowerCase()} post`,
      referenceId: post._id,
      referenceType: 'Post',
      metadata: {
        postType: postType,
        postContent: content.substring(0, 100),
        tags: tags || [],
        community: community || null,
        hasMedia: false,
        action: 'created'
      }
    });

    // Check for badge awards after post creation
    const badgeController = require('../controllers/badgeController');
    await badgeController.checkAndAwardBadges(req.user._id);

    const postObj = await Post.findById(post._id)
      .populate('user', 'username firstName lastName avatar')
      .populate('community', 'name')
      .populate('likes.user', 'avatar firstName lastName');
    const postJson = postObj.toObject();
    postJson.postType = postJson.postType || '';
    postJson.likes = (postJson.likes || []).map(like => ({
      userId: like.user?._id || like.user,
      avatar: like.user?.avatar || '',
      firstName: like.user?.firstName || '',
      lastName: like.user?.lastName || '',
      likedAt: like.likedAt
    }));
    res.status(201).json(postJson);
  } catch (err) {
    logger.error('Error creating text post:', err);
    next(err);
  }
};

// POST /api/posts/with-images - Create post with images
exports.createPostWithImages = async (req, res, next) => {
  try {
    const { community, content, postType, tags, visibility } = sanitizeInput(req.body);
    const allowedPostTypes = [
      'Learning update',
      'Ask Question',
      'Share Tips',
      'Study Groups'
    ];
    if (!postType || !allowedPostTypes.includes(postType)) {
      return res.status(200).json({
        error: 'postType is required and must be one of: ' + allowedPostTypes.join(', '),
        postType: ''
      });
    }
    if (!content && !req.files) {
      return res.status(400).json({ error: 'Content or images required.' });
    }
    
    logger.info('Creating post with images:', {
      userId: req.user._id,
      content: content ? content.substring(0, 50) + '...' : 'No content',
      postType,
      tags,
      imageCount: req.files ? req.files.length : 0
    });

    let images = [];
    
    // Handle multiple image uploads with advanced compression
    if (req.files && req.files.length > 0) {
      try {
        const cloudinary = require('cloudinary').v2;
        const imageCompression = require('../utils/imageCompression');
        const path = require('path');
        const fs = require('fs');
        
        // Upload all images to Cloudinary with advanced optimization
        const uploadPromises = req.files.map(async (file) => {
          // Validate image first
          const validation = await imageCompression.validateImage(file.path);
          if (!validation.valid) {
            throw new Error(`Invalid image: ${validation.error}`);
          }

          // Compress image before upload
          const compressedPath = file.path.replace(path.extname(file.path), '_compressed.webp');
          await imageCompression.compressImage(file.path, compressedPath, {
            width: 1200,
            height: 1200,
            quality: 85,
            format: 'webp'
          });

          // Upload compressed image to Cloudinary
          const result = await cloudinary.uploader.upload(compressedPath, {
            folder: 'post-images',
            transformation: [
              { width: 1200, height: 1200, crop: 'limit' },
              { quality: 'auto' },
              { fetch_format: 'auto' }
            ],
            resource_type: 'image',
            eager: [
              { width: 300, height: 300, crop: 'thumb', gravity: 'auto' },
              { width: 600, height: 600, crop: 'limit' }
            ],
            eager_async: true,
            eager_notification_url: process.env.CLOUDINARY_WEBHOOK_URL
          });

          // Clean up files
          fs.unlinkSync(file.path);
          fs.unlinkSync(compressedPath);
          
          return {
            url: result.secure_url,
            thumbnailUrl: result.eager?.[0]?.secure_url || result.secure_url.replace('/upload/', '/upload/c_thumb,w_300,h_300/'),
            mediumUrl: result.eager?.[1]?.secure_url || result.secure_url,
            publicId: result.public_id,
            fileName: file.originalname,
            fileSize: result.bytes,
            originalSize: file.size,
            width: result.width,
            height: result.height,
            alt: file.originalname,
            format: result.format,
            compressionRatio: ((file.size - result.bytes) / file.size * 100).toFixed(2)
          };
        });

        images = await Promise.all(uploadPromises);
        
        logger.info('Images uploaded successfully with compression:', {
          count: images.length,
          publicIds: images.map(img => img.publicId),
          totalOriginalSize: images.reduce((sum, img) => sum + (img.originalSize || 0), 0),
          totalCompressedSize: images.reduce((sum, img) => sum + (img.fileSize || 0), 0),
          averageCompressionRatio: (images.reduce((sum, img) => sum + parseFloat(img.compressionRatio || 0), 0) / images.length).toFixed(2)
        });
      } catch (uploadError) {
        logger.error('Image upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload images.' });
      }
    }

    let post;
    try {
      post = await Post.create({
        community,
        user: req.user._id,
        content,
        images,
        media: images.map(img => img.url), // Legacy support
        tags,
        postType,
        visibility,
      });
    } catch (err) {
      if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
    logger.info('Post with images created successfully:', {
      postId: post._id,
      postType,
      imageCount: images.length
    });

    // Create activity record for post creation
    await Activity.create({
      user: req.user._id,
      type: 'post_create',
      message: `Created a new ${postType.toLowerCase()} post with ${images.length} image${images.length !== 1 ? 's' : ''}`,
      referenceId: post._id,
      referenceType: 'Post',
      metadata: {
        postType: postType,
        postContent: content ? content.substring(0, 100) : '',
        tags: tags || [],
        community: community || null,
        hasMedia: true,
        imageCount: images.length,
        action: 'created'
      }
    });

    // Check for badge awards after post creation
    const badgeController = require('../controllers/badgeController');
    await badgeController.checkAndAwardBadges(req.user._id);

    const postObj = await Post.findById(post._id)
      .populate('user', 'username firstName lastName avatar')
      .populate('community', 'name')
      .populate('likes.user', 'avatar firstName lastName');
    const postJson = postObj.toObject();
    postJson.postType = postJson.postType || '';
    postJson.likes = (postJson.likes || []).map(like => ({
      userId: like.user?._id || like.user,
      avatar: like.user?.avatar || '',
      firstName: like.user?.firstName || '',
      lastName: like.user?.lastName || '',
      likedAt: like.likedAt
    }));
    res.status(201).json(postJson);
  } catch (err) {
    logger.error('Error creating post with images:', err);
    next(err);
  }
};

// PUT /api/posts/:id - Edit post
exports.editPost = async (req, res, next) => {
  try {
    const updates = sanitizeInput(req.body);
    const post = await Post.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id }, 
      updates, 
      { new: true }
    ).populate('user', 'username firstName lastName avatar')
     .populate('community', 'name')
     .populate('likes.user', 'avatar firstName lastName');
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized.' });
    }

    // Create activity record for post edit
    await Activity.create({
      user: req.user._id,
      type: 'post_edit',
      message: `Edited a post`,
      referenceId: post._id,
      referenceType: 'Post',
      metadata: {
        postType: post.postType || '',
        postContent: post.content ? post.content.substring(0, 100) : '',
        action: 'edited'
      }
    });

    const postObj = post.toObject();
    postObj.postType = postObj.postType || '';
    postObj.likes = (postObj.likes || []).map(like => ({
      userId: like.user?._id || like.user,
      avatar: like.user?.avatar || '',
      firstName: like.user?.firstName || '',
      lastName: like.user?.lastName || '',
      likedAt: like.likedAt
    }));
    res.json(postObj);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/posts/:id - Delete post
exports.deletePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized.' });
    }

    // Check if user owns this post
    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this post.' });
    }

    // Create activity record for post deletion
    await Activity.create({
      user: req.user._id,
      type: 'post_delete',
      message: `Deleted a post`,
      referenceId: post._id,
      referenceType: 'Post',
      metadata: {
        postType: post.postType || '',
        postContent: post.content ? post.content.substring(0, 100) : '',
        action: 'deleted'
      }
    });

    // Delete the post
    await Post.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    next(err);
  }
};

exports.deleteNullUserPosts = async (req, res) => {
  try {
    // Find posts with null user references
    const nullUserPosts = await Post.find({ user: null });
    
    if (nullUserPosts.length === 0) {
      return res.status(200).json({ message: 'No posts with null users found.' });
    }

    // Delete the found posts
    const deleteResult = await Post.deleteMany({ user: null });

    res.status(200).json({
      message: `${deleteResult.deletedCount} posts with null users have been deleted.`,
      deletedCount: deleteResult.deletedCount
    });
  } catch (error) {
    console.error('Error deleting posts with null users:', error);
    res.status(500).json({ message: 'An error occurred while deleting posts.' });
  }
};

// POST /api/posts/:id/like - Like/Unlike (toggle) post
exports.likePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    // Check if user already liked the post (handle both formats)
    const userLikeIndex = post.likes.findIndex(like => getLikeUserId(like) === req.user._id.toString());
    let action = '';
    if (userLikeIndex > -1) {
      // User already liked: remove like (unlike)
      post.likes.splice(userLikeIndex, 1);
      action = 'unliked';
    } else {
      // User has not liked: add like
      post.likes.push({ user: req.user._id, likedAt: new Date() });
      action = 'liked';
      // Create notification for post owner if it's not the same user
      if (post.user.toString() !== req.user._id.toString()) {
        const notificationData = {
          userId: post.user,
          type: 'like',
          senderId: req.user._id,
          context: {
            postId: post._id,
            postTitle: post.content ? post.content.substring(0, 20) : 'your post'
          }
        };
        const notification = await createNotification(notificationData);
        if (notification && req.io) {
          req.io.to(post.user.toString()).emit('newNotification', notification);
        }
      }
    }
    await post.save();
    const populatedPost = await Post.findById(post._id)
      .populate('user', 'username firstName lastName avatar')
      .populate('community', 'name')
      .populate('likes.user', 'avatar firstName lastName')
      .populate('comments.user', 'username firstName lastName avatar')
      .populate('comments.replies.user', 'username firstName lastName avatar');
    res.json({
      action,
      post: populatedPost
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/posts/:id/like - Unlike post
exports.unlikePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    // Find the index of the like entry for the current user
    const likeIndex = post.likes.findIndex(like => getLikeUserId(like) === req.user._id.toString());

    if (likeIndex > -1) {
      post.likes.splice(likeIndex, 1);
      await post.save();
    }
    const populatedPost = await Post.findById(post._id)
      .populate('user', 'username firstName lastName avatar')
      .populate('community', 'name')
      .populate('likes.user', 'avatar firstName lastName')
      .populate('comments.user', 'username firstName lastName avatar')
      .populate('comments.replies.user', 'username firstName lastName avatar');
    res.json({
      post: populatedPost
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/posts/:id/report - Report a post
exports.reportPost = async (req, res, next) => {
  try {
    const { reason, details } = sanitizeInput(req.body);
    const postId = req.params.id;
    
    if (!reason) {
      return res.status(400).json({ error: 'Report reason is required.' });
    }

    const post = await Post.findById(postId).populate('user', 'username firstName lastName');
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    // Check if user is reporting their own post
    if (post.user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot report your own post.' });
    }

    // Create report record
    const Report = require('../models/Report');
    const report = await Report.create({
      reporter: req.user._id,
      reportedPost: postId,
      reportedUser: post.user._id,
      reason,
      details: details || '',
      status: 'pending'
    });

    // Create notification for post owner
    const notificationData = {
      userId: post.user._id,
      type: 'post_reported',
      senderId: req.user._id,
      context: {
        postId: post._id,
        reportId: report._id,
        reason: reason
      }
    };

    const notification = await createNotification(notificationData);
    if (notification && req.io) {
      req.io.to(post.user._id.toString()).emit('newNotification', notification);
    }

    // Check if post should be automatically hidden based on report count
    const reportCount = await Report.countDocuments({
      reportedPost: postId,
      status: { $in: ['pending', 'reviewed'] }
    });

    if (reportCount >= 5) {
      // Auto-hide post after 5 reports
      post.visibility = 'hidden';
      await post.save();
    }

    res.status(201).json({
      message: 'Post reported successfully',
      reportId: report._id,
      reportCount
    });

  } catch (err) {
    logger.error('Error reporting post:', err);
    next(err);
  }
};

// POST /api/posts/:id/share - Share a post
exports.sharePost = async (req, res, next) => {
  try {
    const { platform, message } = sanitizeInput(req.body);
    const postId = req.params.id;
    
    const post = await Post.findById(postId).populate('user', 'username firstName lastName');
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    // Create share record
    const Share = require('../models/Share');
    const share = await Share.create({
      user: req.user._id,
      post: postId,
      platform: platform || 'internal',
      message: message || '',
      shareUrl: `${process.env.FRONTEND_URL}/post/${postId}`
    });

    // Create notification for post owner
    if (post.user._id.toString() !== req.user._id.toString()) {
      const notificationData = {
        userId: post.user._id,
        type: 'post_shared',
        senderId: req.user._id,
        context: {
          postId: post._id,
          shareId: share._id,
          platform: platform
        }
      };

      const notification = await createNotification(notificationData);
      if (notification && req.io) {
        req.io.to(post.user._id.toString()).emit('newNotification', notification);
      }
    }

    res.status(201).json({
      message: 'Post shared successfully',
      shareId: share._id,
      shareUrl: share.shareUrl
    });

  } catch (err) {
    logger.error('Error sharing post:', err);
    next(err);
  }
};

// POST /api/posts/:id/save - Save a post
exports.savePost = async (req, res, next) => {
  try {
    const postId = req.params.id;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    // Check if already saved
    const SavedPost = require('../models/SavedPost');
    const existingSave = await SavedPost.findOne({
      user: req.user._id,
      post: postId
    });

    if (existingSave) {
      return res.status(400).json({ error: 'Post already saved.' });
    }

    // Save post
    const savedPost = await SavedPost.create({
      user: req.user._id,
      post: postId,
      savedAt: new Date()
    });

    res.status(201).json({
      message: 'Post saved successfully',
      savedPostId: savedPost._id
    });

  } catch (err) {
    logger.error('Error saving post:', err);
    next(err);
  }
};

// DELETE /api/posts/:id/save - Unsave a post
exports.unsavePost = async (req, res, next) => {
  try {
    const postId = req.params.id;
    
    const SavedPost = require('../models/SavedPost');
    const savedPost = await SavedPost.findOneAndDelete({
      user: req.user._id,
      post: postId
    });

    if (!savedPost) {
      return res.status(404).json({ error: 'Saved post not found.' });
    }

    res.json({ message: 'Post unsaved successfully' });

  } catch (err) {
    logger.error('Error unsaving post:', err);
    next(err);
  }
};

// Enhanced comment functionality
exports.addComment = async (req, res, next) => {
  try {
    const { content, parentCommentId } = sanitizeInput(req.body);
    const postId = req.params.id;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required.' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ error: 'Comment too long. Maximum 1000 characters.' });
    }

    const post = await Post.findById(postId).populate('user', 'username firstName lastName');
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    // Rate limiting for comments
    const rateLimitKey = `comment:${req.user._id}`;
    const redis = require('../utils/redis');
    const commentCount = await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 300); // 5 minutes window
    
    if (commentCount > 10) {
      return res.status(429).json({ error: 'Too many comments. Please wait before commenting again.' });
    }

    let comment;
    if (parentCommentId) {
      // Add reply to existing comment
      const parentComment = post.comments.id(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({ error: 'Parent comment not found.' });
      }

      const reply = {
        user: req.user._id,
        content: content.trim(),
        createdAt: new Date()
      };

      parentComment.replies.push(reply);
      await post.save();

      comment = parentComment.replies[parentComment.replies.length - 1];

      // Notify parent comment author
      if (parentComment.user.toString() !== req.user._id.toString()) {
        const notificationData = {
          userId: parentComment.user,
          type: 'comment_reply',
          senderId: req.user._id,
          context: {
            postId: post._id,
            commentId: parentComment._id,
            replyId: comment._id
          }
        };

        const notification = await createNotification(notificationData);
        if (notification && req.io) {
          req.io.to(parentComment.user.toString()).emit('newNotification', notification);
        }
      }
    } else {
      // Add new comment
      comment = {
        user: req.user._id,
        content: content.trim(),
        createdAt: new Date(),
        replies: []
      };

    post.comments.push(comment);
    await post.save();

      comment = post.comments[post.comments.length - 1];
    }

    // Notify post author
    if (post.user._id.toString() !== req.user._id.toString()) {
        const notificationData = {
        userId: post.user._id,
            type: 'comment',
            senderId: req.user._id,
            context: {
              postId: post._id,
          commentId: comment._id
            }
        };

        const notification = await createNotification(notificationData);
        if (notification && req.io) {
        req.io.to(post.user._id.toString()).emit('newNotification', notification);
      }
    }

    // Populate user info for response
    const User = require('../models/User');
    const user = await User.findById(req.user._id).select('username firstName lastName avatar');

    const commentResponse = {
      _id: comment._id,
      content: comment.content,
      createdAt: comment.createdAt,
      user: {
        _id: user._id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar
      }
    };

    res.status(201).json(commentResponse);

  } catch (err) {
    logger.error('Error adding comment:', err);
    next(err);
  }
};

// PUT /api/posts/:id/comments/:commentId - Update comment
exports.updateComment = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }
    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }
    comment.content = sanitizeInput(req.body.content);
    await post.save();
    res.json(comment);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/posts/:id/comments/:commentId - Delete comment
exports.deleteComment = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }
    if (comment.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }
    comment.remove();
    await post.save();
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    next(err);
  }
};

// POST /api/posts/:postId/comment/:commentId/reply - Add reply to comment
exports.addReply = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }
    const reply = { user: req.user._id, content: sanitizeInput(req.body.content) };
    comment.replies.push(reply);
    await post.save();
    // Notification to comment author if not the same as replier
    if (comment.user.toString() !== req.user._id.toString()) {
      const notificationData = {
        userId: comment.user,
        type: 'reply',
        senderId: req.user._id,
        context: {
          postId: post._id,
          commentId: comment._id,
          replyId: comment.replies[comment.replies.length - 1]._id
        }
      };
      const notification = await createNotification(notificationData);
      if (notification && req.io) {
        req.io.to(comment.user.toString()).emit('newNotification', notification);
      }
    }
    res.status(201).json(comment.replies);
  } catch (err) {
    next(err);
  }
};

// PUT /api/posts/:postId/comment/:commentId/reply/:replyId - Update reply
exports.updateReply = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }
    const reply = comment.replies.id(req.params.replyId);
    if (!reply) {
      return res.status(404).json({ error: 'Reply not found.' });
    }
    if (reply.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }
    reply.content = sanitizeInput(req.body.content);
    await post.save();
    res.json(reply);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/posts/:postId/comment/:commentId/reply/:replyId - Delete reply
exports.deleteReply = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }
    const reply = comment.replies.id(req.params.replyId);
    if (!reply) {
      return res.status(404).json({ error: 'Reply not found.' });
    }
    if (reply.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }
    reply.remove();
    await post.save();
    res.json({ message: 'Reply deleted' });
  } catch (err) {
    next(err);
  }
};

// GET /api/posts/:id/related - Get related posts for a specific post
exports.getRelatedPosts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 10, page = 1 } = req.query;
    
    // Get the current post
    const currentPost = await Post.findById(id)
      .populate('user', 'username firstName lastName avatar')
      .populate('tags')
      .lean();
    
    if (!currentPost) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    const currentUserId = currentPost.user._id;
    const currentTags = currentPost.tags || [];
    const currentPostType = currentPost.postType;
    const currentCommunity = currentPost.community;

    // First, try to get related posts with high relevance
    let query = {
      _id: { $ne: id }, // Exclude current post
      visibility: 'public',
      user: { $ne: currentUserId } // Exclude posts by same user initially
    };

    // Add community filter if post is in a community
    if (currentCommunity) {
      query.community = currentCommunity;
    }

    // Get posts with similar characteristics
    let relatedPosts = await Post.find(query)
      .populate('user', 'username firstName lastName avatar')
      .populate('community', 'name')
      .populate('likes.user', 'avatar firstName lastName')
      .populate('comments.user', 'username firstName lastName avatar')
      .populate('comments.replies.user', 'username firstName lastName avatar')
      .sort('-createdAt')
      .limit(parseInt(limit) * 5) // Get more to filter and rank
      .lean();

    // If no related posts found, get random posts
    if (relatedPosts.length === 0) {
      relatedPosts = await Post.find({
        _id: { $ne: id },
        visibility: 'public',
        user: { $ne: currentUserId }
      })
      .populate('user', 'username firstName lastName avatar')
      .populate('community', 'name')
      .populate('likes.user', 'avatar firstName lastName')
      .populate('comments.user', 'username firstName lastName avatar')
      .populate('comments.replies.user', 'username firstName lastName avatar')
      .sort('-createdAt')
      .limit(parseInt(limit) * 3)
      .lean();
    }

    // Score and rank posts by relevance
    const scoredPosts = relatedPosts.map(post => {
      let score = 0;
      let relevanceFactors = [];
      
      // Same post type (high priority - 10 points)
      if (post.postType === currentPostType) {
        score += 10;
        relevanceFactors.push('same_post_type');
      }
      
      // Tag matches (medium priority - 5 points per tag)
      if (post.tags && currentTags.length > 0) {
        const matchingTags = post.tags.filter(tag => currentTags.includes(tag));
        score += matchingTags.length * 5;
        if (matchingTags.length > 0) {
          relevanceFactors.push(`tag_match_${matchingTags.length}`);
        }
      }
      
      // Same community (medium priority - 3 points)
      if (post.community && currentCommunity && post.community._id.toString() === currentCommunity.toString()) {
        score += 3;
        relevanceFactors.push('same_community');
      }
      
      // Engagement bonus (low priority - 0-2 points)
      const engagement = (post.likes?.length || 0) + (post.comments?.length || 0);
      const engagementScore = Math.min(engagement / 10, 2);
      score += engagementScore;
      if (engagement > 5) {
        relevanceFactors.push('high_engagement');
      }
      
      // Recency bonus (low priority - 0-1 point)
      const daysSinceCreated = (Date.now() - new Date(post.createdAt)) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - (daysSinceCreated / 30)); // 30 days max
      score += recencyScore;
      if (daysSinceCreated < 7) {
        relevanceFactors.push('recent_post');
      }
      
      // Popular user bonus (medium priority - 2 points)
      const userFollowers = post.user?.followers?.length || 0;
      if (userFollowers > 10) {
        score += 2;
        relevanceFactors.push('popular_user');
      }
      
      // Post quality bonus (low priority - 1 point)
      const hasMedia = post.media && post.media.length > 0;
      const hasTags = post.tags && post.tags.length > 0;
      const hasGoodContent = post.content && post.content.length > 50;
      
      if (hasMedia || hasTags || hasGoodContent) {
        score += 1;
        relevanceFactors.push('quality_post');
      }
      
      return { 
        ...post, 
        relevanceScore: score,
        relevanceFactors,
        isRandom: score < 5 // Mark as random if low relevance
      };
    });

    // Sort by relevance score and apply pagination
    scoredPosts.sort((a, b) => b.relevanceScore - a.score);
    
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedPosts = scoredPosts.slice(startIndex, endIndex);

    // Format posts like the main getPosts endpoint
    const formattedPosts = paginatedPosts.map(post => {
      const postObj = post;
      postObj.postType = postObj.postType || '';
      postObj.likes = (postObj.likes || []).map(like => ({
        userId: like.user?._id || like.user,
        avatar: like.user?.avatar || '',
        firstName: like.user?.firstName || '',
        lastName: like.user?.lastName || '',
        likedAt: like.likedAt
      }));
      postObj.user = postObj.user && typeof postObj.user === 'object' ? {
        _id: postObj.user._id,
        username: postObj.user.username,
        firstName: postObj.user.firstName,
        lastName: postObj.user.lastName,
        avatar: postObj.user.avatar || ''
      } : postObj.user;
      postObj.comments = (postObj.comments || []).map(comment => ({
        _id: comment._id,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        user: comment.user && typeof comment.user === 'object' ? {
          _id: comment.user._id,
          username: comment.user.username,
          firstName: comment.user.firstName,
          lastName: comment.user.lastName,
          avatar: comment.user.avatar || ''
        } : comment.user,
        replies: (comment.replies || []).map(reply => ({
          _id: reply._id,
          content: reply.content,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
          user: reply.user && typeof reply.user === 'object' ? {
            _id: reply.user._id,
            username: reply.user.username,
            firstName: reply.user.firstName,
            lastName: reply.user.lastName,
            avatar: reply.user.avatar || ''
          } : reply.user
        }))
      }));
      return postObj;
    });

    // Calculate metadata
    const recommendedPosts = formattedPosts.filter(post => !post.isRandom);
    const randomPosts = formattedPosts.filter(post => post.isRandom);
    const averageScore = scoredPosts.reduce((sum, post) => sum + post.relevanceScore, 0) / scoredPosts.length;

    res.json({
      posts: formattedPosts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: scoredPosts.length,
        pages: Math.ceil(scoredPosts.length / parseInt(limit))
      },
      metadata: {
        currentPostId: id,
        totalCandidates: relatedPosts.length,
        averageScore: averageScore,
        recommendedCount: recommendedPosts.length,
        randomCount: randomPosts.length,
        hasRelatedPosts: recommendedPosts.length > 0,
        relevanceFactors: scoredPosts.reduce((factors, post) => {
          post.relevanceFactors.forEach(factor => {
            factors[factor] = (factors[factor] || 0) + 1;
          });
          return factors;
        }, {})
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/posts/main-feed - Get main feed with recommendations and mixed content
exports.getMainFeed = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      userCity,
      userCountry,
      userInterests = [],
      lastPostId 
    } = req.query;
    
    const userId = req.user?._id;
    const skip = (page - 1) * limit;
    
    // Rate limiting check
    const rateLimitKey = `feed:${userId || req.ip}`;
    const redis = require('../utils/redis');
    
    try {
      const requestCount = await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, 60); // 1 minute window
      
      if (requestCount > 100) {
        return res.status(429).json({ 
          error: 'Too many requests. Please wait before refreshing.' 
        });
      }
    } catch (redisError) {
      logger.warn('Redis not available, skipping rate limiting:', redisError.message);
    }

    // Get user preferences and interests
    let userPreferences = {
      interests: [],
      skills: [],
      location: null,
      following: []
    };
    
    if (userId) {
      const User = require('../models/User');
      const user = await User.findById(userId).select('interests skills location following');
      if (user) {
        userPreferences = {
          interests: user.interests || [],
          skills: user.skills || [],
          location: user.location || null,
          following: user.following || []
        };
      }
    }

    // Build recommendation algorithm
    const recommendationPipeline = [
      {
        $match: {
          visibility: 'public',
          user: { $ne: null },
          $or: [
            { content: { $exists: true, $ne: '' } },
            { images: { $exists: true, $ne: [] } },
            { media: { $exists: true, $ne: [] } }
          ]
        }
      },
      {
        $addFields: {
          // Calculate relevance score
          relevanceScore: {
            $add: [
              // Base score
              10,
              // Engagement score
              { $multiply: [{ $size: { $ifNull: ['$likes', []] } }, 2] },
              { $multiply: [{ $size: { $ifNull: ['$comments', []] } }, 3] },
              // Recency score (posts from last 7 days get bonus)
              {
                $cond: {
                  if: { $gte: ['$createdAt', { $subtract: [new Date(), 7 * 24 * 60 * 60 * 1000] }] },
                  then: 5,
                  else: 0
                }
              }
            ]
          }
        }
      },
      // Add location relevance after user lookup
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $addFields: {
          locationRelevance: 0,
          interestRelevance: 0,
          followingRelevance: 0
        }
      },
      {
        $addFields: {
          relevanceScore: {
            $add: ['$relevanceScore', '$locationRelevance', '$interestRelevance', '$followingRelevance']
          }
        }
      },
      {
        $sort: { relevanceScore: -1, createdAt: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: parseInt(limit)
      },
      {
        $lookup: {
          from: 'communities',
          localField: 'community',
          foreignField: '_id',
          as: 'community'
        }
      },
      {
        $unwind: {
          path: '$community',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'likes.user',
          foreignField: '_id',
          as: 'likesUsers'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'comments.user',
          foreignField: '_id',
          as: 'commentsUsers'
        }
      },
      {
        $addFields: {
          user: {
            _id: '$user._id',
            username: '$user.username',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            avatar: '$user.avatar',
            location: '$user.location'
          },
          community: {
            _id: '$community._id',
            name: '$community.name'
          },
          likes: {
            $map: {
              input: '$likes',
              as: 'like',
              in: {
                userId: '$$like.user',
                likedAt: '$$like.likedAt'
              }
            }
          },
          comments: {
            $map: {
              input: '$comments',
              as: 'comment',
              in: {
                _id: '$$comment._id',
                content: '$$comment.content',
                createdAt: '$$comment.createdAt',
                updatedAt: '$$comment.updatedAt',
                user: {
                  _id: '$$comment.user',
                  username: '$$comment.user.username',
                  firstName: '$$comment.user.firstName',
                  lastName: '$$comment.user.lastName',
                  avatar: '$$comment.user.avatar'
                }
              }
            }
          }
        }
      }
    ];

    // Get recommended posts
    const recommendedPosts = await Post.aggregate(recommendationPipeline);
    
    // Add relevance scores in JavaScript
    const postsWithRelevance = recommendedPosts.map(post => {
      let relevanceScore = post.relevanceScore || 0;
      
      try {
        // Add location relevance
        if (userPreferences.location?.city && 
            post.user?.location?.city && 
            post.user.location.city === userPreferences.location.city) {
          relevanceScore += 3;
        }
        
        // Add interest relevance
        if (userPreferences.interests?.length > 0 && post.tags?.length > 0) {
          const commonInterests = post.tags.filter(tag => 
            userPreferences.interests.includes(tag)
          );
          if (commonInterests.length > 0) {
            relevanceScore += 4;
          }
        }
        
        // Add following relevance
        if (userPreferences.following?.length > 0 && 
            post.user?._id && 
            userPreferences.following.includes(post.user._id.toString())) {
          relevanceScore += 6;
        }
      } catch (error) {
        logger.error('Error calculating relevance score:', error);
        // Continue with base relevance score
      }
      
      return {
        ...post,
        relevanceScore
      };
    });
    
    // Sort by relevance score
    postsWithRelevance.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Get trending posts (high engagement)
    const trendingPipeline = [
      {
        $match: {
          visibility: 'public',
          user: { $ne: null },
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        }
      },
      {
        $addFields: {
          engagementScore: {
            $add: [
              { $size: { $ifNull: ['$likes', []] } },
              { $multiply: [{ $size: { $ifNull: ['$comments', []] } }, 2] }
            ]
          }
        }
      },
      {
        $sort: { engagementScore: -1, createdAt: -1 }
      },
      {
        $limit: 5
      }
    ];

    const trendingPosts = await Post.aggregate(trendingPipeline);

    // Get posts from followed users
    let followedPosts = [];
    if (userId && userPreferences.following?.length > 0) {
      const followedPipeline = [
        {
          $match: {
            user: { $in: userPreferences.following },
            visibility: 'public'
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $limit: 10
        }
      ];
      followedPosts = await Post.aggregate(followedPipeline);
    }

    // Mix and shuffle content
    const allPosts = [
      ...postsWithRelevance,
      ...trendingPosts.filter(p => !postsWithRelevance.find(rp => rp._id.toString() === p._id.toString())),
      ...followedPosts.filter(p => !postsWithRelevance.find(rp => rp._id.toString() === p._id.toString()))
    ];

    // Remove duplicates and shuffle
    const uniquePosts = allPosts.filter((post, index, self) => 
      index === self.findIndex(p => p._id.toString() === post._id.toString())
    );

    // Shuffle posts for variety
    const shuffledPosts = uniquePosts.sort(() => Math.random() - 0.5);

    // Get total count for pagination
    const totalPosts = await Post.countDocuments({
      visibility: 'public',
      user: { $ne: null }
    });

    // Add metadata for different content types
    const feedWithMetadata = shuffledPosts.map(post => ({
      ...post,
      contentType: post.images?.length > 0 ? 'image' : 'text',
      engagementLevel: post.likes?.length + (post.comments?.length * 2),
      isTrending: post.likes?.length > 10 || post.comments?.length > 5,
      timeAgo: new Date(post.createdAt).toISOString()
    }));

    // Cache the results for 5 minutes
    const cacheKey = `mainfeed:${userId}:${page}:${limit}`;
    try {
      await redis.setex(cacheKey, 300, JSON.stringify({
        posts: feedWithMetadata,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPosts / limit),
          totalPosts,
          hasNextPage: skip + limit < totalPosts,
          hasPrevPage: page > 1
        }
      }));
    } catch (cacheError) {
      logger.warn('Failed to cache main feed results:', cacheError.message);
    }

    res.json({
      posts: feedWithMetadata,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalPosts / limit),
        totalPosts,
        hasNextPage: skip + limit < totalPosts,
        hasPrevPage: page > 1
      },
      recommendations: {
        userInterests: userPreferences.interests || [],
        location: userPreferences.location,
        followingCount: userPreferences.following?.length || 0
      }
    });

  } catch (err) {
    logger.error('Error getting main feed:', err);
    next(err);
  }
};

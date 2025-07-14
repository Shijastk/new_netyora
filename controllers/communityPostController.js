const Post = require('../models/Post');

// Create a post in a community
exports.createCommunityPost = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { content, media, tags, visibility, postType } = req.body;
    
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const post = new Post({
      community: communityId,
      user: req.user._id,
      content,
      media,
      tags,
      visibility,
      postType,
    });
    
    await post.save();
    
    // Populate user data before sending response
    const populatedPost = await Post.findById(post._id)
      .populate('user', '_id firstName lastName avatar')
      .populate('community', 'name');
    
    res.status(201).json(populatedPost);
  } catch (err) {
    console.error('Error creating community post:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get all posts in a community
exports.getCommunityPosts = async (req, res) => {
  try {
    const { communityId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const [posts, total] = await Promise.all([
      Post.find({ community: communityId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', '_id firstName lastName avatar')
        .populate('community', 'name')
        .populate('comments.user', '_id firstName lastName avatar')
        .populate('comments.replies.user', '_id firstName lastName avatar')
        .lean(),
      Post.countDocuments({ community: communityId })
    ]);
    
    // Transform posts to match expected format
    const transformedPosts = posts.map(post => ({
      ...post,
      postType: post.postType || '',
      likes: (post.likes || []).map(like => ({
        userId: like.user?._id || like.user,
        avatar: like.user?.avatar || '',
        firstName: like.user?.firstName || '',
        lastName: like.user?.lastName || '',
        likedAt: like.likedAt
      })),
      user: post.user && typeof post.user === 'object' ? {
        _id: post.user._id,
        username: post.user.username,
        firstName: post.user.firstName,
        lastName: post.user.lastName,
        avatar: post.user.avatar || '',
        location: post.user.location
      } : post.user,
      comments: (post.comments || []).map((comment) => ({
        _id: comment._id,
        content: comment.content,
        createdAt: comment.createdAt || "",
        updatedAt: comment.updatedAt || "",
        user: comment.user && typeof comment.user === "object"
          ? {
              _id: comment.user._id,
              username: comment.user.username,
              firstName: comment.user.firstName,
              lastName: comment.user.lastName,
              avatar: comment.user.avatar || "",
            }
          : comment.user,
        replies: (comment.replies || []).map((reply) => ({
          _id: reply._id,
          content: reply.content,
          createdAt: reply.createdAt || "",
          updatedAt: reply.updatedAt || "",
          user: reply.user && typeof reply.user === "object"
            ? {
                _id: reply.user._id,
                username: reply.user.username,
                firstName: reply.user.firstName,
                lastName: reply.user.lastName,
                avatar: reply.user.avatar || "",
              }
            : reply.user,
        })),
      })),
    }));
    
    res.json({ posts: transformedPosts, total, page, limit });
  } catch (err) {
    console.error('Error getting community posts:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get a single post
exports.getCommunityPostById = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId)
      .populate('user', '_id firstName lastName avatar')
      .populate('comments.user', '_id firstName lastName avatar')
      .populate('comments.replies.user', '_id firstName lastName avatar');
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a post
exports.updateCommunityPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, media, tags, visibility, postType } = req.body;
    
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const post = await Post.findOneAndUpdate(
      { _id: postId, user: req.user._id },
      { content, media, tags, visibility, postType },
      { new: true }
    ).populate('user', '_id firstName lastName avatar')
     .populate('community', 'name');
     
    if (!post) return res.status(404).json({ error: 'Post not found or unauthorized' });
    res.json(post);
  } catch (err) {
    console.error('Error updating community post:', err);
    res.status(500).json({ error: err.message });
  }
};

// Delete a post
exports.deleteCommunityPost = async (req, res) => {
  try {
    const { postId } = req.params;
    
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const post = await Post.findOneAndDelete({ _id: postId, user: req.user._id });
    if (!post) return res.status(404).json({ error: 'Post not found or unauthorized' });
    res.json({ message: 'Post deleted', postId });
  } catch (err) {
    console.error('Error deleting community post:', err);
    res.status(500).json({ error: err.message });
  }
};

// Like or unlike a post
exports.likePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id; // Use user from token
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const likeIndex = post.likes.findIndex(like => like.user.toString() === userId.toString());
    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
    } else {
      // Like
      post.likes.push({ user: userId });
    }
    await post.save();
    res.json({ likes: post.likes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add a comment to a post
exports.addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.comments.push({ user: req.user._id, content });
    await post.save();
    // Populate the newly added comment's user
    const populatedPost = await Post.findById(postId).populate([
      { path: 'comments.user', select: '_id firstName lastName avatar' },
      { path: 'comments.replies.user', select: '_id firstName lastName avatar' }
    ]);
    const newComment = populatedPost.comments[populatedPost.comments.length - 1];
    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Reply to a comment
exports.replyToComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { content } = req.body;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    comment.replies.push({ user: req.user._id, content });
    await post.save();
    // Populate the newly added reply's user
    const populatedPost = await Post.findById(postId).populate([
      { path: 'comments.user', select: '_id firstName lastName avatar' },
      { path: 'comments.replies.user', select: '_id firstName lastName avatar' }
    ]);
    const populatedComment = populatedPost.comments.id(commentId);
    const newReply = populatedComment.replies[populatedComment.replies.length - 1];
    res.status(201).json(newReply);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 
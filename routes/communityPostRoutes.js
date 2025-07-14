const express = require('express');
const router = express.Router();
const communityPostController = require('../controllers/communityPostController');
const auth = require('../middleware/auth');

// Create a post
router.post('/:communityId/posts', auth, communityPostController.createCommunityPost);
// Get all posts in a community
router.get('/:communityId/posts', communityPostController.getCommunityPosts);
// Get a single post
router.get('/:communityId/posts/:postId', communityPostController.getCommunityPostById);
// Update a post
router.put('/:communityId/posts/:postId', auth, communityPostController.updateCommunityPost);
// Delete a post
router.delete('/:communityId/posts/:postId', auth, communityPostController.deleteCommunityPost);
// Like/unlike a post (protected)
router.post('/:communityId/posts/:postId/like', auth, communityPostController.likePost);
// Add a comment (protected)
router.post('/:communityId/posts/:postId/comments', auth, communityPostController.addComment);
// Reply to a comment (protected)
router.post('/:communityId/posts/:postId/comments/:commentId/replies', auth, communityPostController.replyToComment);

module.exports = router; 
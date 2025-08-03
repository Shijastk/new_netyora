const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const auth = require('../middleware/auth');
const validateInput = require('../middleware/validateInput');
const { single, array, handleMulterError } = require('../middleware/upload');

// Add JSON parsing only to routes that need it
const jsonParser = express.json({ limit: '10mb' });
const urlEncodedParser = express.urlencoded({ extended: true, limit: '10mb' });

// Public routes
router.get('/', postController.getPosts);
router.get('/main-feed', postController.getMainFeed); // New main feed endpoint
router.get('/:id', postController.getPostById);
router.get('/:id/related', postController.getRelatedPosts);

// Protected routes
router.post('/', auth, jsonParser, postController.createPost); // Text-only posts
router.post('/with-images', auth, array('images', 10), handleMulterError, postController.createPostWithImages); // Posts with images (FormData)
router.post('/with-binary-images', auth, jsonParser, postController.createPostWithBinaryImages); // Posts with binary images (JSON)
router.put('/:id', auth, jsonParser, postController.editPost);
router.delete('/:id', auth, postController.deletePost);

// New functionality endpoints
router.post('/:id/report', auth, jsonParser, validateInput(['reason']), postController.reportPost);
router.post('/:id/share', auth, jsonParser, postController.sharePost);
router.post('/:id/save', auth, postController.savePost);
router.delete('/:id/save', auth, postController.unsavePost);

// Cleanup route
router.delete('/cleanup/null-users', auth, postController.deleteNullUserPosts);

// Like/Unlike routes
router.post('/:id/like', auth, postController.likePost);
router.delete('/:id/like', auth, postController.unlikePost);

// Enhanced comment routes
router.post('/:id/comments', auth, jsonParser, validateInput(['content']), postController.addComment);
router.put('/:id/comments/:commentId', auth, jsonParser, validateInput(['content']), postController.updateComment);
router.delete('/:id/comments/:commentId', auth, postController.deleteComment);

// Add reply to comment
router.post('/:postId/comment/:commentId/reply', auth, jsonParser, validateInput(['content']), postController.addReply);
// Update reply
router.put('/:postId/comment/:commentId/reply/:replyId', auth, jsonParser, validateInput(['content']), postController.updateReply);
// Delete reply
router.delete('/:postId/comment/:commentId/reply/:replyId', auth, postController.deleteReply);

module.exports = router;

const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const auth = require('../middleware/auth');
const { single, handleUploadError, validateFileType, processUploadedFiles } = require('../middleware/uploadMiddleware');

// Community CRUD
router.post('/', auth, communityController.createCommunity);
router.get('/', communityController.getCommunities);
router.get('/:id', communityController.getCommunityById);
router.put('/:id', auth, communityController.updateCommunity);
router.post('/:id/join', auth, communityController.joinCommunity);
router.post('/:id/leave', auth, communityController.leaveCommunity);

// Posts
router.post('/:id/post', auth, communityController.createPost);
router.put('/:id/post/:postId', auth, communityController.editPost);
router.delete('/:id/post/:postId', auth, communityController.deletePost);

// Events
router.post('/:id/event', auth, communityController.createEvent);

// Moderation
router.put('/:id/moderate', auth, communityController.moderate);

// Q&A
router.post('/:id/qa', auth, communityController.qa);
router.get('/:id/qa', communityController.getQA);
router.post('/:id/qa/vote-question', auth, communityController.voteQuestion);
router.post('/:id/qa/vote-answer', auth, communityController.voteAnswer);
router.post('/:id/qa/:qaId/answers/:answerId/accept', auth, communityController.acceptAnswer);
router.put('/:id/qa/:qaId', auth, communityController.updateQuestion);
router.delete('/:id/qa/:qaId', auth, communityController.deleteQuestion);

// Debates
router.post('/:id/debate', auth, communityController.debate);
router.put('/:id/debate/:debateId/vote', auth, communityController.voteDebate);

// Community image upload (admin only)
router.patch(
  '/:id/image',
  auth,
  single('image'),
  validateFileType(['image/jpeg', 'image/png', 'image/jpg', 'image/gif']),
  processUploadedFiles,
  handleUploadError,
  communityController.uploadCommunityImage
);

// Community avatar upload (admin only)
router.patch(
  '/:id/avatar',
  auth,
  single('avatar'),
  validateFileType(['image/jpeg', 'image/png', 'image/jpg', 'image/gif']),
  processUploadedFiles,
  handleUploadError,
  communityController.uploadCommunityAvatar
);

// Community header image upload (admin only)
router.patch(
  '/:id/header-image',
  auth,
  single('headerImage'),
  validateFileType(['image/jpeg', 'image/png', 'image/jpg', 'image/gif']),
  processUploadedFiles,
  handleUploadError,
  communityController.uploadCommunityHeaderImage
);

// Get community members
router.get('/:id/members', communityController.getCommunityMembers);

// Request to join community
router.post('/:id/join-request', auth, communityController.requestToJoinCommunity);

// Approve join request (admin only)
router.post('/:id/approve-request', auth, communityController.approveJoinRequest);

router.get('/:id', communityController.getCommunityById);

module.exports = router;

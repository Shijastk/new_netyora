const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { single, handleUploadError } = require('../middleware/uploadMiddleware');

// Public routes
router.post('/register', userController.registerUser);
router.post('/login', userController.login);

// Profile routes (public)
router.get('/profiles', userController.getAllProfiles);
router.get('/profile/:id', userController.getProfile);

// Protected routes
router.use(auth);

// User search for chat creation
router.get('/search', userController.searchUsersForChat);

// Profile management routes (protected)
router.put('/profile', userController.updateProfile);
router.post('/upload-avatar', auth, single('avatar'), handleUploadError, userController.uploadAvatar);
router.delete('/profile', userController.deleteProfile);

// Social routes
router.post('/follow/:id', userController.followUser);
router.post('/unfollow/:id', userController.unfollowUser);
router.post('/block/:id', userController.blockUser);

// Activity routes
router.post('/activity/:id/hide', userController.hideActivity);

// Session management
router.post('/sessions/terminate', userController.terminateSession);

// Swap history
router.get('/:userId/swaps', auth, userController.getUserSwapHistory);

module.exports = router;

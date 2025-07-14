const express = require('express');
const router = express.Router();
const badgeController = require('../controllers/badgeController');
const auth = require('../middleware/auth');

// GET /api/badges - Get all available badges
router.get('/', badgeController.getBadges);

// GET /api/badges/user/:userId - Get user's badges
router.get('/user/:userId', badgeController.getUserBadges);

// POST /api/badges/check - Check and award badges for current user
router.post('/check', auth, badgeController.checkBadges);

// GET /api/badges/statistics - Get badge statistics
router.get('/statistics', badgeController.getBadgeStatistics);

// POST /api/badges/award/:userId/:badgeId - Manually award a badge (admin only)
router.post('/award/:userId/:badgeId', auth, badgeController.awardBadgeManually);

module.exports = router; 
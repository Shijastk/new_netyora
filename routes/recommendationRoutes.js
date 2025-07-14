const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const auth = require('../middleware/auth');

// GET routes - No authentication required
// GET /api/recommendations/profiles - Get recommended profiles
router.get('/profiles', recommendationController.getRecommendedProfiles);

// GET /api/recommendations/swaps - Get recommended swap cards
router.get('/swaps', recommendationController.getRecommendedSwaps);

// GET /api/recommendations/posts - Get recommended posts
router.get('/posts', recommendationController.getRecommendedPosts);

// GET /api/recommendations/skills - Get recommended skills to learn
router.get('/skills', recommendationController.getRecommendedSkills);

// GET /api/recommendations/dashboard - Get all recommendations for dashboard
router.get('/dashboard', recommendationController.getDashboardRecommendations);

// GET /api/recommendations/explore - Get exploration recommendations
router.get('/explore', recommendationController.getExplorationRecommendations);

// POST routes - Authentication required
// POST /api/recommendations/feedback - Provide feedback on recommendations
router.post('/feedback', auth, recommendationController.provideRecommendationFeedback);

module.exports = router; 
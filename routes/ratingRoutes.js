const express = require('express');
const router = express.Router();
const ratingController = require('../controllers/ratingController');
const auth = require('../middleware/auth');
const validateInput = require('../middleware/validateInput');

// Public routes (no authentication required)
// GET /api/ratings - Get ratings with filtering
router.get('/', ratingController.getRatings);

// GET /api/ratings/:id - Get specific rating
router.get('/:id', ratingController.getRating);

// GET /api/ratings/stats/:itemId - Get rating statistics for an item
router.get('/stats/:itemId', ratingController.getRatingStats);

// Protected routes (authentication required)
router.use(auth);

// POST /api/ratings - Create a new rating
router.post('/', validateInput, ratingController.createRating);

// PUT /api/ratings/:id - Update rating
router.put('/:id', validateInput, ratingController.updateRating);

// DELETE /api/ratings/:id - Delete rating
router.delete('/:id', ratingController.deleteRating);

// POST /api/ratings/bulk - Create multiple ratings (for admin use)
router.post('/bulk', validateInput, ratingController.createBulkRatings);

// GET /api/ratings/my-ratings - Get current user's ratings
router.get('/my-ratings', ratingController.getMyRatings);

module.exports = router; 
const express = require('express');
const router = express.Router();
const swapCardController = require('../controllers/swapCardController');
const auth = require('../middleware/auth');

// Create a new swap card
router.post('/', auth, swapCardController.createSwapCard);

// Get all swap cards (with filters)
router.get('/', swapCardController.getSwapCards);

// Get a single swap card by ID
router.get('/:id', swapCardController.getSwapCard);

// Like/unlike a swap card
router.post('/:id/like', auth, swapCardController.likeSwapCard);

// Feature/unfeature a swap card (admin/moderator)
router.put('/:id/feature', auth, swapCardController.featureSwapCard);

// Delete a swap card
router.delete('/:id', auth, swapCardController.deleteSwapCard);

// Swap Request Management
router.post('/requests', auth, swapCardController.sendSwapRequest);
router.get('/requests/inbox', auth, swapCardController.getSwapRequestsInbox);
router.get('/requests/outbox', auth, swapCardController.getSwapRequestsOutbox);
router.put('/requests/bulk', auth, swapCardController.bulkUpdateSwapRequests);
router.put('/requests/:id', auth, swapCardController.updateSwapRequest);
router.get('/requests/:id', auth, swapCardController.getSwapRequestById);

// Enhanced Search/Filters
router.get('/search', swapCardController.searchSwapCards);

// Suggested Matches
router.get('/suggested', auth, swapCardController.getSuggestedSwapCards);

// Analytics (admin-only)
router.get('/analytics', auth, swapCardController.getSwapCardsAnalytics);

// Update a swap card
router.put('/:id', auth, swapCardController.updateSwapCard);

router.post('/:swapId/video-session', auth, swapCardController.createVideoSessionForSwap);

// Cancel video session for swap
router.post('/:swapId/cancel-video-session', auth, swapCardController.cancelVideoSessionForSwap);

// End swap video call
router.post('/:swapId/end-video-call', auth, swapCardController.endSwapVideoCall);

// Timeout swap video call invitation
router.post('/:swapId/timeout-video-call', auth, swapCardController.timeoutSwapVideoCall);

// Test endpoint for debugging
router.get('/test-cancel', (req, res) => {
  res.json({ message: 'Cancel route is working' });
});

module.exports = router;

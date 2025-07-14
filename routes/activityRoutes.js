const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const auth = require('../middleware/auth');

// Public routes (if needed)
// router.get('/public/:userId', activityController.getPublicActivities);

// Protected routes
router.use(auth);

// Create new activity
router.post('/', activityController.createActivity);

// Learning progress summary (must come before /:id)
router.get('/learning-progress', activityController.getLearningProgress);

// Activity statistics (must come before /:id)
router.get('/stats', activityController.getActivityStats);

// Get activities with filtering
router.get('/', activityController.getActivities);

// Get specific activity
router.get('/:id', activityController.getActivity);

// Update activity
router.put('/:id', activityController.updateActivity);

// Delete activity
router.delete('/:id', activityController.deleteActivity);

// Hide activity
router.post('/:id/hide', activityController.hideActivity);

// Unhide activity
router.post('/:id/unhide', activityController.unhideActivity);

module.exports = router;

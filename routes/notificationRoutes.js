const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');
const validateInput = require('../middleware/validateInput');

// List/filter/paginate notifications
router.get('/', auth, notificationController.getNotifications);
// Mark single notification as read
router.put('/:id/read', auth, notificationController.markRead);
// Bulk actions (mark all read, delete old)
router.put('/bulk', auth, validateInput(['action']), notificationController.bulkAction);
// Notification settings routes
router.get('/settings', auth, notificationController.getSettings);
router.put('/settings', auth, notificationController.updateSettings);
router.put('/settings/reset', auth, notificationController.resetSettings);
router.put('/settings/type', auth, validateInput(['type', 'channel', 'enabled']), notificationController.updateTypeSettings);

module.exports = router;

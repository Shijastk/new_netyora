const express = require('express');
const router = express.Router();
const videoSessionController = require('../controllers/videoSessionController');

// POST /api/video-session/token
router.post('/token', videoSessionController.getZegoToken);

module.exports = router; 
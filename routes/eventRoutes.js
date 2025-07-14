const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const auth = require('../middleware/auth');

// List/search events
router.get('/', eventController.getEvents);
// Create event
router.post('/', auth, eventController.createEvent);
// Update event
router.put('/:id', auth, eventController.updateEvent);
// Delete event
router.delete('/:id', auth, eventController.deleteEvent);
// RSVP to event
router.post('/:id/rsvp', auth, eventController.rsvpEvent);

module.exports = router;

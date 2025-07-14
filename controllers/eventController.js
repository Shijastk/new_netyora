const Event = require('../models/Event');
const sanitizeInput = require('../utils/sanitizeInput');

// GET /api/events - List/search events
exports.getEvents = async (req, res, next) => {
  try {
    const { community, date, page = 1, limit = 10, sort = 'date' } = req.query;
    const filter = {};
    if (community) filter.community = community;
    if (date) filter.date = { $gte: new Date(date) };
    const events = await Event.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json(events);
  } catch (err) {
    next(err);
  }
};

// POST /api/events - Create event
exports.createEvent = async (req, res, next) => {
  try {
    const { community, title, description, date, location, virtual, virtualLink } = sanitizeInput(req.body);
    if (!title || !date) return res.status(400).json({ error: 'Title and date are required.' });
    const event = await Event.create({
      community,
      title,
      description,
      date,
      location,
      virtual,
      virtualLink,
    });
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
};

// PUT /api/events/:id - Update event
exports.updateEvent = async (req, res, next) => {
  try {
    const updates = sanitizeInput(req.body);
    const event = await Event.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json(event);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/events/:id - Delete event
exports.deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/events/:id/rsvp - RSVP to event
exports.rsvpEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!event.rsvp.includes(req.user.id)) {
      event.rsvp.push(req.user.id);
      await event.save();
    }
    res.json({ rsvp: true });
  } catch (err) {
    next(err);
  }
};

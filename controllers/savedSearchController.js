const SavedSearch = require('../models/SavedSearch');
const sanitizeInput = require('../utils/sanitizeInput');

// GET /api/savedsearch - List user saved searches
exports.getSavedSearches = async (req, res, next) => {
  try {
    const searches = await SavedSearch.find({ user: req.user.id }).sort('-createdAt');
    res.json(searches);
  } catch (err) {
    next(err);
  }
};

// POST /api/savedsearch - Save search query/filters
exports.saveSearch = async (req, res, next) => {
  try {
    const { query, filters, name } = sanitizeInput(req.body);
    if (!query && !filters) return res.status(400).json({ error: 'Query or filters required.' });
    const saved = await SavedSearch.create({
      user: req.user.id,
      query,
      filters,
      name,
    });
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/savedsearch/:id - Delete saved search
exports.deleteSavedSearch = async (req, res, next) => {
  try {
    const search = await SavedSearch.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!search) return res.status(404).json({ error: 'Saved search not found.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

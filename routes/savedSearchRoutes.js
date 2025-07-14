const express = require('express');
const router = express.Router();
const savedSearchController = require('../controllers/savedSearchController');
const auth = require('../middleware/auth');

// List user saved searches
router.get('/', auth, savedSearchController.getSavedSearches);
// Save search query/filters
router.post('/', auth, savedSearchController.saveSearch);
// Delete saved search
router.delete('/:id', auth, savedSearchController.deleteSavedSearch);

module.exports = router;

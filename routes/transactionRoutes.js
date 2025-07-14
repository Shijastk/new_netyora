const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const auth = require('../middleware/auth');

// List/paginate user transactions
router.get('/', auth, transactionController.getTransactions);
// Create transaction
router.post('/', auth, transactionController.createTransaction);
// Update transaction status
router.put('/:id', auth, transactionController.updateTransaction);

module.exports = router;

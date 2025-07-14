const Transaction = require('../models/Transaction');
const sanitizeInput = require('../utils/sanitizeInput');

// GET /api/transactions - List/paginate user transactions
exports.getTransactions = async (req, res, next) => {
  try {
    const { type, status, page = 1, limit = 20, sort = '-createdAt' } = req.query;
    const filter = { user: req.user.id };
    if (type) filter.type = type;
    if (status) filter.status = status;
    const transactions = await Transaction.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json(transactions);
  } catch (err) {
    next(err);
  }
};

// POST /api/transactions - Create transaction
exports.createTransaction = async (req, res, next) => {
  try {
    const { type, amount, stripeId } = sanitizeInput(req.body);
    if (!type || !amount) return res.status(400).json({ error: 'Type and amount are required.' });
    const transaction = await Transaction.create({
      user: req.user.id,
      type,
      amount,
      stripeId,
    });
    res.status(201).json(transaction);
  } catch (err) {
    next(err);
  }
};

// PUT /api/transactions/:id - Update transaction status
exports.updateTransaction = async (req, res, next) => {
  try {
    const { status } = sanitizeInput(req.body);
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { status },
      { new: true }
    );
    if (!transaction) return res.status(404).json({ error: 'Transaction not found.' });
    res.json(transaction);
  } catch (err) {
    next(err);
  }
};

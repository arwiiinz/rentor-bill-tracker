// routes/bills.js
const express = require('express');
const Bill = require('../models/Bill');
const User = require('../models/User');
const { authMiddleware, adminOnly, adminOrSpecial } = require('../middleware/auth');
const router = express.Router();

// Get bills (role-based filtering)
router.get('/', authMiddleware, async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role === 'client') {
      query.clientId = req.user.id;
    }
    
    const bills = await Bill.find(query)
      .populate('clientId', 'name username room level')
      .sort({ dueDate: 1 });
    
    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new bill (admin or special)
router.post('/', authMiddleware, adminOrSpecial, async (req, res) => {
  try {
    const { clientId, amount, dueDate, description } = req.body;
    
    if (!clientId || !amount || !dueDate || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const client = await User.findById(clientId);
    if (!client || client.role !== 'client') {
      return res.status(400).json({ error: 'Invalid client' });
    }
    
    const bill = new Bill({
      clientId,
      amount,
      dueDate: new Date(dueDate),
      description,
      status: 'pending'
    });
    
    await bill.save();
    await bill.populate('clientId', 'name username room level');
    
    res.status(201).json(bill);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark bill as paid (admin or special)
router.put('/:id/pay', authMiddleware, adminOrSpecial, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    if (bill.status === 'paid') {
      return res.status(400).json({ error: 'Bill already paid' });
    }
    
    bill.status = 'paid';
    bill.paidDate = new Date();
    await bill.save();
    await bill.populate('clientId', 'name username room level');
    
    res.json(bill);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete bill (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const bill = await Bill.findByIdAndDelete(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
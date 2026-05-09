const express = require('express');
const Bill = require('../models/Bill');
const User = require('../models/User');
const { authMiddleware, adminOrSpecial } = require('../middleware/auth');

const router = express.Router();


// Delete a bill (admin or special)
router.delete('/:id', authMiddleware, adminOrSpecial, async (req, res) => {
  try {
    const bill = await Bill.findByIdAndDelete(req.params.id);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    res.json({ message: 'Bill deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
    let query = {};
    if (req.user.role === 'client') query.clientId = req.user.id;
    const bills = await Bill.find(query).populate('clientId', 'name username room level').sort({ dueDate: 1 });
    res.json(bills);
});

router.post('/', authMiddleware, adminOrSpecial, async (req, res) => {
    const { clientId, amount, dueDate, description } = req.body;
    const bill = new Bill({ clientId, amount, dueDate, description, status: 'pending' });
    await bill.save();
    await bill.populate('clientId', 'name');

    // Send push notification to tenant
    if (global.sendNotificationToUser) {
        await global.sendNotificationToUser(
            clientId,
            '📄 New Bill Added',
            `${description}: ₱${amount} due by ${new Date(dueDate).toLocaleDateString()}`,
            '/dashboard.html?section=bills'
        );
    }
    res.status(201).json(bill);
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const { clientId, description, amount, dueDate } = req.body;
        if (!clientId || !description || !amount || !dueDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const newBill = new Bill({
            clientId,
            description,
            amount,
            dueDate,
            status: 'pending'
        });
        await newBill.save();
        res.status(201).json(newBill);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.put('/:id/pay', authMiddleware, adminOrSpecial, async (req, res) => {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ error: 'Not found' });
    if (bill.status === 'paid') return res.status(400).json({ error: 'Already paid' });

    bill.status = 'paid';
    bill.paidDate = new Date();
    await bill.save();

    if (global.sendNotificationToUser) {
        await global.sendNotificationToUser(
            bill.clientId,
            '✅ Bill Paid',
            `Your bill "${bill.description}" has been marked as paid.`,
            '/dashboard.html?section=bills'
        );
    }
    res.json(bill);
});

router.delete('/:id', authMiddleware, adminOrSpecial, async (req, res) => {
    await Bill.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
});

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const bill = await Bill.findById(req.params.id).populate('clientId', 'name username');
        if (!bill) return res.status(404).json({ error: 'Bill not found' });
        if (req.user.role !== 'admin' && bill.clientId._id.toString() !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        res.json(bill);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

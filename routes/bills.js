const express = require('express');
const Bill = require('../models/Bill');
const User = require('../models/User');
const { authMiddleware, adminOrSpecial } = require('../middleware/auth');

const router = express.Router();

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

module.exports = router;

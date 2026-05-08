const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/messages?withUserId=xxx (optional)

router.get('/', authMiddleware, async (req, res) => {
    try {
        if (req.query.withUserId) {
            // Mark all messages from the other user as read
            await Message.updateMany(
                { fromUser: req.query.withUserId, toUser: req.user.id, isRead: false },
                { isRead: true }
            );
            const messages = await Message.find({
                $or: [
                    { fromUser: req.user.id, toUser: req.query.withUserId },
                    { fromUser: req.query.withUserId, toUser: req.user.id }
                ]
            }).populate('fromUser toUser', 'name username').sort({ createdAt: 1 });
            return res.json(messages);
        } else {
            // … existing code for all messages
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/messages (send new message)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { toUsername, subject, message } = req.body;
        const recipient = await User.findOne({ username: toUsername });
        if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
        const newMsg = new Message({
            fromUser: req.user.id,
            toUser: recipient._id,
            subject,
            message
        });
        await newMsg.save();
        await newMsg.populate('fromUser', 'name username');
        await newMsg.populate('toUser', 'name username');
        res.status(201).json(newMsg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/messages/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Not found' });
        if (msg.fromUser.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not allowed' });
        }
        await msg.deleteOne();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE conversation (optional)
router.delete('/conversation/:userId', authMiddleware, async (req, res) => {
    try {
        await Message.deleteMany({
            $or: [
                { fromUser: req.user.id, toUser: req.params.userId },
                { fromUser: req.params.userId, toUser: req.user.id }
            ]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
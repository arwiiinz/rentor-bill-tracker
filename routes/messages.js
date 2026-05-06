const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get all messages for current user
// Add this helper at the top
const crypto = require('crypto'); // already there? if not, add

// Modify GET / to mark messages as read when recipient fetches them
router.get('/', authMiddleware, async (req, res) => {
    // Mark all messages sent to this user as read
    await Message.updateMany(
        { toUser: req.user.id, isRead: false },
        { isRead: true }
    );
    const query = {
        $or: [
            { fromUser: req.user.id },
            { toUser: req.user.id }
        ]
    };
    const messages = await Message.find(query)
        .populate('fromUser', 'name username role')
        .populate('toUser', 'name username role')
        .sort({ createdAt: -1 });
    res.json(messages);
});

// Send new message
router.post('/', authMiddleware, async (req, res) => {
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

    // Send push notification to recipient
    if (global.sendNotificationToUser) {
        await global.sendNotificationToUser(
            recipient._id,
            '✉️ New Message',
            `${req.user.username}: ${subject}`,
            '/dashboard.html?section=messages'
        );
    }
    res.status(201).json(newMsg);
});

// Reply to a message
router.post('/:id/reply', authMiddleware, async (req, res) => {
    const original = await Message.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Original not found' });

    const recipientId = original.fromUser.toString();
    const reply = new Message({
        fromUser: req.user.id,
        toUser: recipientId,
        subject: `Re: ${original.subject}`,
        message: req.body.message,
        replyTo: original._id
    });
    await reply.save();
    await reply.populate('fromUser', 'name username');
    await reply.populate('toUser', 'name username');

    if (global.sendNotificationToUser) {
        await global.sendNotificationToUser(
            recipientId,
            '💬 Reply to your message',
            `${req.user.username} replied to "${original.subject}"`,
            '/dashboard.html?section=messages'
        );
    }
    res.status(201).json(reply);
});

// Mark as read
router.put('/:id/read', authMiddleware, async (req, res) => {
    const msg = await Message.findById(req.params.id);
    if (msg.toUser.toString() !== req.user.id) return res.status(403).json({ error: 'Not allowed' });
    msg.isRead = true;
    await msg.save();
    res.json({ success: true });
});

// Delete message
router.delete('/:id', authMiddleware, async (req, res) => {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.fromUser.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not allowed' });
    }
    await msg.deleteOne();
    res.json({ success: true });
});

// Unread count
router.get('/unread/count', authMiddleware, async (req, res) => {
    const count = await Message.countDocuments({ toUser: req.user.id, isRead: false });
    res.json({ unreadCount: count });
});

// Delete entire conversation? We'll handle deletion per message or per conversation.
// Existing DELETE endpoint (works per message):
router.delete('/:id', authMiddleware, async (req, res) => {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.fromUser.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not allowed' });
    }
    await msg.deleteOne();
    res.json({ success: true });
});


// Delete entire conversation between current user and another user
router.delete('/conversation/:userId', authMiddleware, async (req, res) => {
    const otherUserId = req.params.userId;
    await Message.deleteMany({
        $or: [
            { fromUser: req.user.id, toUser: otherUserId },
            { fromUser: otherUserId, toUser: req.user.id }
        ]
    });
    res.json({ success: true, message: 'Conversation deleted' });
});
module.exports = router;

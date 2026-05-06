const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();

// Get all messages for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    let query;
    if (req.user.role === 'admin' || req.user.role === 'special') {
      // Admins see all messages (sent to or from them)
      query = {
        $or: [
          { toUser: req.user.id },
          { fromUser: req.user.id }
        ]
      };
    } else {
      // Clients only see their own messages (sent and replies)
      query = {
        $or: [
          { fromUser: req.user.id },
          { toUser: req.user.id }
        ]
      };
    }
    
    const messages = await Message.find(query)
      .populate('fromUser', 'name username role room level')
      .populate('toUser', 'name username role room level')
      .sort({ createdAt: -1 });
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a new message
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { toUsername, subject, message } = req.body;
    
    if (!toUsername || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Find recipient
    const recipient = await User.findOne({ username: toUsername });
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    const newMessage = new Message({
      fromUser: req.user.id,
      toUser: recipient._id,
      subject,
      message,
      isRead: false
    });
    
    await newMessage.save();
    await newMessage.populate('fromUser', 'name username role');
    await newMessage.populate('toUser', 'name username role');
    
    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reply to a message
router.post('/:id/reply', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const originalMessage = await Message.findById(req.params.id);
    
    if (!originalMessage) {
      return res.status(404).json({ error: 'Original message not found' });
    }
    
    // Determine recipient (reply to the sender of original message)
    const recipientId = originalMessage.fromUser.toString();
    
    const reply = new Message({
      fromUser: req.user.id,
      toUser: recipientId,
      subject: `Re: ${originalMessage.subject}`,
      message: message,
      replyTo: originalMessage._id,
      isRead: false
    });
    
    await reply.save();
    await reply.populate('fromUser', 'name username role');
    await reply.populate('toUser', 'name username role');
    
    // Mark original as read (optional)
    originalMessage.isRead = true;
    await originalMessage.save();
    
    res.status(201).json(reply);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark message as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Only recipient can mark as read
    if (message.toUser.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    message.isRead = true;
    await message.save();
    
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete message (admin only or sender)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Allow admin or sender to delete
    if (req.user.role !== 'admin' && message.fromUser.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    await message.deleteOne();
    res.json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread count
router.get('/unread/count', authMiddleware, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      toUser: req.user.id,
      isRead: false
    });
    res.json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
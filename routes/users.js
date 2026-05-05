// routes/users.js
const express = require('express');
const User = require('../models/User');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();
// Inside routes/users.js, where admin creates a user
const { hashPassword } = require('../utils/crypto'); // or copy the hashPassword function


const crypto = require('crypto');
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'fallback-secret-change-this';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', PASSWORD_SECRET + salt)
                     .update(password)
                     .digest('hex');
  return `${salt}:${hash}`;
}


// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin only)
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role ? { role } : {};
    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get clients only (for special accounts)
router.get('/clients', authMiddleware, async (req, res) => {
  try {
    // Special accounts can view all clients, admin too, clients only see themselves
    if (req.user.role === 'client') {
      const user = await User.findById(req.user.id).select('-password');
      return res.json([user]);
    }
    const clients = await User.find({ role: 'client' }).select('-password');
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user (admin only)
// Create new user (admin only)
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, password, name, role, room, level, dueDay } = req.body;
    
    // Validation
    if (!username || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (role === 'client' && (!room || !level)) {
      return res.status(400).json({ error: 'Room and level required for clients' });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Hash the password using crypto before saving
    const hashedPassword = hashPassword(password);
    
    const user = new User({
      username,
      password: hashedPassword,
      name,
      role,
      room: room || '',
      level: level || '',
      dueDay: dueDay || null
    });
    
    await user.save();
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json(userResponse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Update user (admin only)
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, room, level, dueDay, role } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (room !== undefined) updates.room = room;
    if (level !== undefined) updates.level = level;
    if (dueDay !== undefined) updates.dueDay = dueDay;
    if (role) updates.role = role;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

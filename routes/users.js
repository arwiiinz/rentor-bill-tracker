const express = require('express');
const User = require('../models/User');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'fallback-secret-change-this';

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHmac('sha256', PASSWORD_SECRET + salt)
                       .update(password)
                       .digest('hex');
    return `${salt}:${hash}`;
}

router.get('/me', authMiddleware, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
});

router.get('/', authMiddleware, adminOnly, async (req, res) => {
    const users = await User.find().select('-password');
    res.json(users);
});

router.get('/clients', authMiddleware, async (req, res) => {
    if (req.user.role === 'client') {
        const user = await User.findById(req.user.id).select('-password');
        return res.json([user]);
    }
    const clients = await User.find({ role: 'client' }).select('-password');
    res.json(clients);
});

router.post('/', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { username, password, name, role, room, level, dueDay } = req.body;
        if (!username || !password || !name || !role) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username exists' });

        const hashed = hashPassword(password);
        const user = new User({ username, password: hashed, name, role, room, level, dueDay });
        await user.save();
        const response = user.toObject();
        delete response.password;
        res.status(201).json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
    const updates = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json(user);
});

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
});

module.exports = router;

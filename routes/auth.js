const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');

const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'fallback-secret-change-this';

function verifyPassword(stored, password) {
    const [salt, originalHash] = stored.split(':');
    if (!salt || !originalHash) return false;
    const hash = crypto.createHmac('sha256', PASSWORD_SECRET + salt)
                       .update(password)
                       .digest('hex');
    return hash === originalHash;
}

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const valid = verifyPassword(user.password, password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({
            token,
            user: { id: user._id, username: user.username, name: user.name, role: user.role, room: user.room, level: user.level }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

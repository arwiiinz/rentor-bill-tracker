require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Models
const User = require('./models/User');
const Bill = require('./models/Bill');
const Message = require('./models/Message');
const PushSubscription = require('./models/PushSubscription');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const billRoutes = require('./routes/bills');
const messageRoutes = require('./routes/messages');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/messages', messageRoutes);

// ==================== Password Helper (Crypto) ====================
const PASSWORD_SECRET = process.env.PASSWORD_SECRET || 'fallback-secret-change-this';

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHmac('sha256', PASSWORD_SECRET + salt)
                       .update(password)
                       .digest('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(stored, password) {
    const [salt, originalHash] = stored.split(':');
    if (!salt || !originalHash) return false;
    const hash = crypto.createHmac('sha256', PASSWORD_SECRET + salt)
                       .update(password)
                       .digest('hex');
    return hash === originalHash;
}

// ==================== Public Registration ====================
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, name, room, level, dueDay } = req.body;
        if (!username || !password || !name || !room || !level) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username taken' });

        const hashed = hashPassword(password);
        const newUser = new User({
            username, password: hashed, name, role: 'client',
            room, level, dueDay: dueDay || null
        });
        await newUser.save();
        const userResponse = newUser.toObject();
        delete userResponse.password;
        res.status(201).json({ message: 'Account created', user: userResponse });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== Push Notifications ====================
const webpush = require('web-push');
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails('mailto:admin@rentor.com', vapidPublicKey, vapidPrivateKey);
}

app.post('/api/push/subscribe', async (req, res) => {
    try {
        const { subscription } = req.body;
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await PushSubscription.findOneAndDelete({ endpoint: subscription.endpoint });
        const newSub = new PushSubscription({
            userId: decoded.id,
            endpoint: subscription.endpoint,
            keys: subscription.keys
        });
        await newSub.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper to send notification (used in bills & messages routes)
global.sendNotificationToUser = async (userId, title, body, url = '/') => {
    if (!webpush.setVapidDetails) return;
    const subscriptions = await PushSubscription.find({ userId });
    const payload = JSON.stringify({ title, body, url });
    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
            }, payload);
        } catch (err) {
            if (err.statusCode === 410) await PushSubscription.deleteOne({ _id: sub._id });
        }
    }
};

// ==================== Database & Admin Setup ====================
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('✅ MongoDB connected');
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const admin = new User({
                username: 'admin',
                password: hashPassword('admin123'),
                name: 'System Admin',
                role: 'admin',
                room: '', level: '', dueDay: null
            });
            await admin.save();
            console.log('✅ Admin created: admin / admin123');
        }
        app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB error:', err));

// ==================== Catch-all (must be last) ====================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

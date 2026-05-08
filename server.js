require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const socketIo = require('socket.io');
const { authMiddleware } = require('./middleware/auth');

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
const ElectricityConfig = require('./models/ElectricityConfig');
const PushSubscription = require('./models/PushSubscription');
const MeterReading = require('./models/MeterReading');
const BillTemplate = require('./models/BillTemplate');

// ==================== Password Helper ====================
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

// ==================== Socket.IO ====================
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return next(new Error('User not found'));
        socket.user = user;
        next();
    } catch (err) {
        next(new Error('Invalid token'));
    }
});

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.user.username} (${socket.user._id})`);
    socket.join(`user_${socket.user._id}`);

    socket.on('private message', async ({ toUserId, message, tempId }) => {
        try {
            const newMsg = new Message({
                fromUser: socket.user._id,
                toUser: toUserId,
                subject: 'Chat',
                message
            });
            await newMsg.save();
            const populated = await newMsg.populate('fromUser', 'name username');
            const baseResponse = populated.toObject();

            // Sender gets tempId (replace optimistic message)
            socket.emit('new message', { ...baseResponse, tempId });
            // Recipient gets clean copy
            socket.to(`user_${toUserId}`).emit('new message', baseResponse);
        } catch (err) {
            console.error('Private message error:', err);
        }
    });

    socket.on('typing', ({ toUserId, isTyping }) => {
        socket.to(`user_${toUserId}`).emit('user typing', { fromUserId: socket.user._id, isTyping });
    });

    socket.on('message seen', ({ messageId, fromUserId }) => {
        socket.to(`user_${fromUserId}`).emit('message read', { messageId });
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.user.username}`);
    });
});

// ==================== API Routes (ALL must be BEFORE the catch‑all) ====================

// Public registration
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

// Heartbeat (updates lastSeen)
app.post('/api/heartbeat', authMiddleware, async (req, res) => {
    await User.findByIdAndUpdate(req.user.id, { lastSeen: new Date() });
    res.json({ ok: true });
});

// Test endpoint (to verify routes are working)
app.get('/api/test', (req, res) => {
    res.json({ message: 'API is alive' });
});

// ===== Electricity Configuration =====
app.get('/api/electricity/config/:clientId', authMiddleware, async (req, res) => {
    try {
        let config = await ElectricityConfig.findOne({ clientId: req.params.clientId });
        if (!config) {
            return res.json({ ratePerKwh: 0, minimumAmount: null });
        }
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/electricity/config', authMiddleware, async (req, res) => {
    try {
        const { clientId, ratePerKwh, minimumAmount } = req.body;
        if (!clientId || ratePerKwh === undefined) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        let config = await ElectricityConfig.findOne({ clientId });
        if (config) {
            config.ratePerKwh = ratePerKwh;
            config.minimumAmount = minimumAmount || null;
            await config.save();
        } else {
            config = new ElectricityConfig({ clientId, ratePerKwh, minimumAmount });
            await config.save();
        }
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all templates (global)
app.get('/api/bill-templates', authMiddleware, async (req, res) => {
    try {
        const templates = await BillTemplate.find();
        res.json(templates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new template
app.post('/api/bill-templates', authMiddleware, async (req, res) => {
    try {
        const { name, description, ratePerUnit, minimumAmount, dueDay } = req.body;
        if (!name || !description || ratePerUnit === undefined || !dueDay) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const existing = await BillTemplate.findOne({ name });
        if (existing) return res.status(400).json({ error: 'Template with this name already exists' });
        const template = new BillTemplate({ name, description, ratePerUnit, minimumAmount, dueDay });
        await template.save();
        res.status(201).json(template);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a template
app.delete('/api/bill-templates/:id', authMiddleware, async (req, res) => {
    try {
        await BillTemplate.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ===== Custom Message Endpoints (must be before general router) =====
app.get('/api/messages/contacts', authMiddleware, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [{ fromUser: req.user.id }, { toUser: req.user.id }]
        });
        const contactIds = new Set();
        messages.forEach(m => {
            if (m.fromUser.toString() !== req.user.id) contactIds.add(m.fromUser.toString());
            if (m.toUser.toString() !== req.user.id) contactIds.add(m.toUser.toString());
        });
        const contacts = await User.find({ _id: { $in: [...contactIds] } }).select('name username lastSeen');
        res.json(contacts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/messages/unread/count', authMiddleware, async (req, res) => {
    const count = await Message.countDocuments({ toUser: req.user.id, isRead: false });
    res.json({ unreadCount: count });
});

app.get('/api/messages/unread-per-contact', authMiddleware, async (req, res) => {
    try {
        const pipeline = [
            { $match: { toUser: req.user.id, isRead: false } },
            { $group: { _id: "$fromUser", count: { $sum: 1 } } }
        ];
        const unread = await Message.aggregate(pipeline);
        const result = {};
        unread.forEach(u => { result[u._id.toString()] = u.count; });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/messages/conversation/:userId', authMiddleware, async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        await Message.deleteMany({
            $or: [
                { fromUser: req.user.id, toUser: otherUserId },
                { fromUser: otherUserId, toUser: req.user.id }
            ]
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Meter Reading Endpoints =====
app.get('/api/meters/last-reading', authMiddleware, async (req, res) => {
    try {
        const { clientId, description } = req.query;
        if (!clientId || !description) return res.json({ reading: 0 });
        const last = await MeterReading.findOne({ clientId, description }).sort({ date: -1 });
        res.json({ reading: last ? last.reading : 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/meters/generate-bill', authMiddleware, async (req, res) => {
    try {
        const { clientId, description, currentReading, ratePerKwh, minimumAmount, dueDay } = req.body;
        if (!clientId || !description || currentReading === undefined || !ratePerKwh || !dueDay) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const lastReadingDoc = await MeterReading.findOne({ clientId, description }).sort({ date: -1 });
        const previousReading = lastReadingDoc ? lastReadingDoc.reading : 0;
        const consumption = currentReading - previousReading;
        if (consumption < 0) return res.status(400).json({ error: 'Current reading cannot be less than previous' });
        let amount = consumption * ratePerKwh;
        if (minimumAmount && amount < minimumAmount) amount = minimumAmount;
        const now = new Date();
        const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
        const newBill = new Bill({
            clientId,
            description: `${description} - ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
            amount,
            dueDate,
            status: 'pending',
            previousReading,
            currentReading,
            consumptionKwh: consumption,
            ratePerKwh,
            minimumAmount: minimumAmount || null
        });
        await newBill.save();
        const newReading = new MeterReading({ clientId, description, reading: currentReading });
        await newReading.save();
        res.status(201).json({ bill: newBill, consumption, previousReading });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== General Routers (mount after individual routes) =====
const messageRoutes = require('./routes/messages');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const billRoutes = require('./routes/bills');
app.use('/api/messages', messageRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bills', billRoutes);

// ===== Push Notifications (optional) =====
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
global.sendNotificationToUser = async () => {};

// ===== Diagnostic =====
app.get('/api/check-admin', async (req, res) => {
    try {
        const admin = await User.findOne({ role: 'admin' });
        if (!admin) return res.json({ exists: false });
        const format = admin.password.includes(':') ? 'crypto' : (admin.password.startsWith('$2b$') ? 'bcrypt' : 'plain');
        res.json({ exists: true, username: admin.username, format });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== CATCH‑ALL (MUST BE LAST) ====================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== Database & Server Start ====================
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
        server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB error:', err));
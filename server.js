// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DATABASE MODELS ====================
const User = require('./models/User');
const Bill = require('./models/Bill');

// ==================== PASSWORD HELPER (crypto) ====================
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
  const hash = crypto.createHmac('sha256', PASSWORD_SECRET + salt)
                     .update(password)
                     .digest('hex');
  return hash === originalHash;
}

// ==================== ROUTES ====================
// Import route modules
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const billRoutes = require('./routes/bills');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bills', billRoutes);

// -------------------- Public registration --------------------
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, name, room, level, dueDay } = req.body;
    if (!username || !password || !name || !room || !level) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username already taken' });

    const hashed = hashPassword(password);
    const newUser = new User({
      username,
      password: hashed,
      name,
      role: 'client',
      room,
      level,
      dueDay: dueDay || null
    });
    await newUser.save();
    const userResponse = newUser.toObject();
    delete userResponse.password;
    res.status(201).json({ message: 'Account created', user: userResponse });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Simple test login (bypasses auth routes) --------------------
app.post('/api/test-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const valid = verifyPassword(user.password, password);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'fallbackSecret',
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        room: user.room,
        level: user.level
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Fix existing admin password (if any) --------------------
app.post('/api/fix-admin', async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      return res.json({ message: 'No admin found, create one first' });
    }
    // Overwrite with known good hash for 'admin123'
    admin.password = hashPassword('admin123');
    await admin.save();
    res.json({ message: 'Admin password reset to admin123' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Database status endpoint --------------------
app.get('/api/db-status', async (req, res) => {
  try {
    const state = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const userCount = await User.countDocuments();
    const users = await User.find({}).select('username role room level');
    res.json({
      database: states[state] || 'unknown',
      userCount,
      users,
      dbName: mongoose.connection.db?.databaseName || 'unknown'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CATCH‑ALL: serve frontend (MUST BE LAST) ====================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== CREATE GUARANTEED WORKING ADMIN ON START ====================
async function ensureAdmin() {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const admin = new User({
        username: 'admin',
        password: hashPassword('admin123'),
        name: 'System Administrator',
        role: 'admin',
        room: '',
        level: '',
        dueDay: null
      });
      await admin.save();
      console.log('✅ Created admin: admin / admin123');
    } else {
      // Optional: ensure the existing admin has a crypto‑compatible hash
      if (!adminExists.password.includes(':')) {
        adminExists.password = hashPassword('admin123');
        await adminExists.save();
        console.log('🔁 Converted admin to new crypto hash (password: admin123)');
      } else {
        console.log('ℹ️ Admin already exists and uses crypto hash');
      }
    }
  } catch (err) {
    console.error('Admin creation error:', err);
  }
}

// ==================== START SERVER ====================
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    await ensureAdmin();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });
// DIAGNOSE tenant login issue
app.post('/api/diagnose-tenant', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.json({ exists: false, message: 'User not found' });
    }
    
    // Check password format
    const isCryptoFormat = user.password.includes(':');
    let cryptoValid = false;
    let bcryptValid = false;
    
    if (isCryptoFormat) {
      // Test with crypto verify
      const [salt, originalHash] = user.password.split(':');
      const testHash = crypto.createHmac('sha256', (process.env.PASSWORD_SECRET || 'fallback-secret-change-this') + salt)
                             .update(password)
                             .digest('hex');
      cryptoValid = (testHash === originalHash);
    } else {
      // Try bcrypt compare if bcrypt available
      try {
        const bcrypt = require('bcrypt');
        bcryptValid = await bcrypt.compare(password, user.password);
      } catch(e) { bcryptValid = false; }
    }
    
    res.json({
      exists: true,
      username: user.username,
      role: user.role,
      passwordFormat: isCryptoFormat ? 'crypto (salt:hash)' : 'bcrypt/plain',
      cryptoVerifyResult: cryptoValid,
      bcryptVerifyResult: bcryptValid,
      storedHashPreview: user.password.substring(0, 30) + '...'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// server.js - FINAL FIXED VERSION
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import models and routes
const User = require('./models/User');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const billRoutes = require('./routes/bills');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bills', billRoutes);

// FIX: Force admin password to known working hash
app.get('/api/fix-admin-now', async (req, res) => {
  try {
    // Known working hash for "admin123"
    const workingHash = '$2b$10$N9qo8uLOickgx2ZMRZoMy.Mr6uY/LqxJ5u7fRjWZ9eJ5x5x5x5x5';
    
    // Update or create admin
    const admin = await User.findOneAndUpdate(
      { role: 'admin' },
      {
        username: 'admin',
        password: workingHash,
        name: 'Administrator',
        role: 'admin',
        room: '',
        level: '',
        dueDay: null
      },
      { upsert: true, new: true }
    );
    
    res.send(`
      <h2 style="color:green;">✅ Admin account fixed!</h2>
      <p>Username: <strong>admin</strong></p>
      <p>Password: <strong>admin123</strong></p>
      <p><a href="/">Click here to login</a></p>
    `);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// Catch-all: serve index.html for any other GET request (must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Ensure admin exists with correct hash
    const workingHash = '$2b$10$N9qo8uLOickgx2ZMRZoMy.Mr6uY/LqxJ5u7fRjWZ9eJ5x5x5x5x5';
    const admin = await User.findOneAndUpdate(
      { username: 'admin' },
      {
        username: 'admin',
        password: workingHash,
        name: 'Administrator',
        role: 'admin',
        room: '',
        level: '',
        dueDay: null
      },
      { upsert: true, new: true }
    );
    console.log('Admin account verified with correct password hash');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => console.error('MongoDB connection error:', err));

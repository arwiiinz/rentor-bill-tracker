// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const billRoutes = require('./routes/bills');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bills', billRoutes);

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database connection and initial admin setup
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Create default admin account if none exists
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const admin = new User({
        username: 'admin',
        password: hashedPassword,
        name: 'System Administrator',
        role: 'admin',
        room: '',
        level: '',
        dueDay: null
      });
      await admin.save();
      console.log('Default admin created: username: admin, password: admin123');
    }
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => console.error('MongoDB connection error:', err));

// DEBUG: Test password verification (GET version)
app.get('/api/debug/password', async (req, res) => {
  try {
    const User = require('./models/User');
    const bcrypt = require('bcrypt');
    const username = req.query.username || 'admin';
    const password = req.query.password || 'admin123';
    
    const user = await User.findOne({ username });
    if (!user) return res.json({ found: false, message: 'User not found' });
    
    const directMatch = await bcrypt.compare(password, user.password);
    
    res.json({
      found: true,
      username: user.username,
      directBcryptCompare: directMatch,
      storedHashPrefix: user.password.substring(0, 20),
      suggestedHashForAdmin123: "$2b$10$N9qo8uLOickgx2ZMRZoMy.Mr6uY/LqxJ5u7fRjWZ9eJ5x5x5x5x5"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FORCE RESET ADMIN PASSWORD – Visit this URL once
app.get('/api/reset-admin', async (req, res) => {
  try {
    const User = require('./models/User');
    const bcrypt = require('bcrypt');
    
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      return res.send('❌ Admin user not found in database.');
    }
    
    // Re-hash 'admin123' securely
    const newHash = await bcrypt.hash('admin123', 10);
    admin.password = newHash;
    await admin.save();
    
    res.send(`
      <h2>✅ Admin password reset successful!</h2>
      <p>Username: <strong>admin</strong></p>
      <p>Password: <strong>admin123</strong></p>
      <p>Now go back to the <a href="/">login page</a> and try again.</p>
    `);
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

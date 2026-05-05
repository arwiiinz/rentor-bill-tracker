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

app.post('/api/debug/password', async (req, res) => {
  try {
    const User = require('./models/User');
    const bcrypt = require('bcrypt');
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) return res.json({ found: false, message: 'User not found' });
    
    // Direct bcrypt compare
    const directMatch = await bcrypt.compare(password, user.password);
    
    // Also try using the model's method
    let modelMatch = false;
    try {
      modelMatch = await user.comparePassword(password);
    } catch(e) {
      modelMatch = `error: ${e.message}`;
    }
    
    res.json({
      found: true,
      username: user.username,
      role: user.role,
      passwordHashPrefix: user.password.substring(0, 20),
      directBcryptCompare: directMatch,
      modelComparePassword: modelMatch,
      note: "If directBcryptCompare is false, the password hash doesn't match 'admin123'. Try updating the hash in MongoDB."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

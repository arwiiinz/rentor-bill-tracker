const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'client', 'special'], required: true },
  room: { type: String, default: '' },
  level: { type: String, default: '' },
  dueDay: { type: Number, min: 1, max: 31, default: null },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('User', userSchema);

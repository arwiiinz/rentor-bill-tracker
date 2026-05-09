const mongoose = require('mongoose');

const recurringScheduleSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDay: { type: Number, required: true, min: 1, max: 31 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Unique per client+description (only one active schedule per combo)
recurringScheduleSchema.index({ clientId: 1, description: 1 }, { unique: true });

module.exports = mongoose.model('RecurringSchedule', recurringScheduleSchema);
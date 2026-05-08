const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paidDate: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    // Meter reading specific fields
    previousReading: { type: Number, default: null },
    currentReading: { type: Number, default: null },
    consumptionKwh: { type: Number, default: null },
    ratePerKwh: { type: Number, default: null },
    minimumAmount: { type: Number, default: null }
});

module.exports = mongoose.model('Bill', billSchema);
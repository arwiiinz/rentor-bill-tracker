const mongoose = require('mongoose');

const meterReadingSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    reading: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MeterReading', meterReadingSchema);
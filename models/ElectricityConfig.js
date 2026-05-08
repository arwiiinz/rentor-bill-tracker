const mongoose = require('mongoose');

const electricityConfigSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    ratePerKwh: { type: Number, required: true, default: 0 },
    minimumAmount: { type: Number, default: null }
});

module.exports = mongoose.model('ElectricityConfig', electricityConfigSchema);
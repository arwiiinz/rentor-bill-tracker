const mongoose = require('mongoose');

const retentionSettingSchema = new mongoose.Schema({
    monthsToKeep: { type: Number, default: 12, min: 1, max: 120 }, // default 12 months
    lastRun: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RetentionSetting', retentionSettingSchema);
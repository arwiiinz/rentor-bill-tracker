const mongoose = require('mongoose');

const billDefaultSchema = new mongoose.Schema({
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    defaultAmount: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now }
});
// Composite unique index to ensure one default per client+description
billDefaultSchema.index({ clientId: 1, description: 1 }, { unique: true });

module.exports = mongoose.model('BillDefault', billDefaultSchema);
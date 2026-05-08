const mongoose = require('mongoose');

const billTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // e.g., "Electricity", "Water"
    description: { type: String, required: true },        // e.g., "Electric bill"
    ratePerUnit: { type: Number, required: true },
    minimumAmount: { type: Number, default: null },
    dueDay: { type: Number, min: 1, max: 31, required: true }
});

module.exports = mongoose.model('BillTemplate', billTemplateSchema);
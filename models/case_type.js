const mongoose = require('mongoose');

const caseTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  archived: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('CaseType', caseTypeSchema);

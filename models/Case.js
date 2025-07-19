const mongoose = require('mongoose');

const caseSchema = new mongoose.Schema({
  officer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  caseType: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseType', required: true },
  timeline: { type: Date, default: Date.now },
  status: { type: String, enum: ['suspected', 'confirmed', 'not a case'], default: 'suspected' },
  caseCommunity: { type: String, required: true },
  healthFacility: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthFacility', required: true },
  patient: {
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    phone: { type: String, required: true },
    status: { type: String, enum: ['Recovered', 'Ongoing treatment', 'Deceased'], required: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('Case', caseSchema);
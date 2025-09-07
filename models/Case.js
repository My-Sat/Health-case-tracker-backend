// models/case.js
const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  region: { type: mongoose.Schema.Types.ObjectId, ref: 'Region', default: null },
  district: { type: mongoose.Schema.Types.ObjectId, ref: 'District', default: null },
  subDistrict: { type: mongoose.Schema.Types.ObjectId, ref: 'SubDistrict', default: null },
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', default: null },
}, { _id: false });

const caseSchema = new mongoose.Schema({
  officer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  caseType: { type: mongoose.Schema.Types.ObjectId, ref: 'CaseType', required: true },
  timeline: { type: Date, default: Date.now },
  status: { type: String, enum: ['suspected', 'confirmed', 'not a case'], default: 'suspected' },
  healthFacility: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthFacility', required: true },
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community' },
  archived: { type: Boolean, default: false },
  patient: {
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    phone: { type: String, required: true },
    status: { type: String, enum: ['Recovered', 'Ongoing treatment', 'Deceased'], required: true }
  },
  // store references to the canonical objects (no duplication)
  location: { type: locationSchema, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Case', caseSchema);

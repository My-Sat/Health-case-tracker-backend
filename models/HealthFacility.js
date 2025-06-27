const mongoose = require('mongoose');

const healthFacilitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    community: { type: String, required: true },
    district: { type: String, required: true },
    region: { type: String, required: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('HealthFacility', healthFacilitySchema);

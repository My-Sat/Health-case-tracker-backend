const mongoose = require('mongoose');

const healthFacilitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    community: { type: String, required: true },
    subDistrict: { type: String },
    district: { type: String, required: true },
    region: { type: String, required: true },
    geo: {
      lat: { type: Number },
      lng: { type: Number}
    }
  },
  archived: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('HealthFacility', healthFacilitySchema);
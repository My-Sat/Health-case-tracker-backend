// models/HealthFacility.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const healthFacilitySchema = new Schema({
  name: { type: String, required: true },
  region: { type: Schema.Types.ObjectId, ref: 'Region', required: true },
  district: { type: Schema.Types.ObjectId, ref: 'District', required: true },
  subDistrict: { type: Schema.Types.ObjectId, ref: 'SubDistrict' },
  community: { type: Schema.Types.ObjectId, ref: 'Community', required: true },
  geo: {
    lat: { type: Number },
    lng: { type: Number }
  },
  archived: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('HealthFacility', healthFacilitySchema);

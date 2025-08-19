const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const communitySchema = new Schema({
  name: { type: String, required: true },
  subDistrict: { type: Schema.Types.ObjectId, ref: 'SubDistrict', required: true }
}, { timestamps: true });
module.exports = mongoose.model('Community', communitySchema);
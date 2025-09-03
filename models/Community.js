const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const communitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // A community can belong either directly to a District OR to a SubDistrict
    district: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    subDistrict: { type: Schema.Types.ObjectId, ref: 'SubDistrict', default: null },
  },
  { timestamps: true }
);

// Require at least one parent pointer
communitySchema.path('district').validate(function () {
  return !!(this.district || this.subDistrict);
}, 'Either district or subDistrict must be set.');

// Avoid duplicates within the same container
communitySchema.index({ name: 1, district: 1, subDistrict: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Community', communitySchema);

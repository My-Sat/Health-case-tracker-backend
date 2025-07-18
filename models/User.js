const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true }, // Recovery email
  password: { type: String, required: true },
  contactInfo: { type: String, required: true },
  role: { type: String, enum: ['admin', 'officer'], default: 'officer' },
  healthFacility: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthFacility' },
  passwordResetToken: String,
  passwordResetExpires: Date,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
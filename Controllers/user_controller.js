const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const HealthFacility = require('../models/HealthFacility');
const crypto = require('crypto');
const sendEmail = require('../utilities/sendEmail');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const registerUser = async (req, res) => {
  const { fullName, username, email, password, contactInfo, healthFacility } = req.body;

  const existingUser = await User.findOne({ username });
  if (existingUser) return res.status(400).json({ message: 'Username already exists' });

  const existingEmail = await User.findOne({ email });
  if (existingEmail) return res.status(400).json({ message: 'Email already in use' });

  const facility = await HealthFacility.findById(healthFacility);
  if (!facility) return res.status(404).json({ message: 'Invalid health facility' });

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    fullName,
    username,
    email,
    password: hashedPassword,
    contactInfo,
    healthFacility
  });

  res.status(201).json({
    _id: user._id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    token: generateToken(user._id),
    role: user.role
  });
};

const loginUser = async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username }).populate('healthFacility');
  if (!user) return res.status(400).json({ message: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ message: 'Invalid credentials' });

  res.json({
    _id: user._id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    role: user.role,
    healthFacility: user.healthFacility,
    token: generateToken(user._id)
  });
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'No account found with that email' });

  const resetCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  const hashedCode = crypto.createHash('sha256').update(resetCode).digest('hex');
  const expire = Date.now() + 15 * 60 * 1000; // 15 minutes

  user.passwordResetToken = hashedCode;
  user.passwordResetExpires = expire;
  await user.save();

  const html = `
    <p>You requested a password reset.</p>
    <p>Your 6-digit reset code is:</p>
    <h2>${resetCode}</h2>
    <p>This code will expire in 15 minutes.</p>
  `;

  try {
    await sendEmail({
      to: email,
      subject: 'Your Password Reset Code',
      html,
      text: `Your reset code is: ${resetCode}`,
    });
    res.json({ message: 'Reset code sent to email', userId: user._id });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    res.status(500).json({ message: 'Email could not be sent' });
  }
};

const resetPassword = async (req, res) => {
  const { id, token, newPassword } = req.body;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    _id: id,
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: Date.now() },
  });
  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

  user.password = await bcrypt.hash(newPassword, 10);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({ message: 'Password reset successful' });
};

const verifyResetCode = async (req, res) => {
  const { id, code } = req.body;
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

  const user = await User.findOne({
    _id: id,
    passwordResetToken: hashedCode,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) return res.status(400).json({ message: 'Invalid or expired code' });

  res.json({ message: 'Code verified' });
};

module.exports = { registerUser, loginUser, forgotPassword, resetPassword, verifyResetCode };

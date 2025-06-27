const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const HealthFacility = require('../models/HealthFacility');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const registerUser = async (req, res) => {
  const { fullName, username, password, contactInfo, healthFacility } = req.body;

  const existingUser = await User.findOne({ username });
  if (existingUser) return res.status(400).json({ message: 'Username already exists' });

  const facility = await HealthFacility.findById(healthFacility);
  if (!facility) return res.status(404).json({ message: 'Invalid health facility' });

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    fullName,
    username,
    password: hashedPassword,
    contactInfo,
    healthFacility
  });

  res.status(201).json({
    _id: user._id,
    fullName: user.fullName,
    username: user.username,
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
    role: user.role,
    healthFacility: user.healthFacility,
    token: generateToken(user._id)
  });
};

module.exports = { registerUser, loginUser };

const HealthFacility = require('../models/HealthFacility');

const createFacility = async (req, res) => {
  const { name, location } = req.body;

  const exists = await HealthFacility.findOne({ name });
  if (exists) return res.status(400).json({ message: 'Facility already exists' });

  const facility = await HealthFacility.create({ name, location });

  res.status(201).json(facility);
};

const getAllFacilities = async (req, res) => {
  const facilities = await HealthFacility.find();
  res.json(facilities);
};

module.exports = { createFacility, getAllFacilities };

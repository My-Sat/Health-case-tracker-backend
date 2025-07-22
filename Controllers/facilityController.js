const HealthFacility = require('../models/HealthFacility');

const createFacility = async (req, res) => {
  const { name } = req.body;

  const exists = await HealthFacility.findOne({ name });
  if (exists) return res.status(400).json({ message: 'Facility already exists' });

  const facility = await HealthFacility.create({ name});

  res.status(201).json(facility);
};


const getAllFacilities = async (req, res) => {
  const facilities = await HealthFacility.find();
  res.json(facilities);
};

const getRegions = async (req, res) => {
  const regions = await HealthFacility.distinct('location.region');
  res.json(regions);
};

const getDistricts = async (req, res) => {
  const { region } = req.query;
  if (!region) return res.status(400).json({ message: 'Missing region' });
  const districts = await HealthFacility.find({ 'location.region': region })
    .distinct('location.district');
  res.json(districts);
};

const getSubDistricts = async (req, res) => {
  const { region, district } = req.query;
  if (!region || !district) return res.status(400).json({ message: 'Missing region or district' });
  const subDistricts = await HealthFacility.find({
    'location.region': region,
    'location.district': district
  }).distinct('location.subDistrict');
  res.json(subDistricts.filter(sd => sd != null));
};

const getFacilitiesUnder = async (req, res) => {
  const { region, district, subDistrict } = req.query;
  const filter = { 'location.region': region };
  if (district) filter['location.district'] = district;
  if (subDistrict) filter['location.subDistrict'] = subDistrict;
  const facilities = await HealthFacility.find(filter);
  res.json(facilities);
};



module.exports = {
  createFacility,
  getAllFacilities,
  getRegions,
  getDistricts,
  getSubDistricts,
  getFacilitiesUnder
};
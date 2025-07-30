const HealthFacility = require('../models/HealthFacility');
const Case = require('../models/Case');


const createFacility = async (req, res) => {
  const { name, location } = req.body;

if (location?.geo && (isNaN(location.geo.lat) || isNaN(location.geo.lng))) {
  return res.status(400).json({ message: 'Invalid GPS coordinates' });
}

  const exists = await HealthFacility.findOne({ name });
  if (exists) return res.status(400).json({ message: 'Facility already exists' });

  const facility = await HealthFacility.create({ name, location });

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

const getCommunities = async (req, res) => {
  const { region, district, subDistrict } = req.query;

  if (!region || !district) {
    return res.status(400).json({ message: 'Missing region or district' });
  }

  const filter = {
    'location.region': region,
    'location.district': district,
  };

  if (subDistrict) {
    filter['location.subDistrict'] = subDistrict;
  }

  const communities = await HealthFacility.find(filter).distinct('location.community');
  res.json(communities.filter(c => c != null));
};

const deleteFacility = async (req, res) => {
  const { id } = req.params;

  const facility = await HealthFacility.findById(id);
  if (!facility) {
    return res.status(404).json({ message: 'Facility not found' });
  }

  // Delete all cases referencing this facility
  await Case.deleteMany({ healthFacility: facility._id });

  await facility.deleteOne(); // or HealthFacility.findByIdAndDelete(id)

  res.json({ message: 'Facility and related cases deleted' });
};

const updateFacility = async (req, res) => {
  const { id } = req.params;
  const { name, location } = req.body;

  const facility = await HealthFacility.findById(id);
  if (!facility) return res.status(404).json({ message: 'Facility not found' });

  facility.name = name;
  facility.location = location;

  await facility.save();
  res.json(facility);
};




module.exports = {
  createFacility,
  getAllFacilities,
  getRegions,
  getDistricts,
  getSubDistricts,
  getFacilitiesUnder,
  getCommunities,
  deleteFacility,
  updateFacility
  };
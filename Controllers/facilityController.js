const mongoose = require('mongoose');

const HealthFacility = require('../models/HealthFacility');
const Case = require('../models/Case');
const Region = require('../models/Region');
const District = require('../models/District');
const SubDistrict = require('../models/SubDistrict');
const Community = require('../models/Community');

const {
  findOrCreateRegion,
  findOrCreateDistrict,
  findOrCreateSubDistrict,
  findOrCreateCommunity
} = require('../utilities/location');

// ---------- helpers: accept id or name ----------
const isId = (v) => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);

async function findRegionByNameOrId(val) {
  if (!val) return null;
  return isId(val) ? Region.findById(val) : Region.findOne({ name: val });
}

async function findDistrictByNameOrId(val, regionId) {
  if (!val) return null;
  if (isId(val)) return District.findOne({ _id: val, region: regionId });
  return District.findOne({ name: val, region: regionId });
}

async function findSubDistrictByNameOrId(val, districtId) {
  if (!val) return null;
  if (isId(val)) return SubDistrict.findOne({ _id: val, district: districtId });
  return SubDistrict.findOne({ name: val, district: districtId });
}

// ---------- create ----------
const createFacility = async (req, res) => {
  const { name, location } = req.body;

  if (location?.geo && (isNaN(location.geo.lat) || isNaN(location.geo.lng))) {
    return res.status(400).json({ message: 'Invalid GPS coordinates' });
  }

  const exists = await HealthFacility.findOne({ name });
  if (exists) return res.status(400).json({ message: 'Facility already exists' });

  const region = await findOrCreateRegion(location.region);
  const district = await findOrCreateDistrict(location.district, region._id);
  let subDistrict = null;
  if (location.subDistrict) {
    subDistrict = await findOrCreateSubDistrict(location.subDistrict, district._id);
  }
  const community = await findOrCreateCommunity(
    location.community,
    subDistrict ? subDistrict._id : district._id
  );

  const facility = await HealthFacility.create({
    name,
    region: region._id,
    district: district._id,
    subDistrict: subDistrict?._id ?? null,
    community: community._id,
    geo: location.geo,
  });

  const populated = await facility.populate('region district subDistrict community');
  res.status(201).json(populated);
};

// ---------- reads ----------
const getAllFacilities = async (req, res) => {
  const facilities = await HealthFacility.find({ archived: false })
    .populate('region district subDistrict community');
  res.json(facilities);
};

const getFacilityById = async (req, res) => {
  const { id } = req.params;
  const facility = await HealthFacility.findById(id)
    .populate('region district subDistrict community');

  if (!facility) return res.status(404).json({ message: 'Facility not found' });
  res.json(facility);
};

const getRegions = async (req, res) => {
  const regions = await Region.find().sort({ name: 1 });
  res.json(regions.map((r) => r.name));
};

const getDistricts = async (req, res) => {
  const { region } = req.query;
  if (!region) return res.status(400).json({ message: 'Missing region' });

  const regionDoc = await findRegionByNameOrId(region);
  if (!regionDoc) return res.status(404).json({ message: 'Region not found' });

  const districts = await District.find({ region: regionDoc._id }).sort({ name: 1 });
  res.json(districts.map((d) => d.name));
};

const getSubDistricts = async (req, res) => {
  const { region, district } = req.query;
  if (!region || !district) return res.status(400).json({ message: 'Missing region or district' });

  const regionDoc = await findRegionByNameOrId(region);
  if (!regionDoc) return res.status(404).json({ message: 'Region not found' });

  const districtDoc = await findDistrictByNameOrId(district, regionDoc._id);
  if (!districtDoc) return res.status(404).json({ message: 'District not found' });

  const subDistricts = await SubDistrict.find({ district: districtDoc._id }).sort({ name: 1 });
  res.json(subDistricts.map((s) => s.name));
};

const getFacilitiesUnder = async (req, res) => {
  const { region, district, subDistrict } = req.query;

  const regionDoc = await findRegionByNameOrId(region);
  if (!regionDoc) return res.status(404).json({ message: 'Region not found' });

  const filter = { region: regionDoc._id };

  if (district) {
    const districtDoc = await findDistrictByNameOrId(district, regionDoc._id);
    if (!districtDoc) return res.status(404).json({ message: 'District not found' });
    filter.district = districtDoc._id;

    if (subDistrict) {
      const subDistrictDoc = await findSubDistrictByNameOrId(subDistrict, districtDoc._id);
      if (!subDistrictDoc) return res.status(404).json({ message: 'SubDistrict not found' });
      filter.subDistrict = subDistrictDoc._id;
    }
  }

  const facilities = await HealthFacility.find(filter)
    .populate('region district subDistrict community');
  res.json(facilities);
};

// replace existing getCommunities with this implementation
const getCommunities = async (req, res) => {
  const { region, district, subDistrict } = req.query;
  if (!region || !district) return res.status(400).json({ message: 'Missing region or district' });

  // Resolve region
  const regionDoc = await findRegionByNameOrId(region);
  if (!regionDoc) return res.status(404).json({ message: 'Region not found' });

  // Resolve district (using region context)
  const districtDoc = await findDistrictByNameOrId(district, regionDoc._id);
  if (!districtDoc) return res.status(404).json({ message: 'District not found' });

  // If a subDistrict is provided: resolve it and return communities directly under it
  if (subDistrict) {
    const subDistrictDoc = await findSubDistrictByNameOrId(subDistrict, districtDoc._id);
    if (!subDistrictDoc) return res.status(404).json({ message: 'SubDistrict not found' });

    const communities = await Community.find({ subDistrict: subDistrictDoc._id }).sort({ name: 1 });
    return res.json(communities.map((c) => c.name));
  }

  // No subDistrict provided:
  // Find all subDistricts under the given district, then return communities that belong to those subDistricts.
  const subDistrictDocs = await SubDistrict.find({ district: districtDoc._id }).select('_id').lean();
  const subIds = subDistrictDocs.map((s) => s._id);

  if (subIds.length === 0) {
    // No subdistricts => no communities
    return res.json([]);
  }

  const communities = await Community.find({ subDistrict: { $in: subIds } }).sort({ name: 1 });
  res.json(communities.map((c) => c.name));
};

// ---------- mutations ----------
const updateFacility = async (req, res) => {
  const { id } = req.params;
  const { name, location } = req.body;

  const facility = await HealthFacility.findById(id);
  if (!facility) return res.status(404).json({ message: 'Facility not found' });

  const region = await findOrCreateRegion(location.region);
  const district = await findOrCreateDistrict(location.district, region._id);

  let subDistrict = null;
  if (location.subDistrict) {
    subDistrict = await findOrCreateSubDistrict(location.subDistrict, district._id);
  }

  const community = await findOrCreateCommunity(
    location.community,
    subDistrict ? subDistrict._id : district._id
  );

  facility.name = name;
  facility.region = region._id;
  facility.district = district._id;
  facility.subDistrict = subDistrict?._id ?? null;
  facility.community = community._id;

  await facility.save();

  const populated = await facility.populate('region district subDistrict community');
  res.json(populated);
};

const archiveFacility = async (req, res) => {
  const { id } = req.params;

  const facility = await HealthFacility.findById(id);
  if (!facility) return res.status(404).json({ message: 'Facility not found' });

  facility.archived = true;
  await facility.save();

  await Case.updateMany(
    { healthFacility: facility._id },
    { $set: { archived: true } }
  );

  res.json({ message: 'Facility and associated cases archived' });
};

const getArchivedFacilities = async (req, res) => {
  const facilities = await HealthFacility.find({ archived: true })
    .populate('region district subDistrict community');
  res.json(facilities);
};

const patchFacility = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const facility = await HealthFacility.findById(id);
  if (!facility) return res.status(404).json({ message: 'Facility not found' });

  if (updateData.name) facility.name = updateData.name;

  if (updateData.location) {
    const { region, district, subDistrict, community } = updateData.location;

    const regionDoc = await findOrCreateRegion(region);
    const districtDoc = await findOrCreateDistrict(district, regionDoc._id);
    let subDistrictDoc = null;
    if (subDistrict) {
      subDistrictDoc = await findOrCreateSubDistrict(subDistrict, districtDoc._id);
    }
    const communityDoc = await findOrCreateCommunity(
      community,
      subDistrictDoc ? subDistrictDoc._id : districtDoc._id
    );

    facility.region = regionDoc._id;
    facility.district = districtDoc._id;
    facility.subDistrict = subDistrictDoc?._id ?? null;
    facility.community = communityDoc._id;
  }

  if (updateData.archived !== undefined) {
    facility.archived = updateData.archived;
    if (!updateData.archived) {
      await Case.updateMany(
        { healthFacility: facility._id },
        { $set: { archived: false } }
      );
    }
  }

  await facility.save();
  const populated = await facility.populate('region district subDistrict community');
  res.json(populated);
};

module.exports = {
  createFacility,
  getAllFacilities,
  getFacilityById,
  getRegions,
  getDistricts,
  getSubDistricts,
  getFacilitiesUnder,
  getCommunities,
  updateFacility,
  archiveFacility,
  getArchivedFacilities,
  patchFacility
};

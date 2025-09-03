// utilities/location.js
const Region = require('../models/Region');
const District = require('../models/District');
const SubDistrict = require('../models/SubDistrict');
const Community = require('../models/Community');

async function findOrCreateRegion(name) {
  let region = await Region.findOne({ name });
  if (!region) region = await Region.create({ name });
  return region;
}

async function findOrCreateDistrict(name, regionId) {
  let district = await District.findOne({ name, region: regionId });
  if (!district) district = await District.create({ name, region: regionId });
  return district;
}

async function findOrCreateSubDistrict(name, districtId) {
  let subDistrict = await SubDistrict.findOne({ name, district: districtId });
  if (!subDistrict) subDistrict = await SubDistrict.create({ name, district: districtId });
  return subDistrict;
}

// Accept either a district or subDistrict container
async function findOrCreateCommunity(name, { districtId = null, subDistrictId = null }) {
  const query = { name };
  if (subDistrictId) query.subDistrict = subDistrictId;
  else query.district = districtId;

  let community = await Community.findOne(query);
  if (!community) {
    community = await Community.create({
      name,
      district: subDistrictId ? null : districtId,
      subDistrict: subDistrictId ?? null,
    });
  }
  return community;
}

module.exports = {
  findOrCreateRegion,
  findOrCreateDistrict,
  findOrCreateSubDistrict,
  findOrCreateCommunity,
};

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
async function findOrCreateCommunity(name, { districtId = null, subDistrictId = null } = {}) {
  if (!name) throw new Error('Community name required');

  // If subDistrictId provided, prefer that container
  if (subDistrictId) {
    let community = await Community.findOne({ name, subDistrict: subDistrictId });
    if (!community) {
      community = await Community.create({ name, subDistrict: subDistrictId, district: null });
    }
    return community;
  }

  // Otherwise use district container
  if (!districtId) {
    // no parent provided -> try global find
    let community = await Community.findOne({ name });
    if (!community) community = await Community.create({ name, district: null, subDistrict: null });
    return community;
  }

  let community = await Community.findOne({ name, district: districtId });
  if (!community) {
    community = await Community.create({ name, district: districtId, subDistrict: null });
  }
  return community;
}

module.exports = {
  findOrCreateRegion,
  findOrCreateDistrict,
  findOrCreateSubDistrict,
  findOrCreateCommunity,
};

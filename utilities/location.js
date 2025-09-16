// utilities/location.js
const Region = require('../models/Region');
const District = require('../models/District');
const SubDistrict = require('../models/SubDistrict');
const Community = require('../models/Community');
const mongoose = require('mongoose');

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveRegionId(regionRef) {
  if (!regionRef) return null;
  if (mongoose.Types.ObjectId.isValid(String(regionRef))) return String(regionRef);
  const name = String(regionRef).trim();
  if (!name) return null;
  const region = await Region.findOne({ name: new RegExp(`^${escapeRegExp(name)}$`, 'i') });
  return region ? String(region._id) : null;
}

async function resolveDistrictId(districtRef, regionRef = null) {
  if (!districtRef) return null;
  if (mongoose.Types.ObjectId.isValid(String(districtRef))) return String(districtRef);
  const name = String(districtRef).trim();
  if (!name) return null;

  const query = { name: new RegExp(`^${escapeRegExp(name)}$`, 'i') };
  if (regionRef) {
    const regionId = await resolveRegionId(regionRef);
    if (!regionId) return null;
    query.region = regionId;
  }

  const district = await District.findOne(query);
  return district ? String(district._id) : null;
}

// --------------------- findOrCreate (case-insensitive matching) ---------------------
async function findOrCreateRegion(name) {
  if (!name || !name.trim()) throw new Error('Region name required');
  const clean = name.trim();
  const regex = new RegExp(`^${escapeRegExp(clean)}$`, 'i');
  let region = await Region.findOne({ name: regex });
  if (!region) region = await Region.create({ name: clean });
  return region;
}

async function findOrCreateDistrict(name, regionId) {
  if (!name || !name.trim()) throw new Error('District name required');
  if (!regionId) throw new Error('Region id required for district');
  const clean = name.trim();
  const regex = new RegExp(`^${escapeRegExp(clean)}$`, 'i');
  let district = await District.findOne({ name: regex, region: regionId });
  if (!district) district = await District.create({ name: clean, region: regionId });
  return district;
}

async function findOrCreateSubDistrict(name, districtId) {
  if (!name || !name.trim()) throw new Error('Sub-district name required');
  if (!districtId) throw new Error('District id required for sub-district');
  const clean = name.trim();
  const regex = new RegExp(`^${escapeRegExp(clean)}$`, 'i');
  let subDistrict = await SubDistrict.findOne({ name: regex, district: districtId });
  if (!subDistrict) subDistrict = await SubDistrict.create({ name: clean, district: districtId });
  return subDistrict;
}

// Accept either a district or subDistrict container
async function findOrCreateCommunity(name, { districtId = null, subDistrictId = null } = {}) {
  if (!name || !name.trim()) throw new Error('Community name required');
  const clean = name.trim();
  const regex = new RegExp(`^${escapeRegExp(clean)}$`, 'i');

  // If subDistrictId provided, prefer that container
  if (subDistrictId) {
    let community = await Community.findOne({ name: regex, subDistrict: subDistrictId });
    if (!community) {
      community = await Community.create({ name: clean, subDistrict: subDistrictId, district: null });
    }
    return community;
  }

  // Otherwise use district container
  if (!districtId) {
    // no parent provided -> try global find
    let community = await Community.findOne({ name: regex });
    if (!community) community = await Community.create({ name: clean, district: null, subDistrict: null });
    return community;
  }

  let community = await Community.findOne({ name: regex, district: districtId });
  if (!community) {
    community = await Community.create({ name: clean, district: districtId, subDistrict: null });
  }
  return community;
}

// --------------------- existence helpers (used by validation endpoints) ---------------------
async function existsRegion(name) {
  if (!name || !name.toString().trim()) return false;
  const clean = name.toString().trim();
  const regex = new RegExp(`^${escapeRegExp(clean)}$`, 'i');
  const found = await Region.findOne({ name: regex });
  return !!found;
}

async function existsDistrict(name, regionRef) {
  if (!name || !name.toString().trim()) return false;
  if (!regionRef) return false; // district uniqueness is scoped to region
  const regionId = await resolveRegionId(regionRef);
  if (!regionId) return false; // region doesn't exist -> district cannot already exist under it
  const clean = name.toString().trim();
  const regex = new RegExp(`^${escapeRegExp(clean)}$`, 'i');
  const found = await District.findOne({ name: regex, region: regionId });
  return !!found;
}

async function existsSubDistrict(name, districtRef) {
  if (!name || !name.toString().trim()) return false;
  if (!districtRef) return false;
  const districtId = await resolveDistrictId(districtRef);
  if (!districtId) return false;
  const clean = name.toString().trim();
  const regex = new RegExp(`^${escapeRegExp(clean)}$`, 'i');
  const found = await SubDistrict.findOne({ name: regex, district: districtId });
  return !!found;
}

async function existsCommunity(name, { districtRef = null, subDistrictRef = null } = {}) {
  if (!name || !name.toString().trim()) return false;
  const clean = name.toString().trim();
  const regex = new RegExp(`^${escapeRegExp(clean)}$`, 'i');

  // prefer subdistrict if provided
  if (subDistrictRef) {
    const subId = await resolveDistrictId(subDistrictRef); // reuse resolver; works if subDistrictRef is id or name
    // note: resolveDistrictId used for district -> need a small resolution for subDistrict by name
    // Safer: try treat subDistrictRef as id first:
    let subDistrictId = null;
    if (mongoose.Types.ObjectId.isValid(String(subDistrictRef))) {
      subDistrictId = String(subDistrictRef);
    } else {
      const maybe = await SubDistrict.findOne({ name: new RegExp(`^${escapeRegExp(String(subDistrictRef).trim())}$`, 'i') });
      subDistrictId = maybe ? String(maybe._id) : null;
    }
    if (!subDistrictId) return false;
    const found = await Community.findOne({ name: regex, subDistrict: subDistrictId });
    return !!found;
  }

  if (districtRef) {
    const districtId = await resolveDistrictId(districtRef);
    if (!districtId) return false;
    const found = await Community.findOne({ name: regex, district: districtId });
    return !!found;
  }

  // global community check
  const found = await Community.findOne({ name: regex });
  return !!found;
}

module.exports = {
  findOrCreateRegion,
  findOrCreateDistrict,
  findOrCreateSubDistrict,
  findOrCreateCommunity,
  resolveCommunityId,
  // new exports
  existsRegion,
  existsDistrict,
  existsSubDistrict,
  existsCommunity,
};

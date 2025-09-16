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

/**
 * Resolve/create a Community ID given optional inputs:
 * - communityName (string) — optional. If missing/blank we return fallbackFacility.community
 * - location: { region, district, subDistrict? } — optional; when present we will create/find parents then community under them
 * - fallbackFacility: HealthFacility doc (used when communityName present but no location is supplied)
 *
 * Returns a Community document (_id).
 */
async function resolveCommunityId({ communityName, location, fallbackFacility } = {}) {
  // If no community name provided at all, use the facility's configured community
  if (!communityName || !communityName.trim()) {
    if (!fallbackFacility) throw new Error('No community name and no fallback facility provided');
    return fallbackFacility.community; // ObjectId
  }

  // If a location object is provided, use that path (region > district > [subDistrict?])
  if (location && location.region && location.district) {
    const regionDoc = await findOrCreateRegion(location.region.trim());
    const districtDoc = await findOrCreateDistrict(location.district.trim(), regionDoc._id);

    let subDistrictId = null;
    if (location.subDistrict && location.subDistrict.trim()) {
      const subDistrictDoc = await findOrCreateSubDistrict(location.subDistrict.trim(), districtDoc._id);
      subDistrictId = subDistrictDoc._id;
    }

    // Create/find community using the most specific parent available
    const communityDoc = await findOrCreateCommunity(communityName.trim(), {
      districtId: districtDoc._id,
      subDistrictId,
    });
    return communityDoc._id;
  }

  // Otherwise: create/find the community under the officer's facility path
  // prefer subDistrict (if set) else district
  const fallbackSubId = (fallbackFacility && fallbackFacility.subDistrict) ? fallbackFacility.subDistrict : null;
  const fallbackDistrictId = fallbackSubId ? null : ((fallbackFacility && fallbackFacility.district) ? fallbackFacility.district : null);

  const communityDoc = await findOrCreateCommunity(communityName.trim(), {
    districtId: fallbackDistrictId,
    subDistrictId: fallbackSubId,
  });
  return communityDoc._id;
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

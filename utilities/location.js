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
};

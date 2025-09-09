// Controllers/case_controller.js
const Case = require('../models/Case');
const User = require('../models/User');
const CaseType = require('../models/case_type');
const HealthFacility = require('../models/HealthFacility');
const mongoose = require('mongoose');
const Region = require('../models/Region');
const District = require('../models/District');
const SubDistrict = require('../models/SubDistrict');
const Community = require('../models/Community');

const {
  findOrCreateRegion,
  findOrCreateDistrict,
  findOrCreateSubDistrict,
  findOrCreateCommunity,
  resolveCommunityId,
} = require('../utilities/location');

const isObjectId = (v) => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);

// --------------------- helpers ---------------------
const objectIdRe = /^[0-9a-fA-F]{24}$/;

// Read a human name from a candidate that may be:
// - a string name
// - a populated doc with .name or .fullName
// - an ObjectId (ignored)
// - extended JSON { $oid: '...' } (ignored)
function readNameCandidate(v) {
  if (v == null) return '';
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return '';
    if (objectIdRe.test(s)) return '';
    return s;
  }
  if (v instanceof mongoose.Types.ObjectId) return '';
  if (typeof v === 'object') {
    if (typeof v.name === 'string' && v.name.trim() && !objectIdRe.test(v.name.trim())) return v.name.trim();
    if (typeof v.fullName === 'string' && v.fullName.trim() && !objectIdRe.test(v.fullName.trim())) return v.fullName.trim();
    if (v._doc && typeof v._doc === 'object') {
      const inner = v._doc;
      if (typeof inner.name === 'string' && inner.name.trim() && !objectIdRe.test(inner.name.trim())) return inner.name.trim();
      if (typeof inner.fullName === 'string' && inner.fullName.trim() && !objectIdRe.test(inner.fullName.trim())) return inner.fullName.trim();
    }
    if (v.$oid && typeof v.$oid === 'string') {
      const s = v.$oid.trim();
      if (s && !objectIdRe.test(s)) return s;
      return '';
    }
    // nested possible containers
    if (v.region) {
      const r = readNameCandidate(v.region);
      if (r) return r;
    }
    if (v.district) {
      const d = readNameCandidate(v.district);
      if (d) return d;
    }
    if (v.subDistrict) {
      const sd = readNameCandidate(v.subDistrict);
      if (sd) return sd;
    }
    if (v.community) {
      const c = readNameCandidate(v.community);
      if (c) return c;
    }
  }
  try {
    const s = String(v).trim();
    if (!s) return '';
    if (objectIdRe.test(s)) return '';
    return s;
  } catch (_) {
    return '';
  }
}

/**
 * Given a case-like object (possibly populated), synthesize a simple location object:
 * { region: string, district: string, subDistrict: string, community: string }
 *
 * Priority used here (more robust than before):
 * 1) case.location (only if it contains region/district/subDistrict values)
 * 2) if case.location contains only community -> try to enrich parents from:
 *      a) populated case.community (if it contains region/district/subDistrict)
 *      b) healthFacility.location (or hf.region/hf.district/hf.subDistrict)
 * 3) populated case.community (if present)
 * 4) healthFacility.location / top-level hf fields
 */
function synthesizeCaseLocation(caseObj) {
  const caseLoc = caseObj.location || {};
  const regionFromCase = readNameCandidate(caseLoc.region);
  const districtFromCase = readNameCandidate(caseLoc.district);
  const subDistrictFromCase = readNameCandidate(caseLoc.subDistrict);
  const communityFromCase = readNameCandidate(caseLoc.community);

  // If case-level location contains explicit parent names, prefer it.
  if (regionFromCase || districtFromCase || subDistrictFromCase) {
    return {
      region: regionFromCase,
      district: districtFromCase,
      subDistrict: subDistrictFromCase,
      community: communityFromCase,
    };
  }

  // If case-level location only has a community name (no parents),
  // try to enrich using populated community doc or the healthFacility.
  if (communityFromCase) {
    // 2a) try the populated community document for parents
    const com = caseObj.community || {};
    const comRegion = readNameCandidate(com.region);
    const comDistrict = readNameCandidate(com.district);
    const comSubDistrict = readNameCandidate(com.subDistrict);

    if (comRegion || comDistrict || comSubDistrict) {
      return {
        region: comRegion,
        district: comDistrict,
        subDistrict: comSubDistrict,
        community: communityFromCase,
      };
    }

    // 2b) fall back to healthFacility location or top-level hf fields
    const hf = caseObj.healthFacility || {};
    if (hf.location && typeof hf.location === 'object') {
      const hfRegion = readNameCandidate(hf.location.region);
      const hfDistrict = readNameCandidate(hf.location.district);
      const hfSub = readNameCandidate(hf.location.subDistrict);
      if (hfRegion || hfDistrict || hfSub) {
        return {
          region: hfRegion,
          district: hfDistrict,
          subDistrict: hfSub,
          community: communityFromCase,
        };
      }
    }

    // nothing more to enrich — return community with empty parents
    return {
      region: '',
      district: '',
      subDistrict: '',
      community: communityFromCase,
    };
  }

  // 3) case.community (populated) — use it if available
  const com = caseObj.community || {};
  const communityName = readNameCandidate(com);
  const communityRegion = readNameCandidate(com.region);
  const communityDistrict = readNameCandidate(com.district);
  const communitySubDistrict = readNameCandidate(com.subDistrict);

  if (communityName || communityRegion || communityDistrict || communitySubDistrict) {
    return {
      region: communityRegion,
      district: communityDistrict,
      subDistrict: communitySubDistrict,
      community: communityName,
    };
  }

  // 4) finally, use healthFacility.location or hf fields
  const hf = caseObj.healthFacility || {};
  if (hf.location && typeof hf.location === 'object') {
    const region = readNameCandidate(hf.location.region);
    const district = readNameCandidate(hf.location.district);
    const subDistrict = readNameCandidate(hf.location.subDistrict);
    const community = readNameCandidate(hf.location.community);
    if (region || district || subDistrict || community) {
      return { region, district, subDistrict, community };
    }
  }

  const hfRegion = readNameCandidate(hf.region);
  const hfDistrict = readNameCandidate(hf.district);
  const hfSubDistrict = readNameCandidate(hf.subDistrict);
  const hfCommunity = readNameCandidate(hf.community);
  return {
    region: hfRegion,
    district: hfDistrict,
    subDistrict: hfSubDistrict,
    community: hfCommunity,
  };
}

/**
 * Convert a supplied location object containing names into stored ObjectId refs.
 * Expects: { region: '...', district: '...', subDistrict?: '...', community: '...' }
 * Returns: { regionId, districtId, subDistrictId, communityId } (ObjectIds)
 */
async function namesToRefs(location = {}, communityName, fallbackFacility) {
  // If location not provided, return nulls
  if (!location || !location.region || !location.district) return null;

  const regionDoc = await findOrCreateRegion(location.region.trim());
  const districtDoc = await findOrCreateDistrict(location.district.trim(), regionDoc._id);

  let subDistrictDoc = null;
  if (location.subDistrict && location.subDistrict.trim()) {
    subDistrictDoc = await findOrCreateSubDistrict(location.subDistrict.trim(), districtDoc._id);
  }

  // communityName is required by create_case_screen when useFacilityCommunity===false,
  // but handle defensively: if missing, still try to create a default community under district/subDistrict
  const commName = communityName && communityName.trim() ? communityName.trim() : null;
  const communityDoc = commName
    ? await findOrCreateCommunity(commName, {
        subDistrictId: subDistrictDoc ? subDistrictDoc._id : null,
        districtId: subDistrictDoc ? null : districtDoc._id,
      })
    : await findOrCreateCommunity('Unknown', {
        subDistrictId: subDistrictDoc ? subDistrictDoc._id : null,
        districtId: subDistrictDoc ? null : districtDoc._id,
      });

  return {
    regionId: regionDoc._id,
    districtId: districtDoc._id,
    subDistrictId: subDistrictDoc ? subDistrictDoc._id : null,
    communityId: communityDoc._id,
  };
}

// --------------------- controllers ---------------------

const createCase = async (req, res) => {
  try {
    const { caseType, patient, community, location, useFacilityCommunity } = req.body;

    // Officer & facility
    const officer = await User.findById(req.user._id).select('healthFacility fullName');
    if (!officer || !officer.healthFacility) {
      return res.status(404).json({ message: 'Officer or officer facility not found' });
    }

    const facility = await HealthFacility.findById(officer.healthFacility).select(
      'region district subDistrict community'
    );
    if (!facility) {
      return res.status(404).json({ message: 'Health facility not found' });
    }

    // Case type
    const type = await CaseType.findById(caseType);
    if (!type) {
      return res.status(400).json({ message: 'Invalid case type ID' });
    }

    // Resolve community id per rules. If location object provided we will prefer converting names->refs
    let communityId;
    let caseLocationRefs = null;

    if (useFacilityCommunity === true) {
      communityId = facility.community;
      caseLocationRefs = null;
    } else {
      // If client supplied a location (names), convert -> refs and persist them
      if (location && location.region && location.district) {
        const refs = await namesToRefs(location, community, facility);
        if (refs) {
          communityId = refs.communityId;
          caseLocationRefs = {
            region: refs.regionId,
            district: refs.districtId,
            subDistrict: refs.subDistrictId,
            community: refs.communityId,
          };
        } else {
          // fallback to resolveCommunityId (handles community name only)
          communityId = await (async () => {
            const cid = await (async () => {
              const fallback = await resolveCommunityId({
                communityName: community,
                location,
                fallbackFacility: facility,
              });
              return fallback;
            })();
            return cid;
          })();
          caseLocationRefs = null;
        }
      } else {
        // No location supplied: fallback to previous resolveCommunityId behavior
        communityId = await resolveCommunityId({
          communityName: community,
          location,
          fallbackFacility: facility,
        });
        caseLocationRefs = null;
      }
    }

    // Build payload; persist location refs only when present
    const newCasePayload = {
      officer: req.user._id,
      caseType: type._id,
      healthFacility: facility._id,
      status: 'suspected',
      community: communityId,
      patient,
    };

    if (caseLocationRefs) {
      newCasePayload.location = caseLocationRefs;
    } else {
      newCasePayload.location = null;
    }

    const newCase = await Case.create(newCasePayload);

    // Populate the returned document, including location refs -> names
    const populated = await Case.findById(newCase._id)
      .populate('officer', 'fullName')
      .populate('caseType')
      .populate({
        path: 'healthFacility',
        select: 'name region district subDistrict community',
        populate: [
          { path: 'region', select: 'name' },
          { path: 'district', select: 'name' },
          { path: 'subDistrict', select: 'name' },
          { path: 'community', select: 'name' },
        ],
      })
      .populate('community')
      // populate case.location.* refs to get names
      .populate({ path: 'location.region', select: 'name', model: 'Region' })
      .populate({ path: 'location.district', select: 'name', model: 'District' })
      .populate({ path: 'location.subDistrict', select: 'name', model: 'SubDistrict' })
      .populate({ path: 'location.community', select: 'name', model: 'Community' })
      .lean();

    // Ensure healthFacility.location (back-compat) still present
    if (populated.healthFacility && !populated.healthFacility.location) {
      const hf = populated.healthFacility;
      hf.location = {
        region: hf.region?.name ?? hf.region ?? null,
        district: hf.district?.name ?? hf.district ?? null,
        subDistrict: hf.subDistrict?.name ?? hf.subDistrict ?? null,
        community: hf.community?.name ?? hf.community ?? null,
      };
    }

    // Attach synthesized case-level 'location' (strings)
    populated.location = synthesizeCaseLocation(populated);

    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create case' });
  }
};

const updateCaseStatus = async (req, res) => {
  try {
    const caseId = req.params.id;
    const { status, patientStatus } = req.body;

    if (!status && !patientStatus) {
      return res.status(400).json({ message: 'Missing status or patientStatus' });
    }

    const existingCase = await Case.findById(caseId);
    if (!existingCase) return res.status(404).json({ message: 'Case not found' });

    if (!existingCase.officer.equals(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (status && ['confirmed', 'not a case', 'suspected'].includes(status)) {
      existingCase.status = status;
    }

    if (patientStatus && ['Recovered', 'Ongoing treatment', 'Deceased'].includes(patientStatus)) {
      existingCase.patient.status = patientStatus;
    }

    await existingCase.save();

    const populated = await Case.findById(existingCase._id)
      .populate('officer', 'fullName')
      .populate('caseType')
      .populate({
        path: 'healthFacility',
        select: 'name region district subDistrict community',
        populate: [
          { path: 'region', select: 'name' },
          { path: 'district', select: 'name' },
          { path: 'subDistrict', select: 'name' },
          { path: 'community', select: 'name' },
        ],
      })
      .populate('community')
      .populate({ path: 'location.region', select: 'name', model: 'Region' })
      .populate({ path: 'location.district', select: 'name', model: 'District' })
      .populate({ path: 'location.subDistrict', select: 'name', model: 'SubDistrict' })
      .populate({ path: 'location.community', select: 'name', model: 'Community' })
      .lean();

    if (populated.healthFacility && !populated.healthFacility.location) {
      const hf = populated.healthFacility;
      hf.location = {
        region: hf.region?.name ?? hf.region ?? null,
        district: hf.district?.name ?? hf.district ?? null,
        subDistrict: hf.subDistrict?.name ?? hf.subDistrict ?? null,
        community: hf.community?.name ?? hf.community ?? null,
      };
    }

    populated.location = synthesizeCaseLocation(populated);

    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update case status' });
  }
};

const getCases = async (req, res) => {
  try {
    const query =
      req.user?.role === 'admin'
        ? { archived: false }
        : { officer: req.user._id, archived: false };

    const cases = await Case.find(query)
      .populate('officer', 'fullName')
      .populate('caseType', 'name')
      .populate({
        path: 'healthFacility',
        select: 'name region district subDistrict community',
        populate: [
          { path: 'region', select: 'name' },
          { path: 'district', select: 'name' },
          { path: 'subDistrict', select: 'name' },
          { path: 'community', select: 'name' },
        ],
      })
      .populate('community', 'name')
      .populate({ path: 'location.region', select: 'name', model: 'Region' })
      .populate({ path: 'location.district', select: 'name', model: 'District' })
      .populate({ path: 'location.subDistrict', select: 'name', model: 'SubDistrict' })
      .populate({ path: 'location.community', select: 'name', model: 'Community' })
      .sort({ timeline: -1 })
      .lean();

    // Back-compat: synthesize healthFacility.location with names (not ids)
    cases.forEach((c) => {
      const hf = c.healthFacility;
      if (hf && !hf.location) {
        hf.location = {
          region: hf.region?.name ?? hf.region ?? null,
          district: hf.district?.name ?? hf.district ?? null,
          subDistrict: hf.subDistrict?.name ?? hf.subDistrict ?? null,
          community: hf.community?.name ?? hf.community ?? null,
        };
      }

      // Attach synthesized case-level location (strings)
      c.location = synthesizeCaseLocation(c);
    });

    res.json(cases);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to load cases' });
  }
};

const getAllCasesForOfficers = async (req, res) => {
  try {
    const cases = await Case.find({ archived: false })
      .populate('officer', 'fullName')
      .populate('caseType', 'name')
      .populate({
        path: 'healthFacility',
        select: 'name region district subDistrict community',
        populate: [
          { path: 'region', select: 'name' },
          { path: 'district', select: 'name' },
          { path: 'subDistrict', select: 'name' },
          { path: 'community', select: 'name' },
        ],
      })
      .populate('community', 'name')
      .populate({ path: 'location.region', select: 'name', model: 'Region' })
      .populate({ path: 'location.district', select: 'name', model: 'District' })
      .populate({ path: 'location.subDistrict', select: 'name', model: 'SubDistrict' })
      .populate({ path: 'location.community', select: 'name', model: 'Community' })
      .sort({ timeline: -1 })
      .lean();

    cases.forEach((c) => {
      const hf = c.healthFacility;
      if (hf && !hf.location) {
        hf.location = {
          region: hf.region?.name ?? hf.region ?? null,
          district: hf.district?.name ?? hf.district ?? null,
          subDistrict: hf.subDistrict?.name ?? hf.subDistrict ?? null,
          community: hf.community?.name ?? hf.community ?? null,
        };
      }

      c.location = synthesizeCaseLocation(c);
    });

    res.json(cases);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Failed to load all cases' });
  }
};

const getOfficerPatients = async (req, res) => {
  try {
    const cases = await Case.find({ officer: req.user._id, archived: false }).select('patient');
    res.json(cases.map((c) => c.patient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load patients' });
  }
};

const getOfficerCases = async (req, res) => {
  try {
    const cases = await Case.find({ officer: req.user._id, archived: false })
      .populate('officer', 'fullName')
      .populate('caseType', 'name')
      .populate({
        path: 'healthFacility',
        select: 'name region district subDistrict community',
        populate: [
          { path: 'region', select: 'name' },
          { path: 'district', select: 'name' },
          { path: 'subDistrict', select: 'name' },
          { path: 'community', select: 'name' },
        ],
      })
      .populate('community', 'name')
      .populate({ path: 'location.region', select: 'name', model: 'Region' })
      .populate({ path: 'location.district', select: 'name', model: 'District' })
      .populate({ path: 'location.subDistrict', select: 'name', model: 'SubDistrict' })
      .populate({ path: 'location.community', select: 'name', model: 'Community' })
      .sort({ timeline: -1 })
      .lean();

    cases.forEach((c) => {
      const hf = c.healthFacility;
      if (!hf) return;
      if (!hf.location) hf.location = {};
      hf.location = {
        region: hf.region?.name ?? hf.region ?? null,
        district: hf.district?.name ?? hf.district ?? null,
        subDistrict: hf.subDistrict?.name ?? hf.subDistrict ?? null,
        community: hf.community?.name ?? hf.community ?? null,
      };

      c.location = synthesizeCaseLocation(c);
    });

    res.json(cases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load officer cases' });
  }
};

const editCaseDetails = async (req, res) => {
  try {
    const caseId = req.params.id;
    const { caseType, community, location, patient, status, useFacilityCommunity } = req.body;

    const existing = await Case.findById(caseId);
    if (!existing) return res.status(404).json({ message: 'Case not found' });

    if (!existing.officer.equals(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Case type
    if (caseType) {
      const type = await CaseType.findById(caseType);
      if (!type) return res.status(400).json({ message: 'Invalid case type' });
      existing.caseType = type._id;
    }

    // Community (string name) + optional location names
    if (community !== undefined || useFacilityCommunity === true) {
      // Load officer facility for fallback path
      const officer = await User.findById(req.user._id).select('healthFacility');
      const facility = officer
        ? await HealthFacility.findById(officer.healthFacility).select(
            'region district subDistrict community'
          )
        : null;
      if (!facility) return res.status(404).json({ message: 'Officer facility not found' });

      if (useFacilityCommunity === true) {
        existing.community = facility.community;
        // clear any previously stored case-level location (we're explicitly using facility community)
        existing.location = null;
      } else {
        // If a location object is supplied, convert names -> refs and persist those refs
        if (location && location.region && location.district) {
          const refs = await namesToRefs(location, community, facility);
          if (refs) {
            existing.community = refs.communityId;
            existing.location = {
              region: refs.regionId,
              district: refs.districtId,
              subDistrict: refs.subDistrictId,
              community: refs.communityId,
            };
          } else {
            // fallback: resolve community by name only (no location provided)
            const communityId = await resolveCommunityId({
              communityName: typeof community === 'string' ? community : '',
              location,
              fallbackFacility: facility,
            });
            existing.community = communityId;
            // do not persist location refs
            existing.location = null;
          }
        } else {
          // no location supplied -> just update community if provided, leave location unchanged
          if (typeof community === 'string') {
            const communityId = await resolveCommunityId({
              communityName: community,
              location,
              fallbackFacility: facility,
            });
            existing.community = communityId;
          }
        }
      }
    }

    // Status
    if (status && ['suspected', 'confirmed', 'not a case'].includes(status)) {
      existing.status = status;
    }

    // Patient fields
    if (patient) {
      if (patient.name) existing.patient.name = patient.name;
      if (patient.age != null) existing.patient.age = patient.age;
      if (patient.gender) existing.patient.gender = patient.gender;
      if (patient.phone) existing.patient.phone = patient.phone;
      if (patient.status && ['Recovered', 'Ongoing treatment', 'Deceased'].includes(patient.status)) {
        existing.patient.status = patient.status;
      }
    }

    await existing.save();

    const populated = await Case.findById(caseId)
      .populate('officer', 'fullName')
      .populate('caseType')
      .populate({
        path: 'healthFacility',
        select: 'name region district subDistrict community',
        populate: [
          { path: 'region', select: 'name' },
          { path: 'district', select: 'name' },
          { path: 'subDistrict', select: 'name' },
          { path: 'community', select: 'name' },
        ],
      })
      .populate('community')
      .populate({ path: 'location.region', select: 'name', model: 'Region' })
      .populate({ path: 'location.district', select: 'name', model: 'District' })
      .populate({ path: 'location.subDistrict', select: 'name', model: 'SubDistrict' })
      .populate({ path: 'location.community', select: 'name', model: 'Community' })
      .lean();

    if (populated.healthFacility && !populated.healthFacility.location) {
      const hf = populated.healthFacility;
      hf.location = {
        region: hf.region?.name ?? hf.region ?? null,
        district: hf.district?.name ?? hf.district ?? null,
        subDistrict: hf.subDistrict?.name ?? hf.subDistrict ?? null,
        community: hf.community?.name ?? hf.community ?? null,
      };
    }

    populated.location = synthesizeCaseLocation(populated);
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to edit case' });
  }
};

const archiveCase = async (req, res) => {
  try {
    const caseId = req.params.id;

    const existingCase = await Case.findById(caseId);
    if (!existingCase) return res.status(404).json({ message: 'Case not found' });

    if (!existingCase.officer.equals(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    existingCase.archived = true;
    await existingCase.save();

    res.json({ message: 'Case archived successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to archive case' });
  }
};

const getArchivedCases = async (req, res) => {
  try {
    const archived = await Case.find({ archived: true })
      .populate('officer', 'fullName')
      .populate('caseType')
      .populate({
        path: 'healthFacility',
        select: 'name region district subDistrict community',
        populate: [
          { path: 'region', select: 'name' },
          { path: 'district', select: 'name' },
          { path: 'subDistrict', select: 'name' },
          { path: 'community', select: 'name' },
        ],
      })
      .populate('community')
      .populate({ path: 'location.region', select: 'name', model: 'Region' })
      .populate({ path: 'location.district', select: 'name', model: 'District' })
      .populate({ path: 'location.subDistrict', select: 'name', model: 'SubDistrict' })
      .populate({ path: 'location.community', select: 'name', model: 'Community' })
      .lean();

    archived.forEach((c) => {
      if (c.healthFacility && !c.healthFacility.location) {
        const hf = c.healthFacility;
        hf.location = {
          region: hf.region?.name ?? hf.region ?? null,
          district: hf.district?.name ?? hf.district ?? null,
          subDistrict: hf.subDistrict?.name ?? hf.subDistrict ?? null,
          community: hf.community?.name ?? hf.community ?? null,
        };
      }
      c.location = synthesizeCaseLocation(c);
    });

    res.json(archived);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load archived cases' });
  }
};

const unarchiveCase = async (req, res) => {
  try {
    const caseId = req.params.id;

    const existingCase = await Case.findById(caseId);
    if (!existingCase) return res.status(404).json({ message: 'Case not found' });

    if (!existingCase.officer.equals(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    existingCase.archived = false;
    await existingCase.save();

    res.json({ message: 'Case unarchived successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to unarchive case' });
  }
};

const getCaseTypeSummary = async (req, res) => {
  try {
    const { caseType, region, district, subDistrict, community } = req.query;

    // Base match: ignore archived cases and only include suspected/confirmed
    const match = { archived: false, status: { $in: ['suspected', 'confirmed'] } };

    // --- caseType filter (id or name)
    if (caseType && caseType !== 'all') {
      if (isObjectId(caseType)) {
        match.caseType = new mongoose.Types.ObjectId(caseType);
      } else {
        const ct = await CaseType.findOne({ name: caseType });
        if (!ct) return res.json([]); // no matching case type -> empty result
        match.caseType = ct._id;
      }
    }

    // --- resolve facility-level filters (region/district/subDistrict) to find matching facility ids
    const facilityFilter = {};
    let regionId = null;
    let districtId = null;
    let subDistrictId = null;

    if (region) {
      if (isObjectId(region)) {
        regionId = new mongoose.Types.ObjectId(region);
      } else {
        const regionDoc = await Region.findOne({ name: region });
        if (!regionDoc) return res.json([]); // region name not found
        regionId = regionDoc._id;
      }
      facilityFilter.region = regionId;
    }

    if (district) {
      if (isObjectId(district)) {
        districtId = new mongoose.Types.ObjectId(district);
      } else {
        // prefer district scoped to region if we have regionId
        const q = regionId ? { name: district, region: regionId } : { name: district };
        const districtDoc = await District.findOne(q);
        if (!districtDoc) return res.json([]); // district not found
        districtId = districtDoc._id;
      }
      facilityFilter.district = districtId;
    }

    if (subDistrict) {
      if (isObjectId(subDistrict)) {
        subDistrictId = new mongoose.Types.ObjectId(subDistrict);
      } else {
        // prefer subDistrict scoped to district if we have districtId
        const q = districtId ? { name: subDistrict, district: districtId } : { name: subDistrict };
        const subDoc = await SubDistrict.findOne(q);
        if (!subDoc) return res.json([]); // subDistrict not found
        subDistrictId = subDoc._id;
      }
      facilityFilter.subDistrict = subDistrictId;
    }

    // If we have any facilityFilter constraints, find matching facility ids and add to match
    if (Object.keys(facilityFilter).length > 0) {
      const facilityIds = await HealthFacility.find(facilityFilter).distinct('_id');
      if (!facilityIds || facilityIds.length === 0) {
        // No facilities under that region/district/subDistrict -> empty result
        return res.json([]);
      }
      match.healthFacility = { $in: facilityIds };
    }

    // --- community filter (case.community) (id or name)
    if (community) {
      if (isObjectId(community)) {
        match.community = new mongoose.Types.ObjectId(community);
      } else {
        // attempt to resolve community by name with a sensible parent context:
        // prefer subDistrictId > districtId; if neither available, do a global findOne by name.
        let comDoc = null;

        if (subDistrictId) {
          comDoc = await Community.findOne({ name: community, subDistrict: subDistrictId });
        } else if (districtId) {
          const subDocs = await SubDistrict.find({ district: districtId }).select('_id').lean();
          const subIds = subDocs.map((s) => s._id);
          comDoc = await Community.findOne({
            name: community,
            $or: [{ district: districtId }, { subDistrict: { $in: subIds } }],
          });
        } else {
          comDoc = await Community.findOne({ name: community });
        }

        if (!comDoc) return res.json([]); // community not found
        match.community = comDoc._id;
      }
    }

    // --- aggregation pipeline (group by caseType, status, patient.status then roll up)
    const caseTypeCollection = CaseType.collection.name;
    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            caseType: '$caseType',
            status: '$status',
            patientStatus: '$patient.status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.caseType',
          total: { $sum: '$count' },
          confirmed_total: {
            $sum: { $cond: [{ $eq: ['$_id.status', 'confirmed'] }, '$count', 0] },
          },
          suspected_total: {
            $sum: { $cond: [{ $eq: ['$_id.status', 'suspected'] }, '$count', 0] },
          },
          confirmed_recovered: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$_id.status', 'confirmed'] }, { $eq: ['$_id.patientStatus', 'Recovered'] }] },
                '$count',
                0,
              ],
            },
          },
          confirmed_ongoingTreatment: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$_id.status', 'confirmed'] }, { $eq: ['$_id.patientStatus', 'Ongoing treatment'] }] },
                '$count',
                0,
              ],
            },
          },
          confirmed_deceased: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$_id.status', 'confirmed'] }, { $eq: ['$_id.patientStatus', 'Deceased'] }] },
                '$count',
                0,
              ],
            },
          },
          suspected_recovered: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$_id.status', 'suspected'] }, { $eq: ['$_id.patientStatus', 'Recovered'] }] },
                '$count',
                0,
              ],
            },
          },
          suspected_ongoingTreatment: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$_id.status', 'suspected'] }, { $eq: ['$_id.patientStatus', 'Ongoing treatment'] }] },
                '$count',
                0,
              ],
            },
          },
          suspected_deceased: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$_id.status', 'suspected'] }, { $eq: ['$_id.patientStatus', 'Deceased'] }] },
                '$count',
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: caseTypeCollection,
          localField: '_id',
          foreignField: '_id',
          as: 'caseType',
        },
      },
      { $unwind: '$caseType' },
      {
        $project: {
          _id: 0,
          caseTypeId: '$caseType._id',
          name: '$caseType.name',
          total: 1,
          confirmed: {
            total: '$confirmed_total',
            recovered: '$confirmed_recovered',
            ongoingTreatment: '$confirmed_ongoingTreatment',
            deceased: '$confirmed_deceased',
          },
          suspected: {
            total: '$suspected_total',
            recovered: '$suspected_recovered',
            ongoingTreatment: '$suspected_ongoingTreatment',
            deceased: '$suspected_deceased',
          },
        },
      },
      { $sort: { name: 1 } },
    ];

    const results = await Case.aggregate(pipeline);
    return res.json(results);
  } catch (err) {
    console.error('getCaseTypeSummary error:', err);
    return res.status(500).json({ message: 'Failed to load case type summary' });
  }
};


module.exports = {
  createCase,
  updateCaseStatus,
  getCases,
  getAllCasesForOfficers,
  getOfficerPatients,
  getOfficerCases,
  editCaseDetails,
  archiveCase,
  getArchivedCases,
  unarchiveCase,
  getCaseTypeSummary,
};

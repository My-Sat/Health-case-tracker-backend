// Controllers/case_controller.js
const Case = require('../models/Case');
const User = require('../models/User');
const CaseType = require('../models/case_type');
const HealthFacility = require('../models/HealthFacility');
const mongoose = require('mongoose');
const Region = require('../models/Region');
const District = require('../models/District');
const Community = require('../models/Community');

const {
  findOrCreateRegion,
  findOrCreateDistrict,
  findOrCreateSubDistrict,
  findOrCreateCommunity,
} = require('../utilities/location');

function isObjectIdString(v) {
  return typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);
}

// Utility: resolve/create a Community ID based on (optional) location + name
async function resolveCommunityId({ communityName, location, fallbackFacility }) {
  // If no community name provided at all, use the facility's configured community
  if (!communityName || !communityName.trim()) {
    return fallbackFacility.community; // ObjectId
  }

  // If a location object is provided, use that path (region > district > [subDistrict?])
  if (location && location.region && location.district) {
    const regionDoc = await findOrCreateRegion(location.region.trim());
    const districtDoc = await findOrCreateDistrict(location.district.trim(), regionDoc._id);

    let subDistrictDoc = null;
    if (location.subDistrict && location.subDistrict.trim()) {
      subDistrictDoc = await findOrCreateSubDistrict(location.subDistrict.trim(), districtDoc._id);
    }

    const communityDoc = await findOrCreateCommunity(
      communityName.trim(),
      subDistrictDoc ? subDistrictDoc._id : districtDoc._id // same fallback pattern used elsewhere
    );
    return communityDoc._id;
  }

  // Otherwise: create/find the community under the officer's facility path
  const parentId = fallbackFacility.subDistrict ?? fallbackFacility.district;
  const communityDoc = await findOrCreateCommunity(communityName.trim(), parentId);
  return communityDoc._id;
}

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

    // Resolve community id per rules
    let communityId;
    if (useFacilityCommunity === true) {
      // explicit flag from client: use facility community (ObjectId)
      communityId = facility.community;
    } else {
      // fallback behavior based on provided community name or blank -> resolveCommunityId will use facility.community
      communityId = await resolveCommunityId({
        communityName: community, // may be null/empty if using facility community
        location,                 // optional: { region, district, subDistrict? }
        fallbackFacility: facility,
      });
    }

    // Create case
    const newCase = await Case.create({
      officer: req.user._id,
      caseType: type._id,
      healthFacility: facility._id,
      status: 'suspected',
      community: communityId,
      patient,
    });

    const populated = await Case.findById(newCase._id)
      .populate('officer', 'fullName')
      .populate('healthFacility')
      .populate('caseType')
      .populate('community');

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
      .populate('healthFacility')
      .populate('caseType')
      .populate('community');
    res.json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update case status' });
  }
};

const getCases = async (req, res) => {
  try {
    // Admins: see all non-archived cases
    // Officers: only their own non-archived cases
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
      .sort({ timeline: -1 })
      .lean();

    // Make sure we always return readable strings under healthFacility.location
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
      } else {
        const communityId = await resolveCommunityId({
          communityName: typeof community === 'string' ? community : '',
          location,
          fallbackFacility: facility,
        });
        existing.community = communityId;
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
      .populate('healthFacility')
      .populate('caseType')
      .populate('community');
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
      .populate('healthFacility')
      .populate('caseType')
      .populate('community');
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
    const { caseType, region, district, community } = req.query;

    // base match: only active (non-archived) and statuses we want
    const match = {
      archived: false,
      status: { $in: ['suspected', 'confirmed'] },
    };

    // handle caseType (id or name)
    if (caseType && caseType !== 'all') {
      if (isObjectIdString(caseType)) {
        match.caseType = mongoose.Types.ObjectId(caseType);
      } else {
        const ct = await CaseType.findOne({ name: caseType });
        if (!ct) {
          return res.json([]); // nothing matches
        }
        match.caseType = ct._id;
      }
    }

    // Resolve facility-level filters (region/district). We'll collect facility ids matching them.
    let facilityIds = null; // null => no facility constraint
    if (region || district) {
      const facilityFilter = {};

      // region
      if (region) {
        if (isObjectIdString(region)) {
          facilityFilter.region = mongoose.Types.ObjectId(region);
        } else {
          const regionDoc = await Region.findOne({ name: region });
          if (!regionDoc) return res.json([]); // region not found
          facilityFilter.region = regionDoc._id;
        }
      }

      // district
      if (district) {
        if (!facilityFilter.region && !isObjectIdString(district)) {
          // We need region context to reliably resolve district by name; try by id fallback
          // attempt to find district by name without region only if id passed or unique
          // but best effort: try direct lookup
          const maybeDistrict = await District.findOne({ name: district });
          if (!maybeDistrict) return res.json([]);
          facilityFilter.district = maybeDistrict._id;
        } else if (isObjectIdString(district)) {
          facilityFilter.district = mongoose.Types.ObjectId(district);
        } else {
          // district as name + region context present
          const districtDoc = await District.findOne({ name: district, region: facilityFilter.region });
          if (!districtDoc) return res.json([]);
          facilityFilter.district = districtDoc._id;
        }
      }

      // Query HealthFacility to get matching ids
      facilityIds = await HealthFacility.find(facilityFilter).distinct('_id');
      if (!facilityIds || facilityIds.length === 0) {
        // no facilities match -> no cases
        return res.json([]);
      }
    }

    // Resolve community if provided (id or name)
    let communityId = null;
    if (community) {
      if (isObjectIdString(community)) {
        communityId = mongoose.Types.ObjectId(community);
      } else {
        // attempt to find by name (best-effort)
        const communityDoc = await Community.findOne({ name: community });
        if (!communityDoc) {
          return res.json([]);
        }
        communityId = communityDoc._id;
      }
    }

    // Apply facility/community constraints to match:
    if (communityId) {
      // If facility filter present, require both community and facility (AND)
      if (facilityIds && facilityIds.length > 0) {
        match.$and = [
          { community: communityId },
          { healthFacility: { $in: facilityIds.map((id) => mongoose.Types.ObjectId(id)) } },
        ];
      } else {
        match.community = communityId;
      }
    } else if (facilityIds && facilityIds.length > 0) {
      match.healthFacility = { $in: facilityIds.map((id) => mongoose.Types.ObjectId(id)) };
    }

    // Aggregation pipeline (same shape as previous summary, but starting with our dynamic match)
    const caseTypeCollection = CaseType.collection.name; // exact collection name
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
                {
                  $and: [
                    { $eq: ['$_id.status', 'confirmed'] },
                    { $eq: ['$_id.patientStatus', 'Recovered'] },
                  ],
                },
                '$count',
                0,
              ],
            },
          },
          confirmed_ongoingTreatment: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$_id.status', 'confirmed'] },
                    { $eq: ['$_id.patientStatus', 'Ongoing treatment'] },
                  ],
                },
                '$count',
                0,
              ],
            },
          },
          confirmed_deceased: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$_id.status', 'confirmed'] },
                    { $eq: ['$_id.patientStatus', 'Deceased'] },
                  ],
                },
                '$count',
                0,
              ],
            },
          },
          suspected_recovered: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$_id.status', 'suspected'] },
                    { $eq: ['$_id.patientStatus', 'Recovered'] },
                  ],
                },
                '$count',
                0,
              ],
            },
          },
          suspected_ongoingTreatment: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$_id.status', 'suspected'] },
                    { $eq: ['$_id.patientStatus', 'Ongoing treatment'] },
                  ],
                },
                '$count',
                0,
              ],
            },
          },
          suspected_deceased: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$_id.status', 'suspected'] },
                    { $eq: ['$_id.patientStatus', 'Deceased'] },
                  ],
                },
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

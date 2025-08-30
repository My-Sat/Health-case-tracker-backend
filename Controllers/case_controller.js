// Controllers/case_controller.js
const Case = require('../models/Case');
const User = require('../models/User');
const CaseType = require('../models/case_type');
const HealthFacility = require('../models/HealthFacility');
const mongoose = require('mongoose');

const {
  findOrCreateRegion,
  findOrCreateDistrict,
  findOrCreateSubDistrict,
  findOrCreateCommunity,
} = require('../utilities/location');

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
    const { q, region, district, subDistrict, community, facility } = req.query;

    const pipeline = [];

    // only non-archived and only suspected/confirmed (same as before)
    pipeline.push({
      $match: {
        archived: false,
        status: { $in: ['suspected', 'confirmed'] },
      },
    });

    // join healthFacility & its location pieces so we can filter by names or ids
    pipeline.push({
      $lookup: {
        from: 'healthfacilities',
        localField: 'healthFacility',
        foreignField: '_id',
        as: 'hf',
      },
    });
    pipeline.push({ $unwind: { path: '$hf', preserveNullAndEmptyArrays: true } });

    pipeline.push({
      $lookup: {
        from: 'regions',
        localField: 'hf.region',
        foreignField: '_id',
        as: 'region',
      },
    });
    pipeline.push({ $unwind: { path: '$region', preserveNullAndEmptyArrays: true } });

    pipeline.push({
      $lookup: {
        from: 'districts',
        localField: 'hf.district',
        foreignField: '_id',
        as: 'district',
      },
    });
    pipeline.push({ $unwind: { path: '$district', preserveNullAndEmptyArrays: true } });

    pipeline.push({
      $lookup: {
        from: 'subdistricts',
        localField: 'hf.subDistrict',
        foreignField: '_id',
        as: 'subDistrict',
      },
    });
    pipeline.push({ $unwind: { path: '$subDistrict', preserveNullAndEmptyArrays: true } });

    // community attached to the health facility
    pipeline.push({
      $lookup: {
        from: 'communities',
        localField: 'hf.community',
        foreignField: '_id',
        as: 'hfCommunity',
      },
    });
    pipeline.push({ $unwind: { path: '$hfCommunity', preserveNullAndEmptyArrays: true } });

    // community referenced on the case itself (cases may have their own community)
    pipeline.push({
      $lookup: {
        from: 'communities',
        localField: 'community',
        foreignField: '_id',
        as: 'caseCommunity',
      },
    });
    pipeline.push({ $unwind: { path: '$caseCommunity', preserveNullAndEmptyArrays: true } });

    // bring in casetype (we'll allow q search against name)
    pipeline.push({
      $lookup: {
        from: 'casetypes',
        localField: 'caseType',
        foreignField: '_id',
        as: 'caseType',
      },
    });
    pipeline.push({ $unwind: { path: '$caseType', preserveNullAndEmptyArrays: true } });

    // Build filter match object based on given query parameters.
    const match = {};

    if (facility) {
      if (mongoose.Types.ObjectId.isValid(facility)) {
        match['hf._id'] = mongoose.Types.ObjectId(facility);
      } else {
        match['hf.name'] = { $regex: facility, $options: 'i' };
      }
    }

    if (region) {
      if (mongoose.Types.ObjectId.isValid(region)) {
        match['region._id'] = mongoose.Types.ObjectId(region);
      } else {
        match['region.name'] = { $regex: region, $options: 'i' };
      }
    }

    if (district) {
      if (mongoose.Types.ObjectId.isValid(district)) {
        match['district._id'] = mongoose.Types.ObjectId(district);
      } else {
        match['district.name'] = { $regex: district, $options: 'i' };
      }
    }

    if (subDistrict) {
      if (mongoose.Types.ObjectId.isValid(subDistrict)) {
        match['subDistrict._id'] = mongoose.Types.ObjectId(subDistrict);
      } else {
        match['subDistrict.name'] = { $regex: subDistrict, $options: 'i' };
      }
    }

    if (community) {
      // community may be either the case.community or the hf.community — accept either
      const communityMatch = [];
      if (mongoose.Types.ObjectId.isValid(community)) {
        communityMatch.push({ 'caseCommunity._id': mongoose.Types.ObjectId(community) });
        communityMatch.push({ 'hfCommunity._id': mongoose.Types.ObjectId(community) });
      } else {
        communityMatch.push({ 'caseCommunity.name': { $regex: community, $options: 'i' } });
        communityMatch.push({ 'hfCommunity.name': { $regex: community, $options: 'i' } });
      }
      // if there are already other matches, combine using $and; otherwise just add $or
      match['$or'] = communityMatch;
    }

    if (q) {
      match['caseType.name'] = { $regex: q, $options: 'i' };
    }

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    // group by casetype + status + patient.status to count combinations
    pipeline.push({
      $group: {
        _id: {
          caseType: '$caseType._id',
          status: '$status',
          patientStatus: '$patient.status',
        },
        count: { $sum: 1 },
      },
    });

    // roll up per caseType into totals and breakdowns
    pipeline.push({
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

        // capture casetype name and id for projection
        caseTypeName: { $first: '$caseType.name' },
        caseTypeObjId: { $first: '$caseType._id' },
      },
    });

    pipeline.push({
      $project: {
        _id: 0,
        caseTypeId: '$caseTypeObjId',
        name: '$caseTypeName',
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
    });

    pipeline.push({ $sort: { name: 1 } });

    const results = await Case.aggregate(pipeline);
    return res.json(results);
  } catch (err) {
    console.error('getCaseTypeSummary error', err);
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

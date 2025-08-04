const Case = require('../models/Case');
const User = require('../models/User');
const CaseType = require('../models/case_type');

const createCase = async (req, res) => {
  const { caseType, patient, community } = req.body;

  const officer = await User.findById(req.user._id).populate('healthFacility');
  if (!officer) {
    return res.status(404).json({ message: 'Officer not found' });
  }

  const type = await CaseType.findById(caseType);
  if (!type) {
    return res.status(400).json({ message: 'Invalid case type ID' });
  }

  const selectedCommunity = community?.trim() || officer.healthFacility.location.community;

  const newCase = await Case.create({
    officer: req.user._id,
    caseType: type._id,
    healthFacility: officer.healthFacility._id,
    status: 'suspected',
    community: selectedCommunity,
    patient,
  });

  const populatedCase = await Case.findById(newCase._id)
    .populate('officer', 'fullName')
    .populate('healthFacility')
    .populate('caseType');

  res.status(201).json(populatedCase);
};

const updateCaseStatus = async (req, res) => {
  const caseId = req.params.id;
  const { status, patientStatus } = req.body;

  if (!status && !patientStatus) {
    return res.status(400).json({ message: 'Missing status or patientStatus' });
  }

  const existingCase = await Case.findById(caseId);
  if (!existingCase) return res.status(404).json({ message: 'Case not found' });

  if (!existingCase.officer.equals(req.user._id)) {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  if (status && ['confirmed', 'not a case'].includes(status)) {
    existingCase.status = status;
  }

  if (patientStatus && ['Recovered', 'Ongoing treatment', 'Deceased'].includes(patientStatus)) {
    existingCase.patient.status = patientStatus;
  }

  await existingCase.save();

  const populatedCase = await Case.findById(existingCase._id)
    .populate('officer', 'fullName')
    .populate('healthFacility')
    .populate('caseType');

  res.json(populatedCase);
};

const getCases = async (req, res) => {
const filter = req.user.role === 'admin'
  ? { archived: false }
  : { status: { $in: ['suspected', 'confirmed', 'not a case'] }, archived: false };

  const cases = await Case.find(filter)
    .populate('officer', 'fullName')
    .populate('healthFacility')
    .populate('caseType');

  res.json(cases);
};

const getOfficerPatients = async (req, res) => {
const cases = await Case.find({ officer: req.user._id, archived: false }).select('patient');
  res.json(cases.map(c => c.patient));
};

const getOfficerCases = async (req, res) => {
const cases = await Case.find({ officer: req.user._id, archived: false })
    .populate('healthFacility')
    .populate('officer', 'fullName')
    .populate('caseType');

  res.json(cases);
};

const deleteCase = async (req, res) => {
  const caseId = req.params.id;

  const existingCase = await Case.findById(caseId);
  if (!existingCase) return res.status(404).json({ message: 'Case not found' });

  if (!existingCase.officer.equals(req.user._id) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  await Case.findByIdAndDelete(caseId);
  res.json({ message: 'Case deleted successfully' });
};

const editCaseDetails = async (req, res) => {
  const caseId = req.params.id;
  const { caseType, community, patient, status } = req.body;

  const existing = await Case.findById(caseId);
  if (!existing) return res.status(404).json({ message: 'Case not found' });

  if (!existing.officer.equals(req.user._id) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  // ✅ Update case type
  if (caseType) {
    const type = await CaseType.findById(caseType);
    if (!type) return res.status(400).json({ message: 'Invalid case type' });
    existing.caseType = type._id;
  }

  // ✅ Update community
  if (community !== undefined) {
    existing.community = typeof community === 'string' ? community.trim() : existing.community;
  }

  // ✅ Update case status
  if (status && ['suspected', 'confirmed', 'not a case'].includes(status)) {
    existing.status = status;
  }

  // ✅ Update patient fields
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
    .populate('caseType');

  res.json(populated);
};

const archiveCase = async (req, res) => {
  const caseId = req.params.id;

  const existingCase = await Case.findById(caseId);
  if (!existingCase) return res.status(404).json({ message: 'Case not found' });

  if (!existingCase.officer.equals(req.user._id) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  existingCase.archived = true;
  await existingCase.save();

  res.json({ message: 'Case archived successfully' });
};

const getArchivedCases = async (req, res) => {
  const archived = await Case.find({ archived: true })
    .populate('officer', 'fullName')
    .populate('healthFacility')
    .populate('caseType');

  res.json(archived);
};

const unarchiveCase = async (req, res) => {
  const caseId = req.params.id;

  const existingCase = await Case.findById(caseId);
  if (!existingCase) return res.status(404).json({ message: 'Case not found' });

  if (!existingCase.officer.equals(req.user._id) && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  existingCase.archived = false;
  await existingCase.save();

  res.json({ message: 'Case unarchived successfully' });
};





module.exports = {
  createCase,
  updateCaseStatus,
  getCases,
  getOfficerPatients,
  getOfficerCases,
  deleteCase, 
  editCaseDetails,
  archiveCase,
  getArchivedCases,
  unarchiveCase
};


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
    ? {}
    : { status: { $in: ['suspected', 'confirmed', 'not a case'] } };

  const cases = await Case.find(filter)
    .populate('officer', 'fullName')
    .populate('healthFacility')
    .populate('caseType');

  res.json(cases);
};

const getOfficerPatients = async (req, res) => {
  const cases = await Case.find({ officer: req.user._id }).select('patient');
  res.json(cases.map(c => c.patient));
};

const getOfficerCases = async (req, res) => {
  const cases = await Case.find({ officer: req.user._id })
    .populate('healthFacility')
    .populate('officer', 'fullName')
    .populate('caseType');

  res.json(cases);
};

module.exports = {
  createCase,
  updateCaseStatus,
  getCases,
  getOfficerPatients,
  getOfficerCases,
};


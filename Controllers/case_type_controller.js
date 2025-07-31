const CaseType = require('../models/case_type');
const Case = require('../models/Case');

const createCaseType = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Requires admin role' });
  }
  const { name } = req.body;
  const ct = await CaseType.create({ name });
  res.status(201).json(ct);
};

const getCaseTypes = async (_, res) => {
  const types = await CaseType.find();
  res.json(types);
};

const deleteCaseType = async (req, res) => {
  const { id } = req.params;
  const ct = await CaseType.findById(id);
  if (!ct) return res.status(404).json({ message: 'Case type not found' });

  await Case.deleteMany({ caseType: ct._id });
  await ct.deleteOne();

  res.json({ message: 'Case type and associated cases deleted' });
};

const updateCaseType = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  const type = await CaseType.findById(id);
  if (!type) return res.status(404).json({ message: 'Case type not found' });

  type.name = name;
  await type.save();

  res.json(type);
};

const archiveCaseType = async (req, res) => {
  const { id } = req.params;
  const type = await CaseType.findById(id);
  if (!type) return res.status(404).json({ message: 'Case type not found' });

  type.archived = true;
  await type.save();

  // Cascade archive all associated cases
  await Case.updateMany({ caseType: type._id }, { $set: { archived: true } });

  res.json({ message: 'CaseType and associated cases archived' });
};

const unarchiveCaseType = async (req, res) => {
  const { id } = req.params;
  const type = await CaseType.findById(id);
  if (!type) return res.status(404).json({ message: 'Case type not found' });

  type.archived = false;
  await type.save();

  // Unarchive all associated cases
  await Case.updateMany(
    { caseType: type._id },
    { $set: { archived: false } }
  );

  res.json({ message: 'Case type and cases unarchived' });
};

const getArchivedCaseTypes = async (req, res) => {
  const types = await CaseType.find({ archived: true });
  res.json(types);
};


module.exports = { createCaseType, 
  getCaseTypes, 
  deleteCaseType, 
  updateCaseType, 
  archiveCaseType, 
  unarchiveCaseType, 
  getArchivedCaseTypes };

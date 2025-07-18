const CaseType = require('../models/case_type');

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

module.exports = { createCaseType, getCaseTypes };

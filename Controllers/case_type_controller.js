const CaseType = require('../models/caseType');

const create_case_type = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admin can create case types' });
  }
  const { name } = req.body;
  const exists = await CaseType.findOne({ name });
  if (exists) return res.status(400).json({ message: 'Case type exists' });
  const ct = await CaseType.create({ name });
  res.status(201).json(ct);
};

const list_case_types = async (req, res) => {
  const types = await CaseType.find().sort({ name: 1 });
  res.json(types);
};

module.exports = { create_case_type, list_case_types };

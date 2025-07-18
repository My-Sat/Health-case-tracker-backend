const express = require('express');
const router = express.Router();
const {
  createCase,
  updateCaseStatus,
  getCases,
  getOfficerPatients,
  getOfficerCases
} = require('../Controllers/case_controller');

const { protect } = require('../middlewares/authMiddleware');

router.post('/', protect, createCase);
router.put('/:id/status', protect, updateCaseStatus);
router.get('/', protect, getCases);
router.get('/my-patients', protect, getOfficerPatients);
router.get('/my-cases', protect, getOfficerCases);


module.exports = router;
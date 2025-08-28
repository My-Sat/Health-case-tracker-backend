const express = require('express');
const router = express.Router();
const {
  createCase,
  updateCaseStatus,
  getCases,
  getAllCasesForOfficers,
  getOfficerPatients,
  getOfficerCases,
  editCaseDetails, 
  archiveCase,
  getArchivedCases,
  unarchiveCase
} = require('../Controllers/case_controller');

const { protect } = require('../middlewares/auth_middleware');

router.post('/', protect, createCase);
router.put('/:id/status', protect, updateCaseStatus);
router.get('/', protect, getCases);
router.get('/all-officers', protect, getAllCasesForOfficers);
router.get('/my-patients', protect, getOfficerPatients);
router.get('/my-cases', protect, getOfficerCases);
router.put('/:id/edit', protect, editCaseDetails);
router.patch('/:id/archive', protect, archiveCase);
router.get('/archived', protect, getArchivedCases);
router.patch('/:id/unarchive', protect, unarchiveCase);







module.exports = router;
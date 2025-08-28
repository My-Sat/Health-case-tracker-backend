const express = require('express');
const router = express.Router();

const {
  createFacility,
  getAllFacilities,
  getFacilityById,
  getRegions,
  getDistricts,
  getSubDistricts,
  getFacilitiesUnder,
  getCommunities,
  updateFacility,
  archiveFacility,
  getArchivedFacilities,
  patchFacility
} = require('../Controllers/facilityController');

const { protect, adminOnly } = require('../middlewares/auth_middleware');

router.post('/', protect, adminOnly, createFacility);
router.get('/', getAllFacilities);

// NEW: fetch fully populated facility by id (protected)
router.get('/by-id/:id', protect, getFacilityById);

router.get('/regions', getRegions);
router.get('/districts', getDistricts);
router.get('/subDistricts', getSubDistricts);
router.get('/under', getFacilitiesUnder);
router.get('/communities', getCommunities);

router.put('/:id', protect, adminOnly, updateFacility);
router.patch('/:id', protect, adminOnly, patchFacility);
router.patch('/:id/archive', protect, adminOnly, archiveFacility);
router.get('/archived', protect, adminOnly, getArchivedFacilities);

module.exports = router;

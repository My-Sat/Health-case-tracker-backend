const express = require('express');
const router = express.Router();
const {
  createFacility,
  getAllFacilities,
  getRegions,
  getDistricts,
  getSubDistricts,
  getFacilitiesUnder,
  getCommunities,
  deleteFacility,
  updateFacility
} = require('../Controllers/facilityController');

const { protect, adminOnly } = require('../middlewares/auth_middleware');

router.post('/', protect, adminOnly, createFacility);
router.get('/', getAllFacilities);

router.get('/regions', getRegions);
router.get('/districts', getDistricts);
router.get('/subDistricts', getSubDistricts);
router.get('/under', getFacilitiesUnder);
router.get('/communities', getCommunities);
router.put('/:id', protect, adminOnly, updateFacility);
router.delete('/:id', protect, adminOnly, deleteFacility);




module.exports = router;
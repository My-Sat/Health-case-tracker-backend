const express = require('express');
const router = express.Router();
const {
  createFacility,
  getAllFacilities,
  getRegions,
  getDistricts,
  getSubDistricts,
  getFacilitiesUnder
} = require('../Controllers/facilityController');

const { protect, adminOnly } = require('../middlewares/auth_middleware');

router.post('/', protect, adminOnly, createFacility);
router.get('/', getAllFacilities);

router.get('/regions', getRegions);
router.get('/districts', getDistricts);
router.get('/subDistricts', getSubDistricts);
router.get('/under', getFacilitiesUnder);

module.exports = router;
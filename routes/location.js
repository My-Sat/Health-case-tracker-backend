const express = require('express');
const router = express.Router();

const {
  validateRegion,
    validateDistrict,
    validateSubdistrict,
    validateCommunity
} = require('../Controllers/location');
const { protect } = require('../middlewares/auth_middleware');

router.get('/validate/region', protect, validateRegion);
router.get('/validate/district', protect, validateDistrict);
router.get('/validate/subdistrict', protect, validateSubdistrict);
router.get('/validate/community', protect, validateCommunity);

module.exports = router;
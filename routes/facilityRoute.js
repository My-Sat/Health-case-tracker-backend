const express = require('express');
const router = express.Router();
const { createFacility, getAllFacilities } = require('../Controllers/facilityController');
const { protect, adminOnly } = require('../middleWares/authMiddleware');

router.post('/', protect, adminOnly, createFacility);
router.get('/', getAllFacilities);

module.exports = router;

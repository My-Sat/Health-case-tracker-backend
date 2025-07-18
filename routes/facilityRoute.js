const express = require('express');
const router = express.Router();
const {
  createFacility,
  getAllFacilities,
  getRegions,
  getDistricts,
  getSubDistricts,
  getFacilitiesUnder,
  registerUser,
   loginUser, 
   forgotPassword, 
   resetPassword, 
   verifyResetCode
} = require('../controllers/facilityController');

const { protect, adminOnly } = require('../middleWares/authMiddleware');

router.post('/facilities', protect, adminOnly, createFacility);
router.get('/facilities', getAllFacilities);

router.get('/facilities/regions', getRegions);
router.get('/facilities/districts', getDistricts);
router.get('/facilities/subDistricts', getSubDistricts);
router.get('/facilities/under', getFacilitiesUnder);

//FACILITY ROUTES TEMPORARY PLACED HERE DUE TO ONRENDER.COM DEPLOYMENT ISSUES
router.post('/users/register', registerUser);
router.post('/users/login', loginUser);
router.post('/users/forgot-password', forgotPassword);
router.post('/users/reset-password', resetPassword);
router.post('/users/verify-reset-code', verifyResetCode);


module.exports = router;

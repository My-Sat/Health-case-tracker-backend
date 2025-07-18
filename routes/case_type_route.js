const express = require('express');
const { createCaseType, getCaseTypes } = require('../Controllers/case_type_controller');
const { protect } = require('../middlewares/auth_middleware');

const router = express.Router();
router.post('/', protect, createCaseType);
router.get('/', protect, getCaseTypes);

module.exports = router;

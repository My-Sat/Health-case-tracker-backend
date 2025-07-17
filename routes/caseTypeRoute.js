const express = require('express');
const router = express.Router();
const { createCaseType, listCaseTypes } = require('../Controllers/caseTypeController');
const adminOnly = require('../middleWares/authMiddleware');

router.post('/', adminOnly, createCaseType);
router.get('/', adminOnly, listCaseTypes);

module.exports = router;

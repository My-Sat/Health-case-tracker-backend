const express = require('express');
const router = express.Router();
const { create_case_type, list_case_types } = require('../Controllers/case_type_controller');
const { protect, adminOnly } = require('../middleWares/authMiddleware');

// Protected Admin-Only Routes
router.post('/', protect, adminOnly, create_case_type);
router.get('/', protect, adminOnly, list_case_types);

module.exports = router;
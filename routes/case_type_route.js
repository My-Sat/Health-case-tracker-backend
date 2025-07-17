const express = require('express');
const router = express.Router();
const { create_case_type, list_case_types } = require('../controllers/case_type_controller');
const adminOnly = require('../middleWares/authMiddleware');

router.post('/', adminOnly, create_case_type);
router.get('/', adminOnly, list_case_types);

module.exports = router;

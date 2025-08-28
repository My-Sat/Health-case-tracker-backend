const express = require('express');

const { createCaseType, 
    getCaseTypes, 
    updateCaseType, 
    archiveCaseType, 
    unarchiveCaseType,
    getArchivedCaseTypes
 } = require('../Controllers/case_type_controller');

const { protect } = require('../middlewares/auth_middleware');

const router = express.Router();
router.post('/', protect, createCaseType);
router.get('/', protect, getCaseTypes);
router.get('/archived', protect, getArchivedCaseTypes);
router.patch('/:id/archive', protect, archiveCaseType);
router.patch('/:id/unarchive', protect, unarchiveCaseType);
router.put('/:id', protect, updateCaseType);


module.exports = router;

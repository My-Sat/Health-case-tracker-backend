const express = require('express');
const router = express.Router();
const { registerUser, loginUser, forgotPassword, resetPassword, verifyResetCode } = require('../controllers/userController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-reset-code', verifyResetCode);




module.exports = router;

const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');

// Send verification code
router.post('/send-code', (req, res) => {
    authController.sendVerificationCode(req, res);
});

// Verify code
router.post('/verify-code', (req, res) => {
    authController.verifyCode(req, res);
});

// Check authentication status
router.get('/check', (req, res) => {
    authController.checkAuth(req, res);
});

// Logout
router.post('/logout', (req, res) => {
    authController.logout(req, res);
});

module.exports = router;
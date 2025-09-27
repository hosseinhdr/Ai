const express = require('express');
const router = express.Router();
const wheelController = require('../controllers/WheelController');
const authMiddleware = require('../middleware/authMiddleware');

// Spin the wheel (requires authentication)
router.post('/spin', authMiddleware.requireAuth, (req, res) => {
    wheelController.spin(req, res);
});

// Get user status
router.get('/status', (req, res) => {
    wheelController.getUserStatus(req, res);
});

// Get prizes list
router.get('/prizes', (req, res) => {
    wheelController.getPrizes(req, res);
});

module.exports = router;
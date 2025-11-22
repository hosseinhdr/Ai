const express = require('express');
const router = express.Router();
const wheelController = require('../controllers/WheelController');
const authMiddleware = require('../middleware/authMiddleware');

// Spin the wheel - حذف requireAuth چون خود کنترلر چک میکنه
router.post('/spin', (req, res) => {
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
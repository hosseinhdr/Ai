const express = require('express');
const router = express.Router();
const adminController = require('../controllers/AdminController');
const adminMiddleware = require('../middleware/adminMiddleware');

// Redirect root to login or dashboard
router.get('/', (req, res) => {
    if (req.session.isAdmin) {
        res.redirect('/admin/dashboard');
    } else {
        res.redirect('/admin/login');
    }
});

// Admin login page
router.get('/login', (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    res.sendFile('admin-login.html', { root: 'public/admin' });
});

// Admin login
router.post('/login', (req, res) => {
    adminController.login(req, res);
});

// Admin dashboard (protected)
router.get('/dashboard', adminMiddleware.requireAdminAuth, (req, res) => {
    res.sendFile('admin-dashboard.html', { root: 'public/admin' });
});

// Admin API endpoints (protected)
router.get('/api/users', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.getUsers(req, res);
});

router.get('/api/stats', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.getStats(req, res);
});

router.get('/api/daily-stats', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.getDailyStats(req, res);
});

router.get('/api/prize-stats', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.getPrizeStats(req, res);
});

router.get('/api/prizes', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.getAllPrizes(req, res);
});

router.post('/api/prizes', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.createPrize(req, res);
});

router.put('/api/prizes/:id', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.updatePrize(req, res);
});

router.delete('/api/prizes/:id', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.deletePrize(req, res);
});

router.post('/api/normalize-probabilities', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.normalizeProbabilities(req, res);
});

router.post('/api/export', adminMiddleware.requireAdminAuth, (req, res) => {
    adminController.exportData(req, res);
});

// Admin logout
router.post('/logout', (req, res) => {
    adminController.logout(req, res);
});

module.exports = router;
class AdminMiddleware {
    requireAdminAuth(req, res, next) {
        if (!req.session.isAdmin) {
            // If it's an API request, return JSON error
            if (req.path.includes('/api/')) {
                return res.status(401).json({
                    success: false,
                    message: 'دسترسی غیرمجاز - لطفا وارد شوید',
                    requireAuth: true
                });
            }
            // Otherwise redirect to login
            return res.redirect('/admin/login');
        }
        next();
    }

    checkAdminSession(req, res, next) {
        if (req.session.isAdmin) {
            req.admin = {
                username: req.session.adminUsername
            };
        }
        next();
    }
}

module.exports = new AdminMiddleware();
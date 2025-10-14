class AuthMiddleware {
    requireAuth(req, res, next) {
        if (!req.session.isAuthenticated || !req.session.userId) {
            return res.status(401).json({
                success: false,
                message: 'لطفا ابتدا وارد شوید',
                requireAuth: true
            });
        }
        next();
    }

    checkSession(req, res, next) {
        // Add user info to request if authenticated
        if (req.session.isAuthenticated && req.session.userId) {
            req.user = {
                id: req.session.userId,
                phone: req.session.phone
            };
        }
        next();
    }
}

module.exports = new AuthMiddleware();
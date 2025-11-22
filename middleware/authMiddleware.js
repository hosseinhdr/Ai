class AuthMiddleware {
    requireAuth(req, res, next) {
        // چک کردن احراز هویت برای کاربران عادی و تست
        if (!req.session.isAuthenticated) {
            return res.status(401).json({
                success: false,
                message: 'لطفا ابتدا وارد شوید',
                requireAuth: true
            });
        }

        // برای کاربران تست، userId ضروری نیست
        if (req.session.isTestUser) {
            req.user = {
                id: req.session.testUserId || 'test_user',
                phone: req.session.phone,
                isTestUser: true
            };
            return next();
        }

        // برای کاربران عادی، باید userId داشته باشند
        if (!req.session.userId) {
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
        if (req.session.isAuthenticated) {
            if (req.session.isTestUser) {
                // کاربر تست
                req.user = {
                    id: req.session.testUserId || 'test_user',
                    phone: req.session.phone,
                    isTestUser: true
                };
            } else if (req.session.userId) {
                // کاربر عادی
                req.user = {
                    id: req.session.userId,
                    phone: req.session.phone,
                    isTestUser: false
                };
            }
        }
        next();
    }
}

module.exports = new AuthMiddleware();
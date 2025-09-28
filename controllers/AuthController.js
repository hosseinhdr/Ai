const User = require('../models/User');
const SMSManager = require('../services/SMSManager');
const Prize = require('../models/Prize');

class AuthController {
    constructor() {
        // استفاده از SMS Manager با قابلیت Fallback
        this.smsManager = new SMSManager();
    }

    async sendVerificationCode(req, res) {
        try {
            const { phone, utmParams } = req.body;

            if (!phone || !this.validatePhone(phone)) {
                return res.status(400).json({
                    success: false,
                    message: 'شماره تماس معتبر نیست'
                });
            }

            // Check if user exists
            let user = await User.findByPhone(phone);

            // Generate verification code
            const verificationCode = User.generateVerificationCode();

            if (user) {
                // Update existing user
                user.verificationCode = verificationCode;

                // فقط اگر UTM واقعا وجود داشت، آپدیت کن
                if (utmParams && Object.keys(utmParams).some(key => utmParams[key])) {
                    await user.updateUTMParams(utmParams);
                }

                await user.save();
            } else {
                // Create new user
                const userData = {
                    phone: phone,
                    verificationCode: verificationCode,
                    isVerified: false
                };

                // فقط اگر UTM واقعا وجود داشت، اضافه کن
                if (utmParams) {
                    if (utmParams.utm_source) userData.utm_source = utmParams.utm_source;
                    if (utmParams.utm_medium) userData.utm_medium = utmParams.utm_medium;
                    if (utmParams.utm_campaign) userData.utm_campaign = utmParams.utm_campaign;
                }

                user = new User(userData);
                await user.save();
            }

            // ارسال پیامک با استفاده از SMS Manager
            const smsResult = await this.smsManager.sendVerificationCode(phone, verificationCode);

            // بررسی نتیجه ارسال
            if (!smsResult.success) {
                console.error('SMS sending failed:', smsResult);

                // در محیط production، اگر پیامک ارسال نشد
                if (process.env.NODE_ENV === 'production' && !smsResult.devMode) {
                    // پاک کردن کد از دیتابیس برای امنیت
                    user.verificationCode = null;
                    await user.save();

                    return res.status(503).json({
                        success: false,
                        message: smsResult.message || 'متاسفانه مشکلی در ارسال پیامک وجود دارد. لطفا چند دقیقه دیگر تلاش کنید.',
                        retryAfter: 60 // ثانیه
                    });
                }

                // در محیط development ادامه می‌دیم
                console.log(`⚠️ SMS failed but continuing in dev mode. Code: ${verificationCode}`);
            }

            // Store user ID in session
            req.session.tempUserId = user.id;
            req.session.verificationCode = verificationCode;
            req.session.verificationPhone = phone;

            // Log SMS status
            if (smsResult.success) {
                console.log(`✅ SMS sent successfully via ${smsResult.service} to ${phone}`);
            }

            // Response
            const response = {
                success: true,
                message: 'کد تایید ارسال شد',
                service: smsResult.service // نام سرویسی که استفاده شد
            };

            // در حالت توسعه، اطلاعات بیشتر
            if (process.env.NODE_ENV === 'development') {
                response.devCode = verificationCode;
                response.smsStatus = {
                    success: smsResult.success,
                    service: smsResult.service,
                    attemptedServices: smsResult.attemptedServices
                };

                // اگر همه سرویس‌ها fail شدن
                if (!smsResult.success && smsResult.errors) {
                    response.smsErrors = smsResult.errors;
                }
            }

            res.json(response);

        } catch (error) {
            console.error('Error in sendVerificationCode:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در ارسال کد'
            });
        }
    }

    async verifyCode(req, res) {
        try {
            const { phone, code } = req.body;

            if (!phone || !code) {
                return res.status(400).json({
                    success: false,
                    message: 'اطلاعات ناقص است'
                });
            }

            // اول چک کنیم کد از سشن
            if (req.session.verificationCode &&
                req.session.verificationPhone === phone &&
                req.session.verificationCode === code) {

                // کد درست است، ادامه با احراز هویت
                const user = await User.findByPhone(phone);

                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'کاربر یافت نشد'
                    });
                }

                // Verify user
                await user.verify();

                // Clear verification data from session
                delete req.session.verificationCode;
                delete req.session.verificationPhone;
                delete req.session.tempUserId;

                // Set authenticated session
                req.session.userId = user.id;
                req.session.phone = user.phone;
                req.session.isAuthenticated = true;

                // Get full prize data if user has played (با UTM فقط اگر کاربر UTM داشته باشد)
                let prizeData = null;
                if (user.hasPlayed && user.prizeId) {
                    const prize = await Prize.getById(user.prizeId);
                    if (prize) {
                        // فقط اگر کاربر UTM داشت، اونها رو پاس بده
                        const utmParams = user.getUTMParams();
                        prizeData = prize.toWinnerFormat(utmParams);
                    }
                } else if (user.hasPlayed && user.prize) {
                    // Fallback for old data format
                    prizeData = {
                        name: user.prize,
                        isEmpty: user.prize === 'پوچ'
                    };
                }

                res.json({
                    success: true,
                    message: 'ورود با موفقیت انجام شد',
                    user: {
                        phone: user.phone,
                        hasPlayed: user.hasPlayed,
                        prize: prizeData
                    }
                });

            } else {
                // اگر در سشن نیست، از دیتابیس چک کن
                const user = await User.findByPhone(phone);

                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'کاربر یافت نشد'
                    });
                }

                if (user.verificationCode !== code) {
                    return res.status(401).json({
                        success: false,
                        message: 'کد تایید نادرست است'
                    });
                }

                // Verify user
                await user.verify();

                // Clear session verification data if exists
                delete req.session.verificationCode;
                delete req.session.verificationPhone;
                delete req.session.tempUserId;

                // Set session
                req.session.userId = user.id;
                req.session.phone = user.phone;
                req.session.isAuthenticated = true;

                // Get full prize data if user has played
                let prizeData = null;
                if (user.hasPlayed && user.prizeId) {
                    const prize = await Prize.getById(user.prizeId);
                    if (prize) {
                        // فقط اگر کاربر UTM داشت، اونها رو پاس بده
                        const utmParams = user.getUTMParams();
                        prizeData = prize.toWinnerFormat(utmParams);
                    }
                } else if (user.hasPlayed && user.prize) {
                    // Fallback for old data format
                    prizeData = {
                        name: user.prize,
                        isEmpty: user.prize === 'پوچ'
                    };
                }

                res.json({
                    success: true,
                    message: 'ورود با موفقیت انجام شد',
                    user: {
                        phone: user.phone,
                        hasPlayed: user.hasPlayed,
                        prize: prizeData
                    }
                });
            }

        } catch (error) {
            console.error('Error in verifyCode:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در تایید کد'
            });
        }
    }

    async checkAuth(req, res) {
        try {
            if (!req.session.isAuthenticated || !req.session.userId) {
                return res.json({
                    success: false,
                    authenticated: false
                });
            }

            const user = await User.findById(req.session.userId);

            if (!user) {
                req.session.destroy();
                return res.json({
                    success: false,
                    authenticated: false
                });
            }

            // Get full prize data if user has played
            let prizeData = null;
            if (user.hasPlayed && user.prizeId) {
                const prize = await Prize.getById(user.prizeId);
                if (prize) {
                    // فقط اگر کاربر UTM داشت، اونها رو پاس بده
                    const utmParams = user.getUTMParams();
                    prizeData = prize.toWinnerFormat(utmParams);
                }
            } else if (user.hasPlayed && user.prize) {
                // Fallback for old data format
                prizeData = {
                    name: user.prize,
                    isEmpty: user.prize === 'پوچ'
                };
            }

            res.json({
                success: true,
                authenticated: true,
                user: {
                    phone: user.phone,
                    hasPlayed: user.hasPlayed,
                    prize: prizeData
                }
            });

        } catch (error) {
            console.error('Error in checkAuth:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در بررسی احراز هویت'
            });
        }
    }

    async logout(req, res) {
        try {
            req.session.destroy((err) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: 'خطا در خروج'
                    });
                }
                res.json({
                    success: true,
                    message: 'خروج با موفقیت انجام شد'
                });
            });
        } catch (error) {
            console.error('Error in logout:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در خروج'
            });
        }
    }

    // Endpoint جدید برای بررسی وضعیت سرویس‌های پیامک
    async getSMSStatus(req, res) {
        try {
            const status = this.smsManager.getStatus();
            const testResults = await this.smsManager.testServices();

            res.json({
                success: true,
                status: status,
                test: testResults
            });
        } catch (error) {
            console.error('Error getting SMS status:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در بررسی وضعیت'
            });
        }
    }

    validatePhone(phone) {
        // Iranian phone number validation
        const phoneRegex = /^(\+98|0)?9\d{9}$/;
        return phoneRegex.test(phone);
    }
}

module.exports = new AuthController();
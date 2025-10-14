const User = require('../models/User');
const SMSManager = require('../services/SMSManager');
const Prize = require('../models/Prize');

class AuthController {
    constructor() {
        // استفاده از SMS Manager با قابلیت Fallback
        this.smsManager = new SMSManager();

        // لیست شماره‌های تست از ENV
        this.testPhoneNumbers = this.loadTestPhoneNumbers();
    }

    loadTestPhoneNumbers() {
        const testNumbers = process.env.TEST_PHONE_NUMBERS;
        if (!testNumbers) return [];

        return testNumbers.split(',').map(phone => {
            phone = phone.trim();
            phone = phone.replace(/\D/g, '');
            if (phone.startsWith('98')) {
                phone = phone.substring(2);
            }
            if (!phone.startsWith('0')) {
                phone = '0' + phone;
            }
            return phone;
        }).filter(phone => phone.length > 0);
    }

    isTestPhone(phone) {
        let normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('98')) {
            normalizedPhone = normalizedPhone.substring(2);
        }
        if (!normalizedPhone.startsWith('0')) {
            normalizedPhone = '0' + normalizedPhone;
        }

        return this.testPhoneNumbers.includes(normalizedPhone);
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

            // Generate verification code
            const verificationCode = User.generateVerificationCode();

            const isTestNumber = this.isTestPhone(phone);

            if (isTestNumber) {
                console.log(`📱 Test number detected: ${phone}`);
                console.log(`🔑 Test verification code: ${verificationCode}`);

                req.session.testMode = true;
                req.session.testPhone = phone;
                req.session.verificationCode = verificationCode;
                req.session.verificationPhone = phone;

                const smsResult = await this.smsManager.sendVerificationCode(phone, verificationCode);

                // Response
                const response = {
                    success: true,
                    message: 'کد تایید ارسال شد (حالت تست)',
                    service: smsResult.service
                };

                if (process.env.NODE_ENV === 'development') {
                    response.devCode = verificationCode;
                    response.testMode = true;
                }

                return res.json(response);
            }

            let user = await User.findByPhone(phone);

            if (user) {
                user.verificationCode = verificationCode;

                if (utmParams && Object.keys(utmParams).some(key => utmParams[key])) {
                    await user.updateUTMParams(utmParams);
                }

                await user.save();
            } else {
                const userData = {
                    phone: phone,
                    verificationCode: verificationCode,
                    isVerified: false
                };

                if (utmParams) {
                    if (utmParams.utm_source) userData.utm_source = utmParams.utm_source;
                    if (utmParams.utm_medium) userData.utm_medium = utmParams.utm_medium;
                    if (utmParams.utm_campaign) userData.utm_campaign = utmParams.utm_campaign;
                }

                user = new User(userData);
                await user.save();
            }

            const smsResult = await this.smsManager.sendVerificationCode(phone, verificationCode);

            if (!smsResult.success) {
                console.error('SMS sending failed:', smsResult);

                if (process.env.NODE_ENV === 'production' && !smsResult.devMode) {
                    user.verificationCode = null;
                    await user.save();

                    return res.status(503).json({
                        success: false,
                        message: smsResult.message || 'متاسفانه مشکلی در ارسال پیامک وجود دارد. لطفا چند دقیقه دیگر تلاش کنید.',
                        retryAfter: 60 // ثانیه
                    });
                }

                console.log(`⚠️ SMS failed but continuing in dev mode. Code: ${verificationCode}`);
            }

            req.session.tempUserId = user.id;
            req.session.verificationCode = verificationCode;
            req.session.verificationPhone = phone;

            if (smsResult.success) {
                console.log(`✅ SMS sent successfully via ${smsResult.service} to ${phone}`);
            }

            const response = {
                success: true,
                message: 'کد تایید ارسال شد',
                service: smsResult.service // نام سرویسی که استفاده شد
            };

            if (process.env.NODE_ENV === 'development') {
                response.devCode = verificationCode;
                response.smsStatus = {
                    success: smsResult.success,
                    service: smsResult.service,
                    attemptedServices: smsResult.attemptedServices
                };

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

            // چک کردن اینکه آیا شماره تست است
            const isTestNumber = this.isTestPhone(phone);

            if (isTestNumber && req.session.testMode) {
                // برای شماره‌های تست، فقط از سشن چک می‌کنیم
                if (req.session.verificationCode === code &&
                    req.session.verificationPhone === phone) {

                    console.log(`✅ Test number verified: ${phone}`);

                    // Clear verification data from session
                    delete req.session.verificationCode;
                    delete req.session.verificationPhone;
                    delete req.session.testMode;
                    delete req.session.testPhone;

                    // Set authenticated session
                    req.session.testUserId = 'test_' + phone; // آیدی مجازی برای کاربر تست
                    req.session.phone = phone;
                    req.session.isAuthenticated = true;
                    req.session.isTestUser = true; // فلگ برای تشخیص کاربر تست

                    return res.json({
                        success: true,
                        message: 'ورود با موفقیت انجام شد (حالت تست)',
                        user: {
                            phone: phone,
                            hasPlayed: false, // کاربران تست همیشه می‌توانند بازی کنند
                            prize: null,
                            isTestUser: true
                        }
                    });
                } else {
                    return res.status(401).json({
                        success: false,
                        message: 'کد تایید نادرست است'
                    });
                }
            }

            // برای شماره‌های عادی، روند عادی
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
            if (!req.session.isAuthenticated) {
                return res.json({
                    success: false,
                    authenticated: false
                });
            }

            // چک کردن کاربر تست
            if (req.session.isTestUser) {
                return res.json({
                    success: true,
                    authenticated: true,
                    user: {
                        phone: req.session.phone,
                        hasPlayed: false, // کاربران تست همیشه می‌توانند بازی کنند
                        prize: null,
                        isTestUser: true
                    }
                });
            }

            // برای کاربران عادی
            if (!req.session.userId) {
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

            // اضافه کردن اطلاعات شماره‌های تست
            status.testPhoneNumbers = {
                count: this.testPhoneNumbers.length,
                configured: this.testPhoneNumbers.length > 0
            };

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
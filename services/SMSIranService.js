const axios = require('axios');

class SMSIranService {
    constructor() {
        this.apiKey = process.env.SMSIR_API_KEY || '';
        this.secretKey = process.env.SMSIR_SECRET_KEY || '';
        this.baseEndpoint = process.env.SMSIR_BASE_URL || 'https://RestfulSms.com';
        this.timeout = 5000; // 5 seconds
        this.token = null;
        this.tokenExpiry = null;

        // Template IDs
        this.templates = {
            'login': process.env.SMSIR_LOGIN_TEMPLATE || '100000',
            'verify': process.env.SMSIR_VERIFY_TEMPLATE || '100000'
        };

        // بررسی تنظیمات
        if (!this.apiKey || !this.secretKey) {
            console.error('⚠️ SMS.ir credentials are not properly configured!');
        }

        console.log('📱 SMS.ir Service initialized');
    }

    /**
     * دریافت توکن احراز هویت از SMS.ir
     * @returns {Promise<string>}
     */
    async getToken() {
        // اگر توکن هنوز معتبر است
        if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
            return this.token;
        }

        try {
            console.log('🔑 Getting SMS.ir authentication token...');

            const response = await axios.post(
                `${this.baseEndpoint}/api/Token`,
                {
                    UserApiKey: this.apiKey,
                    SecretKey: this.secretKey
                },
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            if (response.data && response.data.IsSuccessful && response.data.TokenKey) {
                this.token = response.data.TokenKey;
                // توکن معمولا 30 دقیقه اعتبار دارد
                this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000); // 25 دقیقه
                console.log('✅ SMS.ir token obtained successfully');
                return this.token;
            } else {
                console.error('❌ Failed to get SMS.ir token:', response.data);
                throw new Error('Failed to authenticate with SMS.ir');
            }
        } catch (error) {
            console.error('❌ Error getting SMS.ir token:', error.message);
            throw error;
        }
    }

    /**
     * ارسال پیامک تایید با SMS.ir
     * @param {string} phone - شماره موبایل
     * @param {string} code - کد تایید
     * @returns {Promise<object>}
     */
    async sendVerificationCode(phone, code) {
        try {
            // دریافت توکن
            const token = await this.getToken();

            // فرمت کردن شماره
            const mobile = this.formatPhoneNumber(phone);

            // آماده‌سازی پارامترها برای template
            const parametersArray = [
                {
                    "Name": "code",  // تغییر از Parameter به Name
                    "Value": code    // تغییر از ParameterValue به Value
                }
            ];

            // ساخت درخواست
            const requestData = {
                "TemplateId": parseInt(this.templates.verify),
                "Mobile": mobile,
                "ParameterArray": parametersArray
            };

            console.log('📤 Sending SMS via SMS.ir to:', mobile);
            console.log('   Template ID:', this.templates.verify);

            // ارسال درخواست
            const response = await axios.post(
                `${this.baseEndpoint}/api/UltraFastSend`,
                requestData,
                {
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'x-sms-ir-secure-token': token  // اضافه کردن توکن
                    }
                }
            );

            // بررسی پاسخ
            if (response.data && response.data.IsSuccessful) {
                console.log('✅ SMS sent successfully via SMS.ir');
                return {
                    success: true,
                    message: 'پیامک با موفقیت ارسال شد',
                    messageId: response.data.VerificationCodeId,
                    service: 'SMS.ir'
                };
            } else {
                console.error('❌ SMS.ir error:', response.data?.Message);
                return {
                    success: false,
                    message: response.data?.Message || 'خطا در ارسال پیامک',
                    error: response.data,
                    service: 'SMS.ir'
                };
            }

        } catch (error) {
            console.error('❌ Error sending SMS via SMS.ir:', error.message);

            if (error.response) {
                // خطای سرور
                return {
                    success: false,
                    message: error.response.data?.Message || 'خطا در سرویس پیامک',
                    statusCode: error.response.status,
                    error: error.response.data,
                    service: 'SMS.ir'
                };
            } else if (error.request) {
                // عدم دریافت پاسخ
                return {
                    success: false,
                    message: 'عدم پاسخ از سرور پیامک SMS.ir',
                    error: 'No response',
                    service: 'SMS.ir'
                };
            } else {
                // خطای دیگر
                return {
                    success: false,
                    message: 'خطا در ارسال پیامک',
                    error: error.message,
                    service: 'SMS.ir'
                };
            }
        }
    }

    /**
     * فرمت کردن شماره موبایل
     * SMS.ir معمولا شماره با 0 رو می‌خواد
     */
    formatPhoneNumber(phone) {
        let cleaned = phone.replace(/\D/g, '');

        // اگر 10 رقمی و با 9 شروع میشه
        if (cleaned.length === 10 && cleaned.startsWith('9')) {
            cleaned = '0' + cleaned;
        }
        // حذف 98 از ابتدا اگر وجود داره
        else if (cleaned.startsWith('98')) {
            cleaned = '0' + cleaned.substring(2);
        } else if (cleaned.startsWith('0098')) {
            cleaned = '0' + cleaned.substring(4);
        } else if (!cleaned.startsWith('0')) {
            cleaned = '0' + cleaned;
        }

        return cleaned;
    }

    /**
     * اعتبارسنجی شماره موبایل
     */
    validatePhoneNumber(phone) {
        const phoneRegex = /^(\+98|0098|98|0)?9\d{9}$/;
        return phoneRegex.test(phone);
    }
}

module.exports = SMSIranService;
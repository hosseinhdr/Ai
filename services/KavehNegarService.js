const axios = require('axios');

class KavehNegarService {
    constructor() {
        this.apiKey = process.env.KAVENEGAR_API_KEY || '';
        this.baseEndpoint = process.env.KAVENEGAR_BASE_URL || 'https://api.kavenegar.com';
        this.template = process.env.KAVENEGAR_TEMPLATE || 'verify';
        this.timeout = 15000; // 15 seconds

        // بررسی اولیه تنظیمات
        if (!this.apiKey) {
            console.error('⚠️ KAVENEGAR_API_KEY is not set in environment variables!');
        }

        console.log('📱 KavehNegar Service initialized');
    }

    /**
     * ارسال پیامک تایید
     * @param {string} phone - شماره موبایل
     * @param {string} code - کد تایید
     * @returns {Promise<object>}
     */
    async sendVerificationCode(phone, code) {
        try {
            // فرمت کردن شماره تلفن
            const receptor = this.formatPhoneNumber(phone);

            // پارامترهای درخواست
            const params = new URLSearchParams({
                receptor: receptor,
                template: this.template,
                token: code
                // حذف type: 'sms' چون ممکنه مشکل ایجاد کنه
            });

            console.log(`📤 Sending SMS via KavehNegar to: ${receptor}`);

            // ارسال درخواست به KavehNegar
            const response = await axios.get(
                `${this.baseEndpoint}/v1/${this.apiKey}/verify/lookup.json`,
                {
                    params: params,
                    timeout: this.timeout,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            // بررسی پاسخ
            if (response.data && response.data.return && response.data.return.status === 200) {
                console.log('✅ SMS sent successfully via KavehNegar');
                return {
                    success: true,
                    message: 'پیامک با موفقیت ارسال شد',
                    messageid: response.data.entries?.[0]?.messageid,
                    status: response.data.entries?.[0]?.status,
                    service: 'KavehNegar'
                };
            } else {
                console.error('❌ KavehNegar API returned non-200 status:', response.data);
                return {
                    success: false,
                    message: response.data?.return?.message || 'خطا در ارسال پیامک',
                    error: response.data,
                    service: 'KavehNegar'
                };
            }
        } catch (error) {
            console.error('❌ Error sending SMS via KavehNegar:', error.message);

            // مدیریت خطاهای مختلف
            if (error.response) {
                const status = error.response.status;
                let message = 'خطا در سرویس پیامک';

                // خطاهای رایج کاوه‌نگار
                switch (status) {
                    case 400:
                        message = 'پارامترهای نادرست';
                        break;
                    case 401:
                        message = 'کلید API نامعتبر';
                        break;
                    case 402:
                        message = 'اعتبار حساب کافی نیست';
                        break;
                    case 403:
                        message = 'دسترسی غیرمجاز';
                        break;
                    case 404:
                        message = 'سرویس یافت نشد';
                        break;
                    case 411:
                        message = 'اطلاعات ناقص';
                        break;
                    case 412:
                        message = 'اکانت غیرفعال';
                        break;
                    case 418:
                        message = 'شماره گیرنده نامعتبر';
                        break;
                    case 422:
                        message = 'داده‌های نامعتبر';
                        break;
                    case 424:
                        message = 'الگوی پیامک یافت نشد یا تایید نشده';
                        break;
                    case 426:
                        message = 'استفاده بیش از حد - لطفا کمی صبر کنید';
                        break;
                    case 428:
                        message = 'نیاز به احراز هویت دو عاملی';
                        break;
                    case 429:
                        message = 'تعداد درخواست‌ها بیش از حد مجاز';
                        break;
                    case 431:
                        message = 'ساختار درخواست نامعتبر';
                        break;
                    default:
                        if (status >= 500) {
                            message = 'خطای سرور کاوه‌نگار';
                        }
                }

                return {
                    success: false,
                    message: message,
                    statusCode: status,
                    error: error.response.data,
                    service: 'KavehNegar'
                };
            } else if (error.request) {
                // عدم دریافت پاسخ
                return {
                    success: false,
                    message: 'عدم پاسخ از سرور کاوه‌نگار',
                    error: 'No response from KavehNegar server',
                    service: 'KavehNegar'
                };
            } else {
                // خطای دیگر
                return {
                    success: false,
                    message: 'خطا در ارسال پیامک',
                    error: error.message,
                    service: 'KavehNegar'
                };
            }
        }
    }

    /**
     * ارسال پیامک عمومی (غیر از کد تایید)
     * @param {string} phone - شماره موبایل
     * @param {string} message - متن پیام
     * @returns {Promise<object>}
     */
    async sendMessage(phone, message) {
        try {
            const receptor = this.formatPhoneNumber(phone);

            const params = new URLSearchParams({
                receptor: receptor,
                message: message,
                sender: process.env.KAVENEGAR_SENDER || '10004346'
            });

            const response = await axios.post(
                `${this.baseEndpoint}/v1/${this.apiKey}/sms/send.json`,
                params,
                {
                    timeout: this.timeout,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            if (response.data && response.data.return && response.data.return.status === 200) {
                console.log('✅ General SMS sent successfully via KavehNegar');
                return {
                    success: true,
                    message: 'پیامک با موفقیت ارسال شد',
                    messageid: response.data.entries?.[0]?.messageid,
                    service: 'KavehNegar'
                };
            } else {
                return {
                    success: false,
                    message: response.data?.return?.message || 'خطا در ارسال پیامک',
                    service: 'KavehNegar'
                };
            }
        } catch (error) {
            console.error('❌ Error sending general SMS:', error.message);
            return {
                success: false,
                message: 'خطا در ارسال پیامک',
                error: error.message,
                service: 'KavehNegar'
            };
        }
    }

    /**
     * فرمت کردن شماره موبایل برای ارسال
     * @param {string} phone - شماره موبایل
     * @returns {string}
     */
    formatPhoneNumber(phone) {
        // حذف کاراکترهای غیر عددی
        let cleaned = phone.replace(/\D/g, '');

        // اگر با 98 شروع میشه، در فرمت بین‌المللی هست
        if (cleaned.startsWith('98')) {
            return cleaned;
        }

        // اگر با 0098 شروع میشه
        if (cleaned.startsWith('0098')) {
            return cleaned.substring(2);
        }

        // اگر با 0 شروع میشه، حذف 0 و اضافه کردن 98
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.substring(1);
        }

        // اضافه کردن پیش‌شماره ایران
        return '98' + cleaned;
    }

    /**
     * اعتبارسنجی شماره موبایل ایران
     * @param {string} phone - شماره موبایل
     * @returns {boolean}
     */
    validatePhoneNumber(phone) {
        const phoneRegex = /^(\+98|0098|98|0)?9\d{9}$/;
        return phoneRegex.test(phone);
    }

    /**
     * بررسی وضعیت پیام ارسال شده
     * @param {string} messageid - شناسه پیام
     * @returns {Promise<object>}
     */
    async getMessageStatus(messageid) {
        try {
            const response = await axios.get(
                `${this.baseEndpoint}/v1/${this.apiKey}/sms/status.json`,
                {
                    params: { messageid },
                    timeout: this.timeout
                }
            );

            if (response.data && response.data.return && response.data.return.status === 200) {
                return {
                    success: true,
                    status: response.data.entries?.[0]?.status,
                    statustext: response.data.entries?.[0]?.statustext,
                    service: 'KavehNegar'
                };
            } else {
                return {
                    success: false,
                    message: response.data?.return?.message || 'خطا در دریافت وضعیت',
                    service: 'KavehNegar'
                };
            }
        } catch (error) {
            console.error('Error getting message status:', error.message);
            return {
                success: false,
                message: 'خطا در دریافت وضعیت پیام',
                service: 'KavehNegar'
            };
        }
    }
}

module.exports = KavehNegarService;
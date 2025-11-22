const KavehNegarService = require('./KavehNegarService');
const SMSIranService = require('./SMSIranService');

class SMSManager {
    constructor() {
        // لیست سرویس‌ها به ترتیب اولویت
        this.services = [];

        // بررسی و اضافه کردن سرویس‌های فعال
        if (process.env.KAVENEGAR_API_KEY) {
            this.services.push({
                name: 'KavehNegar',
                instance: new KavehNegarService(),
                enabled: process.env.KAVENEGAR_ENABLED !== 'false'
            });
        }

        if (process.env.SMSIR_API_KEY && process.env.SMSIR_SECRET_KEY) {
            this.services.push({
                name: 'SMS.ir',
                instance: new SMSIranService(),
                enabled: process.env.SMSIR_ENABLED !== 'false'
            });
        }

        // حالت Mock برای توسعه
        if (process.env.SMS_MODE === 'mock' || process.env.NODE_ENV === 'development') {
            this.mockMode = true;
        }

        console.log('📱 SMS Manager initialized with services:',
            this.services.map(s => `${s.name} (${s.enabled ? 'enabled' : 'disabled'})`).join(', '));
    }

    /**
     * ارسال کد تایید با استفاده از Fallback
     * @param {string} phone - شماره موبایل
     * @param {string} code - کد تایید
     * @returns {Promise<object>}
     */
    async sendVerificationCode(phone, code) {
        console.log('📱 SMS Manager - Starting SMS send process');
        console.log('   Environment:', process.env.NODE_ENV);
        console.log('   SMS Mode:', process.env.SMS_MODE);
        console.log('   Mock Mode:', this.mockMode);

        // در حالت Mock
        if (this.mockMode || process.env.SMS_MODE === 'mock') {
            console.log(`🔧 MOCK MODE: SMS would be sent to ${phone} with code: ${code}`);
            console.log('⚠️ برای ارسال واقعی پیامک، NODE_ENV و SMS_MODE را روی production بگذارید');
            return {
                success: true,
                message: 'پیامک شبیه‌سازی شد (حالت توسعه)',
                service: 'MOCK',
                code: code
            };
        }

        // لیست خطاها برای گزارش نهایی
        const errors = [];

        // تلاش با هر سرویس به ترتیب
        for (const service of this.services) {
            if (!service.enabled) {
                console.log(`⏭️ Skipping ${service.name} (disabled)`);
                continue;
            }

            try {
                console.log(`📤 Trying to send SMS via ${service.name}...`);

                const result = await service.instance.sendVerificationCode(phone, code);

                if (result.success) {
                    console.log(`✅ SMS sent successfully via ${service.name}`);
                    return {
                        ...result,
                        service: service.name,
                        attemptedServices: errors.map(e => e.service)
                    };
                } else {
                    console.log(`⚠️ ${service.name} failed:`, result.message);
                    errors.push({
                        service: service.name,
                        error: result.message,
                        details: result.error
                    });
                }

            } catch (error) {
                console.error(`❌ ${service.name} exception:`, error.message);
                errors.push({
                    service: service.name,
                    error: error.message,
                    exception: true
                });
            }
        }

        // اگر هیچ سرویسی کار نکرد
        console.error('❌ All SMS services failed:', errors);

        // در محیط توسعه، اجازه ادامه با نمایش کد
        if (process.env.NODE_ENV === 'development') {
            return {
                success: false,
                message: 'مشکل در ارسال پیامک - حالت توسعه',
                service: 'FAILED',
                code: code, // کد رو برمی‌گردونیم برای تست
                errors: errors,
                devMode: true
            };
        }

        // در محیط production
        return {
            success: false,
            message: 'متاسفانه در حال حاضر امکان ارسال پیامک وجود ندارد. لطفا چند دقیقه دیگر تلاش کنید.',
            service: 'NONE',
            errors: errors
        };
    }

    /**
     * بررسی وضعیت سرویس‌ها
     * @returns {object}
     */
    getStatus() {
        return {
            mockMode: this.mockMode,
            services: this.services.map(s => ({
                name: s.name,
                enabled: s.enabled,
                configured: true
            })),
            totalServices: this.services.length,
            activeServices: this.services.filter(s => s.enabled).length
        };
    }

    /**
     * تست اتصال سرویس‌ها
     * @returns {Promise<object>}
     */
    async testServices() {
        const testPhone = '09123456789';
        const testCode = '123456';
        const results = [];

        for (const service of this.services) {
            if (!service.enabled) {
                results.push({
                    service: service.name,
                    status: 'disabled'
                });
                continue;
            }

            try {
                // فقط فرمت شماره رو تست می‌کنیم، پیامک ارسال نمی‌کنیم
                const formatted = service.instance.formatPhoneNumber(testPhone);
                const isValid = service.instance.validatePhoneNumber(testPhone);

                results.push({
                    service: service.name,
                    status: 'ready',
                    formattedPhone: formatted,
                    validation: isValid
                });

            } catch (error) {
                results.push({
                    service: service.name,
                    status: 'error',
                    error: error.message
                });
            }
        }

        return {
            timestamp: new Date().toISOString(),
            results: results
        };
    }
}

module.exports = SMSManager;
const axios = require('axios');

class SMSService {
    constructor() {
        this.apiUrl = process.env.SMS_API_URL;
        this.apiKey = process.env.SMS_API_KEY;
    }

    async sendCode(phone, code) {
        try {
            // Format phone number for API
            const formattedPhone = this.formatPhoneNumber(phone);

            const message = `کد تایید شما برای گردونه شانس صراف: ${code}`;

            // In production, uncomment and use your actual SMS API
            /*
            const response = await axios.post(this.apiUrl, {
                phone: formattedPhone,
                message: message,
                apiKey: this.apiKey
            });

            return response.data;
            */

            // For development/testing - simulate SMS sending
            console.log(`SMS sent to ${formattedPhone}: ${message}`);
            return {
                success: true,
                message: 'SMS sent successfully (simulated)',
                phone: formattedPhone,
                code: code
            };

        } catch (error) {
            console.error('Error sending SMS:', error);
            throw new Error('Failed to send SMS');
        }
    }

    formatPhoneNumber(phone) {
        // Remove any non-digit characters
        let cleaned = phone.replace(/\D/g, '');

        // If starts with 98, it's already in international format
        if (cleaned.startsWith('98')) {
            return '+' + cleaned;
        }

        // If starts with 0, remove it and add +98
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.substring(1);
        }

        // Add +98 prefix for Iran
        return '+98' + cleaned;
    }

    validatePhoneNumber(phone) {
        // Basic validation for Iranian phone numbers
        const phoneRegex = /^(\+98|0)?9\d{9}$/;
        return phoneRegex.test(phone);
    }
}

module.exports = SMSService;
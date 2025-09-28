const db = require('../config/database');

class User {
    constructor(data) {
        this.id = data.id || null;
        this.phone = data.phone;
        this.verificationCode = data.verification_code || null;
        this.isVerified = data.is_verified || false;
        this.hasPlayed = data.has_played || false;
        this.prizeId = data.prize_id || null;
        this.prize = data.prize || null; // For backward compatibility
        this.createdAt = data.created_at || new Date();
        this.playedAt = data.played_at || null;
        // فیلدهای UTM - فقط اگر واقعا وجود داشته باشند
        this.utmSource = data.utm_source || null;
        this.utmMedium = data.utm_medium || null;
        this.utmCampaign = data.utm_campaign || null;
    }

    async save() {
        try {
            if (this.id) {
                // Update existing user
                const sql = `
                    UPDATE users
                    SET phone = ?, verification_code = ?, is_verified = ?,
                        has_played = ?, prize_id = ?, prize = ?, played_at = ?,
                        utm_source = ?, utm_medium = ?, utm_campaign = ?
                    WHERE id = ?
                `;
                await db.query(sql, [
                    this.phone,
                    this.verificationCode,
                    this.isVerified,
                    this.hasPlayed,
                    this.prizeId,
                    this.prize,
                    this.playedAt,
                    this.utmSource,
                    this.utmMedium,
                    this.utmCampaign,
                    this.id
                ]);
            } else {
                // Insert new user
                const sql = `
                    INSERT INTO users (phone, verification_code, is_verified, has_played,
                                       prize_id, prize, created_at, played_at,
                                       utm_source, utm_medium, utm_campaign)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const result = await db.query(sql, [
                    this.phone,
                    this.verificationCode,
                    this.isVerified,
                    this.hasPlayed,
                    this.prizeId,
                    this.prize,
                    this.createdAt,
                    this.playedAt,
                    this.utmSource,
                    this.utmMedium,
                    this.utmCampaign
                ]);
                this.id = result.insertId;
            }
            return this;
        } catch (error) {
            console.error('Error saving user:', error);
            throw error;
        }
    }

    static async findByPhone(phone) {
        try {
            const sql = 'SELECT * FROM users WHERE phone = ?';
            const results = await db.query(sql, [phone]);

            if (results.length > 0) {
                return new User(results[0]);
            }
            return null;
        } catch (error) {
            console.error('Error finding user by phone:', error);
            throw error;
        }
    }

    static async findById(id) {
        try {
            const sql = 'SELECT * FROM users WHERE id = ?';
            const results = await db.query(sql, [id]);

            if (results.length > 0) {
                return new User(results[0]);
            }
            return null;
        } catch (error) {
            console.error('Error finding user by id:', error);
            throw error;
        }
    }

    async updatePrize(prizeId, prizeName) {
        this.prizeId = prizeId;
        this.prize = prizeName;
        this.hasPlayed = true;
        this.playedAt = new Date();

        // Also log the prize
        try {
            const logSql = `
                INSERT INTO prizes_log (user_id, phone, prize, won_at)
                VALUES (?, ?, ?, ?)
            `;
            await db.query(logSql, [this.id, this.phone, prizeName, this.playedAt]);
        } catch (error) {
            console.error('Error logging prize:', error);
        }

        return await this.save();
    }

    async verify() {
        this.isVerified = true;
        this.verificationCode = null;
        return await this.save();
    }

    // متد جدید برای آپدیت UTM parameters - فقط اگر واقعا وجود داشته باشند
    async updateUTMParams(utmParams) {
        if (utmParams && Object.keys(utmParams).length > 0) {
            // فقط مقادیری که واقعا ارسال شدند رو آپدیت کن
            if (utmParams.utm_source) {
                this.utmSource = utmParams.utm_source;
            }
            if (utmParams.utm_medium) {
                this.utmMedium = utmParams.utm_medium;
            }
            if (utmParams.utm_campaign) {
                this.utmCampaign = utmParams.utm_campaign;
            }

            // فقط اگر حداقل یکی از UTM ها موجود بود، save رو صدا بزن
            if (this.utmSource || this.utmMedium || this.utmCampaign) {
                return await this.save();
            }
        }
        return this;
    }

    static generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // متد برای دریافت UTM parameters - فقط اگر وجود داشته باشند
    getUTMParams() {
        // فقط اگر حداقل یکی از UTM ها وجود داشت، برگردون
        if (this.utmSource || this.utmMedium || this.utmCampaign) {
            return {
                utm_source: this.utmSource,
                utm_medium: this.utmMedium,
                utm_campaign: this.utmCampaign
            };
        }
        return null;
    }

    // چک کردن اینکه آیا کاربر UTM دارد
    hasUTMParams() {
        return !!(this.utmSource || this.utmMedium || this.utmCampaign);
    }
}

module.exports = User;
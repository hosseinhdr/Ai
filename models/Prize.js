const db = require('../config/database');

class Prize {
    constructor(data) {
        this.id = data.id || null;
        this.name = data.name;
        this.englishName = data.english_name || null;
        this.link = data.link || null;
        this.image = data.image || null;
        this.buttonText = data.button_text || 'دریافت جایزه';
        this.prizeText = data.prize_text || '';
        this.code = data.code || null;
        this.probability = data.probability || 0.1;
        this.isEmpty = data.is_empty || false;
        this.displayOrder = data.display_order || 0;
        this.isActive = data.is_active !== undefined ? data.is_active : true;
    }

    static async getAll(activeOnly = true) {
        try {
            let sql = 'SELECT * FROM prizes';
            const params = [];

            if (activeOnly) {
                sql += ' WHERE is_active = ?';
                params.push(true);
            }

            sql += ' ORDER BY display_order ASC';

            const results = await db.query(sql, params);
            return results.map(row => new Prize(row));
        } catch (error) {
            console.error('Error getting prizes:', error);
            throw error;
        }
    }

    static async getById(id) {
        try {
            const sql = 'SELECT * FROM prizes WHERE id = ?';
            const results = await db.query(sql, [id]);

            if (results.length > 0) {
                return new Prize(results[0]);
            }
            return null;
        } catch (error) {
            console.error('Error finding prize by id:', error);
            throw error;
        }
    }

    async save() {
        try {
            if (this.id) {
                // Update existing prize
                const sql = `
                    UPDATE prizes 
                    SET name = ?, english_name = ?, link = ?, image = ?, button_text = ?, 
                        prize_text = ?, code = ?, probability = ?, 
                        is_empty = ?, display_order = ?, is_active = ?
                    WHERE id = ?
                `;
                await db.query(sql, [
                    this.name,
                    this.englishName,
                    this.link,
                    this.image,
                    this.buttonText,
                    this.prizeText,
                    this.code,
                    this.probability,
                    this.isEmpty,
                    this.displayOrder,
                    this.isActive,
                    this.id
                ]);
            } else {
                // Insert new prize
                const sql = `
                    INSERT INTO prizes (name, english_name, link, image, button_text, prize_text, 
                                      code, probability, is_empty, display_order, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const result = await db.query(sql, [
                    this.name,
                    this.englishName,
                    this.link,
                    this.image,
                    this.buttonText,
                    this.prizeText,
                    this.code,
                    this.probability,
                    this.isEmpty,
                    this.displayOrder,
                    this.isActive
                ]);
                this.id = result.insertId;
            }
            return this;
        } catch (error) {
            console.error('Error saving prize:', error);
            throw error;
        }
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            englishName: this.englishName,
            link: this.link,
            image: this.image,
            buttonText: this.buttonText,
            prizeText: this.prizeText,
            code: this.code,
            probability: this.probability,
            isEmpty: this.isEmpty,
            displayOrder: this.displayOrder,
            isActive: this.isActive
        };
    }

    // For wheel display - minimal data
    toWheelFormat() {
        return {
            index: this.displayOrder - 1, // Zero-based index for wheel
            name: this.name,
            isEmpty: this.isEmpty
        };
    }

    // // For winner display - با UTM فقط اگر وجود داشته باشد
    // toWinnerFormat(utmParams = null) {
    //     const baseData = {
    //         id: this.id,
    //         name: this.name,
    //         englishName: this.englishName,
    //         link: this.link,
    //         image: this.image,
    //         buttonText: this.buttonText,
    //         prizeText: this.prizeText,
    //         code: this.code,
    //         isEmpty: this.isEmpty
    //     };
    //
    //     // فقط اگر واقعا UTM وجود داشت و لینک داریم، اضافه کن
    //     if (this.link && utmParams && !this.isEmpty) {
    //         try {
    //             const url = new URL(this.link);
    //
    //             // فقط UTM هایی که واقعا مقدار دارند رو اضافه کن
    //             if (utmParams.utm_source) {
    //                 url.searchParams.set('utm_source', utmParams.utm_source);
    //             }
    //             if (utmParams.utm_medium) {
    //                 url.searchParams.set('utm_medium', utmParams.utm_medium);
    //             }
    //             if (utmParams.utm_campaign) {
    //                 url.searchParams.set('utm_campaign', utmParams.utm_campaign);
    //             }
    //
    //             // utm_content فقط اگر نام انگلیسی وجود داشته باشد
    //             if (this.englishName) {
    //                 url.searchParams.set('utm_content', this.englishName);
    //             }
    //
    //             baseData.link = url.toString();
    //         } catch (error) {
    //             console.error('Error adding UTM to prize link:', error);
    //             // در صورت خطا، لینک اصلی رو برگردون
    //         }
    //     }
    //
    //     return baseData;
    // }

    // متد toWinnerFormat رو اینطوری تغییر بده:
    //
    // toWinnerFormat(utmParams = null) {
    //     const baseData = {
    //         id: this.id,
    //         name: this.name,
    //         englishName: this.englishName,
    //         link: this.link,
    //         image: this.image,
    //         buttonText: this.buttonText,
    //         prizeText: this.prizeText,
    //         code: this.code,
    //         isEmpty: this.isEmpty
    //     };
    //
    //     // فقط اگر واقعا لینک داریم و جایزه پوچ نیست
    //     if (this.link && !this.isEmpty) {
    //         try {
    //             let finalLink = this.link;
    //
    //             // 🔥 مرحله 1: جایگزینی INJAS با english_name
    //             if (this.englishName) {
    //                 // هم در URL path و هم در query parameters
    //                 finalLink = finalLink.replace(/INJAS/g, this.englishName);
    //             }
    //
    //             // 🔥 مرحله 2: اضافه کردن UTM های کاربر (اگر وجود داشته باشند)
    //             if (utmParams && Object.keys(utmParams).length > 0) {
    //                 const url = new URL(finalLink);
    //
    //                 // فقط UTM هایی که از قبل در URL نیستند رو اضافه کن
    //                 if (utmParams.utm_source && !url.searchParams.has('utm_source')) {
    //                     url.searchParams.set('utm_source', utmParams.utm_source);
    //                 }
    //                 if (utmParams.utm_medium && !url.searchParams.has('utm_medium')) {
    //                     url.searchParams.set('utm_medium', utmParams.utm_medium);
    //                 }
    //                 if (utmParams.utm_campaign && !url.searchParams.has('utm_campaign')) {
    //                     url.searchParams.set('utm_campaign', utmParams.utm_campaign);
    //                 }
    //
    //                 // ⚠️ دیگه utm_content رو اتوماتیک اضافه نمی‌کنیم
    //                 // چون ممکنه خودت با INJAS تعریفش کرده باشی
    //
    //                 finalLink = url.toString();
    //             }
    //
    //             baseData.link = finalLink;
    //
    //         } catch (error) {
    //             console.error('Error processing prize link:', error);
    //             // در صورت خطا، لینک اصلی رو برگردون
    //             baseData.link = this.link;
    //         }
    //     }
    //
    //     return baseData;
    // }

    // در models/Prize.js - متد toWinnerFormat

    toWinnerFormat(utmParams = null) {
        const baseData = {
            id: this.id,
            name: this.name,
            englishName: this.englishName,
            link: this.link,
            image: this.image,
            buttonText: this.buttonText,
            prizeText: this.prizeText,
            code: this.code,
            isEmpty: this.isEmpty
        };

        // ✅ حذف شرط utmParams - فقط چک کن لینک وجود داره و جایزه پوچ نیست
        if (this.link && !this.isEmpty) {
            try {
                let finalLink = this.link;

                // 🔥 مرحله 1: همیشه INJAS رو جایگزین کن (حتی بدون UTM)
                if (this.englishName) {
                    finalLink = finalLink.replace(/INJAS/g, this.englishName);
                }

                // 🔥 مرحله 2: اگر UTM داریم، اونها رو هم اضافه کن
                if (utmParams && Object.keys(utmParams).length > 0) {
                    const url = new URL(finalLink);

                    // اضافه کردن UTM های کاربر
                    if (utmParams.utm_source && !url.searchParams.has('utm_source')) {
                        url.searchParams.set('utm_source', utmParams.utm_source);
                    }
                    if (utmParams.utm_medium && !url.searchParams.has('utm_medium')) {
                        url.searchParams.set('utm_medium', utmParams.utm_medium);
                    }
                    if (utmParams.utm_campaign && !url.searchParams.has('utm_campaign')) {
                        url.searchParams.set('utm_campaign', utmParams.utm_campaign);
                    }

                    finalLink = url.toString();
                } else {
                    // ✅ اگر UTM نداریم، می‌تونیم یک مقدار پیش‌فرض اضافه کنیم
                    const url = new URL(finalLink);

                    // اختیاری: اضافه کردن utm_source=organic برای کاربران ارگانیک
                    if (!url.searchParams.has('utm_source')) {
                        url.searchParams.set('utm_source', 'organic');
                    }

                    finalLink = url.toString();
                }

                baseData.link = finalLink;

            } catch (error) {
                console.error('Error processing prize link:', error);
                baseData.link = this.link; // لینک اصلی رو برگردون
            }
        }

        return baseData;
    }
}

module.exports = Prize;
const db = require('../config/database');

class Prize {
    constructor(data) {
        this.id = data.id || null;
        this.name = data.name;
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
                    SET name = ?, link = ?, image = ?, button_text = ?, 
                        prize_text = ?, code = ?, probability = ?, 
                        is_empty = ?, display_order = ?, is_active = ?
                    WHERE id = ?
                `;
                await db.query(sql, [
                    this.name,
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
                    INSERT INTO prizes (name, link, image, button_text, prize_text, 
                                      code, probability, is_empty, display_order, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                const result = await db.query(sql, [
                    this.name,
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

    // For winner display - full data
    toWinnerFormat() {
        return {
            id: this.id,
            name: this.name,
            link: this.link,
            image: this.image,
            buttonText: this.buttonText,
            prizeText: this.prizeText,
            code: this.code,
            isEmpty: this.isEmpty
        };
    }
}

module.exports = Prize;
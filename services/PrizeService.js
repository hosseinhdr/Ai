const Prize = require('../models/Prize');

class PrizeService {
    constructor() {
        this.prizes = [];
        this.loadPrizes();
    }

    async loadPrizes() {
        try {
            this.prizes = await Prize.getAll(true);

            // اگر هیچ جایزه‌ای در دیتابیس نبود
            if (!this.prizes || this.prizes.length === 0) {
                throw new Error('No prizes found in database');
            }

            this.validateProbabilities();
        } catch (error) {
            console.error('Error loading prizes from database:', error);
            // در صورت خطا، یک آرایه خالی برگردون
            this.prizes = [];
        }
    }

    validateProbabilities() {
        if (!this.prizes || this.prizes.length === 0) return;

        const totalProbability = this.prizes.reduce((sum, prize) => sum + parseFloat(prize.probability), 0);

        // اگر مجموع احتمالات دقیقاً 1 نبود، نرمال‌سازی کن
        if (Math.abs(totalProbability - 1.0) > 0.01) {
            this.prizes = this.prizes.map(prize => {
                prize.probability = parseFloat(prize.probability) / totalProbability;
                return prize;
            });
        }
    }

    async selectPrize() {
        // همیشه جدیدترین دیتا رو از دیتابیس بگیر
        await this.loadPrizes();

        // اگر جایزه‌ای نداریم
        if (!this.prizes || this.prizes.length === 0) {
            throw new Error('No prizes available');
        }

        // عدد رندوم بین 0 تا 1
        const random = Math.random();

        // انتخاب جایزه براساس احتمال
        let cumulativeProbability = 0;
        let selectedPrize = null;

        for (const prize of this.prizes) {
            cumulativeProbability += parseFloat(prize.probability);

            if (random <= cumulativeProbability) {
                selectedPrize = prize;
                break;
            }
        }

        // اگر هنوز انتخاب نشده (نباید اتفاق بیفته)
        if (!selectedPrize) {
            selectedPrize = this.prizes[this.prizes.length - 1];
        }

        return selectedPrize;
    }

    async getPrizes() {
        await this.loadPrizes();

        if (!this.prizes || this.prizes.length === 0) {
            return [];
        }

        // مرتب‌سازی براساس display_order
        const sortedPrizes = [...this.prizes].sort((a, b) => a.displayOrder - b.displayOrder);
        return sortedPrizes.map(p => p.toWheelFormat());
    }

    async getPrizeById(id) {
        return await Prize.getById(id);
    }

    async getFullPrizes() {
        await this.loadPrizes();

        if (!this.prizes || this.prizes.length === 0) {
            return [];
        }

        // مرتب‌سازی براساس display_order
        const sortedPrizes = [...this.prizes].sort((a, b) => a.displayOrder - b.displayOrder);
        return sortedPrizes.map(p => p.toWinnerFormat());
    }
}

module.exports = PrizeService;
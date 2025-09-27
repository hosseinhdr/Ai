const User = require('../models/User');
const PrizeService = require('../services/PrizeService');

class WheelController {
    constructor() {
        this.prizeService = new PrizeService();
    }

    async spin(req, res) {
        try {
            if (!req.session.isAuthenticated || !req.session.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'لطفا ابتدا وارد شوید'
                });
            }

            const user = await User.findById(req.session.userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'کاربر یافت نشد'
                });
            }

            if (user.hasPlayed) {
                // Get the prize details for already played user
                const previousPrize = await this.prizeService.getPrizeById(user.prizeId);
                return res.status(403).json({
                    success: false,
                    message: 'شما قبلا در این مسابقه شرکت کرده‌اید',
                    prize: previousPrize ? previousPrize.toWinnerFormat() : null
                });
            }

            // Select a random prize from database
            const selectedPrize = await this.prizeService.selectPrize();

            if (!selectedPrize) {
                throw new Error('No prize selected');
            }

            // Update user with prize
            await user.updatePrize(selectedPrize.id, selectedPrize.name);

            // Get the index for wheel positioning (0-based)
            const prizeIndex = selectedPrize.displayOrder - 1;

            res.json({
                success: true,
                prizeIndex: prizeIndex,
                prize: selectedPrize.toWinnerFormat(),
                message: selectedPrize.isEmpty ? 'متاسفانه این بار برنده نشدید' : `تبریک! شما برنده ${selectedPrize.name} شدید`
            });

        } catch (error) {
            console.error('Error in spin:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در اجرای گردونه'
            });
        }
    }

    async getUserStatus(req, res) {
        try {
            if (!req.session.isAuthenticated || !req.session.userId) {
                return res.json({
                    success: true,
                    hasPlayed: false,
                    isAuthenticated: false
                });
            }

            const user = await User.findById(req.session.userId);

            if (!user) {
                return res.json({
                    success: true,
                    hasPlayed: false,
                    isAuthenticated: false
                });
            }

            let prizeData = null;
            if (user.hasPlayed && user.prizeId) {
                const prize = await this.prizeService.getPrizeById(user.prizeId);
                if (prize) {
                    prizeData = prize.toWinnerFormat();
                }
            }

            res.json({
                success: true,
                hasPlayed: user.hasPlayed,
                prize: prizeData,
                isAuthenticated: true
            });

        } catch (error) {
            console.error('Error in getUserStatus:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در دریافت وضعیت کاربر'
            });
        }
    }

    async getPrizes(req, res) {
        try {
            const prizes = await this.prizeService.getPrizes();
            res.json({
                success: true,
                prizes: prizes
            });
        } catch (error) {
            console.error('Error in getPrizes:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در دریافت لیست جوایز'
            });
        }
    }

    async getFullPrizes(req, res) {
        try {
            const prizes = await this.prizeService.getFullPrizes();
            res.json({
                success: true,
                prizes: prizes
            });
        } catch (error) {
            console.error('Error in getFullPrizes:', error);
            res.status(500).json({
                success: false,
                message: 'خطا در دریافت اطلاعات جوایز'
            });
        }
    }
}

module.exports = new WheelController();
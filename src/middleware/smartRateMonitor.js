// src/middleware/smartRateMonitor.js

import logger from '../utils/logger.js';

/**
 * Smart Rate Monitor - پایش هوشمند محدودیت‌ها
 */
export class SmartRateMonitor {
    constructor() {
        this.sessionHealth = new Map();
        this.operationStats = new Map();
        this.floodWaitHistory = new Map();

        // آستانه‌های هشدار
        this.thresholds = {
            info: {
                safe: 50,      // ایمن: تا 50 در دقیقه
                warning: 80,   // هشدار: 80 در دقیقه
                critical: 100  // بحرانی: 100 در دقیقه
            },
            join: {
                safe: 4,       // ایمن: 4 در دقیقه
                warning: 5,    // هشدار: 5 (حد تلگرام)
                critical: 6    // بحرانی: بیش از حد
            },
            leave: {
                safe: 8,
                warning: 12,
                critical: 15
            },
            list: {
                safe: 15,
                warning: 25,
                critical: 30
            }
        };

        // شروع مانیتورینگ
        this.startMonitoring();
    }

    /**
     * ثبت عملیات و بررسی وضعیت
     */
    recordOperation(operation, sessionName, success, error = null) {
        const key = `${operation}_${sessionName}`;
        const now = Date.now();

        // دریافت یا ایجاد آمار
        if (!this.operationStats.has(key)) {
            this.operationStats.set(key, {
                operations: [],
                floodWaits: 0,
                lastFloodWait: null
            });
        }

        const stats = this.operationStats.get(key);

        // ثبت عملیات
        stats.operations.push({
            timestamp: now,
            success,
            error
        });

        // حذف عملیات‌های قدیمی (بیش از 1 دقیقه)
        stats.operations = stats.operations.filter(op =>
            now - op.timestamp < 60000
        );

        // محدود کردن تعداد عملیات ذخیره شده (حداکثر 100 عملیات در دقیقه)
        if (stats.operations.length > 100) {
            stats.operations = stats.operations.slice(-100);
        }

        // بررسی flood wait
        if (error && error.includes && error.includes('FLOOD_WAIT')) {
            stats.floodWaits++;
            stats.lastFloodWait = now;
            this.handleFloodWait(operation, sessionName, error);
        }

        // محاسبه نرخ عملیات
        const rate = stats.operations.length;

        // بررسی وضعیت
        const health = this.checkHealth(operation, rate);

        // ذخیره وضعیت سشن
        this.updateSessionHealth(sessionName, operation, health, rate);

        return {
            rate,
            health,
            recommendation: this.getRecommendation(operation, rate, stats)
        };
    }

    /**
     * بررسی سلامت بر اساس نرخ
     */
    checkHealth(operation, rate) {
        const threshold = this.thresholds[operation] || this.thresholds.info;

        if (rate <= threshold.safe) {
            return 'safe';
        } else if (rate <= threshold.warning) {
            return 'warning';
        } else {
            return 'critical';
        }
    }

    /**
     * مدیریت flood wait
     */
    handleFloodWait(operation, sessionName, error) {
        // استخراج زمان انتظار
        const waitTime = this.extractWaitTime(error);

        logger.warn(`⚠️ Flood Wait detected for ${sessionName} on ${operation}: ${waitTime}s`);

        // ذخیره در تاریخچه
        if (!this.floodWaitHistory.has(sessionName)) {
            this.floodWaitHistory.set(sessionName, []);
        }

        this.floodWaitHistory.get(sessionName).push({
            operation,
            waitTime,
            timestamp: Date.now()
        });

        // توصیه کاهش نرخ
        this.adjustRateLimits(operation, sessionName, waitTime);
    }

    /**
     * استخراج زمان انتظار از خطا
     */
    extractWaitTime(error) {
        const match = error.match(/\d+/);
        return match ? parseInt(match[0]) : 60;
    }

    /**
     * تنظیم خودکار محدودیت‌ها
     */
    adjustRateLimits(operation, sessionName, waitTime) {
        // اگر flood wait رخ داد، موقتاً نرخ را کاهش دهید
        const adjustment = {
            operation,
            sessionName,
            originalLimit: this.thresholds[operation]?.safe || 10,
            temporaryLimit: Math.floor((this.thresholds[operation]?.safe || 10) * 0.5),
            duration: waitTime * 1000,
            expiresAt: Date.now() + (waitTime * 1000)
        };

        logger.info(`📉 Temporarily reducing ${operation} rate for ${sessionName} to ${adjustment.temporaryLimit}/min`);

        // اعمال محدودیت موقت
        this.applyTemporaryLimit(adjustment);
    }

    /**
     * اعمال محدودیت موقت
     */
    applyTemporaryLimit(adjustment) {
        // این می‌تواند با rate limiter اصلی یکپارچه شود
        setTimeout(() => {
            logger.info(`✅ Restoring normal rate for ${adjustment.operation} on ${adjustment.sessionName}`);
        }, adjustment.duration);
    }

    /**
     * بروزرسانی وضعیت سلامت سشن
     */
    updateSessionHealth(sessionName, operation, health, rate) {
        if (!this.sessionHealth.has(sessionName)) {
            this.sessionHealth.set(sessionName, {
                operations: {},
                overallHealth: 'safe',
                lastUpdate: Date.now()
            });
        }

        const session = this.sessionHealth.get(sessionName);
        session.operations[operation] = { health, rate };
        session.lastUpdate = Date.now();

        // محاسبه سلامت کلی
        const healths = Object.values(session.operations).map(op => op.health);
        if (healths.includes('critical')) {
            session.overallHealth = 'critical';
        } else if (healths.includes('warning')) {
            session.overallHealth = 'warning';
        } else {
            session.overallHealth = 'safe';
        }
    }

    /**
     * دریافت توصیه بر اساس وضعیت
     */
    getRecommendation(operation, rate, stats) {
        const threshold = this.thresholds[operation] || this.thresholds.info;

        // اگر اخیراً flood wait داشتیم
        if (stats.lastFloodWait && Date.now() - stats.lastFloodWait < 300000) {
            return {
                action: 'REDUCE',
                suggestedRate: Math.floor(threshold.safe * 0.7),
                reason: 'Recent flood wait detected',
                waitBeforeIncrease: Math.ceil((300000 - (Date.now() - stats.lastFloodWait)) / 1000)
            };
        }

        // اگر در محدوده ایمن هستیم
        if (rate <= threshold.safe) {
            return {
                action: 'MAINTAIN',
                suggestedRate: rate,
                reason: 'Operating within safe limits',
                canIncrease: true,
                maxSafeRate: threshold.safe
            };
        }

        // اگر در محدوده هشدار هستیم
        if (rate <= threshold.warning) {
            return {
                action: 'CAUTION',
                suggestedRate: threshold.safe,
                reason: 'Approaching limits',
                canIncrease: false,
                recommendedDelay: 1000 // 1 ثانیه تاخیر بین درخواست‌ها
            };
        }

        // اگر در وضعیت بحرانی هستیم
        return {
            action: 'STOP',
            suggestedRate: Math.floor(threshold.safe * 0.5),
            reason: 'Critical rate - high risk of flood wait',
            mustWait: true,
            recommendedWait: 5000 // 5 ثانیه صبر
        };
    }

    /**
     * دریافت محدودیت پیشنهادی برای عملیات
     */
    getSuggestedLimit(operation, sessionName = null) {
        const key = sessionName ? `${operation}_${sessionName}` : operation;
        const stats = this.operationStats.get(key);

        if (!stats) {
            // هیچ آماری نداریم، محدودیت ایمن
            return this.thresholds[operation]?.safe || 10;
        }

        const recommendation = this.getRecommendation(
            operation,
            stats.operations.length,
            stats
        );

        return recommendation.suggestedRate;
    }

    /**
     * آیا می‌توانیم عملیات را انجام دهیم؟
     */
    canPerformOperation(operation, sessionName) {
        const key = `${operation}_${sessionName}`;
        const stats = this.operationStats.get(key);

        if (!stats) {
            return { allowed: true, reason: 'No history' };
        }

        const rate = stats.operations.length;
        const health = this.checkHealth(operation, rate);
        const recommendation = this.getRecommendation(operation, rate, stats);

        if (recommendation.action === 'STOP') {
            return {
                allowed: false,
                reason: recommendation.reason,
                waitTime: recommendation.recommendedWait
            };
        }

        if (recommendation.action === 'REDUCE' && rate > recommendation.suggestedRate) {
            return {
                allowed: false,
                reason: 'Rate limit reduction in effect',
                waitTime: recommendation.waitBeforeIncrease * 1000
            };
        }

        return {
            allowed: true,
            reason: 'Within limits',
            health,
            currentRate: rate,
            maxRate: this.thresholds[operation]?.warning || 10
        };
    }

    /**
     * شروع مانیتورینگ دوره‌ای
     */
    startMonitoring() {
        // پاکسازی آمار قدیمی هر دقیقه
        setInterval(() => {
            this.cleanup();
        }, 60000);

        // گزارش وضعیت هر 5 دقیقه
        setInterval(() => {
            this.reportStatus();
        }, 300000);
    }

    /**
     * پاکسازی داده‌های قدیمی
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 3600000; // 1 ساعت
        let removed = 0;

        // پاکسازی آمار عملیات
        for (const [key, stats] of this.operationStats) {
            stats.operations = stats.operations.filter(op =>
                now - op.timestamp < maxAge
            );

            if (stats.operations.length === 0 &&
                (!stats.lastFloodWait || now - stats.lastFloodWait > maxAge)) {
                this.operationStats.delete(key);
                removed++;
            }
        }

        // پاکسازی تاریخچه flood wait
        for (const [session, history] of this.floodWaitHistory) {
            const filtered = history.filter(h => now - h.timestamp < maxAge);
            if (filtered.length === 0) {
                this.floodWaitHistory.delete(session);
                removed++;
            } else {
                this.floodWaitHistory.set(session, filtered);
            }
        }

        // پاکسازی sessionHealth (THIS WAS MISSING!)
        for (const [session, health] of this.sessionHealth) {
            // حذف سشن‌هایی که بیش از 1 ساعت فعالیتی نداشته‌اند
            if (now - health.lastUpdate > maxAge) {
                this.sessionHealth.delete(session);
                removed++;
            }
        }

        if (removed > 0) {
            logger.debug(`SmartRateMonitor cleanup: removed ${removed} old entries. Stats: ${this.operationStats.size} ops, ${this.sessionHealth.size} sessions, ${this.floodWaitHistory.size} flood waits`);
        }

        // Enforce maximum sizes to prevent unbounded growth
        if (this.operationStats.size > 500) {
            const toRemove = this.operationStats.size - 500;
            const keys = Array.from(this.operationStats.keys()).slice(0, toRemove);
            keys.forEach(key => this.operationStats.delete(key));
            logger.warn(`SmartRateMonitor: Removed ${toRemove} oldest operation stats (exceeded 500 limit)`);
        }

        if (this.sessionHealth.size > 100) {
            const toRemove = this.sessionHealth.size - 100;
            const keys = Array.from(this.sessionHealth.keys()).slice(0, toRemove);
            keys.forEach(key => this.sessionHealth.delete(key));
            logger.warn(`SmartRateMonitor: Removed ${toRemove} oldest session health entries (exceeded 100 limit)`);
        }

        if (this.floodWaitHistory.size > 100) {
            const toRemove = this.floodWaitHistory.size - 100;
            const keys = Array.from(this.floodWaitHistory.keys()).slice(0, toRemove);
            keys.forEach(key => this.floodWaitHistory.delete(key));
            logger.warn(`SmartRateMonitor: Removed ${toRemove} oldest flood wait histories (exceeded 100 limit)`);
        }
    }

    /**
     * گزارش وضعیت
     */
    reportStatus() {
        const report = {
            timestamp: new Date().toISOString(),
            sessions: {},
            operations: {},
            floodWaits: 0
        };

        // جمع‌آوری آمار سشن‌ها
        for (const [session, health] of this.sessionHealth) {
            report.sessions[session] = {
                health: health.overallHealth,
                operations: health.operations
            };
        }

        // جمع‌آوری آمار عملیات
        for (const [key, stats] of this.operationStats) {
            const [operation] = key.split('_');
            if (!report.operations[operation]) {
                report.operations[operation] = {
                    totalRequests: 0,
                    sessions: []
                };
            }
            report.operations[operation].totalRequests += stats.operations.length;
        }

        // شمارش flood wait ها
        for (const history of this.floodWaitHistory.values()) {
            report.floodWaits += history.length;
        }

        logger.info('📊 Rate Monitor Report:', report);

        return report;
    }

    /**
     * دریافت آمار
     */
    getStats() {
        return {
            sessionHealth: Object.fromEntries(this.sessionHealth),
            operationStats: Object.fromEntries(
                Array.from(this.operationStats.entries()).map(([k, v]) => [
                    k,
                    {
                        rate: v.operations.length,
                        floodWaits: v.floodWaits,
                        lastFloodWait: v.lastFloodWait
                    }
                ])
            ),
            floodWaitHistory: Object.fromEntries(this.floodWaitHistory),
            recommendations: this.getAllRecommendations()
        };
    }

    /**
     * دریافت تمام توصیه‌ها
     */
    getAllRecommendations() {
        const recommendations = {};

        for (const [key, stats] of this.operationStats) {
            const [operation, session] = key.split('_');
            const rate = stats.operations.length;
            const rec = this.getRecommendation(operation, rate, stats);

            if (!recommendations[session]) {
                recommendations[session] = {};
            }
            recommendations[session][operation] = rec;
        }

        return recommendations;
    }
}

// Singleton instance
export const rateMonitor = new SmartRateMonitor();
export default rateMonitor;
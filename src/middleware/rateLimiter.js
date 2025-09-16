import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import { rateMonitor } from './smartRateMonitor.js';

/**
 * Rate limit configurations - بهینه‌سازی شده برای عملیات مختلف
 */
const RATE_LIMIT_CONFIGS = {
    join: {
        windowMs: 60 * 1000,
        max: 5, // محدودیت سخت تلگرام
        message: 'Too many join requests. Telegram limits joining to 5 channels per minute.',
        telegramLimit: true,
        burstAllowed: false
    },
    leave: {
        windowMs: 60 * 1000,
        max: 20, // افزایش از 10 به 20
        message: 'Too many leave requests. Please wait before leaving more channels.',
        telegramLimit: false,
        burstAllowed: true
    },
    info: {
        windowMs: 60 * 1000,
        max: 120, // افزایش از 60 به 120 (2 در ثانیه)
        message: 'Too many info requests. Please slow down.',
        telegramLimit: false,
        burstAllowed: true,
        skipFloodCheck: true
    },
    list: {
        windowMs: 60 * 1000,
        max: 60, // افزایش از 20 به 60
        message: 'Too many list requests. Please wait a moment.',
        telegramLimit: false,
        burstAllowed: true,
        skipFloodCheck: true // read-only operation
    },
    cleanup: {
        windowMs: 60 * 60 * 1000,
        max: 5, // افزایش از 2 به 5 در ساعت
        message: 'Cleanup can only be performed 5 times per hour.',
        telegramLimit: false,
        burstAllowed: false
    },
    analyze: {
        windowMs: 60 * 1000,
        max: 60, // افزایش از 30 به 60
        message: 'Too many analyze requests. Please wait.',
        telegramLimit: false,
        burstAllowed: true
    },
    status: {
        windowMs: 60 * 1000,
        max: 300, // افزایش از 120 به 300 (5 در ثانیه)
        message: 'Too many status requests.',
        telegramLimit: false,
        burstAllowed: true,
        skipFloodCheck: true
    },
    default: {
        windowMs: 60 * 1000,
        max: 100, // افزایش از 60 به 100
        message: 'Too many requests. Please slow down.',
        telegramLimit: false,
        burstAllowed: true
    }
};

// Memory store با مدیریت بهتر حافظه
class OptimizedMemoryStore {
    constructor(maxSize = 500) { // کاهش از 1000 به 500
        this.store = new Map();
        this.maxSize = maxSize;
        this.lastCleanup = Date.now();

        // پاکسازی هر 30 ثانیه
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 30000);
    }

    cleanup() {
        const now = Date.now();
        let deleted = 0;

        // حذف رکوردهای منقضی شده
        for (const [key, value] of this.store.entries()) {
            if (value.resetTime && value.resetTime < now) {
                this.store.delete(key);
                deleted++;
            }
        }

        // اگر هنوز بیش از 80% ظرفیت پر است
        if (this.store.size > this.maxSize * 0.8) {
            // حذف قدیمی‌ترین رکوردها
            const entries = Array.from(this.store.entries())
                .sort((a, b) => a[1].resetTime - b[1].resetTime);

            const toDelete = Math.floor(this.store.size * 0.3); // حذف 30%
            for (let i = 0; i < toDelete; i++) {
                this.store.delete(entries[i][0]);
                deleted++;
            }
        }

        if (deleted > 0) {
            logger.debug(`Rate limiter cleaned up ${deleted} entries`);
        }

        this.lastCleanup = now;
    }

    get(key) {
        const now = Date.now();
        const record = this.store.get(key);

        if (record && record.resetTime < now) {
            this.store.delete(key);
            return null;
        }

        return record;
    }

    set(key, value) {
        // بررسی ظرفیت قبل از اضافه کردن
        if (this.store.size >= this.maxSize) {
            // پاکسازی اضطراری
            this.cleanup();

            // اگر هنوز جا نیست، قدیمی‌ترین را حذف کن
            if (this.store.size >= this.maxSize) {
                const firstKey = this.store.keys().next().value;
                this.store.delete(firstKey);
            }
        }

        this.store.set(key, value);
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.store.clear();
    }
}

const memoryStore = new OptimizedMemoryStore(500);

// پاکسازی در هنگام خاموش شدن
process.on('SIGINT', () => {
    memoryStore.destroy();
});

/**
 * Dynamic rate limiter based on session health and operation type
 */
const getDynamicLimit = (baseLimit, operation, req) => {
    // برای عملیات read-only محدودیت بیشتر
    const readOnlyMultiplier = {
        'info': 2,
        'list': 2,
        'status': 3
    };

    if (readOnlyMultiplier[operation]) {
        return baseLimit * readOnlyMultiplier[operation];
    }

    // برای join حداکثر 5 (محدودیت تلگرام)
    if (operation === 'join') {
        return Math.min(baseLimit, 5);
    }

    // برای master key محدودیت بیشتر
    if (req.validatedApiKey?.isMaster) {
        return baseLimit * 2;
    }

    return baseLimit;
};

/**
 * Create rate limiter middleware with smart limits
 */
export const createRateLimiter = (operation = 'default') => {
    const rateLimitConfig = RATE_LIMIT_CONFIGS[operation] || RATE_LIMIT_CONFIGS.default;

    return rateLimit({
        windowMs: rateLimitConfig.windowMs,
        max: (req, res) => {
            return getDynamicLimit(rateLimitConfig.max, operation, req);
        },
        message: rateLimitConfig.message,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: rateLimitConfig.burstAllowed || false,
        skipFailedRequests: rateLimitConfig.skipFloodCheck || false,

        store: {
            incr: (key, callback) => {
                const now = Date.now();
                let record = memoryStore.get(key);

                if (!record) {
                    record = {
                        count: 0,
                        resetTime: now + rateLimitConfig.windowMs
                    };
                }

                record.count++;
                memoryStore.set(key, record);

                callback(null, record.count, new Date(record.resetTime));
            },
            decrement: (key) => {
                const record = memoryStore.get(key);
                if (record && record.count > 0) {
                    record.count--;
                    memoryStore.set(key, record);
                }
            },
            resetKey: (key) => {
                memoryStore.store.delete(key);
            }
        },

        keyGenerator: (req) => {
            const apiKey = req.headers['x-api-key'];
            if (apiKey) {
                return `api_${apiKey.substring(0, 8)}_${operation}`;
            }
            const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
            return `ip_${ip}_${operation}`;
        },

        handler: (req, res) => {
            const identifier = req.headers['x-api-key'] ?
                `API key ${req.headers['x-api-key'].substring(0, 8)}...` :
                `IP ${req.ip}`;

            logger.warn(`Rate limit exceeded for ${identifier} on operation: ${operation}`);

            // ثبت در مانیتور
            if (rateMonitor) {
                const sessionName = req.body?.sessionName || 'unknown';
                rateMonitor.recordOperation(operation, sessionName, false, 'RATE_LIMIT_EXCEEDED');
            }

            const resetTime = new Date(Date.now() + rateLimitConfig.windowMs);
            const recommendation = rateMonitor?.getSuggestedLimit(operation) || rateLimitConfig.max;

            res.status(429).json({
                success: false,
                error: rateLimitConfig.message,
                retryAfter: Math.ceil(rateLimitConfig.windowMs / 1000),
                limit: rateLimitConfig.max,
                suggestedLimit: recommendation,
                operation: operation,
                resetTime: resetTime.toISOString(),
                tip: operation === 'info' || operation === 'list' || operation === 'status' ?
                    `This is a read-only operation with higher limits (${rateLimitConfig.max}/min)` :
                    operation === 'join' ?
                        'Join operations are limited by Telegram to 5 per minute maximum' :
                        'Consider spacing out your requests to avoid hitting limits'
            });
        },

        skip: (req) => {
            // Skip برای health checks
            if (req.path === '/health' || req.path === '/' || req.path === '/metrics') {
                return true;
            }
            // Skip برای static files
            if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
                return true;
            }
            return false;
        }
    });
};

/**
 * Global rate limiter - محدودیت‌های منطقی‌تر
 */
export const globalRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200, // افزایش از 100 به 200
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: true,

    store: {
        incr: (key, callback) => {
            const now = Date.now();
            let record = memoryStore.get(key);

            if (!record) {
                record = {
                    count: 0,
                    resetTime: now + 60000
                };
            }

            record.count++;
            memoryStore.set(key, record);

            callback(null, record.count, new Date(record.resetTime));
        },
        decrement: (key) => {
            const record = memoryStore.get(key);
            if (record && record.count > 0) {
                record.count--;
                memoryStore.set(key, record);
            }
        },
        resetKey: (key) => {
            memoryStore.store.delete(key);
        }
    },

    keyGenerator: (req) => {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
        return `global_${ip}`;
    },

    handler: (req, res) => {
        logger.warn(`Global rate limit exceeded for IP: ${req.ip}`);

        res.status(429).json({
            success: false,
            error: 'Too many requests, please try again later',
            retryAfter: 60,
            resetTime: new Date(Date.now() + 60000).toISOString()
        });
    },

    skip: (req) => {
        return req.path === '/health' ||
            req.path === '/metrics' ||
            req.path.includes('/static/') ||
            req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/);
    }
});

export const rateLimiters = {
    join: createRateLimiter('join'),
    leave: createRateLimiter('leave'),
    info: createRateLimiter('info'),
    list: createRateLimiter('list'),
    cleanup: createRateLimiter('cleanup'),
    analyze: createRateLimiter('analyze'),
    status: createRateLimiter('status')
};

export const getRateLimitStatus = async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const identifier = apiKey ? `API Key: ${apiKey.substring(0, 8)}...` : `IP: ${req.ip}`;

    const status = {
        client: identifier,
        limits: {},
        storeSize: memoryStore.store.size,
        maxStoreSize: memoryStore.maxSize,
        lastCleanup: new Date(memoryStore.lastCleanup).toISOString(),
        currentTime: new Date().toISOString()
    };

    for (const [operation, config] of Object.entries(RATE_LIMIT_CONFIGS)) {
        status.limits[operation] = {
            requests: config.max,
            window: `${config.windowMs / 1000} seconds`,
            windowMs: config.windowMs,
            burstAllowed: config.burstAllowed || false,
            isReadOnly: config.skipFloodCheck || false
        };
    }

    res.json({
        success: true,
        data: status
    });
};

export const resetRateLimit = async (req, res) => {
    const { key } = req.body;

    if (!req.validatedApiKey?.isMaster) {
        return res.status(403).json({
            success: false,
            error: 'Only master key can reset rate limits'
        });
    }

    if (key) {
        memoryStore.store.delete(key);
        logger.info(`Rate limit reset for key: ${key}`);
    } else {
        memoryStore.store.clear();
        logger.info('All rate limits reset');
    }

    res.json({
        success: true,
        message: `Rate limits reset for ${key || 'all keys'}`
    });
};

export default {
    createRateLimiter,
    globalRateLimiter,
    rateLimiters,
    getRateLimitStatus,
    resetRateLimit,
    RATE_LIMIT_CONFIGS,
    rateMonitor
};
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * Enhanced Monitoring Service با مدیریت بهینه حافظه
 */
export class EnhancedMonitoring extends EventEmitter {
    constructor(telegramManager, notifier, healthChecker) {
        super();
        this.telegramManager = telegramManager;
        this.notifier = notifier;
        this.healthChecker = healthChecker;

        // محدودیت‌های سخت‌گیرانه برای حافظه
        this.config = {
            maxMetricsSize: 50,           // کاهش از 100 به 50
            maxErrorsSize: 25,             // حداکثر 25 خطا
            maxOperationsSize: 100,        // حداکثر 100 عملیات
            cleanupInterval: 30000,        // هر 30 ثانیه پاکسازی
            dataRetentionMs: 1800000,      // نگهداری فقط 30 دقیقه (به جای 1 ساعت)
            enableCompression: true        // فشرده‌سازی داده‌ها
        };

        // ساختار داده بهینه با circular buffer
        this.metrics = {
            operations: new CircularBuffer(this.config.maxOperationsSize),
            errors: new CircularBuffer(this.config.maxErrorsSize),
            capacity: new CircularBuffer(this.config.maxMetricsSize)
        };

        // آمار خلاصه (به جای نگهداری همه داده‌ها)
        this.summary = {
            totalOperations: 0,
            totalErrors: 0,
            lastReset: Date.now()
        };

        this.isRunning = false;
        this.intervals = [];

        // محدود کردن event listeners
        this.setMaxListeners(3);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        // فقط یک interval اصلی
        const mainInterval = setInterval(() => {
            this.collectAndClean();
        }, this.config.cleanupInterval);

        this.intervals.push(mainInterval);

        // Garbage collection hint هر 5 دقیقه
        const gcInterval = setInterval(() => {
            if (global.gc) {
                global.gc();
                logger.debug('Manual garbage collection triggered');
            }
        }, 300000);

        this.intervals.push(gcInterval);

        logger.info('📊 Enhanced Monitoring started with optimized memory management');
    }

    stop() {
        this.isRunning = false;

        // پاکسازی تمام intervals
        this.intervals.forEach(interval => clearInterval(interval));
        this.intervals = [];

        // پاکسازی کامل داده‌ها
        this.metrics.operations.clear();
        this.metrics.errors.clear();
        this.metrics.capacity.clear();

        // حذف تمام listeners
        this.removeAllListeners();

        logger.info('📊 Monitoring stopped and memory cleared');
    }

    async collectAndClean() {
        try {
            // جمع‌آوری متریک‌ها
            await this.collectMetrics();

            // پاکسازی داده‌های قدیمی
            this.cleanup();

            // بررسی حافظه
            this.checkMemoryUsage();

        } catch (error) {
            logger.error('Error in collect and clean cycle:', error);
        }
    }

    async collectMetrics() {
        const timestamp = Date.now();

        try {
            const stats = await this.telegramManager.getCapacityStats();

            // فقط داده‌های ضروری را ذخیره کن
            const compactData = {
                t: timestamp, // کوتاه‌سازی نام فیلدها
                u: stats.total.used,
                m: stats.total.max,
                p: stats.total.percentage
            };

            this.metrics.capacity.add(compactData);

            // ارسال event با داده خلاصه
            this.emit('metricsCollected', {
                timestamp,
                summary: {
                    usage: stats.total.percentage,
                    sessions: stats.sessions?.length || 0
                }
            });

        } catch (error) {
            logger.error('Error collecting metrics:', error);
        }
    }

    recordOperation(type, success, duration) {
        // فقط داده‌های ضروری
        const operation = {
            t: Date.now(),  // timestamp
            o: type.substring(0, 1), // فقط اولین حرف نوع عملیات
            s: success ? 1 : 0, // boolean to number
            d: Math.round(duration) // گرد کردن duration
        };

        this.metrics.operations.add(operation);
        this.summary.totalOperations++;

        if (!success) {
            this.metrics.errors.add(operation);
            this.summary.totalErrors++;
        }
    }

    cleanup() {
        const cutoff = Date.now() - this.config.dataRetentionMs;

        // پاکسازی داده‌های قدیمی
        this.metrics.operations.removeOldItems(item => item.t < cutoff);
        this.metrics.errors.removeOldItems(item => item.t < cutoff);
        this.metrics.capacity.removeOldItems(item => item.t < cutoff);

        // ریست آمار خلاصه هر 24 ساعت
        if (Date.now() - this.summary.lastReset > 86400000) {
            this.summary = {
                totalOperations: 0,
                totalErrors: 0,
                lastReset: Date.now()
            };
            logger.info('Summary stats reset after 24 hours');
        }
    }

    checkMemoryUsage() {
        const usage = process.memoryUsage();
        const heapUsedMB = usage.heapUsed / 1024 / 1024;
        const heapTotalMB = usage.heapTotal / 1024 / 1024;
        const percentage = (usage.heapUsed / usage.heapTotal) * 100;

        // اگر حافظه بیش از 80% است، پاکسازی اضطراری
        if (percentage > 80) {
            logger.warn(`High memory usage detected: ${percentage.toFixed(2)}%`);
            this.emergencyCleanup();
        }

        // لاگ کردن فقط در صورت نیاز
        if (percentage > 70) {
            logger.info(`Memory usage: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB (${percentage.toFixed(2)}%)`);
        }
    }

    emergencyCleanup() {
        logger.warn('Emergency cleanup triggered');

        // حذف نیمی از داده‌ها
        this.metrics.operations.reduceToHalf();
        this.metrics.errors.reduceToHalf();
        this.metrics.capacity.reduceToHalf();

        // Garbage collection
        if (global.gc) {
            global.gc();
        }
    }

    getStats() {
        // برگرداندن فقط آمار خلاصه، نه همه داده‌ها
        return {
            summary: this.summary,
            current: {
                operations: this.metrics.operations.size(),
                errors: this.metrics.errors.size(),
                capacity: this.metrics.capacity.size()
            },
            lastCapacity: this.metrics.capacity.getLast(),
            memoryUsage: this.getMemoryStats()
        };
    }

    getMemoryStats() {
        const usage = process.memoryUsage();
        return {
            heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
            rssMB: Math.round(usage.rss / 1024 / 1024),
            percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100)
        };
    }

    getPrometheusMetrics() {
        const stats = this.getStats();
        const memory = stats.memoryUsage;

        return `
# HELP operations_total Total operations
operations_total ${stats.summary.totalOperations}

# HELP errors_total Total errors  
errors_total ${stats.summary.totalErrors}

# HELP capacity_percentage Current capacity usage
capacity_percentage ${stats.lastCapacity?.p || 0}

# HELP memory_heap_used_mb Memory heap used in MB
memory_heap_used_mb ${memory.heapUsedMB}

# HELP memory_percentage Memory usage percentage
memory_percentage ${memory.percentage}
`.trim();
    }
}

/**
 * Circular Buffer implementation برای مدیریت بهتر حافظه
 */
class CircularBuffer {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.buffer = [];
        this.pointer = 0;
    }

    add(item) {
        if (this.buffer.length < this.maxSize) {
            this.buffer.push(item);
        } else {
            this.buffer[this.pointer] = item;
            this.pointer = (this.pointer + 1) % this.maxSize;
        }
    }

    removeOldItems(predicate) {
        this.buffer = this.buffer.filter(item => !predicate(item));
        this.pointer = this.buffer.length % this.maxSize;
    }

    reduceToHalf() {
        const halfSize = Math.floor(this.buffer.length / 2);
        this.buffer = this.buffer.slice(-halfSize);
        this.pointer = this.buffer.length % this.maxSize;
    }

    getLast() {
        if (this.buffer.length === 0) return null;
        const lastIndex = this.pointer > 0 ? this.pointer - 1 : this.buffer.length - 1;
        return this.buffer[lastIndex];
    }

    getAll() {
        return [...this.buffer];
    }

    size() {
        return this.buffer.length;
    }

    clear() {
        this.buffer = [];
        this.pointer = 0;
    }
}

export default EnhancedMonitoring;
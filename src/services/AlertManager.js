import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

export class AlertManager extends EventEmitter {
    constructor(database, notifier) {
        super();
        this.database = database;
        this.notifier = notifier;
        this.alerts = new Map();
        this.config = {
            capacityThreshold: 80,
            errorThreshold: 10,
            responseTimeThreshold: 1000,
            checkInterval: 60000 // 1 minute
        };
        this.checkInterval = null;
    }

    start() {
        this.loadConfig();
        this.checkInterval = setInterval(() => {
            this.checkAlerts();
        }, this.config.checkInterval);

        logger.info('📢 Alert Manager started');
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        logger.info('📢 Alert Manager stopped');
    }

    async loadConfig() {
        try {
            const config = await this.database.getAlertConfig();
            if (config) {
                this.config = { ...this.config, ...config };
            }
        } catch (error) {
            logger.error('Failed to load alert config:', error);
        }
    }

    async checkAlerts() {
        const checks = [
            this.checkCapacity(),
            this.checkErrors(),
            this.checkResponseTime(),
            this.checkSessionHealth(),
            this.checkFloodWait()
        ];

        const results = await Promise.allSettled(checks);

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                await this.triggerAlert(result.value);
            }
        }
    }

    async checkCapacity() {
        try {
            const stats = await this.database.getCapacityStats();
            const usage = (stats.used / stats.total) * 100;

            if (usage > this.config.capacityThreshold) {
                return {
                    level: usage > 90 ? 'critical' : 'warning',
                    type: 'capacity',
                    title: 'ظرفیت بالا',
                    message: `استفاده از ظرفیت به ${usage.toFixed(2)}% رسیده است`,
                    value: usage,
                    threshold: this.config.capacityThreshold,
                    action: 'cleanup_channels'
                };
            }
        } catch (error) {
            logger.error('Capacity check failed:', error);
        }

        return null;
    }

    async checkErrors() {
        try {
            const errorCount = await this.database.getRecentErrorCount(3600000); // Last hour

            if (errorCount > this.config.errorThreshold) {
                return {
                    level: errorCount > this.config.errorThreshold * 2 ? 'critical' : 'warning',
                    type: 'errors',
                    title: 'نرخ خطای بالا',
                    message: `${errorCount} خطا در ساعت گذشته`,
                    value: errorCount,
                    threshold: this.config.errorThreshold,
                    action: 'check_logs'
                };
            }
        } catch (error) {
            logger.error('Error check failed:', error);
        }

        return null;
    }

    async checkResponseTime() {
        try {
            const avgResponseTime = await this.database.getAverageResponseTime(3600000);

            if (avgResponseTime > this.config.responseTimeThreshold) {
                return {
                    level: 'warning',
                    type: 'performance',
                    title: 'کندی سیستم',
                    message: `میانگین زمان پاسخ: ${avgResponseTime}ms`,
                    value: avgResponseTime,
                    threshold: this.config.responseTimeThreshold,
                    action: 'optimize_performance'
                };
            }
        } catch (error) {
            logger.error('Response time check failed:', error);
        }

        return null;
    }

    async checkSessionHealth() {
        try {
            const unhealthySessions = await this.database.getUnhealthySessions();

            if (unhealthySessions.length > 0) {
                return {
                    level: 'warning',
                    type: 'session_health',
                    title: 'سشن‌های ناسالم',
                    message: `${unhealthySessions.length} سشن در وضعیت ناسالم`,
                    value: unhealthySessions,
                    action: 'reconnect_sessions'
                };
            }
        } catch (error) {
            logger.error('Session health check failed:', error);
        }

        return null;
    }

    async checkFloodWait() {
        try {
            const floodWaitSessions = await this.database.getFloodWaitSessions();

            if (floodWaitSessions.length > 0) {
                return {
                    level: 'warning',
                    type: 'flood_wait',
                    title: 'محدودیت Flood Wait',
                    message: `${floodWaitSessions.length} سشن در حالت انتظار`,
                    value: floodWaitSessions,
                    action: 'wait_or_switch'
                };
            }
        } catch (error) {
            logger.error('Flood wait check failed:', error);
        }

        return null;
    }

    async triggerAlert(alert) {
        const alertId = `${alert.type}_${Date.now()}`;

        // Check if similar alert already exists
        const existingAlert = Array.from(this.alerts.values()).find(
            a => a.type === alert.type && !a.acknowledged
        );

        if (existingAlert) {
            // Update existing alert
            existingAlert.count = (existingAlert.count || 1) + 1;
            existingAlert.lastOccurrence = new Date();
            return;
        }

        // Create new alert
        alert.id = alertId;
        alert.timestamp = new Date();
        alert.acknowledged = false;
        alert.count = 1;

        this.alerts.set(alertId, alert);

        // Save to database
        if (this.database?.isConnected) {
            await this.database.saveAlert(alert);
        }

        // Send notification
        if (this.notifier?.isConnected) {
            const emoji = {
                critical: '🚨',
                warning: '⚠️',
                info: 'ℹ️'
            }[alert.level] || '📢';

            const message = `${emoji} **${alert.title}**\n\n${alert.message}\n\nپیشنهاد: ${this.getActionText(alert.action)}`;

            await this.notifier.sendNotification(message, alert.level);
        }

        // Emit event
        this.emit('alert', alert);

        logger.warn(`Alert triggered: ${alert.title}`);
    }

    getActionText(action) {
        const actions = {
            'cleanup_channels': 'پاکسازی کانال‌های غیرفعال',
            'check_logs': 'بررسی لاگ‌های خطا',
            'optimize_performance': 'اجرای بهینه‌سازی عملکرد',
            'reconnect_sessions': 'اتصال مجدد سشن‌ها',
            'wait_or_switch': 'صبر یا تغییر به سشن دیگر'
        };

        return actions[action] || action;
    }

    async acknowledgeAlert(alertId) {
        const alert = this.alerts.get(alertId);

        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = new Date();

            if (this.database?.isConnected) {
                await this.database.acknowledgeAlert(alertId);
            }

            return true;
        }

        return false;
    }

    async getActiveAlerts() {
        return Array.from(this.alerts.values())
            .filter(alert => !alert.acknowledged)
            .sort((a, b) => {
                const priority = { critical: 0, warning: 1, info: 2 };
                return priority[a.level] - priority[b.level];
            });
    }

    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };

        if (this.database?.isConnected) {
            await this.database.saveAlertConfig(this.config);
        }

        logger.info('Alert configuration updated');
    }
}

export default AlertManager;
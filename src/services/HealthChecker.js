import logger from '../utils/logger.js';

class HealthChecker {
    constructor(telegramManager, database, notifier) {
        this.telegramManager = telegramManager;
        this.database = database;
        this.notifier = notifier;
        this.interval = null;
        this.lastCheck = null;
        this.issues = [];
    }

    start(intervalMs = 60000) {
        logger.info(`Starting health checker with ${intervalMs}ms interval`);

        // Initial check
        this.check();

        // Schedule periodic checks
        this.interval = setInterval(() => {
            this.check();
        }, intervalMs);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            logger.info('Health checker stopped');
        }
    }

    async check() {
        try {
            const health = {
                timestamp: new Date(),
                status: 'healthy',
                services: {},
                issues: []
            };

            // Check database
            health.services.database = await this.checkDatabase();

            // Check Telegram sessions
            health.services.telegram = await this.checkTelegramSessions();

            // Check memory usage
            health.services.memory = this.checkMemory();

            // Check disk space (if needed)
            health.services.disk = await this.checkDiskSpace();

            // Determine overall health
            if (health.services.database.status === 'down' ||
                health.services.telegram.connectedSessions === 0) {
                health.status = 'critical';
            } else if (health.services.memory.usage > 80 ||
                health.services.telegram.healthySessions < health.services.telegram.totalSessions / 2) {
                health.status = 'degraded';
            }

            // Send alerts if needed
            await this.handleHealthStatus(health);

            this.lastCheck = health;
            return health;

        } catch (error) {
            logger.error('Health check failed:', error);
            return {
                timestamp: new Date(),
                status: 'critical',
                error: error.message
            };
        }
    }

    async checkDatabase() {
        try {
            if (!this.database.isConnected) {
                return { status: 'down', connected: false };
            }

            // Test query
            const [result] = await this.database.pool.execute('SELECT 1');

            return {
                status: 'up',
                connected: true,
                responseTime: Date.now() - Date.now()
            };
        } catch (error) {
            logger.error('Database health check failed:', error);
            return {
                status: 'down',
                connected: false,
                error: error.message
            };
        }
    }

    async checkTelegramSessions() {
        const sessions = this.telegramManager.sessions;
        const stats = {
            totalSessions: sessions.length,
            connectedSessions: 0,
            healthySessions: 0,
            criticalSessions: [],
            warningsSessions: []
        };

        for (const session of sessions) {
            if (session.isConnected) {
                stats.connectedSessions++;

                if (session.healthStatus === 'healthy') {
                    stats.healthySessions++;
                } else if (session.healthStatus === 'critical') {
                    stats.criticalSessions.push(session.name);
                } else if (session.healthStatus === 'warning') {
                    stats.warningsSessions.push(session.name);
                }
            }
        }

        return stats;
    }

    checkMemory() {
        const used = process.memoryUsage();
        const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
        const rssMB = Math.round(used.rss / 1024 / 1024);

        const usage = Math.round((used.heapUsed / used.heapTotal) * 100);

        return {
            heapUsed: heapUsedMB,
            heapTotal: heapTotalMB,
            rss: rssMB,
            usage: usage,
            status: usage > 90 ? 'critical' : usage > 70 ? 'warning' : 'healthy'
        };
    }

    async checkDiskSpace() {
        // This is platform specific, simplified version
        try {
            // You can implement disk space check here if needed
            return {
                status: 'healthy',
                available: 'N/A'
            };
        } catch (error) {
            return {
                status: 'unknown',
                error: error.message
            };
        }
    }

    async handleHealthStatus(health) {
        // Check for critical issues
        const criticalIssues = [];
        const warnings = [];

        if (health.services.database.status === 'down') {
            criticalIssues.push('Database is down');
        }

        if (health.services.telegram.connectedSessions === 0) {
            criticalIssues.push('No Telegram sessions connected');
        }

        if (health.services.memory.usage > 90) {
            criticalIssues.push(`Memory usage critical: ${health.services.memory.usage}%`);
        }

        if (health.services.telegram.criticalSessions.length > 0) {
            warnings.push(`Critical sessions: ${health.services.telegram.criticalSessions.join(', ')}`);
        }

        // Send notifications
        if (criticalIssues.length > 0 && this.notifier) {
            const message = `🚨 **Critical Health Issues**\n\n${criticalIssues.join('\n')}`;
            await this.notifier.sendNotification(message, 'critical');
        }

        if (warnings.length > 0 && this.notifier) {
            const message = `⚠️ **Health Warnings**\n\n${warnings.join('\n')}`;
            await this.notifier.sendNotification(message, 'warning');
        }
    }

    getStatus() {
        return this.lastCheck || {
            timestamp: new Date(),
            status: 'unknown',
            message: 'No health check performed yet'
        };
    }

    async getDetailedReport() {
        const health = await this.check();

        return {
            ...health,
            recommendations: this.getRecommendations(health),
            history: this.issues.slice(-10) // Last 10 issues
        };
    }

    getRecommendations(health) {
        const recommendations = [];

        if (health.services.memory.usage > 70) {
            recommendations.push('Consider restarting the application to free memory');
        }

        if (health.services.telegram.connectedSessions < health.services.telegram.totalSessions) {
            recommendations.push('Some sessions are disconnected, check session health');
        }

        if (health.services.database.responseTime > 1000) {
            recommendations.push('Database response time is slow, check database performance');
        }

        return recommendations;
    }
}

export { HealthChecker };
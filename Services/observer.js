require('dotenv').config({ path: '../.env' });
const Application = require('../src/Core/Application');

// Load configuration from environment variables
const config = {
    apiId: parseInt(process.env.API_ID),
    apiHash: process.env.API_HASH,
    sessionPath: process.env.SESSION_PATH,
    adminUsername: process.env.ADMIN_USERNAME,
    database: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT_WRITE),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    },
    logLevel: process.env.LOG_LEVEL || 'ERROR'
};

class Observer {
    constructor(config) {
        this.config = config;
        this.app = null;
        this.isRunning = false;
        this.isRestarting = false;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 5;
        this.shutdownInProgress = false;
        this.healthCheckFailures = 0;
        this.maxHealthCheckFailures = 3;

        // Performance monitoring
        this.startTime = Date.now();
        this.lastHealthCheckTime = Date.now();
    }

    static async startAndLoop(sessionPath, config) {
        const observer = new Observer(config);
        await observer.start();

        // Keep the process running
        process.stdin.resume();
    }

    async start() {
        // Prevent multiple starts
        if (this.isRunning) {
            console.log('Observer already running');
            return;
        }

        console.log('=====================================');
        console.log('Starting Observer...');
        console.log(`Session: ${this.config.sessionPath}`);
        console.log(`API ID: ${this.config.apiId}`);
        console.log(`Admin: ${this.config.adminUsername}`);
        console.log('=====================================\n');

        try {
            // Reset counters on successful start
            this.restartAttempts = 0;
            this.healthCheckFailures = 0;

            // Create and start Application
            this.app = new Application();

            // Run the application
            await this.app.run();

            this.isRunning = true;
            this.startTime = Date.now();

            // Setup monitoring
            this.setupMonitoring();

            // Setup signal handlers (only once)
            if (!this.shutdownInProgress) {
                this.setupSignalHandlers();
            }

            console.log('Observer is running successfully\n');

        } catch (error) {
            console.error('ERROR: Failed to start Observer:', error.message);
            await this.handleError(error);
        }
    }

    setupMonitoring() {
        // Clear existing intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }

        // Health check every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            if (!this.isRunning || this.shutdownInProgress || this.isRestarting) return;

            try {
                await this.healthCheck();
                this.healthCheckFailures = 0; // Reset on success
            } catch (error) {
                this.healthCheckFailures++;
                console.error(`ERROR: Health check failed (${this.healthCheckFailures}/${this.maxHealthCheckFailures}):`, error.message);

                if (this.healthCheckFailures >= this.maxHealthCheckFailures) {
                    await this.restart();
                }
            }
        }, 30000);

        // Status log every 5 minutes
        this.statusInterval = setInterval(() => {
            if (!this.isRunning || this.shutdownInProgress) return;

            const uptime = process.uptime();
            const memory = process.memoryUsage();
            const observerUptime = Math.floor((Date.now() - this.startTime) / 1000);

            console.log('=====================================');
            console.log('Observer Status:');
            console.log(`• Process Uptime: ${Math.floor(uptime / 60)} minutes`);
            console.log(`• Observer Uptime: ${Math.floor(observerUptime / 60)} minutes`);
            console.log(`• Memory: ${Math.round(memory.heapUsed / 1024 / 1024)} MB / ${Math.round(memory.heapTotal / 1024 / 1024)} MB`);
            console.log(`• RSS Memory: ${Math.round(memory.rss / 1024 / 1024)} MB`);
            console.log(`• Restart Attempts: ${this.restartAttempts}`);
            console.log(`• Health Check Failures: ${this.healthCheckFailures}`);
            console.log(`• Time: ${new Date().toLocaleString()}`);
            console.log('=====================================\n');

            // Memory warning
            if (memory.heapUsed > 500 * 1024 * 1024) {
                console.warn('WARNING: High memory usage detected');
            }
        }, 5 * 60 * 1000);
    }

    async healthCheck() {
        if (!this.app) {
            throw new Error('Application not initialized');
        }

        const checks = [];

        // Check Telegram connection
        if (this.app.telegram && this.app.telegram.client) {
            try {
                const me = await this.app.telegram.getMe();
                if (!me) {
                    throw new Error('Telegram connection lost');
                }
                checks.push({ service: 'telegram', status: 'ok' });
            } catch (error) {
                checks.push({ service: 'telegram', status: 'error', error: error.message });
                throw new Error('Telegram health check failed');
            }
        }

        // Check Database connection
        if (this.app.database) {
            try {
                const isConnected = await this.app.database.ping();
                if (!isConnected) {
                    throw new Error('Database connection lost');
                }
                checks.push({ service: 'database', status: 'ok' });
            } catch (error) {
                checks.push({ service: 'database', status: 'error', error: error.message });
                // Don't throw for database - it's optional
                console.warn('Database health check failed:', error.message);
            }
        }

        // Check AdsFinder
        if (this.app.adsFinder && this.app.adsFinder.isRunning) {
            const stats = await this.app.adsFinder.getStats();
            checks.push({
                service: 'adsFinder',
                status: 'ok',
                stats: stats
            });
        }

        // Memory check
        const memory = process.memoryUsage();
        const maxHeap = 800 * 1024 * 1024; // 800MB warning threshold
        if (memory.heapUsed > maxHeap) {
            console.warn('WARNING: Memory usage exceeds threshold');
            checks.push({
                service: 'memory',
                status: 'warning',
                usage: Math.round(memory.heapUsed / 1024 / 1024)
            });

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                console.log('Forced garbage collection');
            }
        }

        this.lastHealthCheckTime = Date.now();
        return checks;
    }

    async handleError(error) {
        console.error('Observer Error:', error.message);

        // Prevent error handling during shutdown
        if (this.shutdownInProgress) {
            return;
        }

        // Notify admin if possible
        if (this.app && this.app.adsFinder) {
            try {
                await this.app.adsFinder.notifyAdmin(
                    `⚠️ **خطا در ربات**\n` +
                    `خطا: ${error.message.substring(0, 100)}\n` +
                    `تلاش ری‌استارت: ${this.restartAttempts + 1}/${this.maxRestartAttempts}`
                );
            } catch (notifyError) {
                console.error('Failed to notify admin:', notifyError.message);
            }
        }

        // Try to restart
        await this.restart();
    }

    async restart() {
        // Prevent multiple simultaneous restarts
        if (this.isRestarting || this.shutdownInProgress) {
            console.log('Restart already in progress or shutting down...');
            return;
        }

        this.isRestarting = true;

        try {
            if (this.restartAttempts >= this.maxRestartAttempts) {
                console.error('ERROR: Max restart attempts reached. Exiting...');

                if (this.app && this.app.adsFinder) {
                    try {
                        await this.app.adsFinder.notifyAdmin(
                            `❌ **ربات کاملاً متوقف شد**\n` +
                            `دلیل: تلاش‌های ری‌استارت ناموفق\n` +
                            `نیاز به راه‌اندازی دستی`
                        );
                    } catch (error) {
                        console.error('Failed to send final notification:', error.message);
                    }
                }

                process.exit(1);
            }

            this.restartAttempts++;
            console.log(`Restarting Observer (Attempt ${this.restartAttempts})...`);

            // Stop current application
            if (this.app) {
                try {
                    await this.app.cleanup();
                } catch (error) {
                    console.error('Error during cleanup:', error.message);
                }
            }

            this.isRunning = false;

            // Clear intervals
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            if (this.statusInterval) {
                clearInterval(this.statusInterval);
                this.statusInterval = null;
            }

            // Exponential backoff for restart delay
            const delay = Math.min(5000 * Math.pow(2, this.restartAttempts - 1), 60000);
            console.log(`Waiting ${delay}ms before restart...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            // Start again
            await this.start();

        } finally {
            this.isRestarting = false;
        }
    }

    setupSignalHandlers() {
        // Remove all previous listeners first
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('uncaughtException');
        process.removeAllListeners('unhandledRejection');

        // Graceful shutdown handler
        const shutdown = async (signal) => {
            // Prevent multiple shutdown calls
            if (this.shutdownInProgress) {
                console.log('Shutdown already in progress...');
                return;
            }

            this.shutdownInProgress = true;
            console.log(`\nReceived ${signal}, shutting down gracefully...`);

            // Clear intervals immediately
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            if (this.statusInterval) {
                clearInterval(this.statusInterval);
                this.statusInterval = null;
            }

            this.isRunning = false;

            if (this.app) {
                try {
                    // Only send notification if AdsFinder is actually running
                    if (this.app.adsFinder && this.app.adsFinder.isRunning) {
                        await this.app.adsFinder.notifyAdmin(
                            `🔴 **ربات متوقف شد**\n` +
                            `سیگنال: ${signal}\n` +
                            `زمان: ${new Date().toLocaleString('fa-IR')}`
                        );
                    }

                    await this.app.cleanup();
                } catch (error) {
                    console.error('Error during shutdown:', error.message);
                }
            }

            // Exit after a timeout to ensure cleanup completes
            setTimeout(() => {
                console.log('Forcing exit...');
                process.exit(0);
            }, 5000);

            process.exit(0);
        };

        // Register signal handlers
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // Handle uncaught exceptions
        process.on('uncaughtException', async (error) => {
            console.error('Uncaught Exception:', error);
            console.error('Stack:', error.stack);

            // Don't try to restart during shutdown
            if (this.shutdownInProgress) {
                return;
            }

            // Try to notify admin
            if (this.app && this.app.adsFinder && this.app.adsFinder.isRunning) {
                try {
                    await this.app.adsFinder.notifyAdmin(
                        `⚠️ **خطای بحرانی**\n` +
                        `خطا: ${error.message.substring(0, 200)}\n` +
                        `در حال ری‌استارت...`
                    );
                } catch (notifyError) {
                    console.error('Failed to notify about uncaught exception:', notifyError.message);
                }
            }

            await this.handleError(error);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', async (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);

            // Don't try to handle during shutdown
            if (this.shutdownInProgress) {
                return;
            }

            // Convert reason to Error object if needed
            const error = reason instanceof Error ? reason : new Error(String(reason));

            // Try to notify admin
            if (this.app && this.app.adsFinder && this.app.adsFinder.isRunning) {
                try {
                    await this.app.adsFinder.notifyAdmin(
                        `⚠️ **خطای پردازش**\n` +
                        `خطا: ${error.message.substring(0, 200)}\n` +
                        `در حال بررسی...`
                    );
                } catch (notifyError) {
                    console.error('Failed to notify about rejection:', notifyError.message);
                }
            }

            // Only restart for critical errors
            if (error.message.includes('TIMEDOUT') ||
                error.message.includes('CONNECTION_LOST') ||
                error.message.includes('PROTOCOL_ERROR')) {
                await this.handleError(error);
            }
        });

        console.log('Signal handlers configured');
    }

    // Cleanup method for Observer
    async cleanup() {
        this.isRunning = false;

        // Clear all intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }

        // Cleanup application
        if (this.app) {
            try {
                await this.app.cleanup();
            } catch (error) {
                console.error('Error cleaning up application:', error.message);
            }
        }
    }
}

// Main function
async function main() {
    try {
        // Validate required environment variables
        if (!config.apiId || !config.apiHash) {
            console.error('ERROR: API_ID and API_HASH must be set in .env file');
            process.exit(1);
        }

        if (!config.sessionPath) {
            console.error('ERROR: SESSION_PATH must be set in .env file');
            process.exit(1);
        }

        if (!config.adminUsername) {
            console.error('ERROR: ADMIN_USERNAME must be set in .env file');
            process.exit(1);
        }

        // Validate database config
        if (!config.database.host || !config.database.user || !config.database.database) {
            console.warn('WARNING: Database configuration incomplete, some features may not work');
        }

        console.log('=====================================');
        console.log('TgObserver - Advertisement Detector');
        console.log('Version: 2.0.0');
        console.log('=====================================\n');

        // Start the observer
        await Observer.startAndLoop(config.sessionPath, config);

    } catch (error) {
        console.error('Fatal error:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Start if run directly
if (require.main === module) {
    main().catch(error => {
        console.error('Failed to start:', error);
        process.exit(1);
    });
}

module.exports = Observer;
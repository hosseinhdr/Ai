require('dotenv').config({ path: '../.env' });
const Config = require('../src/Core/Config');
const TelegramManager = require('../src/Core/TelegramManager');
const Database = require('../Database/Database');
const ViewUpdater = require('../src/Core/ViewUpdater');

class ViewUpdaterRunner {
    constructor() {
        this.config = new Config();
        this.telegram = null;
        this.database = null;
        this.viewUpdater = null;
        this.isRunning = false;
        this.shutdownInProgress = false;
        this.retryAttempts = 0;
        this.maxRetryAttempts = 3;
        this.startTime = Date.now();
    }

    async initialize() {
        console.log('=====================================');
        console.log('Initializing ViewUpdater Runner...');
        console.log('=====================================\n');

        try {
            // Initialize Telegram
            this.telegram = new TelegramManager(
                this.config.apiId,
                this.config.apiHash,
                this.config.sessionPath
            );

            // Check session
            const hasSession = await this.telegram.checkSession();

            if (!hasSession) {
                console.error('ERROR: No Telegram session found');
                console.log('Please run observer.js first to create a session');
                return false;
            }

            // Connect to Telegram with retry
            let connected = false;
            for (let i = 0; i < this.maxRetryAttempts; i++) {
                console.log(`Connecting to Telegram (attempt ${i + 1}/${this.maxRetryAttempts})...`);
                connected = await this.telegram.connect();

                if (connected) {
                    break;
                }

                if (i < this.maxRetryAttempts - 1) {
                    console.log('Retrying in 5 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }

            if (!connected) {
                console.error('ERROR: Failed to connect to Telegram after multiple attempts');
                return false;
            }

            // Verify connection
            const me = await this.telegram.getMe();
            if (!me) {
                console.error('ERROR: Cannot verify Telegram connection');
                return false;
            }

            console.log(`Connected as: ${me.firstName} ${me.lastName || ''} (@${me.username || 'N/A'})`);

            // Initialize Database
            this.database = new Database(this.config.dbConfig);

            console.log('Connecting to database...');
            try {
                await this.database.connect();
                console.log('Database connected successfully');
            } catch (error) {
                console.error('ERROR: Database connection failed:', error.message);
                return false;
            }

            // Initialize ViewUpdater
            this.viewUpdater = new ViewUpdater(
                this.telegram,
                this.database,
                this.config.adminUsername,
                this.config.observerTgUserId
            );

            return true;

        } catch (error) {
            console.error('ERROR: Initialization failed:', error);
            return false;
        }
    }

    async start() {
        const initialized = await this.initialize();

        if (!initialized) {
            console.error('Failed to initialize ViewUpdater');
            await this.cleanup();
            process.exit(1);
        }

        try {
            // Start ViewUpdater
            await this.viewUpdater.start();
            this.isRunning = true;
            this.startTime = Date.now();

            console.log('\n=====================================');
            console.log('ViewUpdater is running');
            console.log(`Updates every ${this.viewUpdater.intervalMinutes} minutes`);
            console.log('Press Ctrl+C to stop');
            console.log('=====================================\n');

            // Setup monitoring
            this.setupMonitoring();

            // Setup signal handlers
            this.setupSignalHandlers();

            // Keep process alive
            process.stdin.resume();

        } catch (error) {
            console.error('ERROR: Failed to start ViewUpdater:', error);
            await this.cleanup();
            process.exit(1);
        }
    }

    setupMonitoring() {
        // Health check every 5 minutes
        this.healthCheckInterval = setInterval(async () => {
            if (!this.isRunning || this.shutdownInProgress) return;

            try {
                await this.performHealthCheck();
            } catch (error) {
                console.error('Health check failed:', error.message);
                this.retryAttempts++;

                if (this.retryAttempts >= this.maxRetryAttempts) {
                    console.error('Max health check failures reached, shutting down...');
                    await this.cleanup();
                    process.exit(1);
                }
            }
        }, 5 * 60 * 1000);

        // Status log every hour
        this.statusInterval = setInterval(() => {
            if (!this.isRunning || this.shutdownInProgress) return;

            const stats = this.viewUpdater.getStats();
            const uptime = Math.floor((Date.now() - this.startTime) / 1000 / 60);
            const memory = process.memoryUsage();

            console.log('=====================================');
            console.log('ViewUpdater Status Report:');
            console.log('-------------------------------------');
            console.log('System:');
            console.log(`• Uptime: ${Math.floor(uptime / 60)}h ${uptime % 60}m`);
            console.log(`• Memory: ${Math.round(memory.heapUsed / 1024 / 1024)} MB`);
            console.log('-------------------------------------');
            console.log('ViewUpdater:');
            console.log(`• Running: ${stats.isRunning ? '✅' : '❌'}`);
            console.log(`• Currently Updating: ${stats.isUpdating ? 'Yes' : 'No'}`);
            console.log(`• Update Count: ${stats.updateCount}`);
            console.log(`• Last Update: ${stats.lastUpdateTime ? stats.lastUpdateTime.toLocaleString() : 'N/A'}`);
            console.log('-------------------------------------');
            console.log('Statistics:');
            console.log(`• Total Updates: ${stats.stats.totalUpdates}`);
            console.log(`• Successful: ${stats.stats.successfulUpdates}`);
            console.log(`• Failed: ${stats.stats.failedUpdates}`);
            console.log(`• Cached Dialogs: ${stats.cachedDialogsCount || 0}`);
            console.log(`• Not Member Channels: ${stats.stats.notMemberChannelsCount || 0}`);

            if (stats.stats.lastError) {
                console.log(`• Last Error: ${stats.stats.lastError}`);
            }

            console.log('=====================================\n');
        }, 60 * 60 * 1000); // Every hour
    }

    async performHealthCheck() {
        const checks = [];

        // Check Telegram connection
        if (this.telegram && this.telegram.isConnected()) {
            try {
                const me = await this.telegram.getMe();
                if (me) {
                    checks.push({ service: 'telegram', status: 'ok' });
                    this.retryAttempts = 0; // Reset on success
                } else {
                    throw new Error('Cannot get user info');
                }
            } catch (error) {
                checks.push({ service: 'telegram', status: 'error', error: error.message });
                throw new Error('Telegram health check failed');
            }
        } else {
            throw new Error('Telegram not connected');
        }

        // Check Database connection
        if (this.database) {
            try {
                const isConnected = await this.database.ping();
                if (isConnected) {
                    checks.push({ service: 'database', status: 'ok' });
                } else {
                    throw new Error('Database ping failed');
                }
            } catch (error) {
                checks.push({ service: 'database', status: 'error', error: error.message });
                throw new Error('Database health check failed');
            }
        }

        // Check ViewUpdater
        if (this.viewUpdater && this.viewUpdater.isRunning) {
            checks.push({ service: 'viewUpdater', status: 'ok' });
        } else {
            throw new Error('ViewUpdater not running');
        }

        // Memory check
        const memory = process.memoryUsage();
        if (memory.heapUsed > 600 * 1024 * 1024) { // 600MB threshold
            console.warn('WARNING: High memory usage detected');

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                console.log('Forced garbage collection');
            }
        }

        return checks;
    }

    setupSignalHandlers() {
        // Remove existing handlers
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('uncaughtException');
        process.removeAllListeners('unhandledRejection');

        const shutdown = async (signal) => {
            if (this.shutdownInProgress) {
                console.log('Shutdown already in progress...');
                return;
            }

            this.shutdownInProgress = true;
            console.log(`\nReceived ${signal}, shutting down gracefully...`);

            this.isRunning = false;

            // Clear intervals immediately
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            if (this.statusInterval) {
                clearInterval(this.statusInterval);
                this.statusInterval = null;
            }

            await this.cleanup();

            // Force exit after 10 seconds
            setTimeout(() => {
                console.log('Forcing exit...');
                process.exit(0);
            }, 10000);

            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        process.on('uncaughtException', async (error) => {
            console.error('Uncaught Exception:', error);

            if (!this.shutdownInProgress) {
                await this.cleanup();
                process.exit(1);
            }
        });

        process.on('unhandledRejection', async (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);

            // Only exit for critical errors
            if (reason && reason.message &&
                (reason.message.includes('TIMEDOUT') ||
                    reason.message.includes('CONNECTION_LOST'))) {

                if (!this.shutdownInProgress) {
                    await this.cleanup();
                    process.exit(1);
                }
            }
        });
    }

    async cleanup() {
        console.log('\nCleaning up resources...');

        // Stop ViewUpdater
        if (this.viewUpdater) {
            try {
                await this.viewUpdater.stop();
            } catch (error) {
                console.error('Error stopping ViewUpdater:', error.message);
            }
        }

        // Disconnect Telegram
        if (this.telegram) {
            try {
                await this.telegram.disconnect();
            } catch (error) {
                console.error('Error disconnecting Telegram:', error.message);
            }
        }

        // Close Database
        if (this.database) {
            try {
                await this.database.close();
            } catch (error) {
                console.error('Error closing database:', error.message);
            }
        }

        // Clear intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }

        console.log('Cleanup completed');
    }
}

// Main function
async function main() {
    console.log('=====================================');
    console.log('ViewUpdater Runner v2.0');
    console.log('Updates views and forwards periodically');
    console.log('=====================================\n');

    // Validate environment
    const required = ['API_ID', 'API_HASH', 'ADMIN_USERNAME', 'DB_HOST', 'DB_USER', 'DB_NAME'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error('ERROR: Missing required environment variables:');
        missing.forEach(key => console.error(`  - ${key}`));
        console.error('\nPlease set these in your .env file');
        process.exit(1);
    }

    // Add startup delay (optional)
    console.log('Starting in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const runner = new ViewUpdaterRunner();

    try {
        await runner.start();
    } catch (error) {
        console.error('Fatal error:', error);
        await runner.cleanup();
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

module.exports = ViewUpdaterRunner;
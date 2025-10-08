const Config = require('./Config');
const TelegramManager = require('./TelegramManager');
const Database = require('../../Database/Database');
const AdsFinder = require('./AdsFinder');

class Application {
    constructor() {
        this.config = new Config();
        this.telegram = null;
        this.database = null;
        this.adsFinder = null;
        this.isInitialized = false;
        this.startTime = Date.now();
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('Application already initialized');
            return true;
        }

        console.log('Starting application initialization...\n');

        try {
            // Initialize Telegram Manager
            this.telegram = new TelegramManager(
                this.config.apiId,
                this.config.apiHash,
                this.config.sessionPath
            );

            // Check and manage Telegram session
            const hasSession = await this.telegram.checkSession();

            if (!hasSession) {
                console.log('Need to login to Telegram...');
                const loginSuccess = await this.telegram.login();

                if (!loginSuccess) {
                    console.error('ERROR: Telegram login failed');
                    return false;
                }
            } else {
                // Connect with existing session
                const connected = await this.telegram.connect();
                if (!connected) {
                    console.error('ERROR: Failed to connect to Telegram');
                    return false;
                }
            }

            // Verify Telegram connection
            const me = await this.telegram.getMe();
            if (!me) {
                console.error('ERROR: Cannot verify Telegram connection');
                return false;
            }
            console.log(`Logged in as: ${me.firstName} ${me.lastName || ''} (@${me.username || 'N/A'})`);

            // Initialize Database
            this.database = new Database(this.config.dbConfig);

            try {
                console.log('Connecting to database...');
                await this.database.connect();
                console.log('Database connected successfully');
            } catch (error) {
                console.error('WARNING: Database connection failed:', error.message);
                console.log('Continuing without database features...');
                // Don't fail initialization if database fails
            }

            // Validate admin username
            const adminUsername = this.config.adminUsername || process.env.ADMIN_USERNAME;
            if (!adminUsername) {
                console.error('ERROR: Admin username not configured');
                return false;
            }
            console.log(`INFO: Admin username set to: ${adminUsername}`);

            // Initialize AdsFinder
            this.adsFinder = new AdsFinder(
                this.telegram,
                this.database,
                adminUsername
            );

            this.isInitialized = true;
            return true;

        } catch (error) {
            console.error('ERROR: Application initialization failed:', error);
            // Cleanup on failure
            await this.cleanup();
            return false;
        }
    }

    async run() {
        const initialized = await this.initialize();

        if (!initialized) {
            console.error('ERROR: Initialization failed');
            throw new Error('Application initialization failed');
        }

        console.log('\n=====================================');
        console.log('Application started successfully');
        console.log('=====================================\n');

        try {
            // Start AdsFinder
            await this.adsFinder.start();

            // Setup periodic stats display
            this.setupStatsDisplay();

            // Setup graceful shutdown
            this.setupShutdownHandlers();

            // Keep application running
            console.log('Application is running. Press Ctrl+C to stop.\n');

            // Prevent the process from exiting
            process.stdin.resume();

        } catch (error) {
            console.error('ERROR: Failed to run application:', error);
            await this.cleanup();
            throw error;
        }
    }

    setupStatsDisplay() {
        // Display stats every 10 minutes
        this.statsInterval = setInterval(async () => {
            if (!this.adsFinder) return;

            try {
                const stats = await this.adsFinder.getStats();
                const uptime = Math.floor((Date.now() - this.startTime) / 1000 / 60);
                const memory = process.memoryUsage();

                console.log('=====================================');
                console.log('Application Statistics:');
                console.log(`• Application Uptime: ${uptime} minutes`);
                console.log(`• Messages Processed: ${stats.messagesProcessed}`);
                console.log(`• Detections Found: ${stats.detectionsFound}`);
                console.log(`• AdsFinder Status: ${stats.isRunning ? '✅ Running' : '❌ Stopped'}`);
                console.log(`• Memory Usage: ${Math.round(memory.heapUsed / 1024 / 1024)} MB`);
                console.log(`• Cache Size: ${stats.cacheSize || 0}`);

                // Database stats if available
                if (this.database && this.database.getPoolStats) {
                    const dbStats = this.database.getPoolStats();
                    if (dbStats) {
                        console.log(`• DB Connections: ${dbStats.busyConnections}/${dbStats.connectionLimit} active`);
                    }
                }

                console.log('=====================================\n');
            } catch (error) {
                console.error('Error getting stats:', error.message);
            }
        }, 10 * 60 * 1000);
    }

    setupShutdownHandlers() {
        // Prevent duplicate handlers
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');

        const shutdown = async (signal) => {
            console.log(`\nReceived ${signal}, shutting down gracefully...`);

            // Clear stats interval
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
                this.statsInterval = null;
            }

            await this.cleanup();
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }

    async cleanup() {
        console.log('\nCleaning up application resources...');

        // Stop AdsFinder
        if (this.adsFinder && this.adsFinder.isRunning) {
            try {
                await this.adsFinder.stop();
            } catch (error) {
                console.error('Error stopping AdsFinder:', error.message);
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

        // Close database
        if (this.database) {
            try {
                await this.database.close();
            } catch (error) {
                console.error('Error closing database:', error.message);
            }
        }

        // Clear intervals
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }

        this.isInitialized = false;
        console.log('Cleanup completed');
    }

    // Get application status
    async getStatus() {
        const status = {
            initialized: this.isInitialized,
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            telegram: {
                connected: this.telegram ? this.telegram.isConnected() : false
            },
            database: {
                connected: this.database ? this.database.isConnected : false
            },
            adsFinder: {
                running: this.adsFinder ? this.adsFinder.isRunning : false
            }
        };

        if (this.adsFinder) {
            status.adsFinder.stats = await this.adsFinder.getStats();
        }

        return status;
    }
}

module.exports = Application;


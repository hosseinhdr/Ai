if (global.gc) {
    logger.info('Manual garbage collection is enabled');
} else {
    logger.warn('Manual garbage collection is not exposed. Run with --expose-gc flag for better memory management');
}
import { TelegramManager } from './core/TelegramManager.js';
import { APIServer } from './api/server.js';
import { EnhancedMonitoring } from './services/EnhancedMonitoring.js';
import { HealthChecker } from './services/HealthChecker.js';
import { TelegramNotifier } from './services/TelegramNotifier.js';
import { OperationQueue } from './core/OperationQueue.js';
import database from './database/mysql.js';
import config from './config/index.js';
import logger from './utils/logger.js';

class Application {
    constructor() {
        this.telegramManager = null;
        this.apiServer = null;
        this.monitoringService = null;
        this.healthChecker = null;
        this.notifier = null;
        this.operationQueue = null;
        this.isShuttingDown = false;
        this.maintenanceInterval = null;
    }

    async initialize() {
        try {
            console.log('\n╔══════════════════════════════════════════════╗');
            console.log('║     Telegram Channel Manager v2.2           ║');
            console.log('╚══════════════════════════════════════════════╝\n');

            logger.info('🚀 Starting Telegram Channel Manager...');

            // Step 1: Operation Queue
            this.operationQueue = new OperationQueue(config.queue);
            logger.info('✅ Operation Queue initialized');

            // Step 2: Database
            logger.info('📊 Connecting to MySQL database...');
            const dbConnected = await this.connectDatabase();
            if (!dbConnected) {
                logger.error('❌ Database connection required');
                process.exit(1);
            }

            // Step 3: Telegram Manager
            logger.info('📱 Initializing Telegram sessions...');
            this.telegramManager = new TelegramManager(config, database, this.operationQueue);
            await this.telegramManager.initialize();
            await this.registerSessionsInDatabase();

            // Step 4: Telegram Notifier
            logger.info('📢 Setting up Telegram Notifier...');
            this.notifier = new TelegramNotifier(config);
            await this.notifier.connect();

            // Step 5: Health Checker
            logger.info('🏥 Starting Health Checker...');
            this.healthChecker = new HealthChecker(this.telegramManager, database, this.notifier);
            this.healthChecker.start(config.monitoring.healthCheckInterval);

            // Step 6: Monitoring
            logger.info('📈 Starting Monitoring Service...');
            this.monitoringService = new EnhancedMonitoring(
                this.telegramManager,
                this.notifier,
                this.healthChecker
            );
            this.monitoringService.start();

            // Step 7: API Server
            logger.info('🌐 Starting API server...');
            this.apiServer = new APIServer(
                this.telegramManager,
                database,
                this.monitoringService,
                this.operationQueue,
                config
            );
            await this.apiServer.start();

            // Setup handlers
            this.setupShutdownHandlers();
            this.startMaintenanceTasks();

            logger.info('✅ Application started successfully!');

            // Send startup notification
            if (this.notifier?.isConnected) {
                await this.notifier.sendNotification(
                    `🚀 سیستم راه‌اندازی شد\n` +
                    `📱 سشن‌های فعال: ${this.telegramManager.sessions.filter(s => s.isConnected).length}/${this.telegramManager.sessions.length}`,
                    'success'
                );
            }

        } catch (error) {
            logger.error('❌ Failed to start application:', error);
            await this.shutdown();
            process.exit(1);
        }
    }

    async connectDatabase() {
        try {
            await database.connect();
            await this.updateDatabaseSchema();
            return true;
        } catch (error) {
            logger.error('Database connection failed:', error.message);

            for (let i = 1; i <= 3; i++) {
                logger.info(`Retrying database connection (${i}/3)...`);
                await new Promise(resolve => setTimeout(resolve, 5000));

                try {
                    await database.connect();
                    await this.updateDatabaseSchema();
                    return true;
                } catch (retryError) {
                    logger.error(`Retry ${i} failed:`, retryError.message);
                }
            }

            return false;
        }
    }

    async registerSessionsInDatabase() {
        if (!database.isConnected) return;

        for (const session of this.telegramManager.sessions) {
            try {
                await database.registerSession(session.name, session.isPremium);
                await database.updateSessionStatus(
                    session.name,
                    session.isConnected,
                    session.isConnected ? 'healthy' : 'disconnected'
                );
            } catch (error) {
                logger.error(`Failed to register session ${session.name}:`, error);
            }
        }
    }

    async updateDatabaseSchema() {
        try {
            // Check and add columns if needed
            const [columns] = await database.pool.execute(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'api_keys'
            `);

            const existingColumns = columns.map(col => col.COLUMN_NAME);

            if (!existingColumns.includes('recovery_hash')) {
                await database.pool.execute(`
                    ALTER TABLE api_keys ADD COLUMN recovery_hash VARCHAR(64) DEFAULT NULL
                `);
            }

            logger.info('✅ Database schema updated');
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {
                logger.error('Schema update error:', error.message);
            }
        }
    }

    startMaintenanceTasks() {
        // Daily maintenance at 3 AM
        this.maintenanceInterval = setInterval(async () => {
            const hour = new Date().getHours();
            if (hour === 3) {
                logger.info('🧹 Running daily maintenance...');

                try {
                    // Clean old logs
                    await database.cleanupOldLogs(config.monitoring.metricsRetentionDays);

                    // Clean inactive channels
                    await this.telegramManager.leaveInactiveChannels(
                        config.monitoring.autoCleanupDays
                    );

                    logger.info('✅ Daily maintenance completed');
                } catch (error) {
                    logger.error('Daily maintenance failed:', error);
                }
            }
        }, 3600000); // Check every hour
    }

    async shutdown() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        console.log('\n╔══════════════════════════════════════════════╗');
        console.log('║          GRACEFUL SHUTDOWN...                 ║');
        console.log('╚══════════════════════════════════════════════╝\n');

        const shutdownTimeout = setTimeout(() => {
            logger.error('Shutdown timeout - forcing exit');
            process.exit(1);
        }, 30000);

        try {
            // Stop services
            if (this.maintenanceInterval) {
                clearInterval(this.maintenanceInterval);
            }

            if (this.healthChecker) {
                this.healthChecker.stop();
            }

            if (this.monitoringService) {
                this.monitoringService.stop();
            }

            if (this.operationQueue) {
                this.operationQueue.stop();
            }

            if (this.apiServer) {
                await this.apiServer.stop();
            }

            if (this.telegramManager) {
                await this.telegramManager.shutdown();
            }

            if (this.notifier?.isConnected) {
                await this.notifier.sendNotification('🛑 سیستم خاموش شد', 'warning');
                await this.notifier.disconnect();
            }

            if (database.isConnected) {
                await database.disconnect();
            }

            clearTimeout(shutdownTimeout);
            logger.info('✅ Graceful shutdown complete');

        } catch (error) {
            logger.error('Error during shutdown:', error);
            clearTimeout(shutdownTimeout);
            setTimeout(() => process.exit(1), 5000);
        }
    }

    setupShutdownHandlers() {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

        signals.forEach(signal => {
            process.on(signal, async () => {
                if (!this.isShuttingDown) {
                    logger.info(`\n⚠️ Received ${signal}, starting graceful shutdown...`);
                    await this.shutdown();
                    process.exit(0);
                }
            });
        });

        process.on('uncaughtException', async (error) => {
            logger.error('❌ Uncaught Exception:', error);
            await this.shutdown();
            process.exit(1);
        });

        process.on('unhandledRejection', async (reason) => {
            logger.error('❌ Unhandled Rejection:', reason);
        });
    }
}

// Create and start application
const app = new Application();

app.initialize().catch(error => {
    console.error('Fatal error during startup:', error);
    process.exit(1);
});

export default app;
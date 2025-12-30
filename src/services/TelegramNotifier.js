import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import logger from '../utils/logger.js';

class TelegramNotifier {
    constructor(config, telegramManager = null) {
        this.config = config;
        this.telegramManager = telegramManager;
        this.client = null;
        this.sessionForNotifications = null;
        this.isConnected = false;
        this.adminUserId = config.telegram?.adminUserId || process.env.ADMIN_USER_ID;
        this.adminUsername = config.telegram?.adminUsername || process.env.ADMIN_USERNAME;
        this.enabled = !!(this.adminUserId || this.adminUsername);
    }

    /**
     * Set the TelegramManager instance to reuse existing session
     */
    setTelegramManager(telegramManager) {
        this.telegramManager = telegramManager;
    }

    async connect() {
        if (!this.enabled) {
            logger.info('Telegram Notifier is disabled (no admin user configured)');
            return false;
        }

        logger.info(`Telegram Notifier config: adminUserId=${this.adminUserId}, adminUsername=${this.adminUsername}`);

        try {
            // ✅ FIX: Reuse existing session from TelegramManager instead of creating duplicate
            if (this.telegramManager && this.telegramManager.sessions.length > 0) {
                // Find first connected session
                this.sessionForNotifications = this.telegramManager.sessions.find(s => s.isConnected);

                if (this.sessionForNotifications) {
                    // Reuse the existing client - NO duplicate connection!
                    this.client = this.sessionForNotifications.client;
                    this.isConnected = true;
                    logger.info(`✅ Telegram Notifier using session: ${this.sessionForNotifications.name}`);
                    return true;
                } else {
                    logger.warn('No connected sessions found in TelegramManager');
                }
            } else {
                logger.warn('TelegramManager has no sessions available');
            }

            // ⚠️ Fallback: Only if TelegramManager not available (shouldn't happen)
            logger.warn('TelegramNotifier: TelegramManager not available, creating standalone connection');

            const sessions = this.config.telegram.sessions;
            if (!sessions || sessions.length === 0) {
                logger.warn('No sessions available for notifications');
                return false;
            }

            const sessionData = sessions[0];

            // Create custom logger
            const customLogger = {
                log: () => {},
                error: () => {},
                warn: () => {},
                info: () => {},
                debug: () => {},
                canSend: () => false,
                format: () => '',
                setLevel: () => {},
                isSendingLogs: false,
                getLevel: () => 'none'
            };

            this.client = new TelegramClient(
                new StringSession(sessionData.string),
                this.config.telegram.apiId,
                this.config.telegram.apiHash,
                {
                    connectionRetries: 3,
                    baseLogger: customLogger,
                    logger: customLogger
                }
            );

            await this.client.connect();
            this.isConnected = true;

            logger.info('✅ Telegram Notifier connected (standalone)');
            return true;

        } catch (error) {
            logger.error('Failed to connect Telegram Notifier:', error);
            this.isConnected = false;
            return false;
        }
    }

    async disconnect() {
        // ✅ FIX: Don't disconnect if we're reusing a session from TelegramManager
        if (this.sessionForNotifications) {
            // Just clear reference, don't disconnect shared client
            this.client = null;
            this.sessionForNotifications = null;
            this.isConnected = false;
            logger.info('Telegram Notifier disconnected (reused session not closed)');
        } else if (this.client) {
            // Only disconnect if we created our own standalone connection
            await this.client.disconnect();
            this.client = null;
            this.isConnected = false;
            logger.info('Telegram Notifier disconnected (standalone connection closed)');
        }
    }

    async sendNotification(message, type = 'info') {
        if (!this.enabled || !this.isConnected) {
            logger.debug('Notifier not enabled or not connected');
            return false;
        }

        // Check if client is still connected (session might have been closed)
        // GramJS uses _connected or we can check via .connected property
        const isClientConnected = this.client?._connected || this.client?.connected;
        if (!isClientConnected) {
            logger.warn('Telegram client is not connected, cannot send notification');
            this.isConnected = false;
            return false;
        }

        try {
            const emoji = {
                'success': '✅',
                'error': '❌',
                'warning': '⚠️',
                'info': 'ℹ️',
                'critical': '🚨'
            };

            const formattedMessage = `${emoji[type] || 'ℹ️'} **Telegram Channel Manager**\n\n${message}`;

            // Try to send by user ID first
            if (this.adminUserId) {
                try {
                    // Convert to BigInt for GramJS compatibility
                    const userId = BigInt(this.adminUserId);
                    logger.debug(`Sending notification to user ID: ${userId}`);

                    // Try to get the entity first (this resolves access hash)
                    let entity;
                    try {
                        entity = await this.client.getEntity(userId);
                    } catch (entityError) {
                        // If getEntity fails, try sending directly (works for some cases)
                        logger.debug(`Could not get entity, trying direct send: ${entityError.message}`);
                        entity = userId;
                    }

                    await this.client.sendMessage(entity, {
                        message: formattedMessage,
                        parseMode: 'markdown'
                    });
                    logger.debug('Notification sent successfully via user ID');
                    return true;
                } catch (error) {
                    logger.warn(`Failed to send by user ID (${this.adminUserId}): ${error.message}`);
                }
            }

            // Try by username (only if it's actually a username, not a numeric ID)
            if (this.adminUsername && !/^\d+$/.test(this.adminUsername)) {
                try {
                    const username = this.adminUsername.startsWith('@')
                        ? this.adminUsername
                        : '@' + this.adminUsername;

                    logger.debug(`Sending notification to username: ${username}`);
                    await this.client.sendMessage(username, {
                        message: formattedMessage,
                        parseMode: 'markdown'
                    });
                    logger.debug('Notification sent successfully via username');
                    return true;
                } catch (error) {
                    logger.warn(`Failed to send by username (${this.adminUsername}): ${error.message}`);
                }
            }

            // Fallback: Send to "me" (Saved Messages) if admin send failed
            // This helps debug if the issue is with admin resolution
            try {
                logger.warn('Falling back to Saved Messages (me)');
                await this.client.sendMessage('me', {
                    message: formattedMessage,
                    parseMode: 'markdown'
                });
                logger.info('Notification sent to Saved Messages (admin user may need to message the bot first)');
                return true;
            } catch (meError) {
                logger.error(`Failed to send to Saved Messages: ${meError.message}`);
            }

            logger.warn('No valid admin user configured for notifications');
            return false;

        } catch (error) {
            logger.error('Failed to send notification:', error);
            return false;
        }
    }

    async sendDailyReport(stats) {
        const report = `📊 **گزارش روزانه سیستم**
        
📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}
⏱ Uptime: ${stats.uptime}

**📱 وضعیت سشن‌ها:**
- کل سشن‌ها: ${stats.totalSessions}
- سشن‌های فعال: ${stats.activeSessions}
- ظرفیت استفاده شده: ${stats.capacityPercent}%

**📢 کانال‌ها:**
- کل کانال‌ها: ${stats.totalChannels}
- عضویت امروز: ${stats.joinedToday}
- خروج امروز: ${stats.leftToday}

**📈 عملکرد:**
- کل درخواست‌ها: ${stats.totalRequests}
- خطاها: ${stats.totalErrors}
- مصرف حافظه: ${stats.memoryUsage}MB

**🔑 API Keys:**
- کلیدهای فعال: ${stats.activeApiKeys}
- درخواست‌های امروز: ${stats.apiRequestsToday}`;

        return this.sendNotification(report, 'info');
    }
}

export { TelegramNotifier };
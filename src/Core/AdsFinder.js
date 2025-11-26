const { NewMessage } = require('telegram/events');

function getIranTime(timestamp) {
    const date = timestamp ? new Date(timestamp * 1000) : new Date();

    return date.toLocaleString('fa-IR', {
        timeZone: 'Asia/Tehran',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

class AdsFinder {
    constructor(telegramManager, database, adminUsername = '@YourAdminUsername') {
        this.telegram = telegramManager;
        this.database = database;
        this.adminUsername = adminUsername;
        this.currentUserId = null;
        this.isRunning = false;
        this.isRestarting = false;
        this.checkInterval = null;
        this.statsInterval = null;

        // Message tracking with size limit
        this.processedMessages = new Set();
        this.maxProcessedMessages = 10000;

        // Event handlers tracking
        this.eventHandlers = [];

        // Statistics
        this.messageCount = 0;
        this.detectionsCount = 0;
        this.startTime = Date.now();

        // Query cache with TTL
        this.queryCache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        this.maxCacheSize = 100;

        // Last cleanup time
        this.lastCleanupTime = Date.now();
        this.cleanupInterval = 30 * 60 * 1000; // 30 minutes
    }

    async getCurrentUserId() {
        if (this.currentUserId) return this.currentUserId;

        try {
            const me = await this.telegram.getMe();
            if (!me || !me.id) {
                throw new Error('Cannot get user info');
            }

            this.currentUserId = me.id;
            return this.currentUserId;
        } catch (error) {
            console.error('ERROR: Failed to get user ID:', error);
            throw new Error('Cannot get current user ID');
        }
    }

    // دریافت اطلاعات کامل کانال
    async getChannelInfo(channelId) {
        try {
            // تبدیل channelId به فرمت صحیح
            const id = channelId.toString().startsWith('-100') ? channelId : `-100${channelId}`;

            // دریافت اطلاعات کانال
            const entity = await this.telegram.client.getEntity(id);

            if (entity) {
                return {
                    username: entity.username || null,
                    title: entity.title || 'Unknown',
                    isPublic: !!entity.username,  // اگر username داره یعنی public
                    participantsCount: entity.participantsCount || 0,
                    isChannel: entity.broadcast || false,
                    isMegagroup: entity.megagroup || false
                };
            }

            return null;
        } catch (error) {
            console.error('Failed to get channel info:', error.message);
            return null;
        }
    }

    async notifyAdmin(message) {
        try {
            if (!this.telegram || !this.telegram.isConnected()) {
                console.log('WARNING: Telegram not connected, message not sent');
                return;
            }

            // Validate message
            if (!message || typeof message !== 'string') {
                console.error('Invalid message for admin notification');
                return;
            }

            // Truncate very long messages
            const maxLength = 4000;
            const truncatedMessage = message.length > maxLength
                ? message.substring(0, maxLength) + '\n...[پیام کوتاه شد]'
                : message;

            await this.telegram.client.sendMessage(this.adminUsername, {
                message: truncatedMessage
            });

            console.log('Message sent to admin');
        } catch (error) {
            console.error('ERROR: Failed to send message to admin:', error.message);
        }
    }

    async start() {
        if (this.isRunning) {
            console.log('WARNING: AdsFinder already running');
            return;
        }

        try {
            this.isRunning = true;
            this.startTime = Date.now();
            console.log('Starting AdsFinder (Database Enabled)...');

            // Parallel initialization
            const [dbConnected, userId] = await Promise.all([
                this.testDatabaseConnection(),
                this.getCurrentUserId()
            ]);

            if (!dbConnected) {
                console.warn('WARNING: Database connection failed, but continuing...');
            }

            await this.notifyAdmin(
                '✅ **ربات شروع به کار کرد**\n' +
                `زمان: ${getIranTime()}`
            );

            await this.setupEventListeners();
            this.startPeriodicCheck();
            this.startDailyReport();

            console.log('AdsFinder started successfully');
        } catch (error) {
            console.error('ERROR: Failed to start AdsFinder:', error);
            this.isRunning = false;
            throw error;
        }
    }

    async testDatabaseConnection() {
        try {
            const result = await this.database.getData('SELECT 1 as test', []);
            console.log('Database connection successful');
            return result !== null && result !== undefined;
        } catch (error) {
            console.error('Database connection failed:', error.message);
            return false;
        }
    }

    async stop() {
        if (!this.isRunning) {
            console.log('AdsFinder already stopped');
            return;
        }

        this.isRunning = false;

        // Clear intervals
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }

        // Clear memory
        this.processedMessages.clear();
        this.queryCache.clear();

        // Remove event listeners
        await this.removeEventListeners();

        await this.notifyAdmin(
            '🔴 **ربات متوقف شد**\n' +
            `زمان: ${getIranTime()}`
        );

        console.log('AdsFinder stopped');
    }

    async setupEventListeners() {
        const client = this.telegram.client;
        if (!client) throw new Error('Telegram client not initialized');

        // Unified handler for all events
        const unifiedHandler = async (event) => {
            // Skip if not running
            if (!this.isRunning) return;

            try {
                const className = event.className || event.constructor.name;

                if (className === 'UpdateNewChannelMessage' || className === 'UpdateNewMessage') {
                    const message = event.message;
                    if (message?.peerId && (message.peerId.className === 'PeerChannel' || message.peerId.channelId)) {
                        await this.handleChannelMessage(event);
                    }
                } else if (className === 'UpdateDeleteChannelMessages') {
                    await this.handleDeletedMessages(event);
                }
            } catch (error) {
                console.error('ERROR: Failed to process event:', error.message);
            }
        };

        // Add event handler with proper error handling
        try {
            client.addEventHandler(unifiedHandler);
            this.eventHandlers.push({ handler: unifiedHandler, client: client });
            console.log('Event listeners setup completed');
        } catch (error) {
            console.error('ERROR: Failed to setup event listeners:', error);
            throw error;
        }
    }

    async removeEventListeners() {
        const client = this.telegram.client;
        if (!client) return;

        // Clear all event builders first
        if (client._eventBuilders) {
            client._eventBuilders = [];
        }

        // Remove tracked handlers
        for (const { handler } of this.eventHandlers) {
            try {
                client.removeEventHandler(handler);
            } catch (error) {
                console.error('ERROR: Failed to remove handler:', error.message);
            }
        }

        this.eventHandlers = [];
        console.log('Event listeners removed');
    }

    async handleChannelMessage(event) {
        try {
            const message = event.message;
            if (!message || message.out === true || !message.post) return;

            const channelId = message.peerId.channelId || message.peerId;
            const messageKey = `${channelId}_${message.id}`;

            // Check if already processed
            if (this.processedMessages.has(messageKey)) return;

            // Manage Set size
            this.manageProcessedMessagesSize();

            this.processedMessages.add(messageKey);
            this.messageCount++;

            let channelInfo = {
                channelId,
                messageId: message.id,
                date: message.date,
                views: message.views || 0,
                forwards: message.forwards || 0,
                isForwarded: false,
                fromChannelId: null,
                fromMessageId: null
            };

            // Check if message is forwarded
            if (message.fwdFrom) {
                channelInfo.isForwarded = true;
                if (message.fwdFrom.fromId) {
                    channelInfo.fromChannelId = this.cleanChannelId(
                        message.fwdFrom.fromId.channelId || message.fwdFrom.fromId
                    );
                }
                if (message.fwdFrom.channelPost) {
                    channelInfo.fromMessageId = message.fwdFrom.channelPost;
                }
            }

            console.log('New channel message detected:', {
                channel: this.cleanChannelId(channelInfo.channelId),
                messageId: channelInfo.messageId,
                forwarded: channelInfo.isForwarded
            });

            // Process forwarded messages
            if (channelInfo.isForwarded && channelInfo.fromChannelId && channelInfo.fromMessageId) {
                const detectionResult = await this.checkForwardedMessage(channelInfo);

                if (detectionResult.detected) {
                    // دریافت اطلاعات کانال
                    const channelDetails = await this.getChannelInfo(channelInfo.channelId);
                    detectionResult.channelDetails = channelDetails;

                    await this.saveDetection(detectionResult);
                    await this.notifyDetection(detectionResult);
                    this.detectionsCount++;
                }
            }
        } catch (error) {
            console.error('ERROR: Failed to handle channel message:', error.message);
        }
    }

    manageProcessedMessagesSize() {
        // Clean up old messages if size exceeds limit
        if (this.processedMessages.size >= this.maxProcessedMessages) {
            const entries = Array.from(this.processedMessages);
            const toKeep = Math.floor(this.maxProcessedMessages * 0.5); // Keep 50%
            this.processedMessages = new Set(entries.slice(-toKeep));
            console.log(`Cleaned processed messages cache, kept ${toKeep} recent entries`);
        }
    }

    async checkForwardedMessage(forwardInfo) {
        try {
            const cacheKey = `check_${forwardInfo.fromChannelId}_${forwardInfo.fromMessageId}`;

            // Check cache
            const cached = this.queryCache.get(cacheKey);
            if (cached && (Date.now() - cached.time < this.CACHE_TTL)) {
                return cached.result;
            }

            // Clean cache periodically
            this.cleanCacheIfNeeded();

            const query = `
                SELECT 
                    pushList.id AS pushId,
                    contents.channelId AS notForwardedChannelId,
                    contents.messageId AS notForwardedMessageId,
                    contents.forwardFromChannelId AS baseContentChannelId,
                    contents.forwardFromMessageId AS baseContentMessageId,
                    pushList.editedChannelId AS editedContentChannelId,
                    pushList.editedMessageIds AS editedContentMessageIds,
                    campaigns.name AS campaignName
                FROM pushList
                    LEFT JOIN campaigns ON campaigns.id = pushList.campaignId
                    LEFT JOIN campaignContents ON campaignContents.id = pushList.contentId
                    LEFT JOIN contents ON contents.id = campaignContents.contentId
                    LEFT JOIN media ON media.id = pushList.mediaId
                WHERE campaigns.status != 'ENDED'
                    AND campaigns.medium = 'TELEGRAM'
                    AND pushList.status IN ('APPROVED', 'DETECTED')
                    AND media.mediaIdentifier = ?
            `;

            const results = await this.database.getData(query, [this.cleanChannelId(forwardInfo.channelId)]);

            if (!results || results.length === 0) {
                const result = { detected: false };
                this.queryCache.set(cacheKey, { result, time: Date.now() });
                return result;
            }

            for (const row of results) {
                if (!row) continue;

                const searchingChannelId = row.editedContentChannelId ||
                    row.baseContentChannelId ||
                    row.notForwardedChannelId;

                let isMatch = false;

                // Check edited message IDs
                if (row.editedContentMessageIds) {
                    try {
                        const messageIds = JSON.parse(row.editedContentMessageIds);
                        if (Array.isArray(messageIds)) {
                            for (const messageId of messageIds) {
                                if (forwardInfo.fromChannelId == this.cleanChannelId(searchingChannelId) &&
                                    forwardInfo.fromMessageId == messageId) {
                                    isMatch = true;
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Failed to parse editedMessageIds:', e.message);
                    }
                } else {
                    // Check regular message ID
                    const searchingMessageId = row.baseContentMessageId || row.notForwardedMessageId;
                    if (forwardInfo.fromChannelId == this.cleanChannelId(searchingChannelId) &&
                        forwardInfo.fromMessageId == searchingMessageId) {
                        isMatch = true;
                    }
                }

                if (isMatch) {
                    const result = {
                        detected: true,
                        pushId: row.pushId,
                        campaignName: row.campaignName || 'Unknown',
                        ...forwardInfo
                    };

                    // Cache the result
                    this.queryCache.set(cacheKey, { result, time: Date.now() });
                    return result;
                }
            }

            const result = { detected: false };
            this.queryCache.set(cacheKey, { result, time: Date.now() });
            return result;

        } catch (error) {
            console.error('ERROR: Database check failed:', error.message);
            return { detected: false, error: error.message };
        }
    }

    cleanCacheIfNeeded() {
        const now = Date.now();

        // Clean cache every cleanupInterval
        if (now - this.lastCleanupTime > this.cleanupInterval) {
            this.cleanCache();
            this.lastCleanupTime = now;
        }

        // Also clean if cache is too large
        if (this.queryCache.size > this.maxCacheSize) {
            this.cleanCache();
        }
    }

    cleanCache() {
        const now = Date.now();
        let removed = 0;

        for (const [key, value] of this.queryCache.entries()) {
            if (now - value.time > this.CACHE_TTL) {
                this.queryCache.delete(key);
                removed++;
            }
        }

        // If still too large, remove oldest entries
        if (this.queryCache.size > this.maxCacheSize) {
            const entries = Array.from(this.queryCache.entries());
            entries.sort((a, b) => a[1].time - b[1].time);

            const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
            for (const [key] of toRemove) {
                this.queryCache.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            console.log(`Cleaned ${removed} entries from query cache`);
        }
    }

    async saveDetection(detectionInfo) {
        try {
            const insertData = {
                type: 'PLACEMENT',
                pushId: detectionInfo.pushId,
                postId: detectionInfo.messageId,
                actionTime: detectionInfo.date * 1000,
                finder: await this.getCurrentUserId()
            };

            const result = await this.database.insertData('detections', insertData);
            console.log('Detection saved with ID:', result.insertId);
            return result.insertId;
        } catch (error) {
            console.error('ERROR: Failed to save detection:', error.message);
            return null;
        }
    }

    async notifyDetection(detectionInfo) {
        // ساخت لینک کانال
        let channelLink = '';
        let privacyStatus = '🔒 خصوصی';

        if (detectionInfo.channelDetails) {
            const details = detectionInfo.channelDetails;

            if (details.username) {
                channelLink = `@${details.username}`;
                privacyStatus = '🌐 عمومی';
            } else {
                // برای کانال خصوصی، از ID استفاده می‌کنیم
                const channelId = this.cleanChannelId(detectionInfo.channelId);
                channelLink = `[${details.title}](https://t.me/c/${channelId}/${detectionInfo.messageId})`;
            }
        } else {
            // اگر نتونستیم اطلاعات بگیریم
            const channelId = this.cleanChannelId(detectionInfo.channelId);
            channelLink = `ID: ${channelId}`;
        }

        const message = `
🎯 **تبلیغ شناسایی شد!**

📊 **اطلاعات کمپین:**
• نام: ${detectionInfo.campaignName}
• Push ID: ${detectionInfo.pushId}

📍 **محل قرارگیری:**
• کانال: ${channelLink}
${detectionInfo.channelDetails ? `• نام کانال: ${detectionInfo.channelDetails.title}` : ''}
• وضعیت: ${privacyStatus}
${detectionInfo.channelDetails && detectionInfo.channelDetails.participantsCount ? `• تعداد اعضا: ${detectionInfo.channelDetails.participantsCount.toLocaleString('fa-IR')}` : ''}
• شماره پیام: ${detectionInfo.messageId}
• زمان: ${getIranTime(detectionInfo.date)}

📈 **آمار:**
• بازدید: ${(detectionInfo.views || 0).toLocaleString('fa-IR')}
• فوروارد: ${(detectionInfo.forwards || 0).toLocaleString('fa-IR')}

🔗 **منبع:**
• از کانال: ${detectionInfo.fromChannelId}
• پیام شماره: ${detectionInfo.fromMessageId}

🔍 **لینک مستقیم:**
${detectionInfo.channelDetails && detectionInfo.channelDetails.username
            ? `https://t.me/${detectionInfo.channelDetails.username}/${detectionInfo.messageId}`
            : `https://t.me/c/${this.cleanChannelId(detectionInfo.channelId)}/${detectionInfo.messageId}`}
        `;

        await this.notifyAdmin(message);
    }

    async handleDeletedMessages(event) {
        try {
            const channelId = this.cleanChannelId(event.channelId);
            const messageIds = event.messages || [];

            if (messageIds.length === 0) return;

            console.log(`Deleted messages in ${channelId}:`, messageIds.slice(0, 10));

            // Build safe query with placeholders
            const placeholders = messageIds.map(() => '?').join(',');

            const query = `
                SELECT pushId, postId, campaigns.name AS campaignName
                FROM detections
                    LEFT JOIN pushList ON pushList.id = detections.pushId
                    LEFT JOIN campaigns ON campaigns.id = pushList.campaignId
                    LEFT JOIN media ON media.id = pushList.mediaId
                WHERE media.mediaIdentifier = ?
                    AND postId IN (${placeholders})
            `;

            const params = [channelId, ...messageIds];
            const results = await this.database.getData(query, params);

            if (results && results.length > 0) {
                // Batch process removals
                const removalPromises = results.map(row => this.saveRemovalDetection(row));
                await Promise.all(removalPromises);

                await this.notifyAdmin(`
⚠️ **تبلیغات حذف شده**
• تعداد: ${results.length}
• کانال: ${channelId}
• پیام‌ها: ${messageIds.slice(0, 5).join(', ')}${messageIds.length > 5 ? '...' : ''}
• زمان: ${getIranTime()}
                `);
            }
        } catch (error) {
            console.error('ERROR: Failed to process deleted messages:', error.message);
        }
    }

    async saveRemovalDetection(row) {
        try {
            const insertData = {
                type: 'REMOVE',
                pushId: row.pushId,
                postId: row.postId,
                actionTime: Date.now(),
                finder: await this.getCurrentUserId()
            };

            await this.database.insertData('detections', insertData);
            console.log(`Removal recorded: Push ${row.pushId}, Post ${row.postId}`);
        } catch (error) {
            console.error('ERROR: Failed to save removal detection:', error.message);
        }
    }

    cleanChannelId(channelId) {
        const id = String(channelId);
        if (id.startsWith('-100')) {
            return id.substring(4);
        }
        return id;
    }

    startPeriodicCheck() {
        this.checkInterval = setInterval(async () => {
            if (!this.isRunning) return;

            try {
                // Parallel health checks
                const [me, dbTest] = await Promise.all([
                    this.telegram.getMe(),
                    this.database.ping()
                ]);

                if (!me) throw new Error('Telegram connection lost');

                // Clean up memory periodically
                this.manageProcessedMessagesSize();
                this.cleanCacheIfNeeded();

                const uptime = Math.floor((Date.now() - this.startTime) / 1000 / 60);
                console.log(`Health check passed - Uptime: ${uptime} min, Messages: ${this.messageCount}, Detections: ${this.detectionsCount}`);

            } catch (error) {
                console.error('ERROR: Health check failed:', error.message);
                await this.notifyAdmin(
                    `⚠️ **خطا در ربات**\n` +
                    `خطا: ${error.message.substring(0, 100)}\n` +
                    `زمان: ${getIranTime()}\n` +
                    `در حال ری‌استارت...`
                );
                await this.restart();
            }
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    startDailyReport() {
        this.statsInterval = setInterval(async () => {
            if (!this.isRunning) return;

            const uptime = Math.floor((Date.now() - this.startTime) / 1000 / 60);
            const hours = Math.floor(uptime / 60);
            const minutes = uptime % 60;

            let todayDetections = 0;
            try {
                const result = await this.database.getData(
                    `SELECT COUNT(*) as count FROM detections 
                     WHERE DATE(FROM_UNIXTIME(actionTime/1000)) = CURDATE() 
                     AND finder = ?`,
                    [await this.getCurrentUserId()]
                );
                todayDetections = result?.[0]?.count || 0;
            } catch (error) {
                console.error('Failed to get today detections:', error.message);
            }

            // Memory usage
            const memUsage = process.memoryUsage();
            const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);

            await this.notifyAdmin(
                `📊 **گزارش روزانه**\n\n` +
                `• مدت زمان اجرا: ${hours} ساعت و ${minutes} دقیقه\n` +
                `• پیام‌های پردازش شده: ${this.messageCount.toLocaleString('fa-IR')}\n` +
                `• تبلیغات شناسایی شده (کل): ${this.detectionsCount.toLocaleString('fa-IR')}\n` +
                `• تبلیغات شناسایی شده (امروز): ${todayDetections.toLocaleString('fa-IR')}\n` +
                `• مصرف حافظه: ${memoryMB} MB\n` +
                `• اندازه کش: ${this.queryCache.size}\n` +
                `• زمان: ${getIranTime()}\n` +
                `• وضعیت: ✅ فعال`
            );
        }, 24 * 60 * 60 * 1000); // Every 24 hours
    }

    async restart() {
        // Prevent multiple simultaneous restarts
        if (this.isRestarting) {
            console.log('Already restarting...');
            return;
        }

        try {
            this.isRestarting = true;
            console.log('Restarting AdsFinder...');

            if (this.isRunning) {
                await this.notifyAdmin(
                    '🔄 **ری‌استارت ربات**\n' +
                    `زمان: ${getIranTime()}`
                );
                await this.stop();
            }

            // Wait before restart
            await new Promise(resolve => setTimeout(resolve, 5000));

            await this.start();
        } catch (error) {
            console.error('ERROR: Failed to restart:', error.message);
        } finally {
            this.isRestarting = false;
        }
    }

    async getStats() {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000 / 60);

        return {
            messagesProcessed: this.messageCount,
            detectionsFound: this.detectionsCount,
            uptime: uptime,
            isRunning: this.isRunning,
            cacheSize: this.queryCache.size,
            processedMessagesSize: this.processedMessages.size,
            memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) // MB
        };
    }
}

module.exports = AdsFinder;
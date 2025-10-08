const { Api } = require('telegram');

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

class ViewUpdater {
    constructor(telegramManager, database, adminUsername = '@YourAdminUsername',observerTgUserId) {
        this.telegram = telegramManager;
        this.database = database;
        this.adminUsername = adminUsername;
        this.observerTgUserId = observerTgUserId;
        this.isRunning = false;
        this.isUpdating = false;
        this.updateInterval = null;
        this.updateCount = 0;
        this.lastUpdateTime = null;
        this.intervalMinutes = 30;
        // Dialog cache management
        this.cachedDialogs = [];
        this.lastDialogsCacheTime = 0;
        this.dialogsCacheTTL = 30 * 60 * 60 * 1000; // 30 ساعت مثل PHP

        // Rate limiting
        this.requestDelay = 1000; // 1 second between requests
        this.batchSize = 10; // Process in batches

        // Statistics
        this.stats = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            notMemberChannels: new Set(),
            lastError: null
        };
    }

    async start() {
        if (this.isRunning) {
            console.log('ViewUpdater already running');
            return;
        }

        try {
            this.isRunning = true;
            console.log('Starting ViewUpdater...');

            // Notify admin with Iran time
            await this.notifyAdmin(
                '🔄 **ViewUpdater شروع به کار کرد**\n' +
                `⏱️ بروزرسانی هر ${this.intervalMinutes} دقیقه\n` +
                `🕐 زمان: ${getIranTime()}`
            );

            // Initial update
            await this.performUpdate();

            // Setup periodic updates
            this.updateInterval = setInterval(async () => {
                if (!this.isUpdating) {
                    await this.performUpdate();
                }
            }, this.intervalMinutes * 60 * 1000);

            console.log(`ViewUpdater started - Updates every ${this.intervalMinutes} minutes`);
        } catch (error) {
            console.error('ERROR: Failed to start ViewUpdater:', error);
            this.isRunning = false;
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) {
            console.log('ViewUpdater already stopped');
            return;
        }

        this.isRunning = false;

        // Clear interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Send final stats with Iran time
        await this.notifyAdmin(
            '⏹️ **ViewUpdater متوقف شد**\n' +
            `📊 تعداد بروزرسانی‌ها: ${this.updateCount}\n` +
            `✅ موفق: ${this.stats.successfulUpdates}\n` +
            `❌ ناموفق: ${this.stats.failedUpdates}\n` +
            `🕐 زمان: ${getIranTime()}`
        );

        console.log('ViewUpdater stopped');
    }

    async performUpdate() {
        // Prevent concurrent updates
        if (this.isUpdating) {
            console.log('Update already in progress, skipping...');
            return;
        }

        this.isUpdating = true;
        console.log('Starting view update process...');

        const startTime = Date.now();
        let updatedCount = 0;
        let errorCount = 0;
        const notMemberChannels = new Map(); // Use Map for better tracking

        try {
            // Get items to update
            const query = `
                SELECT
                    media.mediaIdentifier,
                    media.username,
                    media.privacy,
                    pushList.id as pushId,
                    campaigns.name as campaignName
                FROM pushList
                         LEFT JOIN media ON media.id = pushList.mediaId
                         LEFT JOIN campaigns ON campaigns.id = pushList.campaignId
                WHERE pushList.status = 'DETECTED'
                  AND media.medium = 'TELEGRAM' AND media.observerTgUserId = ${this.observerTgUserId}
                  AND campaigns.status IN ('ON_GOING', 'SHOT', 'PAUSE')
                ORDER BY pushList.id DESC
                    LIMIT 100
            `;

            const results = await this.database.getData(query);

            if (!results || results.length === 0) {
                console.log('No rows found for update');
                return {
                    result: false,
                    error: 'NO_ROWS_FOUND'
                };
            }

            console.log(`Found ${results.length} items to check`);

            // Get cached dialogs
            const dialogsArray = await this.getDialogs();
            console.log(`Checking against ${dialogsArray.length} dialogs`);

            // Create a Set for faster lookup
            const dialogsSet = new Set(dialogsArray.map(id => String(id)));

            // Process in batches
            for (let i = 0; i < results.length; i += this.batchSize) {
                const batch = results.slice(i, i + this.batchSize);

                // Process batch in parallel
                const batchPromises = batch.map(async (row) => {
                    try {
                        const result = await this.processRow(row, dialogsSet, notMemberChannels);
                        if (result.success) {
                            updatedCount++;
                        } else if (result.error) {
                            errorCount++;
                        }
                        return result;
                    } catch (error) {
                        console.error(`Error processing pushId ${row.pushId}:`, error.message);
                        errorCount++;
                        return { success: false, error: error.message };
                    }
                });

                await Promise.all(batchPromises);

                // Rate limiting between batches
                if (i + this.batchSize < results.length) {
                    await new Promise(resolve => setTimeout(resolve, this.requestDelay));
                }
            }

            // Update statistics
            this.updateCount++;
            this.lastUpdateTime = new Date();
            this.stats.totalUpdates++;
            this.stats.successfulUpdates += updatedCount;
            this.stats.failedUpdates += errorCount;

            const duration = Math.round((Date.now() - startTime) / 1000);

            console.log(`Update completed - Updated: ${updatedCount}, Errors: ${errorCount}, Duration: ${duration}s`);

            // Send report to admin with Iran time
            await this.sendUpdateReport(updatedCount, errorCount, duration, notMemberChannels);

            return {
                success: true,
                updated: updatedCount,
                errors: errorCount,
                duration: duration
            };

        } catch (error) {
            console.error('ERROR: Update process failed:', error);
            this.stats.lastError = error.message;

            await this.notifyAdmin(
                `⚠️ **خطا در ViewUpdater**\n` +
                `خطا: ${error.message.substring(0, 200)}\n` +
                `زمان: ${getIranTime()}`
            );

            return {
                success: false,
                error: error.message
            };

        } finally {
            this.isUpdating = false;
        }
    }

    async processRow(row, dialogsSet, notMemberChannels) {
        const pushId = row.pushId;
        const mediaIdentifier = "-100" + row.mediaIdentifier;
        const normalizedId = row.mediaIdentifier;

        // Check if channel is in dialogs
        const isInDialogs = dialogsSet.has(mediaIdentifier) ||
            dialogsSet.has(normalizedId) ||
            dialogsSet.has(String(row.mediaIdentifier));

        if (!isInDialogs) {
            console.log(`Channel ${mediaIdentifier} not in dialogs`);

            // Track not-member channels
            if (!notMemberChannels.has(mediaIdentifier)) {
                notMemberChannels.set(mediaIdentifier, {
                    id: mediaIdentifier,
                    username: row.username,
                    pushIds: [pushId],
                    campaignName: row.campaignName
                });
            } else {
                notMemberChannels.get(mediaIdentifier).pushIds.push(pushId);
            }

            // Add to stats
            this.stats.notMemberChannels.add(mediaIdentifier);

            return { success: false, notMember: true };
        }

        // Get detection info
        const getDetectionQuery = `
            SELECT * FROM detections 
            WHERE pushId = ? AND type = 'PLACEMENT' 
            ORDER BY id DESC 
            LIMIT 1
        `;

        const detectionResult = await this.database.getData(getDetectionQuery, [pushId]);

        if (!detectionResult || detectionResult.length === 0) {
            console.log(`No detection found for pushId ${pushId}`);
            return { success: false, noDetection: true };
        }

        const detection = detectionResult[0];
        const postId = detection.postId;

        // Get message views and forwards
        try {
            const messages = await this.telegram.client.getMessages(mediaIdentifier, {
                ids: [parseInt(postId)]
            });

            let view = 0;
            let share = 0;

            if (messages && messages.length > 0 && messages[0]) {
                view = messages[0].views || 0;
                share = messages[0].forwards || 0;

                console.log(`PushID ${pushId}: ${view} views, ${share} shares`);
            } else {
                console.log(`Message not found for pushId ${pushId}, postId ${postId}`);
                return { success: false, messageNotFound: true };
            }

            // Insert into insightHistories
            const insertQuery = `
                INSERT INTO insightHistories (pushId, viewCount, share)
                VALUES (?, ?, ?)
            `;

            await this.database.getData(insertQuery, [pushId, view, share]);

            return { success: true, view, share };

        } catch (error) {
            // Handle specific Telegram errors
            if (error.message && error.message.includes('CHANNEL_PRIVATE')) {
                console.log(`Channel ${mediaIdentifier} is private`);
                this.stats.notMemberChannels.add(mediaIdentifier);
                return { success: false, private: true };
            }

            if (error.message && error.message.includes('FLOOD_WAIT')) {
                const seconds = parseInt(error.message.match(/\d+/)?.[0] || 60);
                console.log(`Flood wait ${seconds} seconds for pushId ${pushId}`);
                await new Promise(resolve => setTimeout(resolve, seconds * 1000));
                return { success: false, floodWait: true };
            }

            throw error;
        }
    }

    async getDialogs() {
        const now = Date.now();
        const cacheExpiry = this.dialogsCacheTTL;

        // Check if cache is empty or expired
        if (this.cachedDialogs.length === 0 ||
            (this.lastDialogsCacheTime < (now - cacheExpiry))) {

            console.log('Refreshing dialogs cache...');

            try {
                this.cachedDialogs = await this.telegram.getDialogIds(1000);
                this.lastDialogsCacheTime = now;

                console.log(`Cached ${this.cachedDialogs.length} dialog IDs`);

                // Validate cache
                if (this.cachedDialogs.length === 0) {
                    console.warn('WARNING: No dialogs retrieved');
                }

            } catch (error) {
                console.error('Failed to get dialogs:', error.message);
                // Return existing cache if refresh fails
                return this.cachedDialogs;
            }
        }

        return this.cachedDialogs;
    }

    async sendUpdateReport(updatedCount, errorCount, duration, notMemberChannels) {
        let reportMessage = '';

        if (updatedCount > 0 || errorCount > 0) {
            reportMessage += `📊 **بروزرسانی View/Forward**\n\n`;
            reportMessage += `• ✅ بروزرسانی موفق: ${updatedCount}\n`;
            reportMessage += `• ❌ خطاها: ${errorCount}\n`;
            reportMessage += `• ⏱️ مدت زمان: ${duration} ثانیه\n`;
            reportMessage += `• 📝 کل بروزرسانی‌ها: ${this.updateCount}\n`;
        }

        // Report channels we're not member of
        if (notMemberChannels.size > 0) {
            reportMessage += `\n⚠️ **کانال‌های غیرعضو (${notMemberChannels.size}):**\n\n`;

            let channelCount = 0;
            for (const [channelId, info] of notMemberChannels) {
                if (channelCount >= 10) {
                    reportMessage += `... و ${notMemberChannels.size - 10} کانال دیگر\n`;
                    break;
                }

                reportMessage += `• ${info.id}`;
                if (info.username) {
                    reportMessage += ` (@${info.username})`;
                }
                reportMessage += `\n  کمپین: ${info.campaignName || 'نامشخص'}\n`;
                reportMessage += `  تعداد Push: ${info.pushIds.length}\n\n`;

                channelCount++;
            }

            reportMessage += `\n🔔 لطفاً در این کانال‌ها عضو شوید.`;
        }

        if (reportMessage) {
            reportMessage += `\n\n🕐 زمان: ${getIranTime()}`;
            await this.notifyAdmin(reportMessage);
        }
    }

    async notifyAdmin(message) {
        try {
            if (!this.telegram || !this.telegram.isConnected()) {
                console.log('WARNING: Telegram not connected');
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

        } catch (error) {
            console.error('Failed to send admin notification:', error.message);
        }
    }

    // Force cache refresh
    async refreshDialogsCache() {
        console.log('Forcing dialogs cache refresh...');
        this.cachedDialogs = [];
        this.lastDialogsCacheTime = 0;
        return await this.getDialogs();
    }

    // Get statistics with Iran time
    getStats() {
        return {
            isRunning: this.isRunning,
            isUpdating: this.isUpdating,
            updateCount: this.updateCount,
            lastUpdateTime: this.lastUpdateTime ? getIranTime(this.lastUpdateTime.getTime() / 1000) : null,
            intervalMinutes: this.intervalMinutes,
            cachedDialogsCount: this.cachedDialogs.length,
            stats: {
                totalUpdates: this.stats.totalUpdates,
                successfulUpdates: this.stats.successfulUpdates,
                failedUpdates: this.stats.failedUpdates,
                notMemberChannelsCount: this.stats.notMemberChannels.size,
                lastError: this.stats.lastError
            }
        };
    }

    // Update interval dynamically
    setUpdateInterval(minutes) {
        if (minutes < 5 || minutes > 1440) {
            console.error('Invalid interval. Must be between 5 and 1440 minutes');
            return false;
        }

        this.intervalMinutes = minutes;

        // Restart interval if running
        if (this.isRunning) {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
            }

            this.updateInterval = setInterval(async () => {
                if (!this.isUpdating) {
                    await this.performUpdate();
                }
            }, this.intervalMinutes * 60 * 1000);

            console.log(`Update interval changed to ${minutes} minutes`);

            // Notify admin
            this.notifyAdmin(
                `⚙️ **تنظیمات ViewUpdater**\n` +
                `• فاصله بروزرسانی تغییر کرد به: ${minutes} دقیقه\n` +
                `• زمان: ${getIranTime()}`
            );
        }

        return true;
    }
}

module.exports = ViewUpdater;
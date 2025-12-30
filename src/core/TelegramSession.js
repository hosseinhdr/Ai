import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import logger from '../utils/logger.js';

/**
 * LRU Cache with TTL and automatic cleanup
 */
class LRUCache {
    constructor(maxSize = 100, ttlMs = 300000) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.cache = new Map();
        this.accessOrder = new Map(); // Track access time for LRU

        // Start automatic cleanup interval (every 2 minutes)
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 120000);
    }

    set(key, value) {
        const now = Date.now();

        // If cache is full and key doesn't exist, remove LRU item
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLRU();
        }

        this.cache.set(key, {
            data: value,
            timestamp: now
        });
        this.accessOrder.set(key, now);
    }

    get(key) {
        if (!this.cache.has(key)) {
            return null;
        }

        const item = this.cache.get(key);
        const now = Date.now();

        // Check if expired
        if (now - item.timestamp > this.ttlMs) {
            this.cache.delete(key);
            this.accessOrder.delete(key);
            return null;
        }

        // Update access time for LRU
        this.accessOrder.set(key, now);
        return item.data;
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
    }

    clear() {
        this.cache.clear();
        this.accessOrder.clear();
    }

    /**
     * Remove expired entries
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;

        for (const [key, item] of this.cache.entries()) {
            if (now - item.timestamp > this.ttlMs) {
                this.cache.delete(key);
                this.accessOrder.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            logger.debug(`Cache cleanup: removed ${removed} expired entries, ${this.cache.size} remaining`);
        }
    }

    /**
     * Evict least recently used item
     */
    evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, accessTime] of this.accessOrder.entries()) {
            if (accessTime < oldestTime) {
                oldestTime = accessTime;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.accessOrder.delete(oldestKey);
            logger.debug(`Cache eviction: removed LRU entry ${oldestKey}, ${this.cache.size} remaining`);
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            utilization: Math.round((this.cache.size / this.maxSize) * 100),
            ttlMs: this.ttlMs
        };
    }

    /**
     * Destroy the cache and stop cleanup
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clear();
    }
}

export class TelegramSession {
    constructor(name, sessionString, apiId, apiHash, config = {}) {
        this.name = name;
        this.sessionString = sessionString;
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.config = config;

        this.client = null;
        this.isConnected = false;
        this.currentChannelsCount = 0;
        this.isPremium = config.isPremium || false;
        this.maxChannels = this.isPremium ? 1000 : 500;
        this.healthStatus = 'healthy';
        this.lastActivity = new Date();
        this.floodWaitUntil = null;
        this.maxConnectionAttempts = 3;

        // LRU Cache with size limit of 100 items and 5-minute TTL
        this.channelCache = new LRUCache(100, 300000);

        // Cache for dialog results (expensive operation)
        this.dialogsCache = null;
        this.dialogsCacheTimestamp = 0;
        this.dialogsCacheTTL = 600000; // 10 minutes
    }

    async connect(retryCount = 0) {
        try {
            logger.info(`🔄 Connecting session ${this.name}...`);

            this.client = new TelegramClient(
                new StringSession(this.sessionString),
                this.apiId,
                this.apiHash,
                {
                    connectionRetries: 5,
                    retryDelay: 1000,
                    baseLogger: {
                        error: () => {},
                        warn: () => {},
                        info: () => {},
                        debug: () => {},
                        log: () => {},
                        canSend: () => false,  // Disable all Telegram library logging
                        setLevel: () => {}
                    }
                }
            );

            await this.client.connect();
            const me = await this.client.getMe();

            this.isConnected = true;
            this.healthStatus = 'healthy';

            // تشخیص premium
            this.isPremium = me.premium || false;
            this.maxChannels = this.isPremium ? 1000 : 500;

            // شمارش دقیق کانال‌ها
            await this.updateChannelsCount();

            logger.info(`✅ ${this.name} connected - Channels: ${this.currentChannelsCount}/${this.maxChannels}`);

            return true;

        } catch (error) {
            // Log full error details for debugging
            logger.error(`❌ ${this.name} connection failed: ${error.message}`, {
                errorCode: error.code,
                errorType: error.constructor.name,
                stack: error.stack
            });

            if (error.message.includes('FLOOD_WAIT')) {
                const waitTime = parseInt(error.message.match(/\d+/)?.[0] || 60);
                this.floodWaitUntil = new Date(Date.now() + waitTime * 1000);
                this.healthStatus = 'warning';
                logger.warn(`⏳ ${this.name} flood wait: ${waitTime}s`);
            }

            // Check for AUTH_KEY issues
            if (error.message.includes('AUTH_KEY')) {
                logger.error(`🔑 ${this.name} has AUTH_KEY issue: ${error.message}`);
                logger.error(`   This usually means: invalid session string or session revoked`);
                this.healthStatus = 'dead';
                return false; // Don't retry AUTH_KEY errors
            }

            // Check for network issues
            if (error.message.includes('CONNECTION') || error.message.includes('TIMEOUT')) {
                logger.warn(`🌐 ${this.name} network issue, will retry`);
            }

            if (retryCount < this.maxConnectionAttempts) {
                logger.info(`Retry ${retryCount + 1}/${this.maxConnectionAttempts} for ${this.name}...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                return this.connect(retryCount + 1);
            }

            logger.error(`❌ ${this.name} failed after ${this.maxConnectionAttempts} attempts`);
            this.isConnected = false;
            this.healthStatus = 'critical';
            return false;
        }
    }

    /**
     * شمارش دقیق کانال‌ها - فقط با getDialogs
     * با cache برای جلوگیری از فراخوانی مکرر
     */
    async updateChannelsCount(forceRefresh = false) {
        try {
            const now = Date.now();

            // بررسی cache - اگر داده کمتر از 10 دقیقه قدیمی است، از cache استفاده کن
            if (!forceRefresh && this.dialogsCache && (now - this.dialogsCacheTimestamp < this.dialogsCacheTTL)) {
                logger.debug(`Using cached dialog count for ${this.name}`);
                return this.currentChannelsCount;
            }

            logger.info(`📊 Counting channels for ${this.name}...`);

            // استفاده از getDialogs با limit بالا (EXPENSIVE OPERATION!)
            const dialogs = await this.client.getDialogs({
                limit: 2000,
                archived: false
            });

            let channelCount = 0;
            let superGroupCount = 0;
            const seenIds = new Set();

            // فقط اطلاعات ضروری را نگه دار (نه کل dialog object)
            const compactDialogs = [];

            for (const dialog of dialogs) {
                if (!dialog || !dialog.entity) continue;

                const id = dialog.entity?.id?.toString();

                if (id && !seenIds.has(id)) {
                    seenIds.add(id);

                    // شمارش کانال‌های broadcast
                    if (dialog.entity?.broadcast === true) {
                        channelCount++;
                        // ذخیره فقط ID و title (نه کل object)
                        compactDialogs.push({
                            id,
                            title: dialog.entity?.title || 'Unknown',
                            broadcast: true
                        });
                    }
                    // شمارش سوپرگروه‌ها (اختیاری)
                    else if (dialog.entity?.megagroup === true) {
                        superGroupCount++;
                    }
                }
            }

            this.currentChannelsCount = channelCount;

            // Cache فقط اطلاعات فشرده شده (نه کل dialogs)
            this.dialogsCache = compactDialogs;
            this.dialogsCacheTimestamp = now;

            logger.info(`✅ ${this.name}: ${channelCount} broadcast channels, ${superGroupCount} supergroups (cached for 10 min)`);

            return channelCount;

        } catch (error) {
            logger.error(`❌ Count failed for ${this.name}: ${error.message}`);
            return this.currentChannelsCount || 0;
        }
    }

    async joinChannel(inviteLink) {
        try {
            if (this.currentChannelsCount >= this.maxChannels) {
                throw new Error(`Session full: ${this.currentChannelsCount}/${this.maxChannels}`);
            }

            if (this.floodWaitUntil && new Date() < this.floodWaitUntil) {
                const waitSeconds = Math.ceil((this.floodWaitUntil - new Date()) / 1000);
                throw new Error(`Flood wait: ${waitSeconds}s`);
            }

            let result;
            let entity;

            if (inviteLink.includes('joinchat') || inviteLink.includes('+')) {
                const hash = inviteLink.split('+').pop() || inviteLink.split('joinchat/').pop();
                result = await this.client.invoke(
                    new Api.messages.ImportChatInvite({
                        hash: hash.split('?')[0].split('/')[0].trim()
                    })
                );
                entity = result.chats?.[0];
            } else {
                const username = inviteLink.replace('https://t.me/', '').replace('@', '').split('?')[0];
                entity = await this.client.getEntity(username);
                result = await this.client.invoke(
                    new Api.channels.JoinChannel({ channel: entity })
                );
            }

            this.currentChannelsCount++;
            this.lastActivity = new Date();

            const chat = entity || result.chats?.[0] || result.chat;

            return {
                success: true,
                channelId: chat?.id?.toString(),
                channelTitle: chat?.title || 'Unknown',
                sessionUsed: this.name,
                sessionCapacity: `${this.currentChannelsCount}/${this.maxChannels}`,
                remainingSlots: this.maxChannels - this.currentChannelsCount
            };

        } catch (error) {
            logger.error(`Join failed: ${error.message}`);

            if (error.message.includes('FLOOD_WAIT')) {
                const waitTime = parseInt(error.message.match(/\d+/)?.[0] || 60);
                this.floodWaitUntil = new Date(Date.now() + waitTime * 1000);
            }

            throw error;
        }
    }

    async getChannelInfo(channelInput, options = {}) {
        try {
            const cacheKey = `channel_${channelInput}`;

            // Check cache first (LRU cache handles TTL automatically)
            if (!options.skipCache) {
                const cached = this.channelCache.get(cacheKey);
                if (cached !== null) {
                    logger.debug(`Cache hit for channel ${channelInput}`);
                    return cached;
                }
            }

            let entity;

            if (channelInput.includes('t.me')) {
                const username = channelInput.split('t.me/')[1].split('/')[0].replace('@', '');
                entity = await this.client.getEntity(username);
            } else if (channelInput.startsWith('@')) {
                entity = await this.client.getEntity(channelInput);
            } else if (/^\d+$/.test(channelInput)) {
                entity = await this.client.getEntity(parseInt(channelInput));
            } else {
                entity = await this.client.getEntity(channelInput);
            }

            const channelInfo = {
                success: true,
                id: entity.id?.toString(),
                title: entity.title || 'Unknown',
                username: entity.username || null,
                participantsCount: entity.participantsCount || 0,
                verified: entity.verified || false,
                broadcast: entity.broadcast || false,
                megagroup: entity.megagroup || false,
                sessionCapacity: `${this.currentChannelsCount}/${this.maxChannels}`
            };

            // Store in LRU cache (automatically handles size limits and eviction)
            this.channelCache.set(cacheKey, channelInfo);

            return channelInfo;

        } catch (error) {
            logger.error(`Get info failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async leaveChannel(channelId) {
        try {
            const entity = await this.client.getEntity(channelId);
            await this.client.invoke(
                new Api.channels.LeaveChannel({ channel: entity })
            );

            this.currentChannelsCount = Math.max(0, this.currentChannelsCount - 1);
            this.lastActivity = new Date();

            // Invalidate cache for this channel
            const cacheKey = `channel_${channelId}`;
            this.channelCache.delete(cacheKey);

            return {
                success: true,
                message: `Left channel ${channelId}`,
                sessionName: this.name
            };

        } catch (error) {
            logger.error(`Leave failed: ${error.message}`);
            throw error;
        }
    }

    getStatus() {
        const usagePercentage = Math.round((this.currentChannelsCount / this.maxChannels) * 100);

        return {
            name: this.name,
            connected: this.isConnected,
            isPremium: this.isPremium,
            maxChannels: this.maxChannels,
            currentChannels: this.currentChannelsCount,
            channelsUsed: this.currentChannelsCount,
            remainingCapacity: this.maxChannels - this.currentChannelsCount,
            usagePercentage: usagePercentage,
            healthStatus: this.healthStatus,
            lastActivity: this.lastActivity,
            floodWait: this.floodWaitUntil && this.floodWaitUntil > new Date(),
            cacheStats: this.channelCache.getStats()
        };
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStats() {
        return this.channelCache.getStats();
    }

    /**
     * Manually trigger cache cleanup
     */
    cleanupCache() {
        this.channelCache.cleanup();
    }

    /**
     * Clear all cached data
     */
    clearCache() {
        this.channelCache.clear();
        logger.info(`Cache cleared for session ${this.name}`);
    }

    /**
     * Disconnect and cleanup
     */
    async disconnect() {
        try {
            if (this.client && this.isConnected) {
                await this.client.disconnect();
                logger.info(`Disconnected session ${this.name}`);
            }
        } catch (error) {
            logger.error(`Error disconnecting ${this.name}:`, error.message);
        } finally {
            this.isConnected = false;
            this.healthStatus = 'disconnected';

            // Destroy cache and stop cleanup interval
            this.channelCache.destroy();
            logger.info(`Cache destroyed for session ${this.name}`);
        }
    }

    /**
     * Reconnect session
     */
    async reconnect() {
        logger.info(`Attempting to reconnect ${this.name}...`);

        // First disconnect cleanly
        await this.disconnect();

        // Wait a bit before reconnecting
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Recreate the cache
        this.channelCache = new LRUCache(100, 300000);

        // Reconnect
        return await this.connect();
    }
}

export default TelegramSession;
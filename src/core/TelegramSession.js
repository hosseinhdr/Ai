import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import logger from '../utils/logger.js';

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
        this.channelCache = new Map();
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
                        debug: () => {}
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
            logger.error(`❌ ${this.name} connection failed:`, error.message);

            if (error.message.includes('FLOOD_WAIT')) {
                const waitTime = parseInt(error.message.match(/\d+/)?.[0] || 60);
                this.floodWaitUntil = new Date(Date.now() + waitTime * 1000);
                this.healthStatus = 'warning';
            }

            if (retryCount < this.maxConnectionAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return this.connect(retryCount + 1);
            }

            this.isConnected = false;
            this.healthStatus = 'critical';
            return false;
        }
    }

    /**
     * شمارش دقیق کانال‌ها - فقط با getDialogs
     */
    async updateChannelsCount() {
        try {
            logger.info(`📊 Counting channels for ${this.name}...`);

            // استفاده از getDialogs با limit بالا
            const dialogs = await this.client.getDialogs({
                limit: 2000,
                archived: false
            });

            let channelCount = 0;
            let superGroupCount = 0;
            const seenIds = new Set();

            for (const dialog of dialogs) {
                if (!dialog || !dialog.entity) continue;

                const id = dialog.entity?.id?.toString();

                if (id && !seenIds.has(id)) {
                    seenIds.add(id);

                    // شمارش کانال‌های broadcast
                    if (dialog.entity?.broadcast === true) {
                        channelCount++;
                    }
                    // شمارش سوپرگروه‌ها (اختیاری)
                    else if (dialog.entity?.megagroup === true) {
                        superGroupCount++;
                    }
                }
            }

            this.currentChannelsCount = channelCount;
            logger.info(`✅ ${this.name}: ${channelCount} broadcast channels, ${superGroupCount} supergroups`);

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

    async leaveChannel(channelId) {
        try {
            const entity = await this.client.getEntity(channelId);
            await this.client.invoke(
                new Api.channels.LeaveChannel({ channel: entity })
            );

            this.currentChannelsCount = Math.max(0, this.currentChannelsCount - 1);
            this.lastActivity = new Date();

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

    async getChannelInfo(channelInput, options = {}) {
        try {
            const cacheKey = `channel_${channelInput}`;

            if (!options.skipCache && this.channelCache.has(cacheKey)) {
                const cached = this.channelCache.get(cacheKey);
                if (Date.now() - cached.timestamp < 300000) {
                    return cached.data;
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

            this.channelCache.set(cacheKey, {
                data: channelInfo,
                timestamp: Date.now()
            });

            return channelInfo;

        } catch (error) {
            logger.error(`Get info failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
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
            channelsUsed: this.currentChannelsCount,  // این خط مهمه
            remainingCapacity: this.maxChannels - this.currentChannelsCount,
            usagePercentage: usagePercentage,
            healthStatus: this.healthStatus,
            lastActivity: this.lastActivity,
            floodWait: this.floodWaitUntil && this.floodWaitUntil > new Date()
        };
    }

}

export default TelegramSession;
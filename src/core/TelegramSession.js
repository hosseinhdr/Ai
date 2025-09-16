import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Api } from 'telegram';
import logger from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

class TelegramSession {
    constructor(name, sessionString, apiId, apiHash, isPremium = false) {
        this.name = name;
        this.sessionString = sessionString;
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.isPremium = isPremium;
        this.client = null;
        this.isConnected = false;
        this.currentChannelsCount = 0;
        this.maxChannels = isPremium ? 1000 : 500;
        this.healthStatus = 'healthy';
        this.lastError = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        this.floodWaitUntil = null;
        this.lastActivity = new Date();

        // Cache for channel info
        this.channelCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes cache
    }

    async connect(retryCount = 0) {
        try {
            logger.info(`🔄 Connecting session ${this.name}...`);

            // Fixed logger configuration
            const customLogger = {
                log: (...args) => {},
                error: (...args) => {},
                warn: (...args) => {},
                info: (...args) => {},
                debug: (...args) => {},
                canSend: () => false,
                format: () => '',
                setLevel: () => {},
                isSendingLogs: false,
                getLevel: () => 'none'
            };

            this.client = new TelegramClient(
                new StringSession(this.sessionString),
                this.apiId,
                this.apiHash,
                {
                    connectionRetries: 3,
                    retryDelay: 500,
                    useWSS: true,
                    timeout: 10000,
                    requestRetries: 2,
                    baseLogger: customLogger,
                    logger: customLogger
                }
            );

            await this.client.connect();

            // Test connection
            const me = await Promise.race([
                this.client.getMe(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection test timeout')), 5000)
                )
            ]);

            this.isConnected = true;
            this.connectionAttempts = 0;
            this.healthStatus = 'healthy';

            // Update premium status
            this.isPremium = me.premium || false;
            this.maxChannels = this.isPremium ? 1000 : 500;

            // Get channels count in background
            this.updateChannelsCount().catch(err =>
                logger.error(`Background channel count update failed: ${err.message}`)
            );

            logger.info(`✅ ${this.name} connected successfully`);
            logger.info(`   Premium: ${this.isPremium ? 'Yes ⭐' : 'No'}`);

            return true;

        } catch (error) {
            this.connectionAttempts++;
            this.lastError = error.message;

            logger.error(`❌ ${this.name} connection failed (Attempt ${retryCount})`);
            logger.error(`   Reason: ${error.message}`);

            if (error.message.includes('AUTH_KEY_INVALID')) {
                this.healthStatus = 'critical';
                return false;
            }

            if (error.message.includes('FLOOD_WAIT')) {
                const waitTime = parseInt(error.message.match(/\d+/)?.[0] || 60);
                this.floodWaitUntil = new Date(Date.now() + waitTime * 1000);
                this.healthStatus = 'warning';
                return false;
            }

            if (retryCount < this.maxConnectionAttempts) {
                logger.info(`   Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.connect(retryCount + 1);
            }

            this.isConnected = false;
            this.healthStatus = 'critical';
            return false;
        }
    }

    async updateChannelsCount() {
        try {
            const dialogs = await this.client.getDialogs({
                limit: 100,
                offsetDate: 0,
                offsetId: 0,
                offsetPeer: 'me'
            });

            const channels = dialogs.filter(dialog =>
                dialog.isChannel || dialog.entity?.broadcast
            );

            this.currentChannelsCount = channels.length;
            return this.currentChannelsCount;
        } catch (error) {
            logger.error(`Failed to update channels count for ${this.name}:`, error.message);
            return 0;
        }
    }

    /**
     * Get channel info - FIXED VERSION
     */
    async getChannelInfo(channelIdentifier, options = {}) {
        const {
            joinIfNeeded = true,
            leaveAfter = false,
            forceRefresh = false
        } = options;

        // Check cache first
        const cacheKey = `${channelIdentifier}_${joinIfNeeded}_${leaveAfter}`;
        if (!forceRefresh && this.channelCache.has(cacheKey)) {
            const cached = this.channelCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                logger.debug(`Using cached info for ${channelIdentifier}`);
                return cached.data;
            }
        }

        try {
            logger.info(`Getting channel info for: ${channelIdentifier}`);

            let entity = null;
            let channelInfo = {};
            let wasJoined = false;
            let needsToLeave = false;

            // Step 1: Try to get entity
            try {
                // Handle numeric IDs
                if (/^-?\d+$/.test(channelIdentifier)) {
                    // Try different ID formats
                    const possibleIds = [
                        channelIdentifier,
                        `-100${channelIdentifier}`,
                        channelIdentifier.toString().replace('-100', ''),
                        `-${channelIdentifier}`
                    ];

                    for (const id of possibleIds) {
                        try {
                            logger.debug(`Trying ID format: ${id}`);
                            entity = await this.client.getEntity(id);
                            if (entity) {
                                logger.info(`Found entity with ID: ${id}`);
                                break;
                            }
                        } catch (e) {
                            // Continue trying
                        }
                    }
                }
                // Handle invite links
                else if (channelIdentifier.includes('t.me/joinchat/') || channelIdentifier.includes('t.me/+')) {
                    let hash;
                    if (channelIdentifier.includes('t.me/+')) {
                        hash = channelIdentifier.split('t.me/+')[1].split('?')[0];
                    } else {
                        hash = channelIdentifier.split('t.me/joinchat/')[1].split('?')[0];
                    }

                    logger.info(`Checking invite hash: ${hash}`);

                    const inviteInfo = await this.client.invoke(
                        new Api.messages.CheckChatInvite({ hash })
                    );

                    if (inviteInfo.className === 'ChatInviteAlready') {
                        // Already a member
                        entity = inviteInfo.chat;
                        logger.info('Already a member of this channel');
                    } else if (inviteInfo.className === 'ChatInvite' && joinIfNeeded) {
                        // Not a member, need to join
                        logger.info('Not a member, attempting to join...');
                        const joinResult = await this.joinChannel(channelIdentifier);
                        wasJoined = true;
                        needsToLeave = leaveAfter;

                        if (joinResult.channelId) {
                            entity = await this.client.getEntity(joinResult.channelId);
                        }
                    } else {
                        // Return preview info
                        channelInfo = {
                            id: null,
                            title: inviteInfo.title || 'Unknown',
                            about: inviteInfo.about || null,
                            participantsCount: inviteInfo.participantsCount || 0,
                            isPublic: false,
                            isPrivate: true,
                            preview: true,
                            needsToJoin: true,
                            sessionName: this.name
                        };

                        this.channelCache.set(cacheKey, {
                            data: channelInfo,
                            timestamp: Date.now()
                        });

                        return channelInfo;
                    }
                }
                // Handle public usernames
                else {
                    let username = channelIdentifier;
                    if (channelIdentifier.includes('t.me/')) {
                        username = channelIdentifier.split('t.me/')[1].split('?')[0];
                    }
                    username = username.replace('@', '');

                    logger.info(`Getting entity for username: ${username}`);
                    entity = await this.client.getEntity(username);
                }

            } catch (error) {
                logger.error(`Failed to get entity: ${error.message}`);

                // If we couldn't get entity and joinIfNeeded is true, try joining
                if (joinIfNeeded && !entity) {
                    try {
                        logger.info('Attempting to join channel...');
                        const joinResult = await this.joinChannel(channelIdentifier);
                        wasJoined = true;
                        needsToLeave = leaveAfter;

                        if (joinResult.channelId) {
                            entity = await this.client.getEntity(joinResult.channelId);
                        }
                    } catch (joinError) {
                        logger.error('Join failed:', joinError.message);
                        throw new Error(`Cannot access channel: ${joinError.message}`);
                    }
                }

                if (!entity) {
                    throw error;
                }
            }

            // Step 2: Extract channel info from entity
            if (entity) {
                logger.info('Extracting channel information...');

                // Basic info from entity
                channelInfo = {
                    id: entity.id?.toString(),
                    title: entity.title || 'Unknown',
                    username: entity.username || null,
                    participantsCount: entity.participantsCount || 0,
                    isPublic: !!entity.username,
                    isPrivate: !entity.username,
                    isBroadcast: entity.broadcast === true,
                    isMegagroup: entity.megagroup === true,
                    isVerified: entity.verified === true,
                    isScam: entity.scam === true,
                    isFake: entity.fake === true,
                    hasGeo: entity.hasGeo === true,
                    sessionName: this.name,
                    isMember: true,
                    wasAutoJoined: wasJoined
                };

                // Try to get full channel info
                try {
                    logger.info('Getting full channel info...');
                    const fullChannel = await this.client.invoke(
                        new Api.channels.GetFullChannel({ channel: entity })
                    );

                    if (fullChannel && fullChannel.fullChat) {
                        const fullChat = fullChannel.fullChat;

                        // Add additional info
                        channelInfo.about = fullChat.about || channelInfo.about;
                        channelInfo.participantsCount = fullChat.participantsCount || channelInfo.participantsCount;
                        channelInfo.adminsCount = fullChat.adminsCount || 0;
                        channelInfo.bannedCount = fullChat.bannedCount || 0;
                        channelInfo.onlineCount = fullChat.onlineCount || 0;
                        channelInfo.canViewStats = fullChat.canViewStats || false;
                        channelInfo.slowmodeEnabled = fullChat.slowmodeEnabled || false;
                        channelInfo.linkedChatId = fullChat.linkedChatId?.toString() || null;
                        channelInfo.migrateToChatId = fullChat.migrateToChatId?.toString() || null;
                        channelInfo.pinnedMsgId = fullChat.pinnedMsgId || null;
                        channelInfo.folderId = fullChat.folderId || null;
                        channelInfo.ttlPeriod = fullChat.ttlPeriod || null;
                        channelInfo.themeEmoticon = fullChat.themeEmoticon || null;
                        channelInfo.requestsPending = fullChat.requestsPending || 0;

                        logger.info(`Full info retrieved: ${channelInfo.title} (${channelInfo.participantsCount} members)`);
                    }
                } catch (fullError) {
                    logger.warn(`Could not get full info: ${fullError.message}`);
                    // Continue with basic info
                }

                // Try to get recent message
                try {
                    const messages = await this.client.getMessages(entity, { limit: 1 });
                    if (messages && messages.length > 0) {
                        channelInfo.lastMessageDate = messages[0].date;
                        channelInfo.totalMessages = messages.total || 0;
                    }
                } catch (msgError) {
                    logger.debug(`Could not get messages: ${msgError.message}`);
                }
            }

            // Step 3: Leave if requested
            if (needsToLeave && channelInfo.id) {
                try {
                    logger.info(`Leaving channel after getting info...`);
                    await this.leaveChannel(channelInfo.id);
                    channelInfo.wasAutoLeft = true;
                    channelInfo.isMember = false;
                } catch (leaveError) {
                    logger.error('Failed to leave channel:', leaveError.message);
                    channelInfo.leaveError = leaveError.message;
                }
            }

            // Cache the result
            if (channelInfo && Object.keys(channelInfo).length > 0) {
                this.channelCache.set(cacheKey, {
                    data: channelInfo,
                    timestamp: Date.now()
                });

                // Clean old cache entries
                if (this.channelCache.size > 100) {
                    const oldestKey = this.channelCache.keys().next().value;
                    this.channelCache.delete(oldestKey);
                }
            }

            logger.info(`Channel info retrieved successfully: ${JSON.stringify(channelInfo).substring(0, 100)}...`);
            return channelInfo;

        } catch (error) {
            logger.error(`${this.name} failed to get channel info: ${error.message}`);
            throw error;
        }
    }

    async joinChannel(inviteLink) {
        // Check flood wait
        if (this.floodWaitUntil && new Date() < this.floodWaitUntil) {
            const waitSeconds = Math.ceil((this.floodWaitUntil - new Date()) / 1000);
            throw new Error(`Flood wait active. Wait ${waitSeconds} seconds`);
        }

        // Check capacity
        if (this.currentChannelsCount >= this.maxChannels) {
            throw new Error(`Session ${this.name} has reached maximum capacity (${this.maxChannels} channels)`);
        }

        try {
            let result;
            let entity;

            // Handle different link formats
            if (inviteLink.includes('t.me/joinchat/') || inviteLink.includes('t.me/+')) {
                // Private channel
                let hash;
                if (inviteLink.includes('t.me/+')) {
                    hash = inviteLink.split('t.me/+')[1];
                } else {
                    hash = inviteLink.split('t.me/joinchat/')[1];
                }

                hash = hash.split('?')[0].split('/')[0].trim();
                logger.info(`Joining with hash: ${hash}`);

                result = await this.client.invoke(
                    new Api.messages.ImportChatInvite({ hash })
                );

                entity = result.chats?.[0];
            } else {
                // Public channel
                const username = inviteLink.replace('@', '').replace('https://t.me/', '').split('?')[0];
                entity = await this.client.getEntity(username);

                result = await this.client.invoke(
                    new Api.channels.JoinChannel({ channel: entity })
                );
            }

            this.currentChannelsCount++;
            this.lastActivity = new Date();

            const chat = result.chats?.[0] || result.chat || entity;

            return {
                success: true,
                channelId: chat?.id?.toString(),
                channelTitle: chat?.title || 'Unknown',
                channelUsername: chat?.username || null,
                sessionUsed: this.name,
                sessionCapacity: `${this.currentChannelsCount}/${this.maxChannels}`,
                remainingSlots: this.maxChannels - this.currentChannelsCount,
                entity: entity || chat
            };

        } catch (error) {
            logger.error(`${this.name} failed to join channel:`, error.message);

            if (error.message.includes('FLOOD_WAIT')) {
                const waitTime = parseInt(error.message.match(/\d+/)?.[0] || 60);
                this.floodWaitUntil = new Date(Date.now() + waitTime * 1000);
                this.healthStatus = 'warning';
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

            // Clear cache
            for (const [key] of this.channelCache) {
                if (key.includes(channelId)) {
                    this.channelCache.delete(key);
                }
            }

            return {
                success: true,
                message: `Left channel ${channelId}`,
                sessionName: this.name
            };

        } catch (error) {
            logger.error(`${this.name} failed to leave channel:`, error.message);
            throw error;
        }
    }

    async listChannels() {
        try {
            const dialogs = await this.client.getDialogs({
                limit: 500,
                archived: false
            });

            const channels = dialogs
                .filter(dialog => dialog.isChannel || dialog.entity?.broadcast)
                .map(dialog => ({
                    id: dialog.entity.id?.toString(),
                    title: dialog.entity.title,
                    username: dialog.entity.username || null,
                    participantsCount: dialog.entity.participantsCount || 0,
                    isPublic: !!dialog.entity.username,
                    unreadCount: dialog.unreadCount || 0,
                    lastMessage: dialog.message?.message || null,
                    lastMessageDate: dialog.message?.date
                }));

            return channels;

        } catch (error) {
            logger.error(`${this.name} failed to list channels:`, error.message);
            throw error;
        }
    }

    async reconnect() {
        logger.info(`🔄 Reconnecting session ${this.name}...`);

        if (this.client) {
            try {
                await this.client.disconnect();
            } catch (error) {
                logger.debug(`Error disconnecting ${this.name}:`, error.message);
            }
        }

        this.channelCache.clear();
        this.isConnected = false;
        return this.connect();
    }

    async disconnect() {
        if (this.client && this.isConnected) {
            try {
                await this.client.disconnect();
                this.isConnected = false;
                this.channelCache.clear();
                logger.info(`${this.name} disconnected`);
            } catch (error) {
                logger.error(`Error disconnecting ${this.name}:`, error.message);
            }
        }
    }

    getStatus() {
        return {
            name: this.name,
            connected: this.isConnected,
            isPremium: this.isPremium,
            channelsUsed: this.currentChannelsCount,
            maxChannels: this.maxChannels,
            usage: `${Math.round((this.currentChannelsCount / this.maxChannels) * 100)}%`,
            health: this.healthStatus,
            lastError: this.lastError,
            floodWait: this.floodWaitUntil ? this.floodWaitUntil.toISOString() : null,
            lastActivity: this.lastActivity.toISOString(),
            cacheSize: this.channelCache.size
        };
    }

    clearCache() {
        const cleared = this.channelCache.size;
        this.channelCache.clear();
        logger.debug(`Cleared ${cleared} cached entries for ${this.name}`);
    }
}

export { TelegramSession };
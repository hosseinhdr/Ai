import { TelegramSession } from './TelegramSession.js';
import { SessionPool } from './SessionPool.js';
import logger from '../utils/logger.js';
import { rateMonitor } from '../middleware/smartRateMonitor.js';

class TelegramManager {
    constructor(config, database, operationQueue) {
        this.config = config;
        this.database = database;
        this.operationQueue = operationQueue;
        this.sessions = [];
        this.sessionPool = null;
        this.isInitialized = false;
        this.rateMonitor = rateMonitor;
    }

    async initialize() {
        logger.info('📱 Initializing Telegram Manager...');

        // Check for recent shutdown to prevent AUTH_KEY_DUPLICATED
        const lastShutdownFile = '/tmp/telegram-manager-shutdown.lock';
        try {
            const fs = await import('fs');
            if (fs.existsSync(lastShutdownFile)) {
                const lastShutdown = parseInt(fs.readFileSync(lastShutdownFile, 'utf8') || '0');
                const timeSinceShutdown = Date.now() - lastShutdown;
                const minWaitTime = 5000; // 5 seconds minimum between shutdown and startup

                if (timeSinceShutdown < minWaitTime) {
                    const waitTime = minWaitTime - timeSinceShutdown;
                    logger.warn(`⏳ Waiting ${waitTime}ms before connecting to prevent AUTH_KEY_DUPLICATED...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
                fs.unlinkSync(lastShutdownFile);
            }
        } catch (err) {
            // Ignore file errors
        }

        // Initialize sessions
        for (const sessionConfig of this.config.telegram.sessions) {
            const session = new TelegramSession(
                sessionConfig.name,
                sessionConfig.string,
                this.config.telegram.apiId,
                this.config.telegram.apiHash,
                sessionConfig.isPremium
            );
            this.sessions.push(session);
        }

        // Connect sessions with staggered delays to avoid rate limiting
        logger.info(`Connecting ${this.sessions.length} sessions with staggered delays...`);
        const results = [];

        for (let i = 0; i < this.sessions.length; i++) {
            const session = this.sessions[i];

            // Add 2-second delay between connections (except first one)
            if (i > 0) {
                logger.debug(`Waiting 2s before connecting ${session.name}...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            try {
                const connected = await session.connect();
                results.push({ status: 'fulfilled', value: connected });
            } catch (error) {
                results.push({ status: 'rejected', reason: error });
            }
        }

        const connectedSessions = results.filter(r => r.status === 'fulfilled' && r.value === true);

        if (connectedSessions.length === 0) {
            throw new Error('No sessions could be connected');
        }

        logger.info(`✅ Connected ${connectedSessions.length}/${this.sessions.length} sessions`);

        // Initialize session pool
        const activeSessions = this.sessions.filter(s => s.isConnected);
        if (activeSessions.length > 0) {
            this.sessionPool = new SessionPool(activeSessions);
            logger.info('✅ Session pool initialized');
        }

        this.isInitialized = true;
        return true;
    }

    async joinChannel(channelIdentifier) {
        if (!this.sessionPool) {
            throw new Error('No active sessions available');
        }

        // Queue the operation
        if (this.operationQueue) {
            return new Promise((resolve, reject) => {
                this.operationQueue.add(async () => {
                    try {
                        const result = await this._performJoin(channelIdentifier);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                }, 8);
            });
        }

        return this._performJoin(channelIdentifier);
    }

    async _performJoin(channelIdentifier) {
        const session = await this.sessionPool.getAvailableSession();

        if (!session) {
            throw new Error('No available sessions with free capacity');
        }

        // Check rate limit
        const canProceed = this.rateMonitor.canPerformOperation('join', session.name);
        if (!canProceed.allowed) {
            throw new Error(`Rate limit: ${canProceed.reason}. Wait ${canProceed.waitTime}ms`);
        }

        try {
            const result = await session.joinChannel(channelIdentifier);

            // Record success
            this.rateMonitor.recordOperation('join', session.name, true);

            // Save to database
            if (this.database?.isConnected) {
                await this.database.registerChannel({
                    id: result.channelId,
                    username: result.channelUsername,
                    title: result.channelTitle,
                    isPublic: !!result.channelUsername
                });

                await this.database.linkSessionToChannel(session.name, result.channelId);
                await this.database.updateSessionChannelCount(session.name, 1);
            }

            logger.info(`✅ Joined channel: ${result.channelTitle} using ${session.name}`);
            return result;

        } catch (error) {
            logger.error(`Failed to join channel: ${error.message}`);
            this.rateMonitor.recordOperation('join', session.name, false, error.message);

            if (error.message.includes('FLOOD_WAIT')) {
                const waitTime = parseInt(error.message.match(/\d+/)?.[0] || 60);
                session.floodWaitUntil = new Date(Date.now() + waitTime * 1000);
            }

            throw error;
        }
    }

    async leaveChannel(channelId, sessionName = null) {
        let session;

        if (sessionName) {
            session = this.getSessionByName(sessionName);
            if (!session) {
                throw new Error(`Session ${sessionName} not found`);
            }
        } else {
            session = await this.findSessionWithChannel(channelId);
            if (!session) {
                throw new Error('Channel not found in any session');
            }
        }

        const canProceed = this.rateMonitor.canPerformOperation('leave', session.name);
        if (!canProceed.allowed) {
            throw new Error(`Rate limit: ${canProceed.reason}. Wait ${canProceed.waitTime}ms`);
        }

        try {
            const result = await session.leaveChannel(channelId);
            this.rateMonitor.recordOperation('leave', session.name, true);

            if (this.database?.isConnected) {
                await this.database.unlinkSessionFromChannel(session.name, channelId);
                await this.database.updateSessionChannelCount(session.name, -1);
            }

            logger.info(`✅ Left channel ${channelId} from ${session.name}`);
            return result;

        } catch (error) {
            logger.error(`Failed to leave channel: ${error.message}`);
            this.rateMonitor.recordOperation('leave', session.name, false, error.message);
            throw error;
        }
    }

    /**
     * Get channel info with intelligent session selection
     */
    async getChannelInfo(channelIdentifier) {
        // Try to find a session that's already member of the channel
        let session = null;

        // If it's a numeric ID, try to find session with this channel
        if (/^-?\d+$/.test(channelIdentifier)) {
            session = await this.findSessionWithChannel(channelIdentifier);
        }

        // If no specific session found, use any connected session
        if (!session) {
            session = this.getFirstConnectedSession();
        }

        if (!session) {
            throw new Error('No connected sessions available');
        }

        try {
            const info = await session.getChannelInfo(channelIdentifier);
            this.rateMonitor.recordOperation('info', session.name, true);

            // Save channel info to database if we have it
            if (this.database?.isConnected && info.id) {
                await this.database.updateChannelInfo({
                    id: info.id,
                    title: info.title,
                    username: info.username,
                    about: info.about,
                    participantsCount: info.participantsCount,
                    isPublic: info.isPublic,
                    isPrivate: info.isPrivate
                });
            }

            return { success: true, data: info };
        } catch (error) {
            logger.error(`Failed to get channel info: ${error.message}`);
            this.rateMonitor.recordOperation('info', session.name, false, error.message);

            // If failed with AUTH_KEY error, mark session as dead and try another
            if (error.message.includes('AUTH_KEY')) {
                session.healthStatus = 'dead';
                session.isConnected = false;
                logger.warn(`Session ${session.name} marked as dead due to AUTH_KEY error`);
            }

            // Try another healthy session
            if (this.sessions.length > 1) {
                const otherSession = this.sessions.find(s =>
                    s.isConnected &&
                    s !== session &&
                    s.healthStatus !== 'dead'
                );
                if (otherSession) {
                    try {
                        logger.info(`Retrying with session ${otherSession.name}...`);
                        const info = await otherSession.getChannelInfo(channelIdentifier);
                        return { success: true, data: info };
                    } catch (retryError) {
                        logger.error('Retry also failed:', retryError.message);
                    }
                }
            }

            throw error;
        }
    }

    /**
     * Get channel profile photo
     */
    async getChannelPhoto(channelIdentifier) {
        const session = await this.findBestSessionForChannel(channelIdentifier);

        if (!session) {
            throw new Error('No suitable session found');
        }

        try {
            const photoPath = await session.downloadChannelPhoto(channelIdentifier);

            return {
                success: true,
                photoPath: photoPath,
                sessionUsed: session.name
            };
        } catch (error) {
            logger.error(`Failed to get channel photo: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get channel statistics (if we're admin)
     */
    async getChannelStats(channelId) {
        const session = await this.findSessionWithChannel(channelId);

        if (!session) {
            throw new Error('Channel not found in any session');
        }

        try {
            const stats = await session.getChannelStatistics(channelId);

            return {
                success: true,
                data: stats,
                sessionUsed: session.name
            };
        } catch (error) {
            logger.error(`Failed to get channel stats: ${error.message}`);
            throw error;
        }
    }

    /**
     * Find best session for channel operations
     */
    async findBestSessionForChannel(channelIdentifier) {
        // First, try to find a session that's already member
        if (/^-?\d+$/.test(channelIdentifier)) {
            const memberSession = await this.findSessionWithChannel(channelIdentifier);
            if (memberSession && memberSession.healthStatus !== 'dead') return memberSession;
        }

        // Otherwise, return the healthiest connected session (exclude dead sessions)
        const healthySessions = this.sessions
            .filter(s => s.isConnected && s.healthStatus === 'healthy')
            .sort((a, b) => a.currentChannelsCount - b.currentChannelsCount);

        return healthySessions[0] || this.getFirstConnectedSession();
    }

    async listAllChannels() {
        const allChannels = {};
        let totalChannels = 0;

        for (const session of this.sessions) {
            if (!session.isConnected) continue;

            try {
                const channels = await session.listChannels();
                allChannels[session.name] = channels;
                totalChannels += channels.length;
                this.rateMonitor.recordOperation('list', session.name, true);
            } catch (error) {
                logger.error(`Failed to list channels for ${session.name}:`, error.message);
                allChannels[session.name] = [];
                this.rateMonitor.recordOperation('list', session.name, false, error.message);
            }
        }

        return {
            success: true,
            data: {
                total: totalChannels,
                bySession: allChannels
            }
        };
    }

    async leaveInactiveChannels(days = 7) {
        const leftChannels = [];
        let totalLeft = 0;

        for (const session of this.sessions) {
            if (!session.isConnected) continue;

            try {
                const channels = await session.listChannels();
                const now = Date.now();
                const daysInMs = days * 24 * 60 * 60 * 1000;

                for (const channel of channels) {
                    const lastMessageTime = channel.lastMessageDate ?
                        new Date(channel.lastMessageDate * 1000).getTime() : 0;

                    if ((now - lastMessageTime) > daysInMs) {
                        try {
                            await session.leaveChannel(channel.id);
                            leftChannels.push({
                                id: channel.id,
                                title: channel.title,
                                sessionName: session.name
                            });
                            totalLeft++;
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (error) {
                            logger.error(`Failed to leave channel ${channel.title}:`, error.message);
                        }
                    }
                }
            } catch (error) {
                logger.error(`Failed to process channels for ${session.name}:`, error.message);
            }
        }

        logger.info(`🧹 Cleanup complete: Left ${totalLeft} inactive channels`);
        return { success: true, totalLeft, leftChannels };
    }


    async getSessionsStatus() {
        const status = {
            total: this.sessions.length,
            active: 0,
            inactive: 0,
            totalChannelsUsed: 0,
            totalCapacity: 0,
            sessions: []
        };

        for (const session of this.sessions) {
            const sessionStatus = session.getStatus();

            if (session.isConnected) {
                status.active++;
            } else {
                status.inactive++;
            }

            status.totalChannelsUsed += session.currentChannelsCount || 0;
            status.totalCapacity += session.maxChannels || 0;

            // اینجا دقیقاً همون فیلد channelsUsed که frontend می‌خواد
            status.sessions.push({
                name: sessionStatus.name,
                connected: sessionStatus.connected,
                isPremium: sessionStatus.isPremium,
                maxChannels: sessionStatus.maxChannels,

                // این فیلد مهمه که frontend استفاده می‌کنه
                channelsUsed: session.currentChannelsCount || 0,

                // بقیه فیلدها
                usage: sessionStatus.usagePercentage ? `${sessionStatus.usagePercentage}%` : '0%',
                health: sessionStatus.healthStatus,
                lastActivity: sessionStatus.lastActivity,
                lastError: null // اگر خطایی داشته باشید
            });
        }

        return { success: true, data: status };
    }

    async getCapacityStats() {
        const stats = {
            total: { used: 0, max: 0, percentage: 0 },
            sessions: []
        };

        for (const session of this.sessions) {
            const used = session.currentChannelsCount || 0;
            const max = session.maxChannels || 0;

            stats.total.used += used;
            stats.total.max += max;

            stats.sessions.push({
                name: session.name,
                used: used,
                max: max,
                percentage: max > 0 ? Math.round((used / max) * 100) : 0
            });
        }

        if (stats.total.max > 0) {
            stats.total.percentage = Math.round((stats.total.used / stats.total.max) * 100);
        }

        return stats;
    }

    getSessionByName(name) {
        return this.sessions.find(s => s.name === name);
    }

    getFirstConnectedSession() {
        // Skip sessions with AUTH_KEY issues (dead status)
        return this.sessions.find(s => s.isConnected && s.healthStatus !== 'dead');
    }

    async findSessionWithChannel(channelId) {
        for (const session of this.sessions) {
            if (!session.isConnected) continue;

            try {
                const channels = await session.listChannels();
                if (channels.some(c => c.id === channelId || c.id === `-100${channelId}` || c.id === channelId.replace('-100', ''))) {
                    return session;
                }
            } catch (error) {
                logger.debug(`Error checking channels for ${session.name}:`, error.message);
            }
        }
        return null;
    }

    async reconnectSession(sessionName) {
        const session = this.getSessionByName(sessionName);

        if (!session) {
            throw new Error(`Session ${sessionName} not found`);
        }

        const result = await session.reconnect();

        if (this.database?.isConnected) {
            await this.database.updateSessionStatus(
                sessionName,
                result,
                result ? 'healthy' : 'disconnected'
            );
        }

        if (this.sessionPool) {
            if (result) {
                this.sessionPool.addSession(session);
            } else {
                this.sessionPool.removeSession(sessionName);
            }
        }

        return result;
    }

    async shutdown() {
        logger.info('Shutting down Telegram Manager...');

        if (this.sessionPool) {
            this.sessionPool.stopAutoRotation();
        }

        // Disconnect sessions sequentially with delays to prevent AUTH_KEY_DUPLICATED on restart
        for (const session of this.sessions) {
            try {
                logger.info(`Disconnecting ${session.name}...`);
                await session.disconnect();
                // Small delay between disconnections to ensure clean shutdown
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                logger.debug(`Error disconnecting ${session.name}:`, error.message);
            }
        }

        // Wait a bit after all disconnections to ensure Telegram servers register them
        logger.info('Waiting for Telegram servers to register disconnections...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Write shutdown timestamp to prevent rapid restart AUTH_KEY issues
        try {
            const fs = await import('fs');
            fs.writeFileSync('/tmp/telegram-manager-shutdown.lock', Date.now().toString());
        } catch (err) {
            // Ignore file errors
        }

        this.isInitialized = false;
        logger.info('Telegram Manager shut down complete');
    }

    getRateLimitStatus() {
        return this.rateMonitor.getStats();
    }

    getRateLimitRecommendations() {
        return this.rateMonitor.getAllRecommendations();
    }
    /**
     * Get channel info with options for auto-join and auto-leave
     */
    async getChannelInfoWithOptions(channelIdentifier, options = {}) {
        logger.info(`TelegramManager: Getting info for ${channelIdentifier}`);

        // Find best session for this operation
        const session = await this.findBestSessionForChannel(channelIdentifier) || this.getFirstConnectedSession();

        if (!session) {
            logger.error('No connected sessions available');
            throw new Error('No connected sessions available');
        }

        logger.info(`Using session: ${session.name}`);

        try {
            const info = await session.getChannelInfo(channelIdentifier, options);

            logger.info(`Got channel info:`, info);

            this.rateMonitor.recordOperation('info', session.name, true);

            // Save to database if we have the info
            if (this.database?.isConnected && info.id) {
                await this.database.updateChannelInfo({
                    id: info.id,
                    title: info.title,
                    username: info.username,
                    about: info.about,
                    participantsCount: info.participantsCount,
                    isPublic: info.isPublic,
                    isPrivate: info.isPrivate
                });
            }

            return { success: true, data: info };
        } catch (error) {
            logger.error(`Failed to get channel info with options: ${error.message}`);
            logger.error(`Stack trace:`, error.stack);
            this.rateMonitor.recordOperation('info', session.name, false, error.message);
            throw error;
        }
    }
}

export { TelegramManager };
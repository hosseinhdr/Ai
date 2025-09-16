import logger from '../utils/logger.js';

class SessionPool {
    constructor(sessions = []) {
        this.sessions = sessions.filter(s => s.isConnected);
        this.currentIndex = 0;
        this.rotationInterval = null;
        this.rotationEnabled = true;
        this.lastRotation = new Date();

        // Start auto rotation
        this.startAutoRotation();
    }

    addSession(session) {
        if (session.isConnected && !this.sessions.includes(session)) {
            this.sessions.push(session);
            logger.info(`Added ${session.name} to pool (Total: ${this.sessions.length})`);
        }
    }

    removeSession(sessionName) {
        const index = this.sessions.findIndex(s => s.name === sessionName);
        if (index > -1) {
            this.sessions.splice(index, 1);
            logger.info(`Removed ${sessionName} from pool (Total: ${this.sessions.length})`);

            // Adjust current index if necessary
            if (this.currentIndex >= this.sessions.length && this.sessions.length > 0) {
                this.currentIndex = 0;
            }
        }
    }

    async getAvailableSession() {
        if (this.sessions.length === 0) {
            return null;
        }

        // Try to find a session with available capacity
        let attempts = 0;
        const maxAttempts = this.sessions.length;

        while (attempts < maxAttempts) {
            const session = this.sessions[this.currentIndex];

            // Check if session is still connected and has capacity
            if (session.isConnected &&
                session.currentChannelsCount < session.maxChannels &&
                (!session.floodWaitUntil || new Date() > session.floodWaitUntil)) {

                // Rotate for next call
                this.rotate();
                return session;
            }

            // Try next session
            this.rotate();
            attempts++;
        }

        // No available session found
        logger.warn('No available sessions with free capacity');
        return null;
    }

    rotate() {
        this.currentIndex = (this.currentIndex + 1) % this.sessions.length;
        this.lastRotation = new Date();
    }

    startAutoRotation(intervalMs = 300000) { // 5 minutes
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }

        this.rotationInterval = setInterval(() => {
            if (this.rotationEnabled && this.sessions.length > 1) {
                this.rotate();
                logger.debug(`Auto-rotated to session index ${this.currentIndex}`);
            }
        }, intervalMs);

        logger.info('Session auto-rotation started');
    }

    stopAutoRotation() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
            this.rotationInterval = null;
            logger.info('Session auto-rotation stopped');
        }
    }

    async getPoolStats() {
        const stats = {
            totalSessions: this.sessions.length,
            availableSessions: 0,
            totalCapacity: 0,
            usedCapacity: 0,
            capacityPercentage: 0,
            sessionDetails: [],
            currentIndex: this.currentIndex,
            lastRotation: this.lastRotation
        };

        for (const session of this.sessions) {
            const isAvailable = session.isConnected &&
                session.currentChannelsCount < session.maxChannels &&
                (!session.floodWaitUntil || new Date() > session.floodWaitUntil);

            if (isAvailable) {
                stats.availableSessions++;
            }

            stats.totalCapacity += session.maxChannels;
            stats.usedCapacity += session.currentChannelsCount;

            stats.sessionDetails.push({
                name: session.name,
                connected: session.isConnected,
                available: isAvailable,
                isPremium: session.isPremium,
                channelsUsed: session.currentChannelsCount,
                maxChannels: session.maxChannels,
                usage: `${Math.round((session.currentChannelsCount / session.maxChannels) * 100)}%`,
                health: session.healthStatus,
                floodWait: session.floodWaitUntil ? session.floodWaitUntil.toISOString() : null
            });
        }

        if (stats.totalCapacity > 0) {
            stats.capacityPercentage = Math.round((stats.usedCapacity / stats.totalCapacity) * 100);
        }

        return stats;
    }

    async rebalanceLoad() {
        logger.info('Starting load rebalancing...');

        // Sort sessions by usage percentage
        const sessionStats = await Promise.all(
            this.sessions.map(async (session) => ({
                session,
                usage: (session.currentChannelsCount / session.maxChannels) * 100
            }))
        );

        sessionStats.sort((a, b) => a.usage - b.usage);

        // Reorder sessions array
        this.sessions = sessionStats.map(s => s.session);
        this.currentIndex = 0;

        logger.info('Load rebalancing complete');

        return {
            rebalanced: true,
            order: this.sessions.map(s => ({
                name: s.name,
                usage: `${Math.round((s.currentChannelsCount / s.maxChannels) * 100)}%`
            }))
        };
    }

    getHealthStatus() {
        let healthy = 0;
        let warning = 0;
        let critical = 0;

        for (const session of this.sessions) {
            switch (session.healthStatus) {
                case 'healthy':
                    healthy++;
                    break;
                case 'warning':
                    warning++;
                    break;
                case 'critical':
                    critical++;
                    break;
            }
        }

        let overallStatus = 'healthy';
        if (critical > 0 || healthy === 0) {
            overallStatus = 'critical';
        } else if (warning > this.sessions.length / 2) {
            overallStatus = 'warning';
        }

        return {
            status: overallStatus,
            healthy,
            warning,
            critical,
            total: this.sessions.length
        };
    }

    async checkAndReconnect() {
        const disconnected = this.sessions.filter(s => !s.isConnected);

        if (disconnected.length === 0) {
            return { reconnected: 0, failed: 0 };
        }

        logger.info(`Attempting to reconnect ${disconnected.length} sessions...`);

        let reconnected = 0;
        let failed = 0;

        for (const session of disconnected) {
            try {
                const result = await session.reconnect();
                if (result) {
                    reconnected++;
                } else {
                    failed++;
                }
            } catch (error) {
                logger.error(`Failed to reconnect ${session.name}:`, error.message);
                failed++;
            }
        }

        return { reconnected, failed };
    }
}

export { SessionPool };
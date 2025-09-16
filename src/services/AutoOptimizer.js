import logger from '../utils/logger.js';

export class AutoOptimizer {
    constructor(telegramManager, database) {
        this.telegramManager = telegramManager;
        this.database = database;
        this.isOptimizing = false;
        this.lastOptimization = null;
        this.optimizationHistory = [];
    }

    async getStatus() {
        return {
            isOptimizing: this.isOptimizing,
            lastOptimization: this.lastOptimization,
            history: this.optimizationHistory.slice(-10),
            currentDistribution: await this.getCurrentDistribution(),
            suggestions: await this.getSuggestions()
        };
    }

    async getCurrentDistribution() {
        const sessions = this.telegramManager.sessions;
        const distribution = {};

        for (const session of sessions) {
            distribution[session.name] = {
                channels: session.currentChannelsCount,
                maxCapacity: session.maxChannels,
                usage: Math.round((session.currentChannelsCount / session.maxChannels) * 100),
                health: session.healthStatus,
                isPremium: session.isPremium
            };
        }

        return distribution;
    }

    async getSuggestions() {
        const suggestions = [];
        const distribution = await this.getCurrentDistribution();

        // Find imbalanced sessions
        const sessions = Object.entries(distribution);
        const avgUsage = sessions.reduce((sum, [_, data]) => sum + data.usage, 0) / sessions.length;

        for (const [sessionName, data] of sessions) {
            // Suggest balancing if usage is significantly different from average
            if (Math.abs(data.usage - avgUsage) > 20) {
                if (data.usage > avgUsage) {
                    suggestions.push({
                        type: 'balance',
                        priority: 'high',
                        session: sessionName,
                        action: 'reduce',
                        reason: `استفاده ${data.usage}% در مقایسه با میانگین ${Math.round(avgUsage)}%`,
                        impact: 'بهبود توزیع بار'
                    });
                } else {
                    suggestions.push({
                        type: 'balance',
                        priority: 'medium',
                        session: sessionName,
                        action: 'increase',
                        reason: `استفاده ${data.usage}% در مقایسه با میانگین ${Math.round(avgUsage)}%`,
                        impact: 'استفاده بهتر از ظرفیت'
                    });
                }
            }

            // Suggest cleanup for high usage
            if (data.usage > 90) {
                suggestions.push({
                    type: 'cleanup',
                    priority: 'critical',
                    session: sessionName,
                    action: 'cleanup',
                    reason: `ظرفیت ${data.usage}% - نزدیک به حد مجاز`,
                    impact: 'جلوگیری از خطای ظرفیت'
                });
            }

            // Suggest health check for unhealthy sessions
            if (data.health !== 'healthy') {
                suggestions.push({
                    type: 'health',
                    priority: 'high',
                    session: sessionName,
                    action: 'reconnect',
                    reason: `وضعیت سلامت: ${data.health}`,
                    impact: 'بهبود پایداری سیستم'
                });
            }
        }

        // Sort by priority
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return suggestions;
    }

    async optimize(type = 'balance') {
        if (this.isOptimizing) {
            throw new Error('Optimization already in progress');
        }

        this.isOptimizing = true;
        const startTime = Date.now();
        const result = {
            type,
            startTime: new Date(),
            changes: [],
            errors: []
        };

        try {
            switch (type) {
                case 'balance':
                    await this.balanceLoad(result);
                    break;

                case 'cleanup':
                    await this.cleanupChannels(result);
                    break;

                case 'consolidate':
                    await this.consolidateChannels(result);
                    break;

                case 'full':
                    await this.fullOptimization(result);
                    break;

                default:
                    throw new Error(`Unknown optimization type: ${type}`);
            }

            result.endTime = new Date();
            result.duration = Date.now() - startTime;
            result.success = true;

            // Save to history
            this.lastOptimization = result;
            this.optimizationHistory.push(result);

            // Log to database
            if (this.database?.isConnected) {
                await this.database.logOptimization(result);
            }

            logger.info(`✅ Optimization completed: ${type}`, {
                duration: result.duration,
                changes: result.changes.length
            });

        } catch (error) {
            result.success = false;
            result.error = error.message;
            logger.error('Optimization failed:', error);

        } finally {
            this.isOptimizing = false;
        }

        return result;
    }

    async balanceLoad(result) {
        logger.info('Starting load balancing...');

        const sessions = this.telegramManager.sessions.filter(s => s.isConnected);
        if (sessions.length < 2) {
            result.message = 'Need at least 2 connected sessions for balancing';
            return;
        }

        // Calculate current distribution
        const distribution = sessions.map(s => ({
            session: s,
            usage: (s.currentChannelsCount / s.maxChannels) * 100,
            channels: []
        }));

        // Get all channels
        for (const item of distribution) {
            try {
                const channels = await item.session.listChannels();
                item.channels = channels;
            } catch (error) {
                logger.error(`Failed to get channels for ${item.session.name}:`, error);
            }
        }

        // Sort by usage
        distribution.sort((a, b) => b.usage - a.usage);

        // Calculate target usage
        const totalChannels = distribution.reduce((sum, d) => sum + d.channels.length, 0);
        const totalCapacity = sessions.reduce((sum, s) => sum + s.maxChannels, 0);
        const targetUsage = (totalChannels / totalCapacity) * 100;

        logger.info(`Target usage: ${targetUsage.toFixed(2)}%`);

        // Move channels from high usage to low usage sessions
        const moved = [];

        for (let i = 0; i < distribution.length - 1; i++) {
            const source = distribution[i];

            if (source.usage <= targetUsage + 5) continue;

            for (let j = distribution.length - 1; j > i; j--) {
                const target = distribution[j];

                if (target.usage >= targetUsage - 5) continue;

                // Calculate how many channels to move
                const sourceExcess = source.usage - targetUsage;
                const targetDeficit = targetUsage - target.usage;
                const channelsToMove = Math.min(
                    Math.floor((sourceExcess * source.session.maxChannels) / 100),
                    Math.floor((targetDeficit * target.session.maxChannels) / 100),
                    5 // Max 5 channels at a time
                );

                if (channelsToMove > 0) {
                    // Select channels to move (prefer inactive ones)
                    const candidateChannels = source.channels
                        .sort((a, b) => (a.unreadCount || 0) - (b.unreadCount || 0))
                        .slice(0, channelsToMove);

                    for (const channel of candidateChannels) {
                        try {
                            // Leave from source
                            await source.session.leaveChannel(channel.id);

                            // Join to target
                            const joinLink = channel.username ?
                                `@${channel.username}` :
                                channel.id;

                            await target.session.joinChannel(joinLink);

                            moved.push({
                                channel: channel.title,
                                from: source.session.name,
                                to: target.session.name
                            });

                            // Update counts
                            source.session.currentChannelsCount--;
                            target.session.currentChannelsCount++;

                            // Add delay to avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 2000));

                        } catch (error) {
                            logger.error(`Failed to move channel ${channel.title}:`, error);
                            result.errors.push({
                                channel: channel.title,
                                error: error.message
                            });
                        }
                    }

                    // Recalculate usage
                    source.usage = (source.session.currentChannelsCount / source.session.maxChannels) * 100;
                    target.usage = (target.session.currentChannelsCount / target.session.maxChannels) * 100;
                }
            }
        }

        result.changes = moved;
        result.message = `Moved ${moved.length} channels for better load distribution`;
    }

    async cleanupChannels(result) {
        logger.info('Starting channel cleanup...');

        const sessions = this.telegramManager.sessions.filter(s => s.isConnected);
        const removed = [];

        for (const session of sessions) {
            try {
                const channels = await session.listChannels();

                for (const channel of channels) {
                    // Check cleanup criteria
                    const shouldRemove =
                        (channel.participantsCount < 10) ||
                        (channel.unreadCount > 1000) ||
                        (!channel.lastMessage && !channel.username);

                    if (shouldRemove) {
                        try {
                            await session.leaveChannel(channel.id);
                            removed.push({
                                channel: channel.title,
                                session: session.name,
                                reason: channel.participantsCount < 10 ? 'Low participants' :
                                    channel.unreadCount > 1000 ? 'Too many unread' :
                                        'Inactive'
                            });

                            // Delay to avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 1000));

                        } catch (error) {
                            logger.error(`Failed to leave channel ${channel.title}:`, error);
                        }
                    }
                }

            } catch (error) {
                logger.error(`Failed to cleanup channels for ${session.name}:`, error);
                result.errors.push({
                    session: session.name,
                    error: error.message
                });
            }
        }

        result.changes = removed;
        result.message = `Removed ${removed.length} channels`;
    }

    async consolidateChannels(result) {
        logger.info('Starting channel consolidation...');

        // Move all channels to the most healthy sessions
        const sessions = this.telegramManager.sessions
            .filter(s => s.isConnected)
            .sort((a, b) => {
                // Prioritize by: health > premium > capacity
                if (a.healthStatus !== b.healthStatus) {
                    return a.healthStatus === 'healthy' ? -1 : 1;
                }
                if (a.isPremium !== b.isPremium) {
                    return a.isPremium ? -1 : 1;
                }
                return b.maxChannels - a.maxChannels;
            });

        if (sessions.length < 2) {
            result.message = 'Need at least 2 sessions for consolidation';
            return;
        }

        const targetSessions = sessions.slice(0, Math.ceil(sessions.length / 2));
        const sourceSessions = sessions.slice(Math.ceil(sessions.length / 2));

        const moved = [];

        for (const source of sourceSessions) {
            try {
                const channels = await source.listChannels();

                for (const channel of channels) {
                    // Find best target session
                    const target = targetSessions
                        .filter(t => t.currentChannelsCount < t.maxChannels - 10)
                        .sort((a, b) => a.currentChannelsCount - b.currentChannelsCount)[0];

                    if (target) {
                        try {
                            await source.leaveChannel(channel.id);

                            const joinLink = channel.username ?
                                `@${channel.username}` :
                                channel.id;

                            await target.joinChannel(joinLink);

                            moved.push({
                                channel: channel.title,
                                from: source.name,
                                to: target.name
                            });

                            await new Promise(resolve => setTimeout(resolve, 2000));

                        } catch (error) {
                            logger.error(`Failed to consolidate channel ${channel.title}:`, error);
                        }
                    }
                }

            } catch (error) {
                logger.error(`Failed to get channels for ${source.name}:`, error);
            }
        }

        result.changes = moved;
        result.message = `Consolidated ${moved.length} channels`;
    }

    async fullOptimization(result) {
        logger.info('Starting full optimization...');

        // Step 1: Cleanup
        await this.cleanupChannels(result);

        // Step 2: Balance
        await this.balanceLoad(result);

        // Step 3: Health check
        for (const session of this.telegramManager.sessions) {
            if (!session.isConnected && session.healthStatus !== 'critical') {
                try {
                    const reconnected = await session.reconnect();
                    if (reconnected) {
                        result.changes.push({
                            type: 'reconnect',
                            session: session.name,
                            status: 'success'
                        });
                    }
                } catch (error) {
                    logger.error(`Failed to reconnect ${session.name}:`, error);
                }
            }
        }

        result.message = 'Full optimization completed';
    }
}

export default AutoOptimizer;
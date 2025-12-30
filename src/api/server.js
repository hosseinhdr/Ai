import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import logger from '../utils/logger.js';
import compression from 'compression';
import { rateMonitor } from '../middleware/smartRateMonitor.js';
import {
    globalRateLimiter,
    rateLimiters,
    getRateLimitStatus,
    resetRateLimit
} from '../middleware/rateLimiter.js';
import { SessionAuthAPI } from './sessionAuth.js';
import { AutoOptimizer } from '../services/AutoOptimizer.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LRU Cache for server-side response caching
 */
class LRUServerCache {
    constructor(maxSize = 100, ttlMs = 300000) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.cache = new Map();
        this.accessOrder = new Map();

        // Automatic cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 300000);
    }

    set(key, value) {
        const now = Date.now();

        // Evict LRU if cache is full
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

        // Check expiration
        if (now - item.timestamp > this.ttlMs) {
            this.delete(key);
            return null;
        }

        // Update access time
        this.accessOrder.set(key, now);
        return item;
    }

    has(key) {
        const item = this.get(key);
        return item !== null;
    }

    delete(key) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
    }

    clear() {
        this.cache.clear();
        this.accessOrder.clear();
    }

    cleanup() {
        const now = Date.now();
        let removed = 0;

        for (const [key, item] of this.cache.entries()) {
            if (now - item.timestamp > this.ttlMs) {
                this.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            logger.debug(`Server cache cleanup: removed ${removed} expired entries, ${this.cache.size} remaining`);
        }
    }

    evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, time] of this.accessOrder.entries()) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.delete(oldestKey);
            logger.debug(`Server cache eviction: removed LRU entry`);
        }
    }

    get size() {
        return this.cache.size;
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clear();
    }
}


export class APIServer {
    constructor(telegramManager, database, monitoringService, operationQueue, config) {
        this.app = express();
        this.telegramManager = telegramManager;
        this.database = database;
        this.monitoringService = monitoringService;
        this.operationQueue = operationQueue;
        this.config = config;
        this.server = null;

        this.sessionAuthAPI = new SessionAuthAPI(database, config);
        this.rateMonitor = rateMonitor;

        // Initialize Auto-Optimizer
        this.autoOptimizer = new AutoOptimizer(telegramManager, database);

        // Response cache for channel info with LRU implementation
        this.channelInfoCache = new LRUServerCache(100, 300000); // Max 100 items, 5-min TTL

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(compression());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        this.app.use(cors({
            origin: this.config?.server?.corsOrigin || '*',
            credentials: true,
            maxAge: 86400
        }));

        // Add request timing middleware
        this.app.use((req, res, next) => {
            req.startTime = Date.now();
            next();
        });

        this.app.use(globalRateLimiter);

        this.app.use((req, res, next) => {
            if (req.path.startsWith('/api/')) {
                logger.info(`${req.method} ${req.path} from ${req.ip}`);
            }
            next();
        });

        const staticOptions = {
            maxAge: '1d',
            etag: true,
            lastModified: true
        };

        this.app.use(express.static(path.join(__dirname, '../../public'), staticOptions));

        // Serve channel photos
        this.app.use('/photos', express.static(path.join(process.cwd(), 'temp', 'channel-photos'), {
            maxAge: '1h',
            etag: true
        }));
    }

    setupRoutes() {
        // Load Swagger documentation
        const swaggerDocument = YAML.load(path.join(__dirname, '../../docs/swagger.yaml'));

        // SWAGGER UI ROUTE - این خط اضافه شده
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
            customCss: '.swagger-ui .topbar { display: none }',
            customSiteTitle: "Telegram Channel Manager API"
        }));

        // API Key validation middleware
        const validateApiKey = async (req, res, next) => {
            const apiKey = req.headers['x-api-key'] || req.query.api_key;

            if (!apiKey) {
                return res.status(401).json({
                    success: false,
                    error: 'API key required'
                });
            }

            try {
                const isValid = await this.database.validateApiKey(apiKey);

                if (!isValid) {
                    return res.status(401).json({
                        success: false,
                        error: 'Invalid API key'
                    });
                }

                req.apiKey = apiKey;
                req.validatedApiKey = isValid;
                next();
            } catch (error) {
                logger.error('API key validation error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Authentication error'
                });
            }
        };

        const requireAdmin = async (req, res, next) => {
            const apiKey = req.headers['x-api-key'] || req.query.api_key;
            const isMaster = await this.database.isMasterKey(apiKey);

            if (!isMaster) {
                return res.status(403).json({
                    success: false,
                    error: 'Admin access required'
                });
            }

            next();
        };

        // Public Routes
        this.app.get('/', (req, res) => res.redirect('/login'));
        this.app.get('/login', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public/admin-login.html'));
        });
        this.app.get('/admin', (req, res) => {
            res.sendFile(path.join(__dirname, '../../public/index.html'));
        });

        this.app.get('/api', (req, res) => {
            res.json({
                name: 'Telegram Channel Manager API',
                version: '2.2.0',
                status: 'operational',
                documentation: '/api-docs'
            });
        });
// Session Management Routes - حذف updateChannelsCount که timeout میکنه
        this.app.get('/api/session/status', validateApiKey, async (req, res) => {
            try {
                // حذف آپدیت کانال‌ها که باعث timeout میشه
                // فقط وضعیت فعلی رو برگردون
                const status = await this.telegramManager.getSessionsStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/api/session/capacity', validateApiKey, async (req, res) => {
            try {
                // اینجا هم بدون آپدیت
                const capacity = await this.telegramManager.getCapacityStats();
                res.json(capacity);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.getHealthStatus();
                res.json(health);
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    error: error.message
                });
            }
        });

        // Session Authentication Routes
        this.sessionAuthAPI.setupRoutes(this.app, requireAdmin);

        // Session Management Routes
        this.app.get('/api/session/status', validateApiKey, async (req, res) => {
            try {
                const status = await this.telegramManager.getSessionsStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.get('/api/session/capacity', validateApiKey, async (req, res) => {
            try {
                const capacity = await this.telegramManager.getCapacityStats();
                res.json(capacity);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Channel Operations
        this.app.post('/api/channel/join',
            validateApiKey,
            rateLimiters.join,
            async (req, res) => {
                try {
                    const { channel } = req.body;

                    if (!channel) {
                        return res.status(400).json({
                            success: false,
                            error: 'Channel parameter required'
                        });
                    }

                    const result = await this.telegramManager.joinChannel(channel);
                    res.json(result);

                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            }
        );

        this.app.post('/api/channel/leave',
            validateApiKey,
            rateLimiters.leave,
            async (req, res) => {
                try {
                    const { channelId, sessionName } = req.body;

                    if (!channelId) {
                        return res.status(400).json({
                            success: false,
                            error: 'Channel ID required'
                        });
                    }

                    const result = await this.telegramManager.leaveChannel(channelId, sessionName);
                    res.json(result);

                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            }
        );

        this.app.get('/api/channel/list',
            validateApiKey,
            rateLimiters.list,
            async (req, res) => {
                try {
                    const result = await this.telegramManager.listAllChannels();
                    res.json(result);
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            }
        );

        this.app.get('/api/channel/info',
            validateApiKey,
            rateLimiters.info,
            async (req, res) => {
                try {
                    const {
                        channel,
                        includePhoto = 'false',
                        joinIfNeeded = 'true',
                        leaveAfter = 'false',
                        forceRefresh = 'false'
                    } = req.query;

                    if (!channel) {
                        return res.status(400).json({
                            success: false,
                            error: 'Channel parameter required'
                        });
                    }

                    // Normalize channel URL - restore + that may have been decoded as space
                    let normalizedChannel = channel;
                    if (channel.includes('t.me/')) {
                        // Fix: "t.me/ xxx" → "t.me/+xxx" (space after t.me/ means it was a +)
                        normalizedChannel = channel.replace(/t\.me\/\s+/g, 't.me/+');
                        // Also handle %2B
                        normalizedChannel = normalizedChannel.replace(/%2B/gi, '+');
                    }

                    logger.info(`Channel info request for: ${normalizedChannel}`);

                    // Check if this is a private invite link
                    const isPrivateInvite = normalizedChannel.includes('+') ||
                                           normalizedChannel.includes('joinchat');

                    // For private invite links, must join first to get info
                    // Default behavior: join → get info → leave (unless already joined)
                    if (isPrivateInvite) {
                        logger.info(`Private invite link detected: ${normalizedChannel}`);

                        try {
                            // Join the channel (will use session with lowest count)
                            const joinResult = await this.telegramManager.joinChannel(normalizedChannel);

                            if (joinResult.success) {
                                // Return join result as channel info
                                const result = {
                                    success: true,
                                    data: {
                                        success: true,
                                        id: joinResult.channelId,
                                        title: joinResult.channelTitle,
                                        username: joinResult.channelUsername || null,
                                        participantsCount: joinResult.membersCount || 0,
                                        isPrivate: true,
                                        joinedVia: 'invite_link',
                                        alreadyJoined: joinResult.alreadyJoined || false,
                                        sessionUsed: joinResult.sessionUsed
                                    }
                                };

                                // Default: leave after getting info (unless already joined or leaveAfter=false)
                                const shouldLeave = leaveAfter !== 'false' && !joinResult.alreadyJoined;
                                if (shouldLeave) {
                                    try {
                                        await this.telegramManager.leaveChannel(joinResult.channelId, joinResult.sessionUsed);
                                        result.data.leftAfterInfo = true;
                                        logger.info(`Left channel after getting info: ${joinResult.channelTitle}`);
                                    } catch (leaveErr) {
                                        logger.warn(`Failed to leave after info: ${leaveErr.message}`);
                                    }
                                }

                                return res.json(result);
                            }
                        } catch (joinError) {
                            logger.error(`Failed to join private channel: ${joinError.message}`);

                            // Check if it's a FLOOD_WAIT error
                            if (joinError.message.includes('wait of') || joinError.message.includes('FLOOD')) {
                                const waitMatch = joinError.message.match(/(\d+)\s*seconds/);
                                const waitSeconds = waitMatch ? parseInt(waitMatch[1]) : 60;
                                return res.status(429).json({
                                    success: false,
                                    error: `Rate limited by Telegram. Wait ${waitSeconds} seconds.`,
                                    waitSeconds: waitSeconds,
                                    retryAfter: new Date(Date.now() + waitSeconds * 1000).toISOString()
                                });
                            }

                            return res.status(400).json({
                                success: false,
                                error: `Cannot get private channel info: ${joinError.message}`,
                                hint: 'The invite link may be invalid or expired'
                            });
                        }
                    }

                    // Check server-side cache first (LRU cache handles TTL automatically)
                    const cacheKey = `${normalizedChannel}_${joinIfNeeded}_${leaveAfter}`;
                    if (forceRefresh !== 'true') {
                        const cached = this.channelInfoCache.get(cacheKey);
                        if (cached !== null) {
                            logger.info(`Returning cached result for ${normalizedChannel}`);

                            res.set({
                                'Cache-Control': 'private, max-age=300',
                                'X-Response-Time': `${Date.now() - req.startTime}ms`,
                                'X-Cache': 'HIT'
                            });

                            return res.json(cached.data);
                        }
                    }

                    // Parse boolean parameters
                    const options = {
                        joinIfNeeded: joinIfNeeded === 'true',
                        leaveAfter: leaveAfter === 'true',
                        forceRefresh: forceRefresh === 'true'
                    };

                    logger.info(`Getting channel info with options:`, options);

                    // Increased timeout to 30 seconds
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000);
                    });

                    // Get channel info
                    const result = await Promise.race([
                        this.telegramManager.getChannelInfoWithOptions(normalizedChannel, options),
                        timeoutPromise
                    ]);

                    logger.info(`Channel info result:`, result);

                    if (!result || !result.data) {
                        logger.error('Empty result from getChannelInfoWithOptions');
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to get channel information'
                        });
                    }

                    // Cache the successful result (LRU cache handles size limits automatically)
                    // Note: LRUServerCache.set() already wraps with { data, timestamp }
                    this.channelInfoCache.set(cacheKey, result);

                    // Convert photo path to accessible URL if exists and requested
                    if (result.data?.profilePhotoPath && includePhoto === 'true') {
                        const photoFileName = path.basename(result.data.profilePhotoPath);
                        result.data.profilePhotoUrl = `/photos/${photoFileName}`;
                    }

                    // Add response headers
                    res.set({
                        'Cache-Control': 'private, max-age=300',
                        'X-Response-Time': `${Date.now() - req.startTime}ms`,
                        'X-Cache': 'MISS'
                    });

                    res.json(result);

                } catch (error) {
                    logger.error('Channel info error:', error);
                    logger.error('Stack trace:', error.stack);

                    let errorMessage = error.message;
                    let statusCode = 500;

                    if (error.message.includes('timeout')) {
                        errorMessage = 'Request took too long. The channel might be large or network is slow. Please try again.';
                        statusCode = 504;
                    } else if (error.message.includes('FLOOD_WAIT')) {
                        const waitTime = error.message.match(/\d+/)?.[0] || '60';
                        errorMessage = `Too many requests. Please wait ${waitTime} seconds.`;
                        statusCode = 429;
                    } else if (error.message.includes('CHANNEL_PRIVATE')) {
                        errorMessage = 'This is a private channel. You need to join first.';
                        statusCode = 403;
                    } else if (error.message.includes('CHANNEL_INVALID')) {
                        errorMessage = 'Invalid channel identifier.';
                        statusCode = 400;
                    } else if (error.message.includes('No connected sessions')) {
                        errorMessage = 'No active sessions available. Please check your sessions.';
                        statusCode = 503;
                    }

                    res.status(statusCode).json({
                        success: false,
                        error: errorMessage,
                        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
                    });
                }
            }
        );

        // API Key Management
        this.app.post('/api/keys/generate', requireAdmin, async (req, res) => {
            try {
                const { name, description } = req.body;

                if (!name) {
                    return res.status(400).json({
                        success: false,
                        error: 'Name is required'
                    });
                }

                const result = await this.database.generateApiKey(name, description);
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Monitoring
        this.app.get('/api/monitoring/status', validateApiKey, (req, res) => {
            if (!this.monitoringService) {
                return res.status(503).json({
                    success: false,
                    error: 'Monitoring service not available'
                });
            }

            res.json({
                success: true,
                data: this.monitoringService.getStats()
            });
        });

        // Rate limit status
        this.app.get('/api/ratelimit/status', validateApiKey, getRateLimitStatus);

        // 404 handler
        this.app.use((req, res) => {
            if (req.path.startsWith('/api/')) {
                res.status(404).json({
                    success: false,
                    error: 'Endpoint not found'
                });
            } else {
                res.redirect('/login');
            }
        });

        // Error handler
        this.app.use((err, req, res, next) => {
            logger.error('Express error:', err);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });
    }

    async getHealthStatus() {
        const health = {
            status: 'healthy',
            timestamp: new Date(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            services: {}
        };

        health.services.database = {
            connected: this.database?.isConnected || false
        };

        // استفاده از تعداد فعلی کانال‌ها (بدون آپدیت - خیلی سنگینه!)
        const sessions = this.telegramManager?.sessions || [];
        let totalChannels = 0;
        let totalCapacity = 0;

        for (const session of sessions) {
            if (session.isConnected) {
                // از currentChannelsCount استفاده کن بدون اینکه getDialogs رو صدا بزنیم
                // updateChannelsCount() خیلی سنگینه و 2000 dialog رو load میکنه!
                totalChannels += session.currentChannelsCount || 0;
                totalCapacity += session.maxChannels;
            }
        }

        health.services.telegram = {
            totalSessions: sessions.length,
            connectedSessions: sessions.filter(s => s.isConnected).length,
            totalChannels: totalChannels,
            totalCapacity: totalCapacity,
            usagePercentage: totalCapacity > 0 ? Math.round((totalChannels / totalCapacity) * 100) : 0
        };

        health.services.monitoring = {
            active: this.monitoringService?.isRunning || false
        };

        health.services.cache = {
            size: this.channelInfoCache.size,
            maxSize: 100
        };

        const memoryUsageMB = health.memory.rss / (1024 * 1024);
        if (memoryUsageMB > 800) {
            health.status = 'degraded';
            health.warning = 'High memory usage';
        }

        if (!health.services.database.connected ||
            health.services.telegram.connectedSessions === 0) {
            health.status = 'degraded';
        }

        return health;
    }
    async start() {
        const port = process.env.API_PORT || 3000;
        const host = process.env.API_HOST || '0.0.0.0';

        // Create temp directory for photos
        const photosDir = path.join(process.cwd(), 'temp', 'channel-photos');
        if (!fs.existsSync(photosDir)) {
            fs.mkdirSync(photosDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(port, host, () => {
                logger.info(`🌐 API Server running at http://${host}:${port}`);
                logger.info(`📚 API Documentation at http://${host}:${port}/api-docs`);
                logger.info(`🎛️ Admin Panel at http://${host}:${port}/admin`);
                resolve();
            });

            this.server.keepAliveTimeout = 65000;
            this.server.headersTimeout = 66000;
            this.server.on('error', reject);
        });
    }

    async stop() {
        // Cleanup cache
        if (this.channelInfoCache) {
            this.channelInfoCache.destroy();
            logger.info('Server cache destroyed');
        }

        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    logger.info('API Server stopped');
                    resolve();
                });
            });
        }
    }
}

export default APIServer;
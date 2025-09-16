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

        // Response cache for channel info
        this.channelInfoCache = new Map();
        this.cacheTimeout = 300000; // 5 minutes

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
                status: 'operational'
            });
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

                    logger.info(`Channel info request for: ${channel}`); // اضافه کردن لاگ

                    if (!channel) {
                        return res.status(400).json({
                            success: false,
                            error: 'Channel parameter required'
                        });
                    }

                    // Check server-side cache first
                    const cacheKey = `${channel}_${joinIfNeeded}_${leaveAfter}`;
                    if (forceRefresh !== 'true' && this.channelInfoCache.has(cacheKey)) {
                        const cached = this.channelInfoCache.get(cacheKey);
                        if (Date.now() - cached.timestamp < this.cacheTimeout) {
                            logger.info(`Returning cached result for ${channel}`);

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
                        this.telegramManager.getChannelInfoWithOptions(channel, options),
                        timeoutPromise
                    ]);

                    logger.info(`Channel info result:`, result); // اضافه کردن لاگ

                    // بررسی اینکه result واقعاً دیتا دارد
                    if (!result || !result.data) {
                        logger.error('Empty result from getChannelInfoWithOptions');
                        return res.status(500).json({
                            success: false,
                            error: 'Failed to get channel information'
                        });
                    }

                    // Cache the successful result
                    this.channelInfoCache.set(cacheKey, {
                        data: result,
                        timestamp: Date.now()
                    });

                    // Clean old cache entries
                    if (this.channelInfoCache.size > 100) {
                        const oldestKey = this.channelInfoCache.keys().next().value;
                        this.channelInfoCache.delete(oldestKey);
                    }

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
                    logger.error('Stack trace:', error.stack); // اضافه کردن stack trace

                    // Better error messages
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

        /**
         * Clear channel info cache
         */
        this.app.post('/api/channel/cache/clear',
            requireAdmin,
            (req, res) => {
                const size = this.channelInfoCache.size;
                this.channelInfoCache.clear();

                // Also clear session caches
                this.telegramManager.sessions.forEach(session => {
                    if (session.clearCache) {
                        session.clearCache();
                    }
                });

                res.json({
                    success: true,
                    message: `Cleared ${size} cached entries`
                });
            }
        );

        /**
         * Get channel photo separately
         */
        this.app.get('/api/channel/photo/:channelId',
            validateApiKey,
            async (req, res) => {
                try {
                    const { channelId } = req.params;

                    if (!channelId) {
                        return res.status(400).json({
                            success: false,
                            error: 'Channel ID required'
                        });
                    }

                    const result = await this.telegramManager.getChannelPhoto(channelId);

                    if (result.success && result.photoPath) {
                        res.sendFile(result.photoPath);
                    } else {
                        res.status(404).json({
                            success: false,
                            error: 'Photo not found'
                        });
                    }

                } catch (error) {
                    logger.error('Get photo error:', error);
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            }
        );

        /**
         * Batch get channel info
         */
        this.app.post('/api/channel/batch-info',
            validateApiKey,
            rateLimiters.info,
            async (req, res) => {
                try {
                    const {
                        channels,
                        joinIfNeeded = false,
                        leaveAfter = false
                    } = req.body;

                    if (!channels || !Array.isArray(channels)) {
                        return res.status(400).json({
                            success: false,
                            error: 'Channels array required'
                        });
                    }

                    const results = [];

                    for (const channel of channels) {
                        try {
                            // Check cache first
                            const cacheKey = `${channel}_${joinIfNeeded}_${leaveAfter}`;
                            if (this.channelInfoCache.has(cacheKey)) {
                                const cached = this.channelInfoCache.get(cacheKey);
                                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                                    results.push(cached.data);
                                    continue;
                                }
                            }

                            const result = await this.telegramManager.getChannelInfoWithOptions(channel, {
                                joinIfNeeded,
                                leaveAfter
                            });

                            // Cache result
                            this.channelInfoCache.set(cacheKey, {
                                data: result,
                                timestamp: Date.now()
                            });

                            results.push(result);

                            // Small delay to avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 500));
                        } catch (error) {
                            results.push({
                                success: false,
                                channel: channel,
                                error: error.message
                            });
                        }
                    }

                    res.json({
                        success: true,
                        results: results,
                        total: channels.length,
                        successful: results.filter(r => r.success).length,
                        failed: results.filter(r => !r.success).length
                    });

                } catch (error) {
                    logger.error('Batch info error:', error);
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            }
        );

        // Session and Channel Management Routes
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

        const sessions = this.telegramManager?.sessions || [];
        health.services.telegram = {
            totalSessions: sessions.length,
            connectedSessions: sessions.filter(s => s.isConnected).length
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
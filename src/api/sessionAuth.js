import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Store temporary session creation states
const sessionCreationStates = new Map();

export class SessionAuthAPI {
    constructor(database, config) {
        this.database = database;
        this.config = config;
    }

    /**
     * Initialize session creation
     */
    async initializeSession(req, res) {
        try {
            const { sessionName, phoneNumber, isPremium } = req.body;

            if (!phoneNumber || !sessionName) {
                return res.status(400).json({
                    success: false,
                    error: 'Phone number and session name are required'
                });
            }

            // Check if session name already exists in sessions file
            const existingSessions = await this.loadSessionsFromFile();
            if (existingSessions.sessions.some(s => s.name === sessionName)) {
                return res.status(400).json({
                    success: false,
                    error: 'Session name already exists'
                });
            }

            // Generate unique session ID
            const sessionId = crypto.randomBytes(16).toString('hex');

            // Create custom logger
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

            // Create Telegram client
            const client = new TelegramClient(
                new StringSession(''),
                this.config.telegram.apiId,
                this.config.telegram.apiHash,
                {
                    connectionRetries: 5,
                    retryDelay: 1000,
                    baseLogger: customLogger,
                    logger: customLogger
                }
            );

            // Store client and info in memory
            sessionCreationStates.set(sessionId, {
                client,
                phoneNumber,
                isPremium: isPremium || false,
                sessionName,
                state: 'initialized',
                createdAt: Date.now()
            });

            // Clean old states (older than 10 minutes)
            this.cleanOldStates();

            logger.info(`Session creation initialized for ${phoneNumber}`);

            res.json({
                success: true,
                sessionId,
                message: 'Session initialized. Please request code.',
                nextStep: 'requestCode'
            });

        } catch (error) {
            logger.error('Failed to initialize session:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Request verification code
     */
    async requestCode(req, res) {
        try {
            const { sessionId } = req.body;

            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    error: 'Session ID is required'
                });
            }

            const sessionState = sessionCreationStates.get(sessionId);
            if (!sessionState) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found or expired'
                });
            }

            const { client, phoneNumber } = sessionState;

            // Connect client
            await client.connect();

            // Send code request - use start method
            await client.start({
                phoneNumber: () => Promise.resolve(phoneNumber),
                phoneCode: () => {
                    // This will be handled in submitCode
                    return Promise.resolve('12345'); // Dummy code, actual will come from user
                },
                password: () => Promise.resolve(''),
                onError: (err) => {
                    logger.error('Client start error:', err);
                }
            }).catch(async (error) => {
                // If we get here, code was sent
                logger.info('Code request sent, waiting for user input');
            });

            // Update state
            sessionState.state = 'codeRequested';
            sessionCreationStates.set(sessionId, sessionState);

            logger.info(`Code requested for ${phoneNumber}`);

            res.json({
                success: true,
                message: 'Verification code sent to your Telegram',
                nextStep: 'submitCode',
                codeLength: 5
            });

        } catch (error) {
            logger.error('Failed to request code:', error);

            let errorMessage = 'Failed to send verification code';
            if (error.message.includes('PHONE_NUMBER_INVALID')) {
                errorMessage = 'Invalid phone number format';
            } else if (error.message.includes('PHONE_NUMBER_BANNED')) {
                errorMessage = 'This phone number is banned';
            } else if (error.message.includes('FLOOD_WAIT')) {
                errorMessage = 'Too many attempts. Please wait and try again.';
            }

            res.status(500).json({
                success: false,
                error: errorMessage,
                details: error.message
            });
        }
    }

    /**
     * Submit verification code
     */
    async submitCode(req, res) {
        try {
            const { sessionId, code } = req.body;

            if (!sessionId || !code) {
                return res.status(400).json({
                    success: false,
                    error: 'Session ID and code are required'
                });
            }

            const sessionState = sessionCreationStates.get(sessionId);
            if (!sessionState) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found or expired'
                });
            }

            const { client, phoneNumber } = sessionState;

            // Try to complete the sign-in process
            try {
                await client.start({
                    phoneNumber: () => Promise.resolve(phoneNumber),
                    phoneCode: () => Promise.resolve(code),
                    password: async () => {
                        // Will be handled if needed
                        sessionState.state = 'passwordRequired';
                        return Promise.resolve('');
                    },
                    onError: (err) => {
                        throw err;
                    }
                });

                // If we get here, authentication successful
                await this.finalizeSession(sessionId, res);

            } catch (error) {
                if (error.message.includes('SESSION_PASSWORD_NEEDED') ||
                    error.message.includes('Two-step verification')) {
                    // 2FA is enabled
                    sessionState.state = 'passwordRequired';
                    sessionCreationStates.set(sessionId, sessionState);

                    return res.json({
                        success: true,
                        message: 'Two-factor authentication is enabled',
                        nextStep: 'submitPassword',
                        requiresPassword: true
                    });
                } else if (error.message.includes('PHONE_CODE_INVALID')) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid verification code'
                    });
                } else if (error.message.includes('PHONE_CODE_EXPIRED')) {
                    return res.status(400).json({
                        success: false,
                        error: 'Verification code expired. Please request a new one.'
                    });
                } else {
                    throw error;
                }
            }

        } catch (error) {
            logger.error('Failed to submit code:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Submit 2FA password
     */
    async submitPassword(req, res) {
        try {
            const { sessionId, password } = req.body;

            if (!sessionId || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Session ID and password are required'
                });
            }

            const sessionState = sessionCreationStates.get(sessionId);
            if (!sessionState) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found or expired'
                });
            }

            const { client, phoneNumber } = sessionState;

            try {
                // Complete authentication with password
                await client.start({
                    phoneNumber: () => Promise.resolve(phoneNumber),
                    phoneCode: () => Promise.resolve(''), // Already submitted
                    password: () => Promise.resolve(password),
                    onError: (err) => {
                        throw err;
                    }
                });

                // Success - finalize session
                await this.finalizeSession(sessionId, res);

            } catch (error) {
                if (error.message.includes('PASSWORD_HASH_INVALID')) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid password'
                    });
                } else {
                    throw error;
                }
            }

        } catch (error) {
            logger.error('Failed to submit password:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Finalize session creation
     */
    async finalizeSession(sessionId, res) {
        try {
            const sessionState = sessionCreationStates.get(sessionId);
            if (!sessionState) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }

            const { client, sessionName, isPremium, phoneNumber } = sessionState;

            // Get session string
            const sessionString = client.session.save();

            // Get user info
            const me = await client.getMe();
            const actualPremium = me.premium || false;
            const username = me.username || null;
            const fullName = `${me.firstName || ''} ${me.lastName || ''}`.trim() || 'Unknown';

            // Create session object
            const newSession = {
                name: sessionName,
                sessionString: sessionString,
                isPremium: actualPremium,
                phoneNumber: phoneNumber,
                username: username,
                fullName: fullName,
                userId: me.id.toString(),
                description: `${fullName} - ${phoneNumber}`,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            // Save to sessions file
            await this.saveSessionToFile(newSession);

            // Store in database if available (without session string)
            if (this.database && this.database.isConnected) {
                await this.database.registerSession(sessionName, actualPremium);
            }

            // Clean up
            sessionCreationStates.delete(sessionId);
            await client.disconnect();

            logger.info(`✅ Session created successfully: ${sessionName}`);

            res.json({
                success: true,
                message: 'Session created successfully',
                session: {
                    name: sessionName,
                    isPremium: actualPremium,
                    phoneNumber: phoneNumber,
                    username: username,
                    fullName: fullName,
                    userId: me.id.toString()
                }
            });

        } catch (error) {
            logger.error('Failed to finalize session:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Load sessions from file
     */
    async loadSessionsFromFile() {
        const sessionsPath = this.config.telegram?.sessionsFilePath || path.join(process.cwd(), 'sessions.json');
        try {
            const content = await fs.readFile(sessionsPath, 'utf8');
            const data = JSON.parse(content);

            // Handle both array and object format
            if (Array.isArray(data)) {
                return { sessions: data };
            }

            return data;
        } catch (error) {
            logger.error('Failed to load sessions file:', error);
            return { sessions: [] };
        }
    }

    /**
     * Save session to file
     */
    async saveSessionToFile(newSession) {
        const sessionsPath = this.config.telegram?.sessionsFilePath || path.join(process.cwd(), 'sessions.json');
        try {
            // Load existing sessions
            const sessionsData = await this.loadSessionsFromFile();

            // Add new session
            sessionsData.sessions.push(newSession);

            // Create backup
            const backupPath = sessionsPath.replace('.json', '.backup.json');
            try {
                await fs.copyFile(sessionsPath, backupPath);
            } catch (err) {
                // Ignore backup errors
            }

            // Save updated sessions
            await fs.writeFile(
                sessionsPath,
                JSON.stringify(sessionsData, null, 2),
                'utf8'
            );

            logger.info(`Session saved to file: ${newSession.name}`);

            // Reload sessions in config
            if (this.config.reloadSessions) {
                this.config.reloadSessions();
            }

        } catch (error) {
            logger.error('Failed to save session to file:', error);
            throw error;
        }
    }

    /**
     * Cancel session creation
     */
    async cancelSession(req, res) {
        try {
            const { sessionId } = req.body;

            if (sessionId && sessionCreationStates.has(sessionId)) {
                const sessionState = sessionCreationStates.get(sessionId);

                // Disconnect client if connected
                if (sessionState.client) {
                    try {
                        await sessionState.client.disconnect();
                    } catch (error) {
                        // Ignore disconnect errors
                    }
                }

                sessionCreationStates.delete(sessionId);
            }

            res.json({
                success: true,
                message: 'Session creation cancelled'
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Clean old session states
     */
    cleanOldStates() {
        const now = Date.now();
        const timeout = 10 * 60 * 1000; // 10 minutes

        for (const [sessionId, state] of sessionCreationStates.entries()) {
            if (now - state.createdAt > timeout) {
                // Try to disconnect client
                if (state.client) {
                    state.client.disconnect().catch(() => {});
                }
                sessionCreationStates.delete(sessionId);
                logger.debug(`Cleaned old session state: ${sessionId}`);
            }
        }
    }

    /**
     * Setup routes
     */
    setupRoutes(app, validateApiKey) {
        // Session creation endpoints - require API key but not admin
        app.post('/api/session/auth/initialize', validateApiKey, this.initializeSession.bind(this));
        app.post('/api/session/auth/request-code', validateApiKey, this.requestCode.bind(this));
        app.post('/api/session/auth/submit-code', validateApiKey, this.submitCode.bind(this));
        app.post('/api/session/auth/submit-password', validateApiKey, this.submitPassword.bind(this));
        app.post('/api/session/auth/cancel', validateApiKey, this.cancelSession.bind(this));
    }
}

export default SessionAuthAPI;
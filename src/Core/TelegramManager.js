const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs').promises;
const path = require('path');

class TelegramManager {
    constructor(apiId, apiHash, sessionPath) {
        this.apiId = apiId;
        this.apiHash = apiHash;
        this.sessionPath = sessionPath;
        this.client = null;
        this.stringSession = null;
        this.isConnecting = false;
        this.connectionRetries = 0;
        this.maxConnectionRetries = 5;

        // Cache for user info
        this._meCache = null;
        this._meCacheTime = 0;
        this._meCacheTTL = 60000; // 1 minute cache
    }

    async checkSession() {
        try {
            // Check if session file exists and is readable
            await fs.access(this.sessionPath, fs.constants.R_OK);
            const sessionData = await fs.readFile(this.sessionPath, 'utf-8');

            // Validate session data
            if (!sessionData || sessionData.trim().length === 0) {
                console.log('Session file is empty');
                return false;
            }

            this.stringSession = new StringSession(sessionData.trim());
            console.log('Session found');
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('Session file not found');
            } else if (error.code === 'EACCES') {
                console.error('Session file permission denied');
            } else {
                console.error('Error reading session:', error.message);
            }
            return false;
        }
    }

    async login() {
        try {
            console.log('Starting login process...');

            this.stringSession = new StringSession('');
            this.client = new TelegramClient(
                this.stringSession,
                this.apiId,
                this.apiHash,
                {
                    connectionRetries: 5,
                    retryDelay: 1000,
                    autoReconnect: true,
                }
            );

            await this.client.start({
                phoneNumber: async () => {
                    const phone = await input.text('Enter phone number: ');
                    return phone.trim();
                },
                password: async () => {
                    const pass = await input.text('Enter 2FA password (if any): ');
                    return pass.trim();
                },
                phoneCode: async () => {
                    const code = await input.text('Enter verification code: ');
                    return code.trim();
                },
                onError: (err) => {
                    console.error('Login error:', err);
                    throw err;
                },
            });

            console.log('Login successful');

            // Save session
            await this.saveSession();

            // Clear cache
            this._meCache = null;

            return true;
        } catch (error) {
            console.error('Login failed:', error.message);

            // Clean up on failure
            if (this.client) {
                try {
                    await this.client.disconnect();
                } catch (e) {
                    // Ignore disconnect errors
                }
                this.client = null;
            }

            return false;
        }
    }

    async saveSession() {
        try {
            if (!this.client || !this.client.session) {
                throw new Error('No active session to save');
            }

            const sessionString = this.client.session.save();

            // Ensure directory exists
            const sessionDir = path.dirname(this.sessionPath);
            await fs.mkdir(sessionDir, { recursive: true });

            // Write session with proper permissions
            await fs.writeFile(this.sessionPath, sessionString, {
                mode: 0o600 // Read/write for owner only
            });

            console.log('Session saved successfully');
        } catch (error) {
            console.error('Failed to save session:', error.message);
            throw error;
        }
    }

    async connect() {
        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            console.log('Connection already in progress...');
            return false;
        }

        try {
            this.isConnecting = true;

            if (!this.stringSession) {
                throw new Error('No session available');
            }

            // Check if already connected
            if (this.client && this.client.connected) {
                console.log('Already connected to Telegram');
                return true;
            }

            this.client = new TelegramClient(
                this.stringSession,
                this.apiId,
                this.apiHash,
                {
                    connectionRetries: 5,
                    retryDelay: 1000,
                    autoReconnect: true,
                    requestRetries: 3,
                    timeout: 30000,
                }
            );

            await this.client.connect();

            // Verify connection with getMe
            const me = await this.client.getMe();
            if (!me) {
                throw new Error('Failed to verify connection');
            }

            console.log('Connected to Telegram');
            this.connectionRetries = 0;

            // Clear cache on new connection
            this._meCache = null;

            return true;
        } catch (error) {
            console.error('Failed to connect to Telegram:', error.message);

            // Retry logic
            if (this.connectionRetries < this.maxConnectionRetries) {
                this.connectionRetries++;
                console.log(`Retrying connection (${this.connectionRetries}/${this.maxConnectionRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 2000 * this.connectionRetries));
                this.isConnecting = false;
                return this.connect();
            }

            return false;
        } finally {
            this.isConnecting = false;
        }
    }

    async getMe() {
        try {
            if (!this.client || !this.client.connected) {
                console.error('Client not connected');
                return null;
            }

            // Check cache
            const now = Date.now();
            if (this._meCache && (now - this._meCacheTime) < this._meCacheTTL) {
                return this._meCache;
            }

            const me = await this.client.getMe();

            const result = {
                id: me.id ? me.id.toString() : null,
                firstName: me.firstName || '',
                lastName: me.lastName || '',
                username: me.username || '',
                phone: me.phone || ''
            };

            // Update cache
            this._meCache = result;
            this._meCacheTime = now;

            return result;
        } catch (error) {
            console.error('Failed to get user info:', error.message);

            // Clear cache on error
            this._meCache = null;

            return null;
        }
    }

    async getDialogs(limit = 10) {
        try {
            if (!this.client || !this.client.connected) {
                console.error('Client not connected');
                return [];
            }

            const dialogs = await this.client.getDialogs({
                limit: Math.min(limit, 1000) // Cap at 1000
            });

            return dialogs.map(dialog => ({
                id: dialog.id ? dialog.id.toString() : null,
                title: dialog.title || 'Unknown',
                unreadCount: dialog.unreadCount || 0,
                lastMessage: dialog.message?.message || null
            }));
        } catch (error) {
            console.error('Failed to get dialogs:', error.message);
            return [];
        }
    }

    async getDialogIds(limit = 500) {
        try {
            if (!this.client || !this.client.connected) {
                console.error('Client not connected');
                return [];
            }

            const dialogs = await this.client.getDialogs({
                limit: Math.min(limit, 1000),
                archived: false
            });

            const ids = [];

            for (const dialog of dialogs) {
                try {
                    let idStr = '';

                    // Handle different ID formats
                    if (dialog.id && dialog.id.value !== undefined) {
                        // BigInt format
                        idStr = dialog.id.value.toString();
                    } else if (dialog.id && typeof dialog.id === 'bigint') {
                        // Direct BigInt
                        idStr = dialog.id.toString();
                    } else if (dialog.id) {
                        // Regular number or string
                        idStr = String(dialog.id);
                    } else if (dialog.entity && dialog.entity.id) {
                        // Get from entity
                        if (dialog.entity.id.value !== undefined) {
                            idStr = dialog.entity.id.value.toString();
                        } else {
                            idStr = String(dialog.entity.id);
                        }
                    } else {
                        continue;
                    }

                    if (idStr && idStr !== 'undefined' && idStr !== 'null') {
                        ids.push(idStr);
                    }

                } catch (err) {
                    console.error('Error processing dialog ID:', err);
                    continue;
                }
            }

            console.log(`Got ${ids.length} dialog IDs`);

            // Log sample for debugging
            if (ids.length > 0 && process.env.LOG_LEVEL === 'DEBUG') {
                console.log('Sample IDs:', ids.slice(0, 5));
            }

            return ids;

        } catch (error) {
            console.error('Failed to get dialog IDs:', error.message);
            return [];
        }
    }

    async checkChannelMembership(channelId) {
        try {
            if (!this.client || !this.client.connected) {
                return { found: false, error: 'Client not connected' };
            }

            // Normalize channel ID
            const normalizedId = this.normalizeChannelId(channelId);

            const dialogs = await this.client.getDialogs({
                limit: 1000,
                archived: false
            });

            // Create all possible ID formats for comparison
            const searchIds = new Set([
                channelId,
                normalizedId,
                `-100${normalizedId}`,
                `-${normalizedId}`,
                channelId.replace('-100', ''),
                channelId.replace('-', '')
            ]);

            for (const dialog of dialogs) {
                try {
                    const dialogId = this.getDialogId(dialog);

                    if (!dialogId) continue;

                    // Check all format variations
                    for (const searchId of searchIds) {
                        if (dialogId === searchId ||
                            dialogId === `-100${searchId}` ||
                            this.normalizeChannelId(dialogId) === normalizedId) {

                            return {
                                found: true,
                                title: dialog.title || 'Unknown',
                                id: dialogId,
                                isChannel: dialog.isChannel || false,
                                isGroup: dialog.isGroup || false,
                                isUser: dialog.isUser || false
                            };
                        }
                    }
                } catch (err) {
                    console.error('Error checking dialog:', err);
                    continue;
                }
            }

            return { found: false };
        } catch (error) {
            console.error('Error checking channel membership:', error);
            return { found: false, error: error.message };
        }
    }

    async sendMessage(chatId, message) {
        try {
            if (!this.client || !this.client.connected) {
                console.error('Client not connected');
                return false;
            }

            // Validate inputs
            if (!chatId || !message) {
                console.error('Invalid chatId or message');
                return false;
            }

            await this.client.sendMessage(chatId, {
                message: String(message),
                parseMode: 'md' // Markdown parsing
            });

            console.log('Message sent successfully');
            return true;
        } catch (error) {
            console.error('Failed to send message:', error.message);

            // Check if it's a flood wait error
            if (error.message && error.message.includes('FLOOD_WAIT')) {
                const seconds = parseInt(error.message.match(/\d+/)?.[0] || 60);
                console.error(`Flood wait: ${seconds} seconds`);
            }

            return false;
        }
    }

    async disconnect() {
        if (this.client) {
            try {
                // Clear event handlers
                if (this.client._eventBuilders) {
                    this.client._eventBuilders = [];
                }

                // Disconnect if connected
                if (this.client.connected) {
                    await this.client.disconnect();
                    console.log('Disconnected from Telegram');
                }
            } catch (error) {
                console.error('Error during disconnect:', error.message);
            } finally {
                this.client = null;
                this._meCache = null;
            }
        }
    }

    // Helper methods
    getDialogId(dialog) {
        try {
            if (dialog.id) {
                if (dialog.id.value !== undefined) {
                    return dialog.id.value.toString();
                } else if (typeof dialog.id === 'bigint') {
                    return dialog.id.toString();
                } else {
                    return String(dialog.id);
                }
            }

            if (dialog.entity && dialog.entity.id) {
                if (dialog.entity.id.value !== undefined) {
                    return dialog.entity.id.value.toString();
                } else {
                    return String(dialog.entity.id);
                }
            }

            return null;
        } catch (error) {
            console.error('Error extracting dialog ID:', error);
            return null;
        }
    }

    normalizeChannelId(channelId) {
        const id = String(channelId);
        if (id.startsWith('-100')) {
            return id.substring(4);
        }
        if (id.startsWith('-')) {
            return id.substring(1);
        }
        return id;
    }

    // Check if client is connected
    isConnected() {
        return this.client && this.client.connected;
    }
}

module.exports = TelegramManager;
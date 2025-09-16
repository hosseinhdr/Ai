import mysql from 'mysql2/promise';
import crypto from 'crypto';
import logger from '../utils/logger.js';

class Database {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            this.pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'telegram_manager',
                waitForConnections: true,
                connectionLimit: 20,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 0
            });

            // Test connection
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();

            this.isConnected = true;
            logger.info('✅ MySQL Database connected successfully');

            // Initialize default data
            await this.initializeDefaultData();

            return true;
        } catch (error) {
            logger.error('❌ MySQL connection failed:', error);
            this.isConnected = false;
            throw error;
        }
    }

    async disconnect() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            logger.info('MySQL connection closed');
        }
    }

    // ═══════════════════════════════════════
    // API Key Management with Recovery
    // ═══════════════════════════════════════

    async generateApiKey(name, description = '') {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();

            // Generate API key
            const apiKey = crypto.randomBytes(32).toString('hex');
            const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

            // Generate recovery token
            const recoveryToken = crypto.randomBytes(16).toString('hex');
            const recoveryHash = crypto.createHash('sha256').update(recoveryToken).digest('hex');

            // Insert API key with recovery token
            const [result] = await connection.execute(
                `INSERT INTO api_keys
                 (key_hash, name, description, recovery_hash, created_at)
                 VALUES (?, ?, ?, ?, NOW())`,
                [keyHash, name, description, recoveryHash]
            );

            await connection.commit();

            logger.info(`✅ API key created: ${name}`);

            return {
                success: true,
                apiKey, // Return unhashed key only once
                recoveryToken, // Return recovery token
                id: result.insertId,
                name,
                message: 'Save both API key and recovery token securely!'
            };

        } catch (error) {
            await connection.rollback();
            logger.error('Failed to create API key:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    async recoverApiKey(name, recoveryToken) {
        const recoveryHash = crypto.createHash('sha256').update(recoveryToken).digest('hex');

        const [rows] = await this.pool.execute(
            'SELECT id, name FROM api_keys WHERE name = ? AND recovery_hash = ? AND is_active = TRUE',
            [name, recoveryHash]
        );

        if (rows.length === 0) {
            return { success: false, error: 'Invalid recovery token' };
        }

        // Generate new API key
        const newApiKey = crypto.randomBytes(32).toString('hex');
        const newKeyHash = crypto.createHash('sha256').update(newApiKey).digest('hex');

        // Update with new key
        await this.pool.execute(
            'UPDATE api_keys SET key_hash = ?, last_recovered_at = NOW() WHERE id = ?',
            [newKeyHash, rows[0].id]
        );

        return {
            success: true,
            apiKey: newApiKey,
            message: 'API key recovered successfully. Save the new key!'
        };
    }

    async validateApiKey(apiKey) {
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

        const [rows] = await this.pool.execute(
            'SELECT id, name, is_master FROM api_keys WHERE key_hash = ? AND is_active = TRUE',
            [keyHash]
        );

        if (rows.length === 0) {
            return null;
        }

        const keyData = rows[0];

        // Update last used
        await this.pool.execute(
            'UPDATE api_keys SET last_used_at = NOW(), total_requests = total_requests + 1 WHERE id = ?',
            [keyData.id]
        );

        return {
            id: keyData.id,
            name: keyData.name,
            isMaster: keyData.is_master
        };
    }

    async isMasterKey(apiKey) {
        const keyData = await this.validateApiKey(apiKey);
        return keyData?.isMaster || false;
    }

    async recordApiKeyUsage(apiKey) {
        const keyData = await this.validateApiKey(apiKey);
        if (keyData) {
            await this.pool.execute(
                'UPDATE api_keys SET total_requests = total_requests + 1, last_used_at = NOW() WHERE id = ?',
                [keyData.id]
            );
        }
    }

    async getApiKeys() {
        const [rows] = await this.pool.execute(
            `SELECT
                 id, name, description, is_active, is_master,
                 total_requests, last_used_at, created_at
             FROM api_keys
             ORDER BY created_at DESC`
        );

        return rows;
    }

    async revokeApiKey(apiKeyId) {
        const [result] = await this.pool.execute(
            'UPDATE api_keys SET is_active = FALSE, revoked_at = NOW() WHERE id = ?',
            [apiKeyId]
        );

        return result.affectedRows > 0;
    }

    // ═══════════════════════════════════════
    // Session Management (NO session_string)
    // ═══════════════════════════════════════

    async registerSession(name, isPremium = false) {
        const maxChannels = isPremium ? 1000 : 500;

        try {
            const [result] = await this.pool.execute(
                `INSERT INTO telegram_sessions 
                (name, is_premium, max_channels, created_at) 
                VALUES (?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    is_premium = VALUES(is_premium),
                    max_channels = VALUES(max_channels),
                    updated_at = NOW()`,
                [name, isPremium, maxChannels]
            );

            return result.insertId || result.affectedRows;
        } catch (error) {
            logger.error(`Failed to register session ${name}:`, error);
            throw error;
        }
    }

    async updateSessionStatus(sessionName, isConnected, healthStatus = 'healthy') {
        try {
            await this.pool.execute(
                `UPDATE telegram_sessions
                 SET is_connected = ?, 
                     health_status = ?, 
                     last_connected_at = CASE WHEN ? = TRUE THEN NOW() ELSE last_connected_at END,
                     updated_at = NOW()
                 WHERE name = ?`,
                [isConnected, healthStatus, isConnected, sessionName]
            );
        } catch (error) {
            logger.error(`Failed to update session status for ${sessionName}:`, error);
            throw error;
        }
    }

    async getSessionByName(sessionName) {
        try {
            const [rows] = await this.pool.execute(
                `SELECT 
                    id, name, is_premium, is_active, is_connected,
                    current_channels_count, max_channels, health_status,
                    last_error, error_count, success_rate, flood_wait_until,
                    last_connected_at, created_at, updated_at
                 FROM telegram_sessions 
                 WHERE name = ?`,
                [sessionName]
            );

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error(`Failed to get session ${sessionName}:`, error);
            return null;
        }
    }

    async getActiveSessions() {
        try {
            const [rows] = await this.pool.execute(
                `SELECT
                     id, name, is_premium, current_channels_count,
                     max_channels, health_status, last_connected_at
                 FROM telegram_sessions
                 WHERE is_active = TRUE AND is_connected = TRUE`
            );

            return rows;
        } catch (error) {
            logger.error('Failed to get active sessions:', error);
            return [];
        }
    }

    async updateSessionChannelCount(sessionName, delta) {
        try {
            await this.pool.execute(
                `UPDATE telegram_sessions
                 SET current_channels_count = GREATEST(0, current_channels_count + ?),
                     updated_at = NOW()
                 WHERE name = ?`,
                [delta, sessionName]
            );
        } catch (error) {
            logger.error(`Failed to update channel count for ${sessionName}:`, error);
        }
    }

    async updateSessionError(sessionName, errorMessage, errorType = 'unknown') {
        try {
            await this.pool.execute(
                `UPDATE telegram_sessions
                 SET last_error = ?,
                     error_count = error_count + 1,
                     health_status = CASE 
                         WHEN error_count > 10 THEN 'critical'
                         WHEN error_count > 5 THEN 'warning'
                         ELSE health_status
                     END,
                     updated_at = NOW()
                 WHERE name = ?`,
                [errorMessage, sessionName]
            );

            // Also log to error_logs table
            await this.logError(errorType, errorMessage, sessionName);
        } catch (error) {
            logger.error(`Failed to update session error for ${sessionName}:`, error);
        }
    }

    async updateFloodWaitTime(sessionName, waitUntil) {
        try {
            await this.pool.execute(
                `UPDATE telegram_sessions
                 SET flood_wait_until = ?,
                     health_status = 'warning',
                     updated_at = NOW()
                 WHERE name = ?`,
                [waitUntil, sessionName]
            );
        } catch (error) {
            logger.error(`Failed to update flood wait for ${sessionName}:`, error);
        }
    }

    // ═══════════════════════════════════════
    // Channel Management
    // ═══════════════════════════════════════

    async registerChannel(channelData) {
        try {
            const [result] = await this.pool.execute(
                `INSERT INTO channels 
                (channel_id, username, title, description, participants_count, 
                 is_public, is_private, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    description = VALUES(description),
                    participants_count = VALUES(participants_count),
                    is_public = VALUES(is_public),
                    is_private = VALUES(is_private),
                    updated_at = NOW()`,
                [
                    channelData.id,
                    channelData.username || null,
                    channelData.title,
                    channelData.description || null,
                    channelData.participantsCount || 0,
                    channelData.isPublic !== false,
                    channelData.isPrivate === true
                ]
            );

            return result.insertId || result.affectedRows;
        } catch (error) {
            logger.error('Failed to register channel:', error);
            throw error;
        }
    }

    async linkSessionToChannel(sessionName, channelId, apiKeyId = null) {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();

            // Get session ID
            const [sessionRows] = await connection.execute(
                'SELECT id FROM telegram_sessions WHERE name = ?',
                [sessionName]
            );

            if (sessionRows.length === 0) {
                throw new Error(`Session ${sessionName} not found`);
            }

            // Get channel ID
            const [channelRows] = await connection.execute(
                'SELECT id FROM channels WHERE channel_id = ?',
                [channelId]
            );

            if (channelRows.length === 0) {
                throw new Error(`Channel ${channelId} not found`);
            }

            // Link session to channel
            await connection.execute(
                `INSERT INTO session_channels 
                (session_id, channel_id, is_member, joined_by_api_key, joined_at)
                VALUES (?, ?, TRUE, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    is_member = TRUE,
                    joined_at = NOW()`,
                [sessionRows[0].id, channelRows[0].id, apiKeyId]
            );

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            logger.error('Failed to link session to channel:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    async unlinkSessionFromChannel(sessionName, channelId) {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();

            // Get session ID
            const [sessionRows] = await connection.execute(
                'SELECT id FROM telegram_sessions WHERE name = ?',
                [sessionName]
            );

            if (sessionRows.length === 0) {
                throw new Error(`Session ${sessionName} not found`);
            }

            // Get channel ID
            const [channelRows] = await connection.execute(
                'SELECT id FROM channels WHERE channel_id = ?',
                [channelId]
            );

            if (channelRows.length === 0) {
                throw new Error(`Channel ${channelId} not found`);
            }

            // Update link status
            await connection.execute(
                `UPDATE session_channels 
                 SET is_member = FALSE, left_at = NOW()
                 WHERE session_id = ? AND channel_id = ?`,
                [sessionRows[0].id, channelRows[0].id]
            );

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            logger.error('Failed to unlink session from channel:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ═══════════════════════════════════════
    // Logging and Analytics
    // ═══════════════════════════════════════

    async logActivity(action, sessionName = null, channelName = null, status = 'success', metadata = {}, apiKeyId = null) {
        try {
            await this.pool.execute(
                `INSERT INTO activity_logs 
                (action, session_name, channel_name, status, metadata, api_key_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [action, sessionName, channelName, status, JSON.stringify(metadata), apiKeyId]
            );
        } catch (error) {
            logger.error('Failed to log activity:', error);
        }
    }

    async logError(errorType, message, sessionName = null, context = {}) {
        try {
            // اگر errorType درست نیست، از 'unknown' استفاده کن
            const validErrorTypes = ['flood_wait', 'auth_error', 'network', 'database', 'unknown'];
            const type = validErrorTypes.includes(errorType) ? errorType : 'unknown';

            await this.pool.execute(
                `INSERT INTO error_logs 
            (error_type, message, session_name, context, created_at)
            VALUES (?, ?, ?, ?, NOW())`,
                [type, message, sessionName, JSON.stringify(context)]
            );
        } catch (error) {
            logger.error('Failed to log error:', error);
        }
    }
    async saveChannelAnalytics(channelId, analytics) {
        try {
            await this.pool.execute(
                `INSERT INTO channel_analytics 
                (channel_id, spam_score, quality_score, language, activity_score, 
                 engagement_rate, category, recommendation, recommendation_details)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    spam_score = VALUES(spam_score),
                    quality_score = VALUES(quality_score),
                    language = VALUES(language),
                    activity_score = VALUES(activity_score),
                    engagement_rate = VALUES(engagement_rate),
                    category = VALUES(category),
                    recommendation = VALUES(recommendation),
                    recommendation_details = VALUES(recommendation_details),
                    analyzed_at = NOW()`,
                [
                    channelId,
                    analytics.spamScore || 0,
                    analytics.qualityScore || 0,
                    analytics.language || null,
                    analytics.activityScore || 0,
                    analytics.engagementRate || 0,
                    analytics.category || null,
                    analytics.recommendation || 'pending',
                    JSON.stringify(analytics.details || {})
                ]
            );
        } catch (error) {
            logger.error('Failed to save channel analytics:', error);
        }
    }

    // ═══════════════════════════════════════
    // Statistics and Reports
    // ═══════════════════════════════════════

    async getDashboardStats() {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM v_dashboard_stats'
            );
            return rows[0] || {};
        } catch (error) {
            logger.error('Failed to get dashboard stats:', error);
            return {};
        }
    }

    async getSessionPerformance() {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM v_session_performance'
            );
            return rows;
        } catch (error) {
            logger.error('Failed to get session performance:', error);
            return [];
        }
    }

    async getSystemHealth() {
        try {
            const [rows] = await this.pool.execute(
                'SELECT * FROM v_system_health'
            );
            return rows[0] || { health_status: 'unknown' };
        } catch (error) {
            logger.error('Failed to get system health:', error);
            return { health_status: 'unknown' };
        }
    }

    // ═══════════════════════════════════════
    // Cleanup and Maintenance
    // ═══════════════════════════════════════

    async cleanupOldLogs(daysToKeep = 7) {
        try {
            await this.pool.execute(
                'CALL sp_cleanup_old_logs(?)',
                [daysToKeep]
            );
            logger.info(`Cleaned up logs older than ${daysToKeep} days`);
        } catch (error) {
            logger.error('Failed to cleanup old logs:', error);
        }
    }

    async archiveOldLogs(daysToKeep = 30) {
        try {
            await this.pool.execute(
                'CALL sp_archive_old_logs(?)',
                [daysToKeep]
            );
            logger.info(`Archived logs older than ${daysToKeep} days`);
        } catch (error) {
            logger.error('Failed to archive old logs:', error);
        }
    }

    async generateDailyReport() {
        try {
            await this.pool.execute('CALL sp_generate_daily_report()');
            logger.info('Daily report generated');
        } catch (error) {
            logger.error('Failed to generate daily report:', error);
        }
    }

    // ═══════════════════════════════════════
    // Initialization
    // ═══════════════════════════════════════

    async initializeDefaultData() {
        try {
            // Check if master key exists
            const [rows] = await this.pool.execute(
                'SELECT id FROM api_keys WHERE is_master = TRUE'
            );

            if (rows.length === 0) {
                // Create master key with recovery
                const masterKey = process.env.MASTER_API_KEY || crypto.randomBytes(32).toString('hex');
                const keyHash = crypto.createHash('sha256').update(masterKey).digest('hex');
                const recoveryToken = crypto.randomBytes(16).toString('hex');
                const recoveryHash = crypto.createHash('sha256').update(recoveryToken).digest('hex');

                await this.pool.execute(
                    `INSERT INTO api_keys 
                    (key_hash, name, description, is_master, recovery_hash) 
                    VALUES (?, 'Master Key', 'Auto-generated master key', TRUE, ?)`,
                    [keyHash, recoveryHash]
                );

                logger.info('═══════════════════════════════════════════════════════════');
                logger.info('🔐 MASTER API KEY (Save this, shown only once!)');
                logger.info(`Key: ${masterKey}`);
                logger.info(`Recovery Token: ${recoveryToken}`);
                logger.info('═══════════════════════════════════════════════════════════');
            }
        } catch (error) {
            logger.error('Failed to initialize default data:', error);
        }
    }

    async updateChannelInfo(channelData) {
        try {
            // فقط لاگ می‌کنیم، ذخیره نمی‌کنیم اگر نمی‌خواهید
            logger.debug('Channel info update:', channelData.id);
            return true;
        } catch (error) {
            logger.error('Failed to update channel info:', error);
            return false;
        }
    }
}

// Singleton instance
const database = new Database();

export default database;
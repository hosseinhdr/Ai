-- ═══════════════════════════════════════════════════════════════════════════
-- Telegram Channel Manager - Complete Database Schema v2.2
-- ═══════════════════════════════════════════════════════════════════════════
-- This is the FINAL consolidated schema file
-- Remove all other SQL files after applying this
-- ═══════════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS telegram_manager
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE telegram_manager;

-- ═══════════════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. API Keys Management (with recovery system)
DROP TABLE IF EXISTS api_keys;
CREATE TABLE api_keys (
                          id INT AUTO_INCREMENT PRIMARY KEY,
                          key_hash VARCHAR(64) UNIQUE NOT NULL COMMENT 'SHA256 hash of API key',
                          name VARCHAR(100) NOT NULL,
                          description TEXT,
                          is_active BOOLEAN DEFAULT TRUE,
                          is_master BOOLEAN DEFAULT FALSE,
                          recovery_hash VARCHAR(64) DEFAULT NULL COMMENT 'SHA256 hash of recovery token',
                          total_requests INT DEFAULT 0,
                          rate_limit_override INT DEFAULT NULL COMMENT 'Custom rate limit for this key',
                          last_used_at DATETIME DEFAULT NULL,
                          last_recovered_at DATETIME DEFAULT NULL,
                          revoked_at DATETIME DEFAULT NULL,
                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                          expires_at DATETIME DEFAULT NULL,

                          INDEX idx_key_hash (key_hash),
                          INDEX idx_recovery (name, recovery_hash),
                          INDEX idx_active (is_active, is_master),
                          INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Telegram Sessions (NO session strings stored)
DROP TABLE IF EXISTS telegram_sessions;
CREATE TABLE telegram_sessions (
                                   id INT AUTO_INCREMENT PRIMARY KEY,
                                   name VARCHAR(50) UNIQUE NOT NULL,
                                   is_premium BOOLEAN DEFAULT FALSE,
                                   is_active BOOLEAN DEFAULT TRUE,
                                   is_connected BOOLEAN DEFAULT FALSE,
                                   current_channels_count INT DEFAULT 0,
                                   max_channels INT DEFAULT 500,
                                   health_status ENUM('healthy', 'warning', 'critical', 'disconnected', 'shutdown') DEFAULT 'healthy',
                                   last_error TEXT DEFAULT NULL,
                                   error_count INT DEFAULT 0,
                                   success_rate FLOAT DEFAULT 1.0,
                                   flood_wait_until DATETIME DEFAULT NULL,
                                   last_connected_at DATETIME DEFAULT NULL,
                                   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                                   INDEX idx_active (is_active, is_connected),
                                   INDEX idx_name (name),
                                   INDEX idx_health (health_status),
                                   INDEX idx_flood (flood_wait_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Channels Information
DROP TABLE IF EXISTS channels;
CREATE TABLE channels (
                          id INT AUTO_INCREMENT PRIMARY KEY,
                          channel_id VARCHAR(50) UNIQUE NOT NULL COMMENT 'Telegram channel ID',
                          username VARCHAR(100) DEFAULT NULL,
                          title VARCHAR(255) NOT NULL,
                          description TEXT,
                          participants_count INT DEFAULT 0,
                          is_public BOOLEAN DEFAULT TRUE,
                          is_active BOOLEAN DEFAULT TRUE,
                          is_private BOOLEAN DEFAULT FALSE,
                          is_verified BOOLEAN DEFAULT FALSE,
                          last_checked_at DATETIME DEFAULT NULL,
                          last_analyzed_at DATETIME DEFAULT NULL,
                          quality_score FLOAT DEFAULT NULL,
                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                          INDEX idx_channel_id (channel_id),
                          INDEX idx_active (is_active),
                          INDEX idx_username (username),
                          INDEX idx_quality (quality_score),
                          INDEX idx_participants (participants_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Session-Channel Relationships
DROP TABLE IF EXISTS session_channels;
CREATE TABLE session_channels (
                                  id INT AUTO_INCREMENT PRIMARY KEY,
                                  session_id INT NOT NULL,
                                  channel_id INT NOT NULL,
                                  is_member BOOLEAN DEFAULT TRUE,
                                  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                  left_at DATETIME DEFAULT NULL,
                                  joined_by_api_key INT DEFAULT NULL,
                                  join_method ENUM('username', 'invite_link', 'private_link') DEFAULT 'username',

                                  FOREIGN KEY (session_id) REFERENCES telegram_sessions(id) ON DELETE CASCADE,
                                  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
                                  FOREIGN KEY (joined_by_api_key) REFERENCES api_keys(id) ON DELETE SET NULL,

                                  UNIQUE KEY unique_session_channel (session_id, channel_id),
                                  INDEX idx_member (is_member),
                                  INDEX idx_session (session_id),
                                  INDEX idx_channel (channel_id),
                                  INDEX idx_joined (joined_at),
                                  INDEX idx_api_key (joined_by_api_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Activity Logs (بدون Partitioning به خاطر Foreign Key)
DROP TABLE IF EXISTS activity_logs;
CREATE TABLE activity_logs (
                               id BIGINT AUTO_INCREMENT PRIMARY KEY,
                               action ENUM('join', 'leave', 'info', 'list', 'cleanup', 'analyze', 'api_key_usage', 'other') NOT NULL,
                               session_name VARCHAR(50),
                               channel_name VARCHAR(255),
                               status ENUM('success', 'failed', 'pending', 'warning') DEFAULT 'pending',
                               error_message TEXT DEFAULT NULL,
                               metadata JSON DEFAULT NULL,
                               response_time_ms INT DEFAULT NULL,
                               api_key_id INT DEFAULT NULL,
                               created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                               created_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED, -- برای partitioning manual

                               FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,

                               INDEX idx_action (action),
                               INDEX idx_created (created_at),
                               INDEX idx_created_date (created_date), -- برای query های روزانه
                               INDEX idx_session (session_name),
                               INDEX idx_status (status),
                               INDEX idx_api_key (api_key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Channel Analytics
DROP TABLE IF EXISTS channel_analytics;
CREATE TABLE channel_analytics (
                                   id INT AUTO_INCREMENT PRIMARY KEY,
                                   channel_id VARCHAR(50) UNIQUE NOT NULL,
                                   spam_score FLOAT DEFAULT 0 CHECK (spam_score >= 0 AND spam_score <= 1),
                                   quality_score FLOAT DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 1),
                                   language VARCHAR(20),
                                   activity_score FLOAT DEFAULT 0 CHECK (activity_score >= 0 AND activity_score <= 1),
                                   engagement_rate FLOAT DEFAULT 0 CHECK (engagement_rate >= 0 AND engagement_rate <= 1),
                                   category VARCHAR(50),
                                   recommendation ENUM('keep', 'monitor', 'leave', 'pending') DEFAULT 'pending',
                                   recommendation_details JSON,
                                   analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                                   INDEX idx_spam (spam_score),
                                   INDEX idx_quality (quality_score),
                                   INDEX idx_category (category),
                                   INDEX idx_analyzed (analyzed_at),
                                   INDEX idx_recommendation (recommendation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Error Logs (بدون Partitioning)
DROP TABLE IF EXISTS error_logs;
CREATE TABLE error_logs (
                            id BIGINT AUTO_INCREMENT PRIMARY KEY,
                            error_type ENUM('flood_wait', 'auth_error', 'network', 'database', 'unknown') DEFAULT 'unknown',
                            error_code VARCHAR(50),
                            message TEXT,
                            context JSON,
                            session_name VARCHAR(50),
                            channel_id VARCHAR(50),
                            stack_trace TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            created_date DATE GENERATED ALWAYS AS (DATE(created_at)) STORED, -- برای query های روزانه

                            INDEX idx_type (error_type),
                            INDEX idx_session (session_name),
                            INDEX idx_created (created_at),
                            INDEX idx_created_date (created_date), -- برای cleanup
                            INDEX idx_code (error_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Monitoring Reports
DROP TABLE IF EXISTS monitoring_reports;
CREATE TABLE monitoring_reports (
                                    id INT AUTO_INCREMENT PRIMARY KEY,
                                    report_type ENUM('hourly', 'daily', 'weekly', 'monthly', 'realtime') DEFAULT 'hourly',
                                    report_data JSON,
                                    summary JSON,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                                    INDEX idx_type (report_type),
                                    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Rate Limit History
DROP TABLE IF EXISTS rate_limit_history;
CREATE TABLE rate_limit_history (
                                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                                    operation VARCHAR(50),
                                    session_name VARCHAR(50),
                                    api_key_id INT DEFAULT NULL,
                                    success BOOLEAN,
                                    response_time INT,
                                    error_message TEXT,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                                    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,

                                    INDEX idx_operation (operation),
                                    INDEX idx_session (session_name),
                                    INDEX idx_created (created_at),
                                    INDEX idx_api_key (api_key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Session Pool Statistics
DROP TABLE IF EXISTS session_pool_stats;
CREATE TABLE session_pool_stats (
                                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                                    total_sessions INT,
                                    active_sessions INT,
                                    total_capacity INT,
                                    used_capacity INT,
                                    average_load FLOAT,
                                    stats_data JSON,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                                    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════════════════
-- ARCHIVE TABLES (برای داده‌های قدیمی)
-- ═══════════════════════════════════════════════════════════════════════════

-- Archive table for old activity logs (Partitioned, no FK)
DROP TABLE IF EXISTS activity_logs_archive;
CREATE TABLE activity_logs_archive (
                                       id BIGINT NOT NULL,
                                       action VARCHAR(50) NOT NULL,
                                       session_name VARCHAR(50),
                                       channel_name VARCHAR(255),
                                       status VARCHAR(20),
                                       error_message TEXT,
                                       metadata JSON,
                                       response_time_ms INT,
                                       api_key_id INT,
                                       created_at DATETIME NOT NULL,
                                       archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                                       PRIMARY KEY (id, created_at), -- Include partition key in PK
                                       INDEX idx_created (created_at),
                                       INDEX idx_session (session_name),
                                       INDEX idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    PARTITION BY RANGE (YEAR(created_at)) (
        PARTITION p2023 VALUES LESS THAN (2024),
        PARTITION p2024 VALUES LESS THAN (2025),
        PARTITION p2025 VALUES LESS THAN (2026),
        PARTITION p2026 VALUES LESS THAN (2027),
        PARTITION p_future VALUES LESS THAN MAXVALUE
        );

-- Archive table for old error logs (Partitioned, no FK)
DROP TABLE IF EXISTS error_logs_archive;
CREATE TABLE error_logs_archive (
                                    id BIGINT NOT NULL,
                                    error_type VARCHAR(50),
                                    error_code VARCHAR(50),
                                    message TEXT,
                                    context JSON,
                                    session_name VARCHAR(50),
                                    channel_id VARCHAR(50),
                                    stack_trace TEXT,
                                    created_at DATETIME NOT NULL,
                                    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                                    PRIMARY KEY (id, created_at), -- Include partition key in PK
                                    INDEX idx_created (created_at),
                                    INDEX idx_type (error_type),
                                    INDEX idx_session (session_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    PARTITION BY RANGE (YEAR(created_at)) (
        PARTITION p2023 VALUES LESS THAN (2024),
        PARTITION p2024 VALUES LESS THAN (2025),
        PARTITION p2025 VALUES LESS THAN (2026),
        PARTITION p2026 VALUES LESS THAN (2027),
        PARTITION p_future VALUES LESS THAN MAXVALUE
        );

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Dashboard Statistics View
CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
    (SELECT COUNT(*) FROM telegram_sessions WHERE is_connected = TRUE) as active_sessions,
    (SELECT COUNT(*) FROM telegram_sessions) as total_sessions,
    (SELECT SUM(current_channels_count) FROM telegram_sessions WHERE is_connected = TRUE) as total_channels_used,
    (SELECT SUM(max_channels) FROM telegram_sessions WHERE is_active = TRUE) as total_capacity,
    (SELECT COUNT(*) FROM channels WHERE is_active = TRUE) as active_channels,
    (SELECT COUNT(*) FROM channels) as total_channels_registered,
    (SELECT AVG(spam_score) FROM channel_analytics) as avg_spam_score,
    (SELECT AVG(quality_score) FROM channel_analytics) as avg_quality_score,
    (SELECT COUNT(*) FROM error_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)) as recent_errors,
    (SELECT COUNT(*) FROM activity_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)) as daily_operations,
    (SELECT COUNT(*) FROM api_keys WHERE is_active = TRUE) as active_api_keys,
    (SELECT SUM(total_requests) FROM api_keys WHERE last_used_at > DATE_SUB(NOW(), INTERVAL 1 DAY)) as daily_api_requests;

-- 2. Session Performance View
CREATE OR REPLACE VIEW v_session_performance AS
SELECT
    s.id,
    s.name,
    s.is_premium,
    s.current_channels_count,
    s.max_channels,
    s.health_status,
    s.success_rate,
    ROUND((s.current_channels_count / s.max_channels) * 100, 2) as capacity_percentage,
    COUNT(DISTINCT al.id) as total_operations,
    SUM(CASE WHEN al.status = 'success' THEN 1 ELSE 0 END) as successful_operations,
    SUM(CASE WHEN al.status = 'failed' THEN 1 ELSE 0 END) as failed_operations,
    AVG(al.response_time_ms) as avg_response_time,
    MAX(al.created_at) as last_activity
FROM telegram_sessions s
         LEFT JOIN activity_logs al ON s.name = al.session_name AND al.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY s.id;

-- 3. Channel Quality View
CREATE OR REPLACE VIEW v_channel_quality AS
SELECT
    c.id,
    c.channel_id,
    c.username,
    c.title,
    c.participants_count,
    c.is_public,
    ca.spam_score,
    ca.quality_score,
    ca.activity_score,
    ca.engagement_rate,
    ca.category,
    ca.recommendation,
    COUNT(DISTINCT sc.session_id) as session_count,
    c.last_analyzed_at
FROM channels c
         LEFT JOIN channel_analytics ca ON c.channel_id = ca.channel_id
         LEFT JOIN session_channels sc ON c.id = sc.channel_id AND sc.is_member = TRUE
GROUP BY c.id
ORDER BY ca.quality_score DESC;

-- 4. API Key Usage View
CREATE OR REPLACE VIEW v_api_key_usage AS
SELECT
    ak.id,
    ak.name,
    ak.is_master,
    ak.total_requests,
    COUNT(DISTINCT al.id) as recent_requests,
    AVG(al.response_time_ms) as avg_response_time,
    SUM(CASE WHEN al.status = 'success' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100 as success_rate,
    ak.last_used_at,
    ak.created_at
FROM api_keys ak
         LEFT JOIN activity_logs al ON ak.id = al.api_key_id AND al.created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
WHERE ak.is_active = TRUE
GROUP BY ak.id;

-- 5. System Health View
CREATE OR REPLACE VIEW v_system_health AS
SELECT
    CASE
        WHEN error_rate > 10 THEN 'critical'
        WHEN error_rate > 5 THEN 'warning'
        ELSE 'healthy'
        END as health_status,
    connected_sessions,
    total_sessions,
    capacity_usage,
    error_rate,
    avg_response_time
FROM (
         SELECT
             (SELECT COUNT(*) FROM telegram_sessions WHERE is_connected = TRUE) as connected_sessions,
             (SELECT COUNT(*) FROM telegram_sessions) as total_sessions,
             (SELECT AVG(current_channels_count / max_channels * 100) FROM telegram_sessions WHERE is_connected = TRUE) as capacity_usage,
             (SELECT COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM activity_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)), 0)
              FROM activity_logs WHERE status = 'failed' AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)) as error_rate,
             (SELECT AVG(response_time_ms) FROM activity_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)) as avg_response_time
     ) health_data;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

DELIMITER $$

-- 1. Update channel count on join
DROP TRIGGER IF EXISTS trg_update_channel_count_on_join$$
CREATE TRIGGER trg_update_channel_count_on_join
    AFTER INSERT ON session_channels
    FOR EACH ROW
BEGIN
    IF NEW.is_member = TRUE THEN
        UPDATE telegram_sessions
        SET current_channels_count = current_channels_count + 1,
            updated_at = NOW()
        WHERE id = NEW.session_id;
    END IF;
END$$

-- 2. Update channel count on leave
DROP TRIGGER IF EXISTS trg_update_channel_count_on_leave$$
CREATE TRIGGER trg_update_channel_count_on_leave
    AFTER UPDATE ON session_channels
    FOR EACH ROW
BEGIN
    IF OLD.is_member = TRUE AND NEW.is_member = FALSE THEN
        UPDATE telegram_sessions
        SET current_channels_count = GREATEST(0, current_channels_count - 1),
            updated_at = NOW()
        WHERE id = NEW.session_id;
    END IF;
END$$

-- 3. Log API key usage
DROP TRIGGER IF EXISTS trg_log_api_key_usage$$
CREATE TRIGGER trg_log_api_key_usage
    AFTER UPDATE ON api_keys
    FOR EACH ROW
BEGIN
    IF NEW.total_requests > OLD.total_requests THEN
        INSERT INTO activity_logs (action, status, metadata, api_key_id)
        VALUES ('api_key_usage', 'success',
                JSON_OBJECT(
                        'key_id', NEW.id,
                        'key_name', NEW.name,
                        'total_requests', NEW.total_requests
                ),
                NEW.id);
    END IF;
END$$

-- 4. Update session health based on errors
DROP TRIGGER IF EXISTS trg_update_session_health$$
CREATE TRIGGER trg_update_session_health
    AFTER INSERT ON error_logs
    FOR EACH ROW
BEGIN
    DECLARE error_count INT;

    IF NEW.session_name IS NOT NULL THEN
        SELECT COUNT(*) INTO error_count
        FROM error_logs
        WHERE session_name = NEW.session_name
          AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);

        UPDATE telegram_sessions
        SET health_status = CASE
                                WHEN error_count > 10 THEN 'critical'
                                WHEN error_count > 5 THEN 'warning'
                                ELSE health_status
            END,
            error_count = error_count,
            last_error = NEW.message
        WHERE name = NEW.session_name;
    END IF;
END$$

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORED PROCEDURES
-- ═══════════════════════════════════════════════════════════════════════════

DELIMITER $$

-- 1. Archive old logs (به جای حذف، به archive منتقل کن)
DROP PROCEDURE IF EXISTS sp_archive_old_logs$$
CREATE PROCEDURE sp_archive_old_logs(IN days_to_keep INT)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            ROLLBACK;
            RESIGNAL;
        END;

    START TRANSACTION;

    -- Archive old activity logs
    INSERT INTO activity_logs_archive (id, action, session_name, channel_name, status, error_message, metadata, response_time_ms, api_key_id, created_at)
    SELECT id, action, session_name, channel_name, status, error_message, metadata, response_time_ms, api_key_id, created_at
    FROM activity_logs
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);

    DELETE FROM activity_logs
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);

    -- Archive old error logs
    INSERT INTO error_logs_archive (id, error_type, error_code, message, context, session_name, channel_id, stack_trace, created_at)
    SELECT id, error_type, error_code, message, context, session_name, channel_id, stack_trace, created_at
    FROM error_logs
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);

    DELETE FROM error_logs
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);

    -- Delete old rate limit history (no archive needed)
    DELETE FROM rate_limit_history
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);

    -- Delete old monitoring reports (keep last 30 days)
    DELETE FROM monitoring_reports
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

    -- Delete old session pool stats (keep last 7 days)
    DELETE FROM session_pool_stats
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);

    COMMIT;

    -- Optimize tables
    OPTIMIZE TABLE activity_logs, error_logs, rate_limit_history;
END$$

-- 2. Cleanup old logs (simple delete)
DROP PROCEDURE IF EXISTS sp_cleanup_old_logs$$
CREATE PROCEDURE sp_cleanup_old_logs(IN days_to_keep INT)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
            ROLLBACK;
            RESIGNAL;
        END;

    START TRANSACTION;

    -- Use indexed date column for better performance
    DELETE FROM activity_logs
    WHERE created_date < DATE_SUB(CURDATE(), INTERVAL days_to_keep DAY);

    DELETE FROM error_logs
    WHERE created_date < DATE_SUB(CURDATE(), INTERVAL days_to_keep DAY);

    DELETE FROM rate_limit_history
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_to_keep DAY);

    DELETE FROM monitoring_reports
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY);

    DELETE FROM session_pool_stats
    WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);

    COMMIT;
END$$

-- 3. Get session statistics
DROP PROCEDURE IF EXISTS sp_get_session_stats$$
CREATE PROCEDURE sp_get_session_stats(IN p_session_name VARCHAR(50))
BEGIN
    SELECT
        s.*,
        COUNT(DISTINCT sc.channel_id) as unique_channels,
        COUNT(DISTINCT al.id) as total_operations,
        SUM(CASE WHEN al.status = 'success' THEN 1 ELSE 0 END) as successful_ops,
        SUM(CASE WHEN al.status = 'failed' THEN 1 ELSE 0 END) as failed_ops,
        AVG(al.response_time_ms) as avg_response_time,
        MAX(al.created_at) as last_activity
    FROM telegram_sessions s
             LEFT JOIN session_channels sc ON s.id = sc.session_id AND sc.is_member = TRUE
             LEFT JOIN activity_logs al ON s.name = al.session_name
    WHERE s.name = p_session_name
    GROUP BY s.id;
END$$

-- 4. Get channel statistics
DROP PROCEDURE IF EXISTS sp_get_channel_stats$$
CREATE PROCEDURE sp_get_channel_stats(IN p_channel_id VARCHAR(50))
BEGIN
    SELECT
        c.*,
        ca.spam_score,
        ca.quality_score,
        ca.activity_score,
        ca.engagement_rate,
        ca.category,
        ca.recommendation,
        COUNT(DISTINCT sc.session_id) as session_count,
        GROUP_CONCAT(DISTINCT s.name) as session_names
    FROM channels c
             LEFT JOIN channel_analytics ca ON c.channel_id = ca.channel_id
             LEFT JOIN session_channels sc ON c.id = sc.channel_id AND sc.is_member = TRUE
             LEFT JOIN telegram_sessions s ON sc.session_id = s.id
    WHERE c.channel_id = p_channel_id
    GROUP BY c.id;
END$$

-- 5. Generate daily report
DROP PROCEDURE IF EXISTS sp_generate_daily_report$$
CREATE PROCEDURE sp_generate_daily_report()
BEGIN
    DECLARE report_json JSON;

    SELECT JSON_OBJECT(
                   'date', CURDATE(),
                   'sessions', JSON_OBJECT(
                           'total', COUNT(*),
                           'active', SUM(is_connected),
                           'avg_capacity_usage', AVG(current_channels_count / max_channels * 100)
                               ),
                   'channels', JSON_OBJECT(
                           'total', (SELECT COUNT(*) FROM channels),
                           'active', (SELECT COUNT(*) FROM channels WHERE is_active = TRUE),
                           'joined_today', (SELECT COUNT(*) FROM session_channels WHERE DATE(joined_at) = CURDATE())
                               ),
                   'operations', JSON_OBJECT(
                           'total', (SELECT COUNT(*) FROM activity_logs WHERE DATE(created_at) = CURDATE()),
                           'success_rate', (SELECT AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100 FROM activity_logs WHERE DATE(created_at) = CURDATE())
                                 ),
                   'errors', JSON_OBJECT(
                           'total', (SELECT COUNT(*) FROM error_logs WHERE DATE(created_at) = CURDATE()),
                           'by_type', (SELECT JSON_OBJECTAGG(error_type, cnt) FROM (SELECT error_type, COUNT(*) as cnt FROM error_logs WHERE DATE(created_at) = CURDATE() GROUP BY error_type) t)
                             )
           ) INTO report_json
    FROM telegram_sessions;

    INSERT INTO monitoring_reports (report_type, report_data, summary)
    VALUES ('daily', report_json, JSON_OBJECT('generated_at', NOW()));
END$$

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════════════════
-- INITIAL DATA
-- ═══════════════════════════════════════════════════════════════════════════

-- Create default master key if not exists
INSERT IGNORE INTO api_keys (key_hash, name, description, is_master, is_active)
VALUES (
           SHA2('CHANGE_THIS_MASTER_KEY_IMMEDIATELY', 256),
           'Default Master Key',
           'Auto-generated master key - CHANGE THIS IMMEDIATELY',
           TRUE,
           TRUE
       );

-- ═══════════════════════════════════════════════════════════════════════════
-- SCHEDULED EVENTS
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable event scheduler
SET GLOBAL event_scheduler = ON;

-- Daily cleanup event
DROP EVENT IF EXISTS event_daily_cleanup;
CREATE EVENT IF NOT EXISTS event_daily_cleanup
    ON SCHEDULE EVERY 1 DAY
        STARTS CONCAT(CURDATE() + INTERVAL 1 DAY, ' 03:00:00')
    DO
    BEGIN
        CALL sp_cleanup_old_logs(7);
        CALL sp_generate_daily_report();
    END;

-- Hourly stats collection
DROP EVENT IF EXISTS event_hourly_stats;
CREATE EVENT IF NOT EXISTS event_hourly_stats
    ON SCHEDULE EVERY 1 HOUR
    DO
    BEGIN
        INSERT INTO session_pool_stats (total_sessions, active_sessions, total_capacity, used_capacity, average_load, stats_data)
        SELECT
            COUNT(*),
            SUM(is_connected),
            SUM(max_channels),
            SUM(current_channels_count),
            AVG(current_channels_count / max_channels * 100),
            JSON_OBJECT(
                    'timestamp', NOW(),
                    'sessions', JSON_ARRAYAGG(
                            JSON_OBJECT(
                                    'name', name,
                                    'connected', is_connected,
                                    'capacity_used', current_channels_count / max_channels * 100
                            )
                                )
            )
        FROM telegram_sessions
        WHERE is_active = TRUE;
    END;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS (adjust usernames as needed)
-- ═══════════════════════════════════════════════════════════════════════════

-- Create user if not exists
-- CREATE USER IF NOT EXISTS 'telegram_user'@'localhost' IDENTIFIED BY 'secure_password_here';

-- Grant privileges
-- GRANT ALL PRIVILEGES ON telegram_manager.* TO 'telegram_user'@'localhost';
-- GRANT EXECUTE ON telegram_manager.* TO 'telegram_user'@'localhost';
-- FLUSH PRIVILEGES;
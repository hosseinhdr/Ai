import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../../.env'),
    '/app/.env',
    './.env'
];

let envLoaded = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        console.log(`🔧 Loading .env from: ${envPath}`);
        dotenv.config({ path: envPath });
        envLoaded = true;
        break;
    }
}

if (!envLoaded) {
    console.log('⚠️ No .env file found, using environment variables only');
}

// Generate secure encryption key if not provided
const generateEncryptionKey = () => {
    if (!process.env.ENCRYPTION_KEY) {
        const key = crypto.randomBytes(32).toString('hex');
        console.log('⚠️ ENCRYPTION_KEY not found! Generated new key:');
        console.log(`ENCRYPTION_KEY=${key}`);
        console.log('Add this to your .env file!');
        return key;
    }
    return process.env.ENCRYPTION_KEY;
};

// Get sessions file path from environment or use default
const getSessionsFilePath = () => {
    const envPath = process.env.SESSIONS_FILE_PATH;

    if (envPath) {
        // If path is relative, make it relative to project root
        if (!path.isAbsolute(envPath)) {
            return path.join(process.cwd(), envPath);
        }
        return envPath;
    }

    // Default path
    return path.join(process.cwd(), 'sessions.json');
};

// Load sessions from JSON file
const loadSessions = () => {
    const sessions = [];
    const sessionsFilePath = getSessionsFilePath();

    console.log(`📂 Looking for sessions file at: ${sessionsFilePath}`);

    // Try to load from sessions file
    if (fs.existsSync(sessionsFilePath)) {
        try {
            const fileContent = fs.readFileSync(sessionsFilePath, 'utf8');
            const sessionsData = JSON.parse(fileContent);

            // Handle both array and object format
            const sessionsList = Array.isArray(sessionsData)
                ? sessionsData
                : (sessionsData.sessions || []);

            for (const session of sessionsList) {
                if (session.sessionString && session.sessionString.length > 10) {
                    sessions.push({
                        name: session.name || `session_${sessions.length + 1}`,
                        string: session.sessionString.trim(),
                        isPremium: session.isPremium || false,
                        phoneNumber: session.phoneNumber || null,
                        description: session.description || null,
                        username: session.username || null,
                        userId: session.userId || null
                    });
                }
            }

            console.log(`✅ Loaded ${sessions.length} sessions from ${path.basename(sessionsFilePath)}`);
            return sessions;

        } catch (error) {
            console.error(`❌ Error reading sessions file:`, error.message);
            console.error(`   Path: ${sessionsFilePath}`);
            console.error(`   Make sure the file exists and has valid JSON format`);
        }
    } else {
        console.warn(`⚠️ Sessions file not found at: ${sessionsFilePath}`);
        console.warn(`   You can set a custom path with SESSIONS_FILE_PATH in .env`);
    }

    // Fallback to environment variables (for backward compatibility)
    console.log('🔄 Checking for sessions in environment variables...');

    for (let i = 1; i <= 10; i++) {
        const sessionEnv = process.env[`SESSION_${i}`];
        if (sessionEnv) {
            const [sessionString, isPremium] = sessionEnv.split('|');

            if (sessionString && sessionString.length > 10) {
                sessions.push({
                    name: `session_${i}`,
                    string: sessionString.trim(),
                    isPremium: isPremium === 'true'
                });
                console.log(`  ✓ Found SESSION_${i} in environment`);
            }
        }
    }

    if (sessions.length === 0) {
        console.error('═══════════════════════════════════════════════════════');
        console.error('❌ NO SESSIONS FOUND!');
        console.error('═══════════════════════════════════════════════════════');
        console.error('Please either:');
        console.error('1. Create sessions.json file using: npm run session:create');
        console.error('2. Set SESSIONS_FILE_PATH in .env to point to your sessions file');
        console.error('3. Add SESSION_1, SESSION_2, etc. to your .env file');
        console.error('═══════════════════════════════════════════════════════');
    }

    return sessions;
};

const config = {
    app: {
        name: 'Telegram Channel Manager',
        version: '2.2.0',
        env: process.env.NODE_ENV || 'development',
        isDevelopment: process.env.NODE_ENV === 'development',
        isProduction: process.env.NODE_ENV === 'production'
    },

    telegram: {
        apiId: parseInt(process.env.API_ID) || 0,
        apiHash: process.env.API_HASH || '',
        sessions: loadSessions(),
        sessionsFilePath: getSessionsFilePath(), // Store the path for reference
        adminUserId: process.env.ADMIN_USER_ID || '',
        adminUsername: process.env.ADMIN_USERNAME || ''
    },

    server: {
        host: process.env.API_HOST || '0.0.0.0',
        port: parseInt(process.env.API_PORT) || 3000,
        corsOrigin: process.env.CORS_ORIGIN || '*'
    },

    database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        name: process.env.DB_NAME || 'telegram_manager',
        connectionLimit: 20,
        queueLimit: 0,
        waitForConnections: true,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    },

    security: {
        encryptionKey: generateEncryptionKey(),
        masterApiKey: process.env.MASTER_API_KEY || crypto.randomBytes(32).toString('hex'),
        sessionTimeout: 30 * 60 * 1000,
        maxRetries: 3,
        apiKeyRecoveryEnabled: true
    },

    monitoring: {
        inactivityDays: parseInt(process.env.INACTIVITY_DAYS) || 7,
        healthCheckInterval: 60000,
        autoCleanupDays: 7,
        memoryCheckInterval: 300000,
        maxMemoryUsage: 1024 * 1024 * 1024,
        metricsRetentionDays: 7,
        maxMetricsSize: 10000,
        saveSystemState: process.env.SAVE_SYSTEM_STATE === 'true' || false  // اضافه کنید این خط را
    },

    queue: {
        maxConcurrent: 5,
        retryAttempts: 3,
        retryDelay: 5000,
        operationTimeout: 30000,
        maxQueueSize: 1000
    },

    rateLimit: {
        global: 100,
        join: 5,
        leave: 10,
        info: 30,
        cleanup: 2,
        useRedis: process.env.REDIS_ENABLED === 'true'
    },

    redis: {
        enabled: process.env.REDIS_ENABLED === 'true',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: parseInt(process.env.REDIS_DB) || 0
    },

    logging: {
        level: process.env.LOG_LEVEL || 'info',
        maxFiles: 5,
        maxSize: '10m'
    },

    workers: {
        poolSize: parseInt(process.env.WORKER_POOL_SIZE) || 4,
        maxBatchSize: 1000,
        timeout: 30000
    }
};

// Helper function to reload sessions (useful for hot-reload)
config.reloadSessions = () => {
    console.log('🔄 Reloading sessions...');
    config.telegram.sessions = loadSessions();
    return config.telegram.sessions;
};

// Helper function to get sessions file info
config.getSessionsInfo = () => {
    const filePath = getSessionsFilePath();

    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        const sessionCount = Array.isArray(data) ? data.length : (data.sessions?.length || 0);

        return {
            path: filePath,
            exists: true,
            size: stats.size,
            modified: stats.mtime,
            sessionCount: sessionCount
        };
    }

    return {
        path: filePath,
        exists: false,
        sessionCount: 0
    };
};

const validateConfig = () => {
    const errors = [];

    if (!config.telegram.apiId) {
        errors.push('API_ID is required in .env file');
    }

    if (!config.telegram.apiHash) {
        errors.push('API_HASH is required in .env file');
    }

    if (config.telegram.sessions.length === 0) {
        errors.push(`No sessions found! Check SESSIONS_FILE_PATH (${getSessionsFilePath()})`);
    }

    if (!config.security.encryptionKey || config.security.encryptionKey.length < 32) {
        errors.push('ENCRYPTION_KEY must be at least 32 characters');
    }

    if (errors.length > 0) {
        console.error('❌ Configuration errors:');
        errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
    }

    // Display configuration summary
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║         Configuration Summary                 ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║ Sessions File: ${path.basename(getSessionsFilePath()).padEnd(30)}║`);
    console.log(`║ Sessions Loaded: ${config.telegram.sessions.length.toString().padEnd(28)}║`);
    console.log(`║ Environment: ${config.app.env.padEnd(32)}║`);
    console.log(`║ Redis: ${(config.redis.enabled ? 'Enabled' : 'Disabled').padEnd(38)}║`);
    console.log(`║ Admin Notifications: ${(config.telegram.adminUserId ? 'Yes' : 'No').padEnd(24)}║`);
    console.log('╚══════════════════════════════════════════════╝');
};

validateConfig();

export default config;
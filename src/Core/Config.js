require('dotenv').config();

class Config {
    constructor() {
        // Validate and load environment variables
        this.validateEnvironment();

        // Telegram configuration
        this.apiId = this.parseIntSafe(process.env.API_ID, 'API_ID');
        this.apiHash = this.requireEnv('API_HASH');
        this.sessionPath = process.env.SESSION_PATH;
        this.observerTgUserId = process.env.OBSERVER_TELEGRAM_USER_ID;

        // Database configuration
        this.dbConfig = {
            host: process.env.DB_HOST ,
            port: this.parseIntSafe(process.env.DB_PORT_WRITE, 'DB_PORT_WRITE', 3306),
            user: process.env.DB_USER ,
            password: process.env.DB_PASS ,
            database: process.env.DB_NAME
        };

        // Admin configuration
        this.adminUsername = this.requireEnv('ADMIN_USERNAME');

        // Application settings
        this.logLevel = process.env.LOG_LEVEL || 'ERROR';
        this.environment = process.env.NODE_ENV || 'production';

        // Display loaded configuration (without sensitive data)
        this.displayConfig();
    }

    validateEnvironment() {
        const required = ['API_ID', 'API_HASH', 'ADMIN_USERNAME','SESSION_PATH','DB_USER' , 'DB_PASS', 'DB_HOST' , 'DB_NAME'];
        const missing = [];

        for (const key of required) {
            if (!process.env[key]) {
                missing.push(key);
            }
        }

        if (missing.length > 0) {
            console.error('=====================================');
            console.error('ERROR: Missing required environment variables:');
            missing.forEach(key => console.error(`  - ${key}`));
            console.error('=====================================');
            console.error('Please set these variables in your .env file');
            process.exit(1);
        }
    }

    requireEnv(key, defaultValue = null) {
        const value = process.env[key];

        if (!value && defaultValue === null) {
            console.error(`ERROR: Required environment variable ${key} is not set`);
            process.exit(1);
        }

        return value || defaultValue;
    }

    parseIntSafe(value, name, defaultValue = null) {
        if (!value) {
            if (defaultValue !== null) {
                return defaultValue;
            }
            console.error(`ERROR: ${name} is required but not set`);
            process.exit(1);
        }

        const parsed = parseInt(value);

        if (isNaN(parsed)) {
            console.error(`ERROR: ${name} must be a valid number, got: ${value}`);
            process.exit(1);
        }

        return parsed;
    }

    displayConfig() {
        console.log('=====================================');
        console.log('Configuration loaded:');
        console.log('-------------------------------------');
        console.log('Telegram:');
        console.log(`  API ID: ${this.apiId}`);
        console.log(`  Session Path: ${this.sessionPath}`);
        console.log('-------------------------------------');
        console.log('Database:');
        console.log(`  Host: ${this.dbConfig.host}`);
        console.log(`  Port: ${this.dbConfig.port}`);
        console.log(`  User: ${this.dbConfig.user}`);
        console.log(`  Database: ${this.dbConfig.database}`);
        console.log('-------------------------------------');
        console.log('Application:');
        console.log(`  Admin: ${this.adminUsername}`);
        console.log(`  Log Level: ${this.logLevel}`);
        console.log(`  Environment: ${this.environment}`);
        console.log('=====================================\n');
    }

    // Get configuration as object (for debugging)
    toObject() {
        return {
            apiId: this.apiId,
            apiHash: '***hidden***',
            sessionPath: this.sessionPath,
            adminUsername: this.adminUsername,
            database: {
                host: this.dbConfig.host,
                port: this.dbConfig.port,
                user: this.dbConfig.user,
                database: this.dbConfig.database
            },
            logLevel: this.logLevel,
            environment: this.environment
        };
    }
}

module.exports = Config;
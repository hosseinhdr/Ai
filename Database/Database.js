const mysql = require('mysql2/promise');

class Database {
    constructor(config) {
        this.config = config;
        this.pool = null;
        this.connection = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 5000;

        this.allowedTables = ['detections', 'insightHistories', 'pushList', 'campaigns', 'media', 'contents', 'campaignContents'];
    }

    async connect() {
        try {
            console.log('Attempting database connection...');
            console.log('Database config:', {
                host: this.config.host,
                port: this.config.port,
                user: this.config.user,
                database: this.config.database
            });

            this.pool = mysql.createPool({
                host: this.config.host || 'localhost',
                port: this.config.port || 3306,
                user: this.config.user || 'root',
                password: this.config.password || '',
                database: this.config.database || 'telegram_db',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                connectTimeout: 10000,
                timezone: '+00:00',
                enableKeepAlive: true,
                keepAliveInitialDelay: 0
            });

            // تست اتصال
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();

            this.isConnected = true;
            this.retryCount = 0;
            console.log('Database connected successfully');
            return true;
        } catch (error) {
            console.error('Database connection failed:', error.message);
            console.error('Error code:', error.code);
            this.isConnected = false;

            // Retry logic
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`Retrying connection (${this.retryCount}/${this.maxRetries}) in ${this.retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.connect();
            }

            throw error;
        }
    }

    async getData(query, params = []) {
        try {
            // Check connection
            if (!this.pool || !this.isConnected) {
                console.log('Database not connected, attempting to connect...');
                await this.connect();
            }

            let connection;
            try {
                connection = await this.pool.getConnection();

                // Test connection
                await connection.ping();

                // Execute query with proper parameterization
                const [rows] = await connection.execute(query, params);
                return rows;

            } finally {
                // Always release connection back to pool
                if (connection) connection.release();
            }

        } catch (error) {
            console.error('Database query error:', error.message);

            // Handle connection errors
            if (this.isConnectionError(error)) {
                console.log('Connection lost, attempting to reconnect...');
                this.isConnected = false;

                try {
                    await this.connect();
                    // Retry the query after reconnection
                    return await this.getData(query, params);
                } catch (reconnectError) {
                    console.error('Reconnection failed:', reconnectError.message);
                    return [];
                }
            }

            return [];
        }
    }

    async insertData(table, data) {
        try {
            // Security check - prevent SQL injection
            if (!this.allowedTables.includes(table)) {
                throw new Error(`Table '${table}' is not allowed`);
            }

            // Validate data object
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
                throw new Error('Invalid data object');
            }

            // Check connection
            if (!this.pool || !this.isConnected) {
                await this.connect();
            }

            const keys = Object.keys(data);
            const values = Object.values(data);

            // Create parameterized query
            const columns = keys.map(key => `\`${key}\``).join(', ');
            const placeholders = keys.map(() => '?').join(', ');
            const query = `INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`;

            console.log('Insert query:', query.substring(0, 100) + '...');

            let connection;
            try {
                connection = await this.pool.getConnection();
                const [result] = await connection.execute(query, values);
                return result;
            } finally {
                if (connection) connection.release();
            }

        } catch (error) {
            console.error('Database insert error:', error.message);

            // Retry on connection error
            if (this.isConnectionError(error) && this.retryCount < this.maxRetries) {
                this.isConnected = false;
                await this.connect();
                return this.insertData(table, data);
            }

            throw error;
        }
    }

    async updateData(table, data, condition) {
        try {
            // Security check
            if (!this.allowedTables.includes(table)) {
                throw new Error(`Table '${table}' is not allowed`);
            }

            // Validate inputs
            if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
                throw new Error('Invalid data object');
            }

            if (!condition || typeof condition !== 'object' || Object.keys(condition).length === 0) {
                throw new Error('Invalid condition object');
            }

            // Check connection
            if (!this.pool || !this.isConnected) {
                await this.connect();
            }

            // Build parameterized query
            const setClause = Object.keys(data).map(key => `\`${key}\` = ?`).join(', ');
            const whereClause = Object.keys(condition).map(key => `\`${key}\` = ?`).join(' AND ');
            const values = [...Object.values(data), ...Object.values(condition)];

            const query = `UPDATE \`${table}\` SET ${setClause} WHERE ${whereClause}`;

            let connection;
            try {
                connection = await this.pool.getConnection();
                const [result] = await connection.execute(query, values);
                return result;
            } finally {
                if (connection) connection.release();
            }

        } catch (error) {
            console.error('Database update error:', error.message);

            if (this.isConnectionError(error) && this.retryCount < this.maxRetries) {
                this.isConnected = false;
                await this.connect();
                return this.updateData(table, data, condition);
            }

            throw error;
        }
    }

    async testConnection() {
        try {
            if (!this.pool || !this.isConnected) {
                await this.connect();
            }

            let connection;
            try {
                connection = await this.pool.getConnection();
                await connection.ping();
                const [rows] = await connection.execute('SELECT 1 as test');
                console.log('Database test successful:', rows[0]);
                return true;
            } finally {
                if (connection) connection.release();
            }

        } catch (error) {
            console.error('Database test failed:', error.message);
            return false;
        }
    }

    async ping() {
        try {
            if (!this.pool) return false;

            const connection = await this.pool.getConnection();
            try {
                await connection.ping();
                return true;
            } finally {
                connection.release();
            }
        } catch (error) {
            return false;
        }
    }

    async close() {
        if (this.pool) {
            try {
                await this.pool.end();
                this.isConnected = false;
                this.pool = null;
                console.log('Database connection pool closed');
            } catch (error) {
                console.error('Error closing database connection pool:', error.message);
            }
        }
    }

    // Helper method to identify connection errors
    isConnectionError(error) {
        const connectionErrorCodes = [
            'PROTOCOL_CONNECTION_LOST',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ECONNRESET',
            'ENOTFOUND',
            'ER_CON_COUNT_ERROR'
        ];

        return error.fatal || connectionErrorCodes.includes(error.code);
    }

    // Get pool statistics
    getPoolStats() {
        if (!this.pool) return null;

        return {
            connectionLimit: this.pool.pool.config.connectionLimit,
            waitingClients: this.pool.pool._waitingClients.length,
            allConnections: this.pool.pool._allConnections.length,
            idleConnections: this.pool.pool._freeConnections.length,
            busyConnections: this.pool.pool._allConnections.length - this.pool.pool._freeConnections.length
        };
    }
}

module.exports = Database;
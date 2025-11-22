const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const wheelRoutes = require('./routes/wheelRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Import database
const db = require('./config/database');

class Server {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.initializeMiddlewares();
        this.initializeRoutes();
        this.initializeDatabase();
    }

    initializeMiddlewares() {
        this.app.use(cors());
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: true }));

        // Static files
        this.app.use(express.static('public'));
        this.app.use('/admin', express.static('public/admin'));

        this.app.use(session({
            secret: process.env.SESSION_SECRET || 'your-secret-key',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: false, // Set to true in production with HTTPS
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            }
        }));
    }

    initializeRoutes() {
        // API routes
        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/wheel', wheelRoutes);

        // Admin routes
        this.app.use('/admin', adminRoutes);

        // Serve index.html for root route
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    async initializeDatabase() {
        try {
            await db.testConnection();
            console.log('Database connected successfully');
        } catch (error) {
            console.error('Database connection failed:', error);
        }
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`Server is running on port ${this.port}`);
            console.log(`Visit http://localhost:${this.port}`);
            console.log(`Admin panel: http://localhost:${this.port}/admin`);
        });
    }
}

// Create and start server
const server = new Server();
server.start();
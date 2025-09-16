import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

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

// Paths
const SESSIONS_FILE = getSessionsFilePath();
const SESSIONS_BACKUP = SESSIONS_FILE.replace('.json', '.backup.json');

// Colors for console
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',

    fg: {
        black: '\x1b[30m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m'
    },

    bg: {
        black: '\x1b[40m',
        red: '\x1b[41m',
        green: '\x1b[42m',
        yellow: '\x1b[43m',
        blue: '\x1b[44m',
        magenta: '\x1b[45m',
        cyan: '\x1b[46m',
        white: '\x1b[47m'
    }
};

// Shortcuts for common colors
const c = {
    reset: colors.reset,
    bright: colors.bright,
    green: colors.fg.green,
    yellow: colors.fg.yellow,
    blue: colors.fg.blue,
    red: colors.fg.red,
    cyan: colors.fg.cyan,
    magenta: colors.fg.magenta
};

// Check API credentials
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;

if (!apiId || !apiHash) {
    console.error(`${c.red}❌ Please set API_ID and API_HASH in .env file${c.reset}`);
    console.error(`${c.yellow}   1. Go to https://my.telegram.org${c.reset}`);
    console.error(`${c.yellow}   2. Login with your phone number${c.reset}`);
    console.error(`${c.yellow}   3. Click on 'API development tools'${c.reset}`);
    console.error(`${c.yellow}   4. Create an app and get API_ID and API_HASH${c.reset}`);
    console.error(`${c.yellow}   5. Add them to your .env file${c.reset}`);
    process.exit(1);
}

/**
 * Load existing sessions from JSON file
 */
function loadExistingSessions() {
    if (!fs.existsSync(SESSIONS_FILE)) {
        // Create directory if it doesn't exist
        const dir = path.dirname(SESSIONS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`${c.yellow}📁 Created directory: ${dir}${c.reset}`);
        }

        return { sessions: [] };
    }

    try {
        const content = fs.readFileSync(SESSIONS_FILE, 'utf8');
        const data = JSON.parse(content);

        // Handle both array and object format
        if (Array.isArray(data)) {
            return { sessions: data };
        }

        return data;
    } catch (error) {
        console.error(`${c.red}❌ Error reading sessions file:${c.reset}`, error.message);
        return { sessions: [] };
    }
}

/**
 * Save sessions to JSON file
 */
function saveSessions(sessionsData) {
    try {
        // Create backup first
        if (fs.existsSync(SESSIONS_FILE)) {
            fs.copyFileSync(SESSIONS_FILE, SESSIONS_BACKUP);
            console.log(`${c.cyan}📋 Backup created: ${path.basename(SESSIONS_BACKUP)}${c.reset}`);
        }

        // Ensure directory exists
        const dir = path.dirname(SESSIONS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Save new sessions
        fs.writeFileSync(
            SESSIONS_FILE,
            JSON.stringify(sessionsData, null, 2),
            { mode: 0o600 } // Only owner can read/write
        );

        console.log(`${c.green}✅ Sessions saved to: ${path.basename(SESSIONS_FILE)}${c.reset}`);
        console.log(`${c.cyan}   Full path: ${SESSIONS_FILE}${c.reset}`);

        return true;
    } catch (error) {
        console.error(`${c.red}❌ Error saving sessions:${c.reset}`, error.message);
        return false;
    }
}

/**
 * Validate phone number format
 */
function validatePhoneNumber(phone) {
    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');

    // Check if starts with + and has valid length
    if (!cleaned.startsWith('+')) {
        return null;
    }

    // Minimum 10 digits after country code
    if (cleaned.length < 11) {
        return null;
    }

    return cleaned;
}

/**
 * Generate unique session name
 */
function generateSessionName(existingSessions, baseName) {
    let name = baseName;
    let counter = 1;

    // Check if name already exists
    while (existingSessions.some(s => s.name === name)) {
        name = `${baseName}_${counter}`;
        counter++;
    }

    return name;
}

/**
 * Display current sessions
 */
function displayCurrentSessions(sessionsData) {
    if (sessionsData.sessions.length === 0) {
        console.log(`${c.yellow}📭 No existing sessions found in ${path.basename(SESSIONS_FILE)}${c.reset}`);
        return;
    }

    console.log(`\n${c.cyan}📱 Existing Sessions in ${path.basename(SESSIONS_FILE)}:${c.reset}`);
    console.log('─'.repeat(60));

    sessionsData.sessions.forEach((session, index) => {
        const premium = session.isPremium ? '⭐' : '  ';
        const phone = session.phoneNumber ? ` (${session.phoneNumber})` : '';
        const username = session.username ? ` @${session.username}` : '';

        console.log(`${c.bright}${index + 1}.${c.reset} ${premium} ${c.green}${session.name}${c.reset}${phone}${username}`);

        if (session.description) {
            console.log(`      ${c.dim}${session.description}${c.reset}`);
        }

        if (session.createdAt) {
            const date = new Date(session.createdAt).toLocaleDateString();
            console.log(`      ${c.dim}Created: ${date}${c.reset}`);
        }
    });

    console.log('─'.repeat(60));
}

/**
 * Main function to create session
 */
async function createSession() {
    console.clear();
    console.log(`${c.bright}${c.blue}╔════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bright}${c.blue}║        🔐 Telegram Session Creator v2.2               ║${c.reset}`);
    console.log(`${c.bright}${c.blue}╚════════════════════════════════════════════════════════╝${c.reset}\n`);

    console.log(`${c.cyan}📁 Configuration:${c.reset}`);
    console.log(`  Sessions file: ${c.yellow}${SESSIONS_FILE}${c.reset}`);
    console.log(`  Environment: ${c.yellow}${process.env.NODE_ENV || 'development'}${c.reset}`);
    console.log(`  API ID: ${c.yellow}${apiId}${c.reset}\n`);

    // Load existing sessions
    const sessionsData = loadExistingSessions();
    displayCurrentSessions(sessionsData);

    console.log(`\n${c.cyan}➕ Creating New Session${c.reset}`);
    console.log('─'.repeat(60));

    // Get session details
    const sessionName = await input.text(`📝 Enter session name (e.g., primary, backup): `) || 'session';
    const uniqueName = generateSessionName(sessionsData.sessions, sessionName);

    if (uniqueName !== sessionName) {
        console.log(`${c.yellow}⚠️  Name already exists, using: ${uniqueName}${c.reset}`);
    }

    let phoneNumber = await input.text('📱 Enter phone number (with country code, e.g., +98912...): ');
    phoneNumber = validatePhoneNumber(phoneNumber);

    if (!phoneNumber) {
        console.error(`${c.red}❌ Invalid phone number format${c.reset}`);
        console.error(`${c.yellow}   Format should be: +[country_code][number]${c.reset}`);
        console.error(`${c.yellow}   Example: +989121234567${c.reset}`);
        process.exit(1);
    }

    const isPremium = (await input.text('⭐ Is this a Premium account? (y/n): ')).toLowerCase() === 'y';
    const description = await input.text('📄 Description (optional): ') || '';

    console.log(`\n${c.yellow}🔄 Connecting to Telegram...${c.reset}`);

    // Create Telegram client with minimal logging
    const client = new TelegramClient(
        new StringSession(''),
        apiId,
        apiHash,
        {
            connectionRetries: 5,
            baseLogger: {
                error: () => {},
                warn: () => {},
                info: () => {},
                debug: () => {}
            }
        }
    );

    try {
        await client.start({
            phoneNumber: async () => phoneNumber,
            phoneCode: async () => {
                console.log(`${c.cyan}📨 Code sent to ${phoneNumber}${c.reset}`);
                return await input.text('💬 Enter the code you received: ');
            },
            password: async () => {
                console.log(`${c.yellow}🔐 Two-factor authentication is enabled${c.reset}`);
                return await input.text('🔑 Enter your 2FA password: ');
            },
            onError: (err) => {
                if (err.message.includes('PHONE_CODE_INVALID')) {
                    console.error(`${c.red}❌ Invalid code. Please check and try again.${c.reset}`);
                } else if (err.message.includes('PHONE_NUMBER_INVALID')) {
                    console.error(`${c.red}❌ Invalid phone number.${c.reset}`);
                } else if (err.message.includes('PHONE_CODE_EXPIRED')) {
                    console.error(`${c.red}❌ Code expired. Please restart.${c.reset}`);
                } else {
                    console.error(`${c.red}❌ Error:${c.reset}`, err.message);
                }
            },
        });

        const sessionString = client.session.save();

        // Get user info
        const me = await client.getMe();
        const actualPremium = me.premium || false;
        const username = me.username || null;
        const fullName = `${me.firstName || ''} ${me.lastName || ''}`.trim() || 'Unknown';

        console.log(`\n${c.green}✅ Session created successfully!${c.reset}`);
        console.log('═'.repeat(60));
        console.log(`👤 Account: ${c.bright}${fullName}${c.reset}`);
        console.log(`📱 Phone: ${c.bright}${phoneNumber}${c.reset}`);

        if (username) {
            console.log(`🆔 Username: ${c.bright}@${username}${c.reset}`);
        }

        console.log(`⭐ Premium: ${actualPremium ? c.green + 'Yes' : c.yellow + 'No'}${c.reset}`);

        if (actualPremium !== isPremium) {
            console.log(`${c.yellow}⚠️  Note: Actual premium status (${actualPremium}) differs from input (${isPremium})${c.reset}`);
        }

        // Create session object
        const newSession = {
            name: uniqueName,
            sessionString: sessionString,
            isPremium: actualPremium,
            phoneNumber: phoneNumber,
            username: username,
            fullName: fullName,
            userId: me.id.toString(),
            description: description || `${fullName} - ${phoneNumber}`,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        // Add to sessions array
        sessionsData.sessions.push(newSession);

        // Save to file
        console.log('═'.repeat(60));
        const saved = saveSessions(sessionsData);

        if (saved) {
            console.log(`\n${c.green}🎉 Session "${uniqueName}" added successfully!${c.reset}`);
            console.log(`${c.cyan}📁 Total sessions: ${sessionsData.sessions.length}${c.reset}`);

            // Display session string option
            const showString = (await input.text('\n📋 Display session string? (y/n): ')).toLowerCase() === 'y';

            if (showString) {
                console.log('\n' + '═'.repeat(80));
                console.log(`${c.yellow}SESSION STRING (Keep this secret!)${c.reset}`);
                console.log('═'.repeat(80));
                console.log(`${c.bright}${sessionString}${c.reset}`);
                console.log('═'.repeat(80));
            }

            // Option to save individual session file
            const saveIndividual = (await input.text('\n💾 Save individual session file? (y/n): ')).toLowerCase() === 'y';

            if (saveIndividual) {
                const individualFile = path.join(__dirname, `../sessions/${uniqueName}.json`);
                const sessionsDir = path.join(__dirname, '../sessions');

                if (!fs.existsSync(sessionsDir)) {
                    fs.mkdirSync(sessionsDir, { recursive: true });
                }

                fs.writeFileSync(
                    individualFile,
                    JSON.stringify(newSession, null, 2),
                    { mode: 0o600 }
                );

                console.log(`${c.green}✅ Individual session saved to: sessions/${uniqueName}.json${c.reset}`);
            }

            // Option to add another session
            const addAnother = (await input.text('\n➕ Add another session? (y/n): ')).toLowerCase() === 'y';

            if (addAnother) {
                await client.disconnect();
                console.log('\n');
                await createSession(); // Recursive call
                return;
            }
        }

        await client.disconnect();

    } catch (error) {
        console.error(`${c.red}❌ Failed to create session:${c.reset}`, error.message);

        if (error.message.includes('PHONE_CODE_INVALID')) {
            console.log(`${c.yellow}💡 Tip: Make sure you entered the correct code${c.reset}`);
        } else if (error.message.includes('PHONE_NUMBER_INVALID')) {
            console.log(`${c.yellow}💡 Tip: Phone number format should be like +98912...${c.reset}`);
        } else if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
            console.log(`${c.yellow}💡 Tip: This account has 2FA enabled${c.reset}`);
        } else if (error.message.includes('PHONE_NUMBER_BANNED')) {
            console.log(`${c.red}⚠️  This phone number is banned by Telegram${c.reset}`);
        } else if (error.message.includes('FLOOD_WAIT')) {
            const seconds = error.seconds || 60;
            console.log(`${c.yellow}⏰ Too many attempts. Please wait ${seconds} seconds${c.reset}`);
        }

        process.exit(1);
    }

    console.log(`\n${c.green}👋 Done! You can now use your sessions in the application.${c.reset}`);
    process.exit(0);
}

/**
 * Management menu
 */
async function manageSessions() {
    console.clear();
    console.log(`${c.bright}${c.blue}╔════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bright}${c.blue}║        📱 Session Management Menu                      ║${c.reset}`);
    console.log(`${c.bright}${c.blue}╚════════════════════════════════════════════════════════╝${c.reset}\n`);

    const sessionsData = loadExistingSessions();
    displayCurrentSessions(sessionsData);

    console.log(`\n${c.cyan}📋 Options:${c.reset}`);
    console.log(`  ${c.bright}1.${c.reset} Create new session`);
    console.log(`  ${c.bright}2.${c.reset} Remove session`);
    console.log(`  ${c.bright}3.${c.reset} Export session`);
    console.log(`  ${c.bright}4.${c.reset} Import session`);
    console.log(`  ${c.bright}5.${c.reset} Test session`);
    console.log(`  ${c.bright}6.${c.reset} View session details`);
    console.log(`  ${c.bright}7.${c.reset} Backup all sessions`);
    console.log(`  ${c.bright}8.${c.reset} Exit`);

    const choice = await input.text('\n🔢 Choose option (1-8): ');

    switch(choice) {
        case '1':
            await createSession();
            break;

        case '2':
            await removeSession(sessionsData);
            break;

        case '3':
            await exportSession(sessionsData);
            break;

        case '4':
            await importSession(sessionsData);
            break;

        case '5':
            await testSession(sessionsData);
            break;

        case '6':
            await viewSessionDetails(sessionsData);
            break;

        case '7':
            await backupAllSessions(sessionsData);
            break;

        case '8':
            console.log(`${c.green}👋 Goodbye!${c.reset}`);
            process.exit(0);
            break;

        default:
            console.log(`${c.red}❌ Invalid option${c.reset}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            await manageSessions();
    }
}

/**
 * Remove session
 */
async function removeSession(sessionsData) {
    if (sessionsData.sessions.length === 0) {
        console.log(`${c.yellow}No sessions to remove${c.reset}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return manageSessions();
    }

    const index = await input.text('Enter session number to remove: ');
    const sessionIndex = parseInt(index) - 1;

    if (sessionIndex >= 0 && sessionIndex < sessionsData.sessions.length) {
        const removed = sessionsData.sessions.splice(sessionIndex, 1)[0];
        saveSessions(sessionsData);
        console.log(`${c.green}✅ Removed session: ${removed.name}${c.reset}`);
    } else {
        console.log(`${c.red}❌ Invalid session number${c.reset}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    await manageSessions();
}

/**
 * Export session
 */
async function exportSession(sessionsData) {
    if (sessionsData.sessions.length === 0) {
        console.log(`${c.yellow}No sessions to export${c.reset}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return manageSessions();
    }

    const index = await input.text('Enter session number to export: ');
    const sessionIndex = parseInt(index) - 1;

    if (sessionIndex >= 0 && sessionIndex < sessionsData.sessions.length) {
        const session = sessionsData.sessions[sessionIndex];
        const exportFile = path.join(process.cwd(), `session_${session.name}_export_${Date.now()}.json`);

        fs.writeFileSync(
            exportFile,
            JSON.stringify(session, null, 2),
            { mode: 0o600 }
        );

        console.log(`${c.green}✅ Exported to: ${exportFile}${c.reset}`);
    } else {
        console.log(`${c.red}❌ Invalid session number${c.reset}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    await manageSessions();
}

/**
 * Import session
 */
async function importSession(sessionsData) {
    const filePath = await input.text('Enter path to session file: ');

    if (!fs.existsSync(filePath)) {
        console.log(`${c.red}❌ File not found${c.reset}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return manageSessions();
    }

    try {
        const sessionContent = fs.readFileSync(filePath, 'utf8');
        const session = JSON.parse(sessionContent);

        // Validate session object
        if (!session.sessionString || !session.name) {
            throw new Error('Invalid session file format');
        }

        // Generate unique name
        session.name = generateSessionName(sessionsData.sessions, session.name);
        session.lastUpdated = new Date().toISOString();

        sessionsData.sessions.push(session);
        saveSessions(sessionsData);

        console.log(`${c.green}✅ Imported session: ${session.name}${c.reset}`);
    } catch (error) {
        console.log(`${c.red}❌ Error importing session: ${error.message}${c.reset}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    await manageSessions();
}

/**
 * Test session connection
 */
async function testSession(sessionsData) {
    if (sessionsData.sessions.length === 0) {
        console.log(`${c.yellow}No sessions to test${c.reset}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return manageSessions();
    }

    const index = await input.text('Enter session number to test: ');
    const sessionIndex = parseInt(index) - 1;

    if (sessionIndex >= 0 && sessionIndex < sessionsData.sessions.length) {
        const session = sessionsData.sessions[sessionIndex];

        console.log(`${c.yellow}🔄 Testing session: ${session.name}...${c.reset}`);

        const client = new TelegramClient(
            new StringSession(session.sessionString),
            apiId,
            apiHash,
            {
                connectionRetries: 3,
                baseLogger: {
                    error: () => {},
                    warn: () => {},
                    info: () => {},
                    debug: () => {}
                }
            }
        );

        try {
            await client.connect();
            const me = await client.getMe();

            console.log(`${c.green}✅ Session is valid!${c.reset}`);
            console.log('─'.repeat(40));
            console.log(`👤 Account: ${me.firstName} ${me.lastName || ''}`);
            console.log(`📱 Phone: ${me.phone || 'Hidden'}`);
            console.log(`🆔 Username: ${me.username ? '@' + me.username : 'No username'}`);
            console.log(`⭐ Premium: ${me.premium ? 'Yes' : 'No'}`);
            console.log(`🆔 User ID: ${me.id}`);
            console.log('─'.repeat(40));

            // Update session info
            session.isPremium = me.premium || false;
            session.fullName = `${me.firstName} ${me.lastName || ''}`.trim();
            session.username = me.username || null;
            session.lastTested = new Date().toISOString();

            saveSessions(sessionsData);

            await client.disconnect();
        } catch (error) {
            console.log(`${c.red}❌ Session test failed: ${error.message}${c.reset}`);

            if (error.message.includes('AUTH_KEY_INVALID')) {
                console.log(`${c.yellow}⚠️  Session expired - need to create new session${c.reset}`);
            }
        }
    } else {
        console.log(`${c.red}❌ Invalid session number${c.reset}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    await manageSessions();
}

/**
 * View session details
 */
async function viewSessionDetails(sessionsData) {
    if (sessionsData.sessions.length === 0) {
        console.log(`${c.yellow}No sessions available${c.reset}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return manageSessions();
    }

    const index = await input.text('Enter session number to view: ');
    const sessionIndex = parseInt(index) - 1;

    if (sessionIndex >= 0 && sessionIndex < sessionsData.sessions.length) {
        const session = sessionsData.sessions[sessionIndex];

        console.log('\n' + '═'.repeat(60));
        console.log(`${c.cyan}📱 Session Details${c.reset}`);
        console.log('═'.repeat(60));
        console.log(`Name: ${c.bright}${session.name}${c.reset}`);
        console.log(`Phone: ${c.bright}${session.phoneNumber}${c.reset}`);
        console.log(`Username: ${c.bright}${session.username ? '@' + session.username : 'None'}${c.reset}`);
        console.log(`Full Name: ${c.bright}${session.fullName}${c.reset}`);
        console.log(`User ID: ${c.bright}${session.userId}${c.reset}`);
        console.log(`Premium: ${session.isPremium ? c.green + '⭐ Yes' : c.yellow + 'No'}${c.reset}`);
        console.log(`Description: ${session.description || 'None'}`);
        console.log(`Created: ${new Date(session.createdAt).toLocaleString()}`);
        console.log(`Last Updated: ${new Date(session.lastUpdated).toLocaleString()}`);

        if (session.lastTested) {
            console.log(`Last Tested: ${new Date(session.lastTested).toLocaleString()}`);
        }

        console.log('═'.repeat(60));

        const showString = (await input.text('\n📋 Show session string? (y/n): ')).toLowerCase() === 'y';

        if (showString) {
            console.log(`\n${c.yellow}Session String:${c.reset}`);
            console.log(`${c.bright}${session.sessionString}${c.reset}`);
        }
    } else {
        console.log(`${c.red}❌ Invalid session number${c.reset}`);
    }

    await input.text('\nPress Enter to continue...');
    await manageSessions();
}

/**
 * Backup all sessions
 */
async function backupAllSessions(sessionsData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(process.cwd(), `sessions_backup_${timestamp}.json`);

    try {
        fs.writeFileSync(
            backupFile,
            JSON.stringify(sessionsData, null, 2),
            { mode: 0o600 }
        );

        console.log(`${c.green}✅ Backup created: ${backupFile}${c.reset}`);
        console.log(`${c.cyan}   Total sessions backed up: ${sessionsData.sessions.length}${c.reset}`);
    } catch (error) {
        console.log(`${c.red}❌ Backup failed: ${error.message}${c.reset}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    await manageSessions();
}

/**
 * Show help
 */
function showHelp() {
    console.log(`${c.cyan}╔════════════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.cyan}║                    USAGE GUIDE                         ║${c.reset}`);
    console.log(`${c.cyan}╚════════════════════════════════════════════════════════╝${c.reset}\n`);

    console.log(`${c.bright}Commands:${c.reset}`);
    console.log(`  npm run session:create        Create new session`);
    console.log(`  npm run session:manage        Manage sessions (menu)`);
    console.log(`  npm run session:path          Show sessions file path`);
    console.log(`  npm run session:backup        Create backup\n`);

    console.log(`${c.bright}Arguments:${c.reset}`);
    console.log(`  --manage, -m                  Open management menu`);
    console.log(`  --path, -p                    Show sessions file path`);
    console.log(`  --help, -h                    Show this help\n`);

    console.log(`${c.bright}Environment Variables:${c.reset}`);
    console.log(`  SESSIONS_FILE_PATH            Custom path for sessions.json`);
    console.log(`                                Default: ./sessions.json\n`);

    console.log(`${c.bright}Examples:${c.reset}`);
    console.log(`  node scripts/createSession.js`);
    console.log(`  node scripts/createSession.js --manage`);
    console.log(`  SESSIONS_FILE_PATH=/custom/path.json npm run session:create\n`);

    console.log(`${c.bright}Sessions File Location:${c.reset}`);
    console.log(`  Current: ${c.yellow}${SESSIONS_FILE}${c.reset}\n`);
}

// Main execution
const args = process.argv.slice(2);

console.log(`${c.cyan}📁 Sessions file location: ${SESSIONS_FILE}${c.reset}`);
console.log(`${c.dim}   (Set SESSIONS_FILE_PATH in .env to change)${c.reset}\n`);

if (args[0] === '--manage' || args[0] === '-m') {
    manageSessions().catch(console.error);
} else if (args[0] === '--path' || args[0] === '-p') {
    console.log(`Sessions file path: ${SESSIONS_FILE}`);
    process.exit(0);
} else if (args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
} else {
    // Direct session creation
    createSession().catch(console.error);
}
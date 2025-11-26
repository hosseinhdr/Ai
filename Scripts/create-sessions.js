// scripts/create-sessions.js
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const fs = require('fs').promises;
const path = require('path');

async function createSession(serviceName, envFile) {
    console.log(`\n=====================================`);
    console.log(`Creating session for ${serviceName}`);
    console.log(`=====================================\n`);

    // Load environment
    require('dotenv').config({ path: envFile });

    const apiId = parseInt(process.env.API_ID);
    const apiHash = process.env.API_HASH;
    const sessionPath = process.env.SESSION_PATH;

    console.log(`API ID: ${apiId}`);
    console.log(`Session will be saved to: ${sessionPath}`);

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text('Enter phone number: '),
        password: async () => await input.text('Enter 2FA password (if any): '),
        phoneCode: async () => await input.text('Enter verification code: '),
        onError: (err) => console.error('Error:', err),
    });

    console.log('Login successful!');

    // Save session
    const sessionString = client.session.save();

    // Ensure directory exists
    const sessionDir = path.dirname(sessionPath);
    await fs.mkdir(sessionDir, { recursive: true });

    await fs.writeFile(sessionPath, sessionString);
    console.log(`Session saved to ${sessionPath}`);

    await client.disconnect();
}

async function main() {
    console.log('Which service do you want to create a session for?');
    console.log('1. Observer');
    console.log('2. ViewUpdater');
    console.log('3. Both');

    const choice = await input.text('Enter your choice (1-3): ');

    switch(choice) {
        case '1':
            await createSession('Observer', '.env.observer');
            break;
        case '2':
            await createSession('ViewUpdater', '.env.viewupdater');
            break;
        case '3':
            await createSession('Observer', '.env.observer');
            await createSession('ViewUpdater', '.env.viewupdater');
            break;
        default:
            console.log('Invalid choice!');
    }

    process.exit(0);
}

main().catch(console.error);
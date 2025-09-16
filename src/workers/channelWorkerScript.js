import { parentPort, workerData } from 'worker_threads';

// Worker functions
async function analyzeChannelsBatch(channels) {
    const results = [];

    // Check batch size limit
    if (channels.length > 1000) {
        throw new Error('Batch too large for worker (max 1000 items)');
    }

    for (const channel of channels) {
        // Simulate analysis with more realistic scoring
        const analysis = {
            id: channel.id,
            quality: Math.random() * 0.8 + 0.2, // 0.2 to 1.0
            spam: Math.random() < 0.2,
            activity: Math.random(),
            engagement: Math.random() * 0.5,
            recommendation: Math.random() > 0.5 ? 'keep' : 'leave',
            analyzedAt: new Date().toISOString()
        };

        results.push(analysis);
    }

    return results;
}

async function processJoinQueue(queue) {
    const processed = [];

    // Check queue size limit
    if (queue.length > 1000) {
        throw new Error('Queue too large for worker (max 1000 items)');
    }

    for (const item of queue) {
        // Process join operation
        processed.push({
            id: item.id,
            channelId: item.channelId,
            status: 'processed',
            timestamp: Date.now()
        });

        // Add delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return processed;
}

async function cleanupChannelsBatch(channels) {
    const cleaned = [];

    // Check batch size limit
    if (channels.length > 1000) {
        throw new Error('Batch too large for worker (max 1000 items)');
    }

    for (const channel of channels) {
        // Cleanup criteria
        const shouldClean =
            channel.inactive ||
            channel.spam ||
            channel.participantsCount < 10 ||
            channel.quality < 0.3;

        if (shouldClean) {
            cleaned.push(channel.id);
        }
    }

    return cleaned;
}

async function calculateStatsBatch(data) {
    // Check batch size limit
    if (data.length > 1000) {
        throw new Error('Batch too large for worker (max 1000 items)');
    }

    const stats = {
        total: data.length,
        processed: data.length,
        timestamp: Date.now(),
        averageQuality: 0,
        spamCount: 0,
        activeCount: 0
    };

    for (const item of data) {
        if (item.quality) stats.averageQuality += item.quality;
        if (item.spam) stats.spamCount++;
        if (item.active) stats.activeCount++;
    }

    stats.averageQuality = stats.total > 0 ? stats.averageQuality / stats.total : 0;

    return stats;
}

// Main worker logic
(async () => {
    const { operation, data } = workerData;

    try {
        // Memory check
        const memoryUsage = process.memoryUsage();
        if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB limit for worker
            throw new Error('Worker memory limit exceeded');
        }

        let result;

        switch (operation) {
            case 'analyzeChannels':
                result = await analyzeChannelsBatch(data);
                break;

            case 'processJoinQueue':
                result = await processJoinQueue(data);
                break;

            case 'cleanupChannels':
                result = await cleanupChannelsBatch(data);
                break;

            case 'calculateStats':
                result = await calculateStatsBatch(data);
                break;

            default:
                throw new Error(`Unknown operation: ${operation}`);
        }

        parentPort.postMessage({ success: true, result });

    } catch (error) {
        parentPort.postMessage({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
})();
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Worker Pool Manager for parallel processing
 */
export class WorkerPool {
    constructor(size = 4) {
        this.size = size;
        this.workers = [];
        this.queue = [];
        this.activeWorkers = 0;
        this.workerScriptPath = join(__dirname, 'channelWorkerScript.js');

        this.initializePool();
    }

    initializePool() {
        logger.info(`Worker pool initialized with size ${this.size}`);
    }

    /**
     * Execute task with worker
     */
    async execute(operation, data) {
        return new Promise((resolve, reject) => {
            const task = { operation, data, resolve, reject };

            if (this.activeWorkers < this.size) {
                this.runTask(task);
            } else {
                this.queue.push(task);
            }
        });
    }

    /**
     * Run task
     */
    runTask(task) {
        this.activeWorkers++;

        const worker = new Worker(this.workerScriptPath, {
            workerData: {
                operation: task.operation,
                data: task.data
            }
        });

        const timeout = setTimeout(() => {
            worker.terminate();
            this.activeWorkers--;
            task.reject(new Error('Worker timeout'));
        }, 30000); // 30 second timeout

        worker.on('message', (result) => {
            clearTimeout(timeout);
            this.activeWorkers--;

            if (result.success) {
                task.resolve(result.result);
            } else {
                task.reject(new Error(result.error));
            }

            // Process next task in queue
            if (this.queue.length > 0) {
                const nextTask = this.queue.shift();
                this.runTask(nextTask);
            }

            // Terminate worker
            worker.terminate();
        });

        worker.on('error', (error) => {
            clearTimeout(timeout);
            this.activeWorkers--;
            logger.error('Worker error:', error);
            task.reject(error);
            worker.terminate();
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                logger.error(`Worker stopped with exit code ${code}`);
            }
        });
    }

    /**
     * Process batch
     */
    async processBatch(operation, items, batchSize = 100) {
        if (!items || items.length === 0) {
            return [];
        }

        const batches = [];

        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }

        try {
            const results = await Promise.all(
                batches.map(batch => this.execute(operation, batch))
            );

            // Flatten results
            return results.flat();
        } catch (error) {
            logger.error('Batch processing error:', error);
            return [];
        }
    }

    /**
     * Terminate pool
     */
    async terminate() {
        // Wait for queue to empty
        let attempts = 0;
        while ((this.queue.length > 0 || this.activeWorkers > 0) && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        logger.info('Worker pool terminated');
    }

    /**
     * Get pool status
     */
    getStatus() {
        return {
            size: this.size,
            active: this.activeWorkers,
            queued: this.queue.length
        };
    }
}

export default WorkerPool;
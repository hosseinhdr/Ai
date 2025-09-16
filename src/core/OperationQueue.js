import EventEmitter from 'events';
import logger from '../utils/logger.js';

class OperationQueue extends EventEmitter {
    constructor(config = {}) {
        super();

        this.maxConcurrent = config.maxConcurrent || 5;
        this.retryAttempts = config.retryAttempts || 3;
        this.retryDelay = config.retryDelay || 5000;
        this.operationTimeout = config.operationTimeout || 30000;
        this.maxQueueSize = config.maxQueueSize || 1000;

        this.queue = [];
        this.running = [];
        this.completed = [];
        this.failed = [];

        this.isRunning = true;
        this.stats = {
            totalQueued: 0,
            totalCompleted: 0,
            totalFailed: 0,
            avgExecutionTime: 0
        };
    }

    async add(operation, priority = 5) {
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error('Queue is full');
        }

        const op = {
            id: Date.now() + Math.random(),
            operation,
            priority,
            attempts: 0,
            createdAt: Date.now(),
            status: 'queued'
        };

        // Add to queue based on priority
        this.queue.push(op);
        this.queue.sort((a, b) => b.priority - a.priority);

        this.stats.totalQueued++;
        this.emit('queued', op);

        // Process queue
        this.process();

        return op.id;
    }

    async process() {
        if (!this.isRunning) return;

        while (this.running.length < this.maxConcurrent && this.queue.length > 0) {
            const op = this.queue.shift();
            this.running.push(op);

            this.executeOperation(op).catch(error => {
                logger.error(`Operation ${op.id} failed:`, error);
            });
        }
    }

    async executeOperation(op) {
        op.status = 'running';
        op.startedAt = Date.now();
        this.emit('started', op);

        try {
            // Add timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Operation timeout')), this.operationTimeout);
            });

            const result = await Promise.race([
                op.operation(),
                timeoutPromise
            ]);

            // Success
            op.status = 'completed';
            op.completedAt = Date.now();
            op.executionTime = op.completedAt - op.startedAt;
            op.result = result;

            this.completed.push(op);
            this.stats.totalCompleted++;
            this.updateAvgExecutionTime(op.executionTime);

            this.emit('completed', op);

        } catch (error) {
            op.attempts++;
            op.lastError = error.message;

            if (op.attempts < this.retryAttempts) {
                // Retry
                op.status = 'retrying';
                this.emit('retry', op);

                await new Promise(resolve => setTimeout(resolve, this.retryDelay));

                // Add back to queue
                this.queue.unshift(op);
            } else {
                // Failed
                op.status = 'failed';
                op.failedAt = Date.now();
                op.error = error.message;

                this.failed.push(op);
                this.stats.totalFailed++;

                this.emit('failed', op);
            }
        } finally {
            // Remove from running
            const index = this.running.findIndex(r => r.id === op.id);
            if (index > -1) {
                this.running.splice(index, 1);
            }

            // Process next
            this.process();
        }
    }

    updateAvgExecutionTime(time) {
        const total = this.stats.totalCompleted;
        const currentAvg = this.stats.avgExecutionTime;
        this.stats.avgExecutionTime = ((currentAvg * (total - 1)) + time) / total;
    }

    pause() {
        this.isRunning = false;
        logger.info('Operation queue paused');
    }

    resume() {
        this.isRunning = true;
        this.process();
        logger.info('Operation queue resumed');
    }

    clear() {
        this.queue = [];
        logger.info('Operation queue cleared');
    }

    stop() {
        this.isRunning = false;
        this.clear();
        logger.info('Operation queue stopped');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            queued: this.queue.length,
            running: this.running.length,
            completed: this.completed.length,
            failed: this.failed.length,
            stats: this.stats,
            currentOperations: this.running.map(op => ({
                id: op.id,
                status: op.status,
                attempts: op.attempts,
                runningTime: Date.now() - op.startedAt
            }))
        };
    }

    getHistory(limit = 100) {
        const all = [
            ...this.completed.slice(-limit),
            ...this.failed.slice(-limit)
        ].sort((a, b) => (b.completedAt || b.failedAt) - (a.completedAt || a.failedAt));

        return all.slice(0, limit);
    }

    async waitForCompletion() {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (this.queue.length === 0 && this.running.length === 0) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 1000);
        });
    }
}

export { OperationQueue };
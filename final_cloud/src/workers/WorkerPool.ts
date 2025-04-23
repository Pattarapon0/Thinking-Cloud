import { WorkerMessage, WorkerResponse } from './types';
import { NETWORK_CONFIG } from '../utils/sharedConstants';

export class WorkerPool {
    private workers: Worker[] = [];
    private messageQueue: Map<string, {
        resolve: (value: ArrayBuffer) => void;
        reject: (error: Error) => void;
        timeout: number;
    }> = new Map();

    constructor(private workerCount: number = navigator.hardwareConcurrency || 4) {
        this.initialize();
    }

    private initialize(): void {
        for (let i = 0; i < this.workerCount; i++) {
            const worker = new Worker(new URL('./BinaryWorker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = this.handleWorkerMessage.bind(this);
            worker.onerror = this.handleWorkerError.bind(this);
            this.workers.push(worker);
        }
    }

    private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
        const { id, result, error } = event.data;
        const pending = this.messageQueue.get(id);

        if (pending) {
            clearTimeout(pending.timeout);
            this.messageQueue.delete(id);
            
            if (error) {
                pending.reject(new Error(error));
            } else {
                pending.resolve(result);
            }
        }
    }

    private handleWorkerError(error: ErrorEvent): void {
        console.error('Worker error:', error);
    }

    public async processMessage(type: 'encode' | 'decode', data: ArrayBuffer, peerId?: string): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const message: WorkerMessage = {
                id,
                type,
                data,
                peerId,
                timestamp: Date.now()
            };

            // Set timeout to prevent hanging promises
            const timeout = window.setTimeout(() => {
                this.messageQueue.delete(id);
                reject(new Error('Worker processing timeout'));
            }, NETWORK_CONFIG.workerTimeout);

            this.messageQueue.set(id, { resolve, reject, timeout });

            // Find least busy worker (round-robin for now)
            const workerIndex = Math.floor(Math.random() * this.workers.length);
            this.workers[workerIndex].postMessage(message, [data]);
        });
    }

    public terminate(): void {
        // Clear all pending messages
        for (const { reject, timeout } of this.messageQueue.values()) {
            clearTimeout(timeout);
            reject(new Error('Worker pool terminated'));
        }
        this.messageQueue.clear();

        // Terminate all workers
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
    }
}

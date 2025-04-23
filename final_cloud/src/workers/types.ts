import { NetworkTextBodyData } from '../utils/types';

export interface WorkerMessage {
    id: string;           // Unique message ID
    type: 'encode' | 'decode';
    data: ArrayBuffer;    // Data to process
    peerId?: string;      // For tracking which peer sent the message
    timestamp: number;    // For ordering/batching
}

export interface WorkerResponse {
    id: string;           // Matching message ID
    peerId?: string;      // Original peer ID
    result: ArrayBuffer;  // Processed data
    error?: string;       // Error message if processing failed
    timestamp: number;    // Original timestamp
}

export interface BatchMessage<T = any> {
    bodies: T[];             // Array of bodies to process
    timestamp: number;       // Batch timestamp
    chunkId: number;        // For large batches that are split
    totalChunks: number;    // Total number of chunks in this batch
}

export type BatchedPositionUpdate = BatchMessage<NetworkTextBodyData>;

/// <reference lib="webworker" />
import { WorkerMessage, WorkerResponse } from './types';
import { BinaryProtocol, MessageType } from '../networking/BinaryProtocol';

let isProcessing = false;
const messageQueue: WorkerMessage[] = [];

// Process the next message in the queue
function processNextMessage() {
    if (isProcessing || messageQueue.length === 0) return;
    
    isProcessing = true;
    const message = messageQueue.shift()!;
    
    try {
        const { id, type, data, peerId, timestamp } = message;
        let result: ArrayBuffer;

        if (type === 'encode') {
            const { messageType, messageData } = JSON.parse(new TextDecoder().decode(data));
            if (typeof messageType !== 'number') {
                throw new Error('Invalid message type');
            }
            result = BinaryProtocol.encode(messageType, messageData);
        } else if (type === 'decode') {
            const decodedMessage = BinaryProtocol.decode(data);
            const messageString = JSON.stringify({
                type: decodedMessage.type,
                data: decodedMessage.data
            });
            result = new TextEncoder().encode(messageString).buffer;
        } else {
            throw new Error('Unknown operation type');
        }

        const response: WorkerResponse = {
            id,
            peerId,
            result,
            timestamp
        };

        self.postMessage(response, [result]);
    } catch (error: unknown) {
        self.postMessage({
            id: message.id,
            peerId: message.peerId,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: message.timestamp,
            result: new ArrayBuffer(0)
        });
    } finally {
        isProcessing = false;
        // Process next message if available
        processNextMessage();
    }
}

// Handle incoming messages
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    messageQueue.push(event.data);
    processNextMessage();
};

// Handle errors
self.onerror = ((event: Event | string): void => {
    const error = event instanceof Event ? event : new Error(event);
    console.error('Worker error:', error);
}) as OnErrorEventHandler;

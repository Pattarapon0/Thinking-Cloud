import { NetworkTextBodyData } from '../utils/types';
import { BatchMessage } from '../workers/types';
import { NETWORK_CONFIG } from '../utils/sharedConstants';

type BatchedPositionMessage = BatchMessage<NetworkTextBodyData>;

export enum MessageType {
    SENT_INITIAL_STATE = 0,
    POSITION_UPDATE = 1,
    SENT_CLICK_EVENT = 2,
    SENT_DRAG_EVENT = 3,
    SENT_NEW_TEXT = 4,
    RECEIVE_INITIAL_STATE = 5,
    RECEIVE_CLICK_EVENT = 6,
    RECEIVE_DRAG_EVENT = 7,
    RECEIVE_NEW_TEXT = 8,
    REQUEST_INITIAL_STATE = 9,
    SEND_INITIAL_STATE = 10,
}

interface BinaryMessage {
    type: MessageType;
    data: ArrayBuffer;
}

export class BinaryProtocol {
    // Header format: 2 byte for message type, 4 bytes for payload length
    private static readonly HEADER_SIZE = 6;

    public static encode(type: MessageType, data: any): ArrayBuffer {
        const payload = this.encodePayload(type, data);
        const message = new ArrayBuffer(this.HEADER_SIZE + payload.byteLength);
        const view = new DataView(message);

        // Write header
        view.setUint8(0, type);
        view.setUint32(1, payload.byteLength);

        // Copy payload
        new Uint8Array(message, this.HEADER_SIZE).set(new Uint8Array(payload));

        return message;
    }

    public static decode(buffer: ArrayBuffer): BinaryMessage {
        const view = new DataView(buffer);
        const type = view.getUint8(0) as MessageType;
        const length = view.getUint32(1);
        const data = buffer.slice(this.HEADER_SIZE, this.HEADER_SIZE + length);

        return {
            type,
            data: this.decodePayload(type, data)
        };
    }

    private static encodePayload(type: MessageType, data: any): ArrayBuffer {
        switch (type) {
            case MessageType.POSITION_UPDATE:
                return this.encodePositionUpdate(data);
            case MessageType.RECEIVE_CLICK_EVENT:
                return this.encodeClickEvent(data);
            case MessageType.RECEIVE_DRAG_EVENT:
                return this.encodeDragEvent(data);
            case MessageType.RECEIVE_INITIAL_STATE:
                return this.encodeInitialState(data);
            case MessageType.RECEIVE_NEW_TEXT:
                return this.encodeNewText(data);
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    }

    private static decodePayload(type: MessageType, buffer: ArrayBuffer): any {
        switch (type) {
            case MessageType.POSITION_UPDATE:
                return this.decodePositionUpdate(buffer);
            case MessageType.RECEIVE_CLICK_EVENT:
                return this.decodeClickEvent(buffer);
            case MessageType.RECEIVE_DRAG_EVENT:
                return this.decodeDragEvent(buffer);
            case MessageType.RECEIVE_INITIAL_STATE:
                return this.decodeInitialState(buffer);
            case MessageType.RECEIVE_NEW_TEXT:
                return this.decodeNewText(buffer);
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    }

    private static encodeNewText(data: NetworkTextBodyData): ArrayBuffer {
        const encoder = new TextEncoder();
        
        // Prepare networkId (28 bytes fixed)
        const networkIdArray = new Uint8Array(NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).fill(0);
        const networkIdBytes = encoder.encode(data.networkId);
        networkIdArray.set(networkIdBytes);

        // Prepare ownerId (28 bytes fixed)
        const ownerIdArray = new Uint8Array(36).fill(0);
        const ownerIdBytes = encoder.encode(data.ownerId);
        ownerIdArray.set(ownerIdBytes);

        // Prepare text bytes
        const textBytes = encoder.encode(data.text);

        // Calculate buffer size: networkId(28) + ownerId(36 uuid) + textLength(4) + text + position(8) + velocity(8) + angle(4) + angularVelocity(4)
        const bufferSize = NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH + 36 + 4 + textBytes.length + 8 + 8 + 8;
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Write networkId
        new Uint8Array(buffer, offset, NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).set(networkIdArray);
        offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;

        // Write ownerId
        new Uint8Array(buffer, offset, 36).set(ownerIdArray);
        offset += 36;
    
        // Write text length
        view.setUint32(offset, textBytes.length);
        offset += 4;
    
        // Write text bytes
        new Uint8Array(buffer, offset, textBytes.length).set(textBytes);
        offset += textBytes.length;
    
        // Write position and velocity
        view.setFloat32(offset, data.position.x); offset += 4;
        view.setFloat32(offset, data.position.y); offset += 4;
        view.setFloat32(offset, data.velocity.x); offset += 4;
        view.setFloat32(offset, data.velocity.y); offset += 4;

        // Write angle and angular velocity
        view.setFloat32(offset, data.angle); offset += 4;
        view.setFloat32(offset, data.angularVelocity);
       
        return buffer;
    }
    

    private static decodeNewText(buffer: ArrayBuffer): NetworkTextBodyData {
        const view = new DataView(buffer);
        const decoder = new TextDecoder();
        let offset = 0;
    
        // Read networkId
        const networkId = decoder.decode(buffer.slice(offset, offset + NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH)).trim();
        offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;

        // Read ownerId
        const ownerId = decoder.decode(buffer.slice(offset, offset + 36)).trim();
        offset += 36;
    
        // Read text length
        const textLength = view.getUint32(offset);
        offset += 4;
    
        // Read text
        const textBytes = new Uint8Array(buffer, offset, textLength);
        const text = decoder.decode(textBytes);
        offset += textLength;
    
        // Read position and velocity
        const x = view.getFloat32(offset); offset += 4;
        const y = view.getFloat32(offset); offset += 4;
        const vx = view.getFloat32(offset); offset += 4;
        const vy = view.getFloat32(offset); offset += 4;

        // Read angle and angular velocity
        const angle = view.getFloat32(offset); offset += 4;
        const angularVelocity = view.getFloat32(offset); 

        // Let receiver calculate dimensions
        const dimensions = {
            width: 0,  // Will be calculated by receiver
            height: 0  // Will be calculated by receiver
        };

        return {
            networkId,
            ownerId,
            text,
            position: { x, y },
            dimensions,
            angle,
            velocity: { x: vx, y: vy },
            clickLeft: text.length,  // Derive from text length
            angularVelocity
        };
    }
    

    private static encodePositionUpdate(data: NetworkTextBodyData | BatchedPositionMessage): ArrayBuffer {
        if ('bodies' in data) {
            // Handle batch update
            const encoder = new TextEncoder();
            // Calculate body data size: networkId(28) + ownerId(36) + position(8) + velocity(8) + angle(4) + angularVelocity(4)
            const bodyDataSize = NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH + 36 + 24; 
            const headerSize = 16; // 4 bytes each for count, timestamp, chunkId, totalChunks
            const totalSize = headerSize + (data.bodies.length * bodyDataSize);
            const buffer = new ArrayBuffer(totalSize);
            const view = new DataView(buffer);
            let offset = 0;

            // Write header
            view.setUint32(offset, data.bodies.length); offset += 4;
            view.setFloat64(offset, data.timestamp); offset += 8;
            view.setUint16(offset, data.chunkId); offset += 2;
            view.setUint16(offset, data.totalChunks); offset += 2;

            // Write each body's data
            data.bodies.forEach(body => {
                // Write networkId (28 bytes fixed)
                const networkIdArray = new Uint8Array(NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).fill(0);
                const networkIdBytes = encoder.encode(body.networkId);
                networkIdArray.set(networkIdBytes);
                new Uint8Array(buffer, offset, NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).set(networkIdArray);
                offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;

                // Write ownerId (36 bytes fixed, same format as networkId)
                const ownerIdArray = new Uint8Array(36).fill(0);
                const ownerIdBytes = encoder.encode(body.ownerId);
                ownerIdArray.set(ownerIdBytes);
                new Uint8Array(buffer, offset, 36).set(ownerIdArray);
                offset += 36;

                // Write position, velocity, angle and angularVelocity
                view.setFloat32(offset, body.position.x); offset += 4;
                view.setFloat32(offset, body.position.y); offset += 4;
                view.setFloat32(offset, body.velocity.x); offset += 4;
                view.setFloat32(offset, body.velocity.y); offset += 4;
                view.setFloat32(offset, body.angle); offset += 4;
                view.setFloat32(offset, body.angularVelocity); offset += 4;
            });

            return buffer;
        } else {
            // Handle single body update
            const encoder = new TextEncoder();
            // Calculate buffer size: networkId(28) + ownerId(36) + position(8) + velocity(8) + angle(4) + angularVelocity(4)
            const buffer = new ArrayBuffer(NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH + 36 + 24);
            const view = new DataView(buffer);
            let offset = 0;

            // Write networkId (28 bytes fixed)
            const networkIdArray = new Uint8Array(NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).fill(0);
            const networkIdBytes = encoder.encode(data.networkId);
            networkIdArray.set(networkIdBytes);
            new Uint8Array(buffer, offset, NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).set(networkIdArray);
            offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;

            // Write ownerId (36 bytes fixed)
            const ownerIdArray = new Uint8Array(36).fill(0);
            const ownerIdBytes = encoder.encode(data.ownerId);
            ownerIdArray.set(ownerIdBytes);
            new Uint8Array(buffer, offset, 36).set(ownerIdArray);
            offset += 36;

            // Write position, velocity, angle and angularVelocity
            view.setFloat32(offset, data.position.x); offset += 4;
            view.setFloat32(offset, data.position.y); offset += 4;
            view.setFloat32(offset, data.velocity.x); offset += 4;
            view.setFloat32(offset, data.velocity.y); offset += 4;
            view.setFloat32(offset, data.angle); offset += 4;
            view.setFloat32(offset, data.angularVelocity);

            return buffer;
        }
    }

    private static decodePositionUpdate(buffer: ArrayBuffer): NetworkTextBodyData | BatchedPositionMessage {
        const view = new DataView(buffer);
        let offset = 0;

        // Try to read batch header
        const singleBodySize = NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH+36 + 20;
        if (buffer.byteLength > singleBodySize) {
            const count = view.getUint32(offset); offset += 4;
            const timestamp = view.getFloat64(offset); offset += 8;
            const chunkId = view.getUint16(offset); offset += 2;
            const totalChunks = view.getUint16(offset); offset += 2;

            // Read bodies
            const decoder = new TextDecoder();
            const bodies: NetworkTextBodyData[] = [];

            for (let i = 0; i < count; i++) {
                const networkId = decoder.decode(buffer.slice(offset, offset + NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH)).trim();
                offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;
                const ownerId = decoder.decode(buffer.slice(offset, offset + 36)).trim();
                offset += 36;

                const x = view.getFloat32(offset); offset += 4;
                const y = view.getFloat32(offset); offset += 4;
                const vx = view.getFloat32(offset); offset += 4;
                const vy = view.getFloat32(offset); offset += 4;
                const angle = view.getFloat32(offset); offset += 4;
                const angularVelocity = view.getFloat32(offset); offset += 4;

                bodies.push({
                    networkId,
                    ownerId,
                    position: { x, y },
                    velocity: { x: vx, y: vy },
                    angle,
                    text: '', // Will be filled by receiver
                    dimensions: { width: 0, height: 0 }, // Will be filled by receiver
                    clickLeft: 0, // Will be filled by receiver
                    angularVelocity
                });
            }

            return { bodies, timestamp, chunkId, totalChunks };
        } else {
            // Single body update
            const decoder = new TextDecoder();
            const networkId = decoder.decode(buffer.slice(offset, offset + NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH)).trim();
            offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;
            const ownerId = decoder.decode(buffer.slice(offset, offset +36)).trim();
            offset += 36;

            const x = view.getFloat32(offset); offset += 4;
            const y = view.getFloat32(offset); offset += 4;
            const vx = view.getFloat32(offset); offset += 4;
            const vy = view.getFloat32(offset); offset += 4;
            const angle = view.getFloat32(offset); offset += 4;
            const angularVelocity = view.getFloat32(offset);

            return {
                networkId,
                ownerId,
                position: { x, y },
                velocity: { x: vx, y: vy },
                angle,
                text: '', // Will be filled by receiver
                dimensions: { width: 0, height: 0 }, // Will be filled by receiver
                clickLeft: 0, // Will be filled by receiver
                angularVelocity
            };
        }
    }

    private static encodeClickEvent(data: { networkId: string; clickLeft: number }): ArrayBuffer {
        const encoder = new TextEncoder();
        const networkIdArray = new Uint8Array(NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).fill(0);
        const networkIdBytes = encoder.encode(data.networkId);
        networkIdArray.set(networkIdBytes);
    
        // Fixed size buffer: networkId(28) + clickLeft(4)
        const buffer = new ArrayBuffer(NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH + 4);
        const view = new DataView(buffer);
        let offset = 0;
    
        // Write networkId bytes
        new Uint8Array(buffer, offset, NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).set(networkIdArray);
        offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;
    
        // Write clickLeft (4 bytes)
        view.setUint32(offset, data.clickLeft);
    
        return buffer;
    }
    

    private static decodeClickEvent(buffer: ArrayBuffer): { networkId: string; clickLeft: number } {
        const view = new DataView(buffer);
        const decoder = new TextDecoder();
        let offset = 0;
    
        // Read fixed-length networkId
        const networkId = decoder.decode(buffer.slice(offset, offset + NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH)).trim();
        offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;
    
        // Read clickLeft (4 bytes)
        const clickLeft = view.getUint32(offset);
    
        return { networkId, clickLeft };
    }
    

    private static encodeDragEvent(data: {
        networkId: string,
        position: Matter.Vector,
        isDragStart: boolean
    }): ArrayBuffer {
        const encoder = new TextEncoder();
        const networkIdArray = new Uint8Array(NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).fill(0);
        const networkIdBytes = encoder.encode(data.networkId);
        networkIdArray.set(networkIdBytes);
        
        // Fixed size buffer: networkId(28) + position(8) + isDragStart(1)
        const buffer = new ArrayBuffer(NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH + 9);
        const view = new DataView(buffer);
        let offset = 0;
        
        // Write networkId with fixed length
        new Uint8Array(buffer, offset, NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH).set(networkIdArray);
        offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;
        
        // Write position (x,y)
        view.setFloat32(offset, data.position.x); offset += 4;
        view.setFloat32(offset, data.position.y); offset += 4;
        
        // Write isDragStart flag
        view.setUint8(offset, data.isDragStart ? 1 : 0);
        
        return buffer;
    }
    

    private static decodeDragEvent(buffer: ArrayBuffer): {
        networkId: string,
        position: Matter.Vector,
        isDragStart: boolean
    } {
        const view = new DataView(buffer);
        const decoder = new TextDecoder();
        let offset = 0;
        
        // Read fixed-length networkId
        const networkId = decoder.decode(buffer.slice(offset, offset + NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH)).trim();
        offset += NETWORK_CONFIG.NETWORK_ID_FORMAT.TOTAL_LENGTH;
        
        // Read position
        const x = view.getFloat32(offset); offset += 4;
        const y = view.getFloat32(offset); offset += 4;
        
        // Read isDragStart flag
        const isDragStart = view.getUint8(offset) === 1;
        
        return {
            networkId,
            position: { x, y },
            isDragStart
        };
    }
    
    private static encodeInitialState(data: NetworkTextBodyData[]): ArrayBuffer {
        // Create batch format
        const batchData = {
            bodies: data,
            timestamp: Date.now(),
            chunkId: 0,
            totalChunks: 1
        };

        return this.encodePositionUpdate(batchData);
    }

    private static decodeInitialState(buffer: ArrayBuffer): NetworkTextBodyData[] {
        const result = this.decodePositionUpdate(buffer);
        if ('bodies' in result) {
            return result.bodies;
        }
        return [result];
    }
}

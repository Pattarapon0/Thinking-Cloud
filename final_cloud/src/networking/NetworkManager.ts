import * as Matter from 'matter-js';
import { WebRTCConnection, MessageType } from './WebRTCConnection';
import { SignalingClient,NetworkHandlers } from './SignalingClient';
import { NetworkTextBodyData } from '../utils/types';
import { TextBodyManager, ClickableTextBody } from '../physics/bodies';
import { NetworkStatus } from '../components/NetworkStatus';
import { NetworkError, NetworkErrorType, NetworkErrorHandler } from '../utils/NetworkError';
import { NETWORK_CONFIG, CLOUD_CONFIG, DEBUG } from '../utils/constants';
import { SoundManager } from '../utils/SoundManager';
import { PhysicsEngine } from '../physics/engine';
import { WorkerPool } from '../workers/WorkerPool';
import { BatchedPositionUpdate } from '../workers/types';

export class NetworkManager {
    private lastUpdateTime: Map<string, number> = new Map();
    private networkStatus: NetworkStatus;
    private connectionPromise: Promise<void> | null = null;
    private onConnectionChange?: (connected: boolean) => void;
    private onPeerConnected?: (peerId: string) => void;
    private workerPool: WorkerPool;
    private ownedTexts: Set<string> = new Set();
    private syncIntervalId: number | null = null;
    private peerId: string | null = null;
    private lastDragUpdateTime: Map<string, number> = new Map();
    private readonly MAX_ATTEMPTS_PER_PEER = 3;  // Reduced from 5 to make it faster
    private readonly WAIT_TIME_PER_ATTEMPT = 1000; // Increased from 500ms to 1s for more stable connections
    private readonly MAX_SYNC_ATTEMPTS = 3;  // Maximum attempts to sync initial state
    private readonly SYNC_RETRY_DELAY = 2000;  // 2 seconds between sync retries

    private signalingClient: SignalingClient;

    constructor(
        private serverUrl: string,
        private textManager: TextBodyManager,
        private physicsEngine: PhysicsEngine
    ) {
        this.networkStatus = new NetworkStatus();
        this.workerPool = new WorkerPool();
        this.signalingClient = new SignalingClient(serverUrl);
        // Initialize callbacks before setHandlers
        this.setupSignalingCallbacks();
        this.signalingClient.setHandlers(this.setupReceiveHadler());
        this.signalingClient.setNetworkManager(this);
        this.setupSignalingCallbacksWithPeerId();
    }

    public setOnConnectionChange(callback: (connected: boolean) => void): void {
        this.onConnectionChange = callback;
        this.signalingClient.setOnConnectionChange(callback);
    }

    public setOnPeerConnected(callback: (peerId: string) => void): void {
        this.onPeerConnected = callback;
        this.signalingClient.setOnPeerConnected(callback);
    }

    private cleanupPeerTexts(peerId: string): void {
        // Get all texts owned by the disconnected peer
        const textsToRemove = Array.from(this.textManager.getAllBodies())
            .filter(body => body.getOwnerId() === peerId);

        if (DEBUG.network) {
            console.log('Cleaning up texts for disconnected peer:', {
                peerId,
                textCount: textsToRemove.length
            });
        }

        // Remove each text
        const world = this.physicsEngine.getWorld();
        textsToRemove.forEach(body => {
            body.remove(world, this.textManager);
        });
    }

    private setupSignalingCallbacks(): void {
        this.networkStatus.setStatus('connecting');

        this.signalingClient.setOnPeerConnected((peerId: string) => {
            if (DEBUG.network) {
                console.log('Peer connected:', peerId);
            }
            // If we were in introvert mode, switch to connected
            if (this.networkStatus.getStatus() === 'introvert') {
                this.networkStatus.setStatus('connected');
            }
            this.networkStatus.updatePeerCount(this.signalingClient.getAllPeers().length);
            const screen = document.querySelector('.connection-screen') as HTMLDivElement | null;
            if (screen) screen.remove();
            
            // Play join sound
            SoundManager.getInstance().playJoin();
        });

        this.signalingClient.setOnConnectionChange((connected: boolean, disconnectedPeerId?: string) => {
            if (connected) {
                const peerCount = this.signalingClient.getAllPeers().length;
                // Set to 'introvert' if no peers, otherwise 'connected'
                this.networkStatus.setStatus(peerCount === 0 ? 'introvert' : 'connected');
                const screen = document.querySelector('.connection-screen') as HTMLDivElement | null;
                if (screen) screen.remove();
            } else {
                if (DEBUG.network) {
                    console.log('Peer disconnected:', disconnectedPeerId);
                }
                if (disconnectedPeerId) {
                    this.cleanupPeerTexts(disconnectedPeerId);
                    // Play leave sound
                    SoundManager.getInstance().playLeave();
                }
                const peerCount = this.signalingClient.getAllPeers().length;
                this.networkStatus.updatePeerCount(peerCount);
                if (!this.signalingClient.isConnected()) {
                    // Only set to disconnected if signaling connection is lost
                    this.networkStatus.setStatus('disconnected');
                    // Stop background music when disconnected
                    SoundManager.getInstance().stopBackgroundMusic();
                } else if (peerCount === 0) {
                    // Set to introvert if we're still connected but alone
                    this.networkStatus.setStatus('introvert');
                }
            }
        });
    }

    public setupReceiveHadler(): NetworkHandlers {
        return {
            onClickEvent: (networkId: string, clickLeft: number) => {
                this.handleClickEvent(networkId, clickLeft);
            },
            onNewText: async (data: NetworkTextBodyData): Promise<void> => {
                await this.handleNewText(data);
            },
            onDragEvent: (data: { networkId: string; position: Matter.Vector; isDragStart: boolean }) => {
                this.handleDragEvent(data.networkId, data.position, data.isDragStart);
            },
            onBodyUpdate: (data: NetworkTextBodyData | BatchedPositionUpdate) => {
                this.handleBodyUpdate(data);
            }
        };
    }

    private setupSignalingCallbacksWithPeerId(): void {
        console.log('Setting up signaling callbacks with peer ID');
        this.signalingClient.onInit((peerId: string): void => {
            this.peerId = peerId;
            if (DEBUG.network) {
                console.log('Got peer ID:', peerId);
            }
        });
    }

    public async connect(roomId: string, password?: string): Promise<void> {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = NetworkErrorHandler.retry(
            async () => {
                // Connect to room
                await this.signalingClient.joinRoom(roomId, password);
                await this.waitForPeersConnected();
            },
            NETWORK_CONFIG.reconnectAttempts,
            NETWORK_CONFIG.reconnectDelay,
            NetworkErrorType.SIGNALING_CONNECTION_FAILED
        ).catch(error => {
            if (NetworkError.isNetworkError(error)) {
                NetworkErrorHandler.handle(error);
            } else {
                NetworkErrorHandler.handle(new NetworkError(
                    NetworkErrorType.SIGNALING_CONNECTION_FAILED,
                    { originalError: error },
                    false
                ));
            }
            throw error;
        });

        // Start periodic sync after connection
        this.startPeriodicSync();

        return this.connectionPromise;
    }

    private startPeriodicSync(): void {
        if (this.syncIntervalId !== null) {
            clearInterval(this.syncIntervalId);
        }

        this.syncIntervalId = window.setInterval(async () => {
            const ownedBodies = Array.from(this.textManager.getAllBodies())
                .filter(body => this.getPeerId() === body.getOwnerId());

            /*if (DEBUG.network) {
                console.log('Periodic sync - owned bodies:', ownedBodies.length);
            }*/

            if (ownedBodies.length === 0) return;

            const states = ownedBodies.map(body => body.getNetworkState());
            const chunkSize = 10;
            for (let i = 0; i < states.length; i += chunkSize) {
                const chunk = states.slice(i, i + chunkSize);
                const batchMessage = {
                    bodies: chunk,
                    timestamp: Date.now(),
                    chunkId: Math.floor(i / chunkSize),
                    totalChunks: Math.ceil(states.length / chunkSize)
                };
                
                await this.broadcastToPeers(MessageType.POSITION_UPDATE, batchMessage, 2);
            }
        }, NETWORK_CONFIG.syncInterval);
    }

    private roundVector(vector: Matter.Vector): Matter.Vector {
        return {
            x: Math.round(vector.x * 100) / 100,
            y: Math.round(vector.y * 100) / 100
        };
    }

    public async broadcastBodyUpdate(networkId: string): Promise<void> {
        const now = Date.now();
        const lastUpdate = this.lastUpdateTime.get(networkId) || 0;

        if (now - lastUpdate < NETWORK_CONFIG.positionSyncInterval) {
            return;
        }

        const body = this.textManager.getBodyByNetworkId(networkId);
        if (!body) return;

        const state = body.getNetworkState();
        state.position = this.roundVector(state.position);
        state.velocity = this.roundVector(state.velocity);
        state.angle = Math.round(state.angle * 100) / 100;

        this.lastUpdateTime.set(networkId, now);
        await this.broadcastToPeers(MessageType.POSITION_UPDATE, state, 2);
    }

    private async broadcastToPeers(type: MessageType, data: any, priority: number = 1): Promise<void> {
        const connectedPeers = this.signalingClient.getAllPeers().filter(peerId => {
            const connection = this.signalingClient.getPeerConnection(peerId);
            return connection?.isDataChannelOpen() && connection.getState() === 'connected';
        });

        /*if (DEBUG.network) {
            console.log('Broadcasting to peers:', {
                type: MessageType[type],
                peerCount: connectedPeers.length,
                priority
            });
        }*/

        if (connectedPeers.length === 0) {
            /*if (DEBUG.network) {
                console.warn('No connected peers to broadcast to');
            }*/
            return;
        }

        try {
            const messageData = { messageType: type, messageData: data };
           /* if (DEBUG.network) {
                console.log('Broadcast message data:', messageData);
            }*/
            const encodedData = await this.workerPool.processMessage(
                'encode',
                new TextEncoder().encode(JSON.stringify(messageData)).buffer
            );

            connectedPeers.forEach(peerId => {
                const connection = this.signalingClient.getPeerConnection(peerId);
                if (connection) {
                    try {
                        const messagePriority = type === MessageType.RECEIVE_INITIAL_STATE || 
                                              type === MessageType.RECEIVE_NEW_TEXT ? 2 : priority;
                        connection.sendRaw(encodedData, messagePriority);
                    } catch (error) {
                        if (DEBUG.network) {
                            console.warn('Failed to send to peer:', {
                                peerId,
                                error,
                                type: MessageType[type]
                            });
                        }
                        this.handlePeerSendFailure(peerId);
                    }
                }
            });
        } catch (error) {
            console.error('Failed to encode message:', error);
        }
    }

    private handlePeerSendFailure(peerId: string | undefined): void {
        if (!peerId) return;
        const connection = this.signalingClient.getPeerConnection(peerId);
        if (connection && connection.getState() === 'failed') {
            if (DEBUG.network) {
                console.log(`Removing failed peer connection: ${peerId}`);
            }
            this.signalingClient.getPeerConnection(peerId)?.close();
            this.networkStatus.updatePeerCount(this.signalingClient.getAllPeers().length - 1);
        }
    }

    public async broadcastClickEvent(networkId: string): Promise<void> {
        const body = this.textManager.getBodyByNetworkId(networkId);
        console.log('Broadcasting click event:', body);
        if (!body) return;

        const clickData = {
            networkId,
            clickLeft: body.getClickLeft()
        };
        console.log('Broadcasting click event:', clickData);
        await this.broadcastToPeers(MessageType.RECEIVE_CLICK_EVENT, clickData);
    }

    public async broadcastNewText(
        text: string,
        position: Matter.Vector,
        networkId: string,
        angle: number,
        velocity: Matter.Vector,
        angularVelocity: number
    ): Promise<void> {
        if (DEBUG.network) {
            console.log('Broadcasting new text:', {
                networkId,
                ownerId: this.peerId,
                text,
                position,
                angle,
                velocity,
                angularVelocity
            });
        }

        // Receivers will calculate text dimensions themselves
        const textData: NetworkTextBodyData = {
            networkId,
            ownerId: this.peerId || networkId,
            text,
            position,
            angle,
            velocity,
            angularVelocity,
            clickLeft: text.length,
            dimensions: { width: 0, height: 0 } // Dimensions will be calculated by receivers
        };

        this.ownedTexts.add(networkId);
        await this.broadcastToPeers(MessageType.RECEIVE_NEW_TEXT, textData);
    }

    public async broadcastDragEvent(
        networkId: string,
        position: Matter.Vector,
        isDragStart: boolean
    ): Promise<void> {
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' ||
            isNaN(position.x) || isNaN(position.y)) {
            console.warn('Attempted to broadcast invalid position:', position);
            return;
        }

        const validPosition = {
            x: Math.max(-10000, Math.min(10000, position.x)),
            y: Math.max(-10000, Math.min(10000, position.y))
        };

        if (isDragStart || !this.lastDragUpdateTime.has(networkId)) {
            const dragData = {
                networkId,
                position: validPosition,
                isDragStart
            };
            if (DEBUG.network) {
                console.log('Broadcasting drag event:', dragData);
            }
            await this.broadcastToPeers(MessageType.RECEIVE_DRAG_EVENT, dragData);
            this.lastDragUpdateTime.set(networkId, Date.now());
            return;
        }

        const now = Date.now();
        const lastUpdate = this.lastDragUpdateTime.get(networkId) || 0;

        if (now - lastUpdate < NETWORK_CONFIG.dragSyncInterval) {
            return;
        }

        const dragData = {
            networkId,
            position: validPosition,
            isDragStart
        };

        if (DEBUG.network) {
            console.log('Broadcasting throttled drag event:', dragData);
        }
        
        await this.broadcastToPeers(MessageType.RECEIVE_DRAG_EVENT, dragData);
        this.lastDragUpdateTime.set(networkId, now);
    }

    public handleBodyUpdate(data: NetworkTextBodyData | BatchedPositionUpdate): void {
        if ('bodies' in data) {
            if (DEBUG.network) {
                console.log('Received batch update:', {
                    bodyCount: data.bodies.length,
                    chunkId: data.chunkId,
                    totalChunks: data.totalChunks,
                    timestamp: new Date(data.timestamp).toISOString()
                });
            }

            data.bodies.forEach((bodyData, index) => {
                if (DEBUG.network && index === 0) {
                    console.log('Processing first body in batch:', {
                        networkId: bodyData.networkId,
                        position: bodyData.position
                    });
                }
                this.updateSingleBody(bodyData);
            });
            return;
        }

        if (DEBUG.network) {
            console.log('Processing single body update:', {
                networkId: data.networkId,
                position: data.position
            });
        }

        this.updateSingleBody(data);
    }

    private updateSingleBody(data: NetworkTextBodyData): void {
        const body = this.textManager.getBodyByNetworkId(data.networkId);
        if (body) {
            if (body.getNetworkId() === body.getOwnerId()) {
                if (DEBUG.network) {
                    console.log('Skipping network update for owned text:', data.networkId);
                }
                return;
            }

            data.position = this.roundVector(data.position);
            data.velocity = this.roundVector(data.velocity);
            data.angle = Math.round(data.angle * 100) / 100;
            
            body.updateFromNetwork(data);
        }
    }

    public handleClickEvent(networkId: string, clickLeft: number): void {
        console.log('Handling click event:', {
            networkId,
            clickLeft
        });
        const body = this.textManager.getBodyByNetworkId(networkId);
        console.log(body, clickLeft);
        if (body && clickLeft > 0) {
            body.onClick(this.physicsEngine.getWorld(), this.textManager);
        }
    }

    public async handleNewText(data: NetworkTextBodyData): Promise<void> {
        if (DEBUG.network) {
            console.log('Handling new text:', {
                text: data.text,
                networkId: data.networkId,
                exists: !!this.textManager.getBodyByNetworkId(data.networkId)
            });
        }

        if (this.textManager.getBodyByNetworkId(data.networkId)) {
            if (DEBUG.network) {
                console.log('Text already exists:', data.networkId);
            }
            return;
        }

        if (DEBUG.network) {
            console.log('Creating new text texture...');
        }

        // Measure text dimensions
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            console.error('Failed to get canvas context');
            return;
        }

        context.font = CLOUD_CONFIG.textStyle.font;
        const metrics = context.measureText(data.text);
        const textDimensions = {
            width: Math.ceil((metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight)*1.2) + 20,
            height: Math.ceil(parseInt(CLOUD_CONFIG.textStyle.font, 10) * 1.2) + 10
        };

        // Create texture
        const textureSrc = ClickableTextBody.createTexture(data.text, textDimensions.width, textDimensions.height);
        const img = new Image();
        await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.src = textureSrc;
        });

        const clickableBody = ClickableTextBody.create(
            {
                x: data.position.x,
                y: data.position.y,
                width: textDimensions.width,
                height: textDimensions.height,
                text: data.text,
                networkId: data.networkId,
                ownerId: data.ownerId
            },
            img.src,
            data.angle,
            this,
            data.velocity,
            data.angularVelocity
        );

        if (clickableBody) {
            if (DEBUG.network) {
                console.log('Text body created:', {
                    networkId: data.networkId,
                    text: data.text,
                    position: data.position
                });
            }

            this.textManager.addToCollection(data.networkId, clickableBody);

            const world = this.physicsEngine.getWorld();
            if (world) {
                Matter.World.add(world, clickableBody.body);
                if (DEBUG.network) {
                    console.log('Added text body to world:', {
                        networkId: data.networkId,
                        worldBodies: world.bodies.length
                    });
                }
            } else {
                if (DEBUG.network) {
                    console.warn('Physics world not available for text:', data.networkId);
                }
            }
        } else {
            if (DEBUG.network) {
                console.error('Failed to create clickable body:', data);
            }
        }
    }

    public handleDragEvent(
        networkId: string, 
        position: Matter.Vector,
        isDragStart: boolean
    ): void {
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' ||
            isNaN(position.x) || isNaN(position.y)) {
            console.warn('Received invalid position in drag event:', position);
            return;
        }

        if (DEBUG.network) {
            console.log('Handling drag event:', { networkId, position, isDragStart });
        }

        const body = this.textManager.getBodyByNetworkId(networkId);
        if (body) {
            const validPosition = {
                x: Math.max(-10000, Math.min(10000, position.x)),
                y: Math.max(-10000, Math.min(10000, position.y))
            };
            Matter.Body.setPosition(body.body, validPosition);
            if (isDragStart) {
                Matter.Body.setVelocity(body.body, { x: 0, y: 0 });
            }
        }
    }

    public async close(): Promise<void> {
        if (this.syncIntervalId !== null) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
        // Stop background music when leaving room
        SoundManager.getInstance().stopBackgroundMusic();
        this.signalingClient.close();
        this.networkStatus.destroy();
        await this.workerPool.terminate();
        return Promise.resolve();
    }

public getPhysicsEngine(): PhysicsEngine {
    return this.physicsEngine;
}

public getTextManager(): TextBodyManager {
    return this.textManager;
}

public getPeerId(): string | null {
        return this.peerId;
    }

    public async syncAllTextsToNewPeer(peerId: string): Promise<void> {
        // Get all texts that this peer owns
        const ownedBodies = Array.from(this.textManager.getAllBodies())
            .filter(body => this.getPeerId() === body.getOwnerId());
        
        if (DEBUG.network) {
            console.log('Syncing texts to new peer:', {
                peerId,
                textCount: ownedBodies.length
            });
        }

        // Send each text to the new peer
        const connection = this.signalingClient.getPeerConnection(peerId);
        if (!connection) {
            if (DEBUG.network) {
                console.warn('No connection available for peer:', peerId);
            }
            return;
        }

        // Try multiple times to ensure sync succeeds
        for (let attempt = 0; attempt < this.MAX_SYNC_ATTEMPTS; attempt++) {
            try {
                if (DEBUG.network) {
                    console.log(`Sync attempt ${attempt + 1}/${this.MAX_SYNC_ATTEMPTS}`);
                }

                // Send in batches of 5 texts
                const batchSize = 5;
                for (let i = 0; i < ownedBodies.length; i += batchSize) {
                    const batch = ownedBodies.slice(i, i + batchSize);
                    const states = batch.map(body => body.getNetworkState());
                    
                    if (DEBUG.network) {
                        console.log(`Sending batch ${Math.floor(i/batchSize) + 1}:`, {
                            size: states.length,
                            firstText: states[0]?.text
                        });
                    }

                    // Wait for each batch to be sent
                    for (const state of states) {
                        await connection.send(MessageType.RECEIVE_NEW_TEXT, state, 2);
                        // Small delay between texts to prevent overwhelming
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                // If we get here without errors, sync was successful
                if (DEBUG.network) {
                    console.log('Sync completed successfully');
                }
                return;

            } catch (error) {
                if (DEBUG.network) {
                    console.warn(`Sync attempt ${attempt + 1} failed:`, error);
                }
                
                if (attempt < this.MAX_SYNC_ATTEMPTS - 1) {
                    // Wait before retrying
                    await new Promise(resolve => setTimeout(resolve, this.SYNC_RETRY_DELAY));
                }
            }
        }

        // If we get here, all attempts failed
        if (DEBUG.network) {
            console.error('Failed to sync texts after all attempts');
        }
    }

    private async waitForPeersConnected(): Promise<void> {
        const peers = this.signalingClient.getAllPeers();
        const maxAttempts = peers.length * this.MAX_ATTEMPTS_PER_PEER;
        let attempts = 0;
        let lastConnectedCount = 0;

        if (peers.length > 0) {
            const connectionScreen = document.querySelector('.connection-screen') as HTMLDivElement | null;
            if (connectionScreen) {
                connectionScreen.style.display = 'flex';
                const status = connectionScreen as unknown as { updateStatus?: (status: string, message: string) => void };
                if (status.updateStatus) {
                    status.updateStatus('waiting-peers', `Connecting to ${peers.length} peers...`);
                }
            }
            this.networkStatus.setStatus('waiting-peers');
        } else {
            // No peers to connect to, set to introvert mode
            this.networkStatus.setStatus('introvert');
            return;
        }

        if (DEBUG.network) {
            console.log('Waiting for peers to connect:', {
                peerCount: peers.length,
                maxAttempts,
                timeoutMs: maxAttempts * this.WAIT_TIME_PER_ATTEMPT
            });
        }
        
        while (attempts < maxAttempts) {
            const connectedPeers = peers.filter(peerId => {
                const connection = this.signalingClient.getPeerConnection(peerId);
                return connection?.isDataChannelOpen() && 
                       connection.getState() === 'connected';
            });

            if (DEBUG.network) {
                console.log('Peer connection status:', {
                    attempt: attempts + 1,
                    connected: connectedPeers.length,
                    total: peers.length
                });
            }

            // If we have some connected peers and no new connections in last few attempts, proceed
            if (connectedPeers.length > 0 && 
                connectedPeers.length === lastConnectedCount && 
                attempts > this.MAX_ATTEMPTS_PER_PEER) {
                if (DEBUG.network) {
                    console.log('Proceeding with partial peer connections:', {
                        connected: connectedPeers.length,
                        total: peers.length
                    });
                }
                break;
            }
            
            if (connectedPeers.length === peers.length) {
                if (DEBUG.network) {
                    console.log('All peers connected successfully');
                }
                break;
            }
            
            lastConnectedCount = connectedPeers.length;
            await new Promise(r => setTimeout(r, this.WAIT_TIME_PER_ATTEMPT));
            attempts++;
        }

        // Hide screen
            const connectionScreen = document.querySelector('.connection-screen') as HTMLDivElement | null;
            if (connectionScreen) {
                connectionScreen.style.display = 'none';
            }
            
            this.networkStatus.setStatus('connected');
            // Start playing background music when connected to room
            SoundManager.getInstance().playBackgroundMusic();
            
            if (DEBUG.network) {
                console.log('Connection phase complete');
            }
    }
}

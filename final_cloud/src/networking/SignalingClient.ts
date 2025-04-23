import * as Matter from 'matter-js';
import { NetworkTextBodyData } from '../utils/types';
import { BatchedPositionUpdate } from '../workers/types';
import { WebRTCConnection, MessageType } from './WebRTCConnection';
import { NetworkError, NetworkErrorType } from '../utils/NetworkError';
import { DEBUG } from '../utils/constants';

// New types for room list
interface RoomInfo {
  id: string;
  name: string;
  currentUsers: number;
  maxUsers: number;
  hasPassword: boolean;
}

type RoomListEvent = {
  type: 'room-list' | 'room-created' | 'room-updated' | 'room-deleted' | 'room-create-success' | 'error'| 'room-enter-success';
  rooms?: RoomInfo[];
  room?: RoomInfo;
  roomId?: string;
  currentUsers?: number;
  error?: 'invalid-message'| 'invalid-password' | 'room-not-found' | 'room-full';
  password?: string;
}

// Additional helper method
interface RoomUpdate {
  id: string;  
  currentUsers: number;
}

type SignalingMessage = {
    type: 'peer-join' | 'peer-leave' | 'offer' | 'answer' | 'ice-candidate'| 'init' | 'error' | 'renegotiate' | 'connection-timeout';
  error?: 'invalid-password' | 'room-full' | 'room-not-found' | 'invalid-message-format' | 
         'peer-not-found' | 'missing-target-id' | 'server-error-processing-message';
  peerId?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  targetId?: string;
  roomSettings?: {
    maxTexts: number;
    maxUsers: number;
  };
};

type PeerConnectedCallback = (peerId: string) => void;
type ConnectionChangeCallback = (connected: boolean, disconnectedPeerId?: string) => void;

interface PendingConnection {
  initiator: string;
  receiver: string;
  timestamp: number;
}

export interface NetworkHandlers {
    onClickEvent: (networkId: string, clickLeft: number) => void;
    onNewText: (data: NetworkTextBodyData) => Promise<void>;
    onDragEvent: (data: { networkId: string; position: Matter.Vector; isDragStart: boolean }) => void;
    onBodyUpdate: (data: NetworkTextBodyData | BatchedPositionUpdate) => void;
}

export class SignalingClient {
    // Room list specific properties
    private roomListWs: WebSocket | null = null;
    private isRoomListConnecting: boolean = false;
    private roomListCallback?: (rooms: RoomInfo[]) => void;
    private roomList: RoomInfo[] = [];
    private joinRoomCallBack: ((roomId: string, password?: string) => void) | null = null;
    private roomConnection: WebSocket | null = null;
    private peers: Map<string, WebRTCConnection> = new Map();
    private pendingConnections: Map<string, PendingConnection> = new Map();
    private reconnectAttempts: number = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private readonly RECONNECT_DELAY = 1000; // 1 second
    private readonly PENDING_CONNECTION_TIMEOUT = 30000; // 30 seconds
    private isConnectingToRoom: boolean = false;
    private roomConnectionPromise: Promise<void> | null = null;
    private connectionResolve?: () => void;
    private connectionReject?: (error: Error) => void;
    private onPeerConnectedCallback?: PeerConnectedCallback;
    private onConnectionChangeCallback?: ConnectionChangeCallback;
    private onInitCallback?: (peerId: string) => void;
    private cleanupInterval: number | null = null;
    private peerId: string | null = null;
    private handlers?: NetworkHandlers;
    private readonly pendingIceCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
    private networkManager: any;

    constructor(private serverUrl: string, handlers?: NetworkHandlers) {
        if (handlers) {
            this.handlers = handlers;
        }
        // Clean up stale pending connections periodically
        this.cleanupInterval = window.setInterval(() => {
            const now = Date.now();
            for (const [key, conn] of this.pendingConnections) {
                if (now - conn.timestamp > this.PENDING_CONNECTION_TIMEOUT) {
                    if (DEBUG.network) {
                        console.log('Cleaning up stale pending connection:', conn);
                    }
                    this.pendingConnections.delete(key);
                }
            }
        }, 10000);
    }
    public setOnPeerConnected(callback: PeerConnectedCallback): void {
        this.onPeerConnectedCallback = callback;
    }

    public setOnConnectionChange(callback: ConnectionChangeCallback): void {
        this.onConnectionChangeCallback = callback;
    }

    public onInit(callback: (peerId: string) => void): void {
        this.onInitCallback = callback;
    }
    // New method to connect to room list
    public async connectToRoomList(): Promise<void> {
        if (this.isRoomListConnecting || this.roomListWs?.readyState === WebSocket.OPEN) {
            return;
        }

        this.isRoomListConnecting = true;

        return new Promise<void>((resolve, reject) => {
            try {
                this.roomListWs = new WebSocket(`${this.serverUrl}/rooms-list`);
                
                this.roomListWs.onopen = () => {
                    if (DEBUG.network) {
                        console.log('Room list WebSocket connected:', {
                            url: `${this.serverUrl}/rooms-list`,
                            readyState: this.roomListWs?.readyState
                        });
                    }
                    this.isRoomListConnecting = false;
                    resolve();
                };

                this.roomListWs.onclose = () => {
                    if (DEBUG.network) {
                        console.log('Room list WebSocket closed');
                    }
                    this.roomListWs = null;
                };

                this.roomListWs.onerror = (error) => {
                    console.error('Room list WebSocket error:', error);
                    this.isRoomListConnecting = false;
                    reject(new NetworkError(
                        NetworkErrorType.SIGNALING_SERVER_ERROR,
                        { error },
                        false
                    ));
                };

                this.roomListWs.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data) as RoomListEvent;
                        this.handleRoomListMessage(message);
                    } catch (error) {
                        console.error('Failed to parse room list message:', error);
                    }
                };

            } catch (error) {
                this.isRoomListConnecting = false;
                reject(new NetworkError(
                    NetworkErrorType.SIGNALING_CONNECTION_FAILED,
                    { error },
                    false
                ));
            }
        });
    }

    // Add method to create room
    public createRoom(options: {
        name: string;
        maxUsers: number;
        maxTexts: number;
        password?: string;
    }): void {
        if (!this.roomListWs?.readyState) {
            console.error('Not connected to room list');
            return;
        }

        this.roomListWs.send(JSON.stringify({
            type: 'create-room',
            ...options
        }));
    }
    public enterRoom(roomId: string, password?: string): void {
        if (!this.roomListWs?.readyState) {
            console.error('Not connected to room list');
            return;
        }

        this.roomListWs.send(JSON.stringify({
            type: 'enter-room',
            roomId,
            password
        }));
    }

    // New method to set room list callback
    public setOnRoomListChanged(callback: (rooms: RoomInfo[]) => void): void {
        this.roomListCallback = callback;
    }

    // New method to handle room list messages
    private handleRoomListMessage(message: RoomListEvent): void {
        if (DEBUG.network) {
            console.log('Received room list message:', message);
        }
        
        switch (message.type) {
            case 'room-create-success':
                if (DEBUG.network) {
                    console.log('Room created successfully:', {
                        roomId: message.room?.id,
                        hasPassword: !!message.password
                    });
                }
                if (message.room) {
                    this.joinRoomCallBack?.(message.room.id, message.password) || Promise.resolve();
                    this.roomListWs?.close();
                }
                break;
            case 'room-list':
                // Initial room list - replace entire list
                if (message.rooms) {
                    this.roomList = message.rooms;
                }
                this.roomListCallback?.(this.roomList);
                break;
            case 'room-created':
                // Add new room to list
                if (message.room) {
                    this.roomList.push(message.room);
                }
                this.roomListCallback?.(this.roomList);
                break;
            case 'room-updated':
                // Update existing room or just update user count
                if (message.room) {
                    const index = this.roomList.findIndex(r => r.id === message.room?.id);
                    if (index >= 0) {
                        this.roomList[index] = message.room;
                    }
                } else if (message.roomId && message.currentUsers !== undefined) {
                    // Just updating user count
                    const index = this.roomList.findIndex(r => r.id === message.roomId);
                    if (index >= 0) {
                        this.roomList[index] = {
                            ...this.roomList[index],
                            currentUsers: message.currentUsers
                        };
                    }
                }
                this.roomListCallback?.(this.roomList);
                break;
            case 'room-deleted':
                // Remove room from list
                if (message.roomId) {
                    this.roomList = this.roomList.filter(r => r.id !== message.roomId);
                }
                this.roomListCallback?.(this.roomList);
                break;
            case 'room-enter-success':

                if (message.roomId) {
                    console.log('Room entered successfully:', message.roomId);
                    this.joinRoomCallBack?.(message.roomId, message.password);
                }
                break;
            case 'error':
                if (message.error === 'invalid-message') {
                    alert('Invalid message sent to server - please try again');
                }
                if (message.error === 'invalid-password') {
                    alert('Invalid password - please try again');
                }
                if (message.error === 'room-not-found') {
                    alert('Room not found or never existed - please try again xd');
                }
                if (message.error === 'room-full') {
                    alert('Room is full - please try again later');
                }
                break;
        }
    }
    public setJoinRoom(callback:(roomId: string, password?: string)=> void):void
    {
        this.joinRoomCallBack=callback;
    }
    public async joinRoom(roomId: string, password?: string): Promise<void> {
        if (this.isConnectingToRoom || this.roomConnection?.readyState === WebSocket.OPEN) {
            return this.roomConnectionPromise || Promise.resolve();
        }

        // Disconnect from room list since we're joining a room
        this.roomListWs?.close();
        this.roomListWs = null;

        this.roomConnectionPromise = new Promise<void>((resolve, reject) => {
            this.connectionResolve = resolve;
            this.connectionReject = reject;

            try {
                this.isConnectingToRoom = true;
                this.roomConnection = new WebSocket(`${this.serverUrl}/room/${roomId}`);
                this.setupWebSocketHandlers(roomId, password);
            } catch (error) {
                this.handleConnectionError(error);
            }
        });

        return this.roomConnectionPromise;
    }

    private setupWebSocketHandlers(roomId:string,password?:string): void {
        if (!this.roomConnection) return;

        this.roomConnection.onopen = () => {
            if (DEBUG.network) {
                console.log('WebSocket connected:', {
                    url: `${this.serverUrl}/room/${roomId}`,
                    readyState: this.roomConnection?.readyState
                });
            }
            if (password) {
                this.roomConnection?.send(JSON.stringify({
                    type: 'join',
                    password
                }));
            }
            else {
                this.roomConnection?.send(JSON.stringify({
                    type: 'join'
                }));
            }
            this.reconnectAttempts = 0;
            this.isConnectingToRoom= false;
        };

        this.roomConnection.onclose = () => {
            if (DEBUG.network) {
                console.log('Disconnected from signaling server');
            }
            this.onConnectionChangeCallback?.(false);
            void this.handleDisconnect(roomId,password);
        };

        this.roomConnection.onerror = (error) => {
            this.handleConnectionError(error);
        };

        this.roomConnection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data) as SignalingMessage;
                if (DEBUG.network) {
                    console.log('Received signaling message:', {
                        type: message.type,
                        peerId: message.peerId,
                        targetId: message.targetId,
                        hasOffer: !!message.offer,
                        hasAnswer: !!message.answer,
                        hasCandidate: !!message.candidate
                    });
                }
                if (message.type === 'error') {
                    this.handleConnectionError(new Error(message.error));
                    return;
                }
                this.handleSignalingMessage(message,roomId,password);
            } catch (error) {
                console.error('Failed to parse signaling message:', error);
            }
        };
    }

    private async handleDisconnect(roomId:string,password?:string): Promise<void> {
        this.isConnectingToRoom= false;
        
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            const delay = this.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);
            
            if (DEBUG.network) {
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}) in ${delay}ms`);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            await this.joinRoom(roomId,password);
        } else {
            throw new NetworkError(
                NetworkErrorType.SIGNALING_CONNECTION_FAILED,
                { attempts: this.reconnectAttempts },
                false
            );
        }
    }

    private handleConnectionError(error: any): void {
        this.isConnectingToRoom= false;
        const networkError = new NetworkError(
            NetworkErrorType.SIGNALING_SERVER_ERROR,
            { error },
            this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS
        );
        
        if (this.connectionReject) {
            this.connectionReject(networkError);
        } else {
            throw networkError;
        }
    }

    private async handleSignalingMessage(message: SignalingMessage, roomId: string, password?: string): Promise<void> {
        switch (message.type) {
            case "init":
                if (message.peerId) {
                    this.handleInit(message.peerId, message.roomSettings);
                }
                break;
            case 'connection-timeout':
                if (message.peerId) {
                    if (DEBUG.network) {
                        console.log('Connection timeout received for peer:', message.peerId);
                    }
                    // Cleanup existing connection if any
                    this.handlePeerLeave(message.peerId, roomId, password);
                    // Try to establish a new connection
                    await this.handlePeerJoin(message.peerId, roomId, password);
                }
                break;

            case 'renegotiate':
                if (message.targetId) {
                    const connection = this.peers.get(message.targetId);
                    if (connection) {
                        if (DEBUG.network) {
                            console.log('Renegotiating connection with peer:', message.targetId);
                        }
                        connection.close();
                        this.peers.delete(message.targetId);
                        await this.handlePeerJoin(message.targetId, roomId, password);
                    }
                }
                break;

            case 'error':
                if (message.error) {
                    switch(message.error) {
                        case 'invalid-password':
                            alert('Invalid password for this room');
                            break;
                        case 'room-full':
                            alert('This room is full');
                            break;
                        case 'room-not-found':
                            alert('Room not found');
                            break;
                        case 'invalid-message-format':
                            alert('Invalid message format - please try again');
                            break;
                        case 'peer-not-found':
                            alert('The user you are trying to connect to was not found');
                            break;
                        case 'missing-target-id':
                            alert('Connection error: Missing target ID');
                            break;
                        case 'server-error-processing-message':
                            alert('Server error occurred - please try again');
                            break;
                    }
                }
                break;
            case 'peer-join':
                if (message.peerId) {
                    void this.handlePeerJoin(message.peerId,roomId,password);
                }
                break;
            case 'peer-leave':
                if (message.peerId) {
                    this.handlePeerLeave(message.peerId,roomId,password);
                }
                break;
            case 'offer':
                if (message.peerId && message.offer) {
                    void this.handleOffer(message.peerId, message.offer);
                }
                break;
            case 'answer':
                if (message.peerId && message.answer) {
                    void this.handleAnswer(message.peerId, message.answer);
                }
                break;
            case 'ice-candidate':
                if (message.peerId && message.candidate) {
                    void this.handleIceCandidate(message.peerId, message.candidate);
                }
                break;
            
        }
    }

    private handleInit(peerId: string, roomSettings?: { maxTexts: number; maxUsers: number }): void {
        this.peerId = peerId;
        if (DEBUG.network) {
            console.log('Received peer ID and settings from server:', {
                peerId,
                roomSettings,
                wsState: this.roomConnection?.readyState
            });
        }

        // Update TextManager with room settings
        if (roomSettings && this.networkManager) {
            const textManager = this.networkManager.getTextManager();
            if (textManager) {
                textManager.updateRoomSettings(roomSettings);
            }
        }

        this.onConnectionChangeCallback?.(true);
        this.onInitCallback?.(peerId);
        this.connectionResolve?.();
    }

    private async handlePeerJoin(peerId: string,roomId:string,password?:string): Promise<void> {
        if (DEBUG.network) {
            console.log('Peer joined:', {
                peerId,
                totalPeers: this.peers.size,
                activePeers: Array.from(this.peers.keys())
            });
        }
        if (!this.peerId||!peerId||this.peerId===peerId||this.peers.has(peerId)) {
            return;
        }
        const connection = new WebRTCConnection(true);
        this.peers.set(peerId, connection);
        this.setupConnection(connection);

        const connectionKey = `${this.peerId}-${peerId}`;
        this.pendingConnections.set(connectionKey, {
            initiator: this.peerId || '',
            receiver: peerId,
            timestamp: Date.now()
        });

        connection.onIceCandidate = (candidate) => {
            this.sendSignalingMessage({
                type: 'ice-candidate',
                targetId: peerId,
                candidate
            });
        };

        connection.onDataChannelOpen = () => {
            if (DEBUG.network) {
                console.log('Data channel opened with peer:', peerId);
            }
            this.onPeerConnectedCallback?.(peerId);
            if (this.networkManager) {
                this.networkManager.syncAllTextsToNewPeer(peerId);
            }
        };

        connection.onDataChannelClose = () => {
            if (DEBUG.network) {
                console.log('Data channel closed with peer:', peerId);
            }
            if (this.peers.has(peerId)) {
                this.handlePeerLeave(peerId,roomId,password);
            }
        };

        try {
            const offer = await connection.createOffer();
            this.sendSignalingMessage({
                type: 'offer',
                targetId: peerId,
                offer
            });
        } catch (error) {
            console.error('Failed to create offer:', error);
            connection.close();
            this.peers.delete(peerId);
        }
    }

    private handlePeerLeave(peerId: string,roomId:string,password?:string): void {
        const connection = this.peers.get(peerId);
        if (connection) {
            if (DEBUG.network) {
                console.log('Peer left:', {
                    peerId,
                    connectionState: connection.getState(),
                    remainingPeers: this.peers.size - 1
                });
            }

            connection.close();
            this.peers.delete(peerId);
            this.pendingIceCandidates.delete(peerId);

            for (const [key, conn] of this.pendingConnections) {
                if (conn.initiator === peerId || conn.receiver === peerId) {
                    this.pendingConnections.delete(key);
                }
            }

            this.onConnectionChangeCallback?.(this.peers.size > 0);

            if (this.peers.size === 0 && this.roomConnection?.readyState !== WebSocket.OPEN) {
                void this.joinRoom(roomId,password);
            }
        }
    }

    public setHandlers(handlers: NetworkHandlers): void {
        this.handlers = handlers;
    }

    private setupConnection(connection: WebRTCConnection): void {
        connection.clearMessageHandlers();

        if (!this.handlers) {
            console.warn('No network handlers set');
            return;
        }

        connection.onMessage(MessageType.RECEIVE_NEW_TEXT, (data) => {
            void this.handlers?.onNewText(data);
        });

        connection.onMessage(MessageType.POSITION_UPDATE, (data) => {
            this.handlers?.onBodyUpdate(data);
        });

        connection.onMessage(MessageType.RECEIVE_CLICK_EVENT, (data) => {
            this.handlers?.onClickEvent(data.networkId, data.clickLeft);
        });

        connection.onMessage(MessageType.RECEIVE_DRAG_EVENT, (data) => {
            this.handlers?.onDragEvent(data);
        });
    }

    private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
        try {
            let connection = this.peers.get(peerId);
            
            if (!connection) {
                connection = new WebRTCConnection();
                this.peers.set(peerId, connection);
                this.setupConnection(connection);

                const connectionKey = `${peerId}-${this.peerId}`;
                this.pendingConnections.set(connectionKey, {
                    initiator: peerId,
                    receiver: this.peerId || '',
                    timestamp: Date.now()
                });
            }

            connection.onIceCandidate = (candidate) => {
                this.sendSignalingMessage({
                    type: 'ice-candidate',
                    targetId: peerId,
                    candidate
                });
            };

            await connection.setRemoteDescription(offer);
            const answer = await connection.createAnswer();
            
            this.sendSignalingMessage({
                type: 'answer',
                targetId: peerId,
                answer
            });

            this.onPeerConnectedCallback?.(peerId);
            if (this.networkManager) {
                this.networkManager.syncAllTextsToNewPeer(peerId);
            }

        } catch (error) {
            console.error('Failed to handle offer:', error);
            
            const connection = this.peers.get(peerId);
            if (connection) {
                connection.close();
                this.peers.delete(peerId);
            }
            
            const connectionKey = `${peerId}-${this.peerId}`;
            this.pendingConnections.delete(connectionKey);
        }
    }

    private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
        const connection = this.peers.get(peerId);
        if (connection) {
            try {
                // Add validation
                if (!answer.sdp) {
                    throw new NetworkError(
                        NetworkErrorType.PEER_CONNECTION_FAILED,
                        { error: 'Invalid answer SDP' },
                        false
                    );
                }

                // Wait for stable signaling state if needed
                if (connection.getState() === 'connecting') {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (DEBUG.network) {
                    console.log('Handling answer:', {
                        peerState: connection.getState(),
                        hasDataChannel: connection.isDataChannelOpen(),
                        signalingState: connection.getState()
                    });
                }

                await connection.setRemoteDescription(answer);
                const ourId = this.peerId || '';
                const connectionKey = `${ourId}-${peerId}`;
                this.pendingConnections.delete(connectionKey);
                this.onConnectionChangeCallback?.(true);

            } catch (error) {
                // Enhanced error handling
                if (DEBUG.network) {
                    console.error('Answer handling failed:', {
                        peerState: connection.getState(),
                        hasDataChannel: connection.isDataChannelOpen(),
                        error
                    });
                }
                const ourId = this.peerId || '';
                const connectionKey = `${ourId}-${peerId}`;
                this.pendingConnections.delete(connectionKey);
                connection.close();
                this.peers.delete(peerId);
                this.onConnectionChangeCallback?.(this.peers.size > 0);
            }
        }
    }

    private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
        const connection = this.peers.get(peerId);
        
        if (!connection || connection.getState() === 'new') {
            let candidates = this.pendingIceCandidates.get(peerId);
            if (!candidates) {
                candidates = [];
                this.pendingIceCandidates.set(peerId, candidates);
            }
            candidates.push(candidate);
            return;
        }

        try {
            await connection.addIceCandidate(new RTCIceCandidate(candidate));
            const pendingCandidates = this.pendingIceCandidates.get(peerId);
            if (pendingCandidates?.length) {
                for (const pendingCandidate of pendingCandidates) {
                    try {
                        await connection.addIceCandidate(new RTCIceCandidate(pendingCandidate));
                    } catch (error) {
                        console.error('Failed to add queued ICE candidate:', error);
                    }
                }
                this.pendingIceCandidates.delete(peerId);
            }
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    private sendSignalingMessage(message: SignalingMessage): void {
        if (this.roomConnection?.readyState === WebSocket.OPEN) {
            this.roomConnection.send(JSON.stringify(message));
        }
    }

    public getPeerConnection(peerId: string): WebRTCConnection | undefined {
        return this.peers.get(peerId);
    }

    public getAllPeers(): string[] {
        return Array.from(this.peers.keys());
    }
  
    // Clean up method
    public close(): void {
        // Close room list connection
        this.roomListWs?.close();
        this.roomListWs = null;
        this.roomListCallback = undefined;

        // Close room connection
        this.roomConnection?.close();
        this.roomConnection = null;
        
        // Clear callbacks
        this.onPeerConnectedCallback = undefined;
        this.onConnectionChangeCallback = undefined;
        this.onInitCallback = undefined;
    }
    public setNetworkManager(networkManager: any): void {
        this.networkManager = networkManager;
    }

    public isConnected(): boolean {
        return this.roomConnection?.readyState === WebSocket.OPEN;
    }
}

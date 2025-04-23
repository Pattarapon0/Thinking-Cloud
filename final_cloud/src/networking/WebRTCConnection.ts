import { NetworkError, NetworkErrorType, NetworkErrorHandler } from '../utils/NetworkError';
import { BinaryProtocol, MessageType } from './BinaryProtocol';
import { NetworkTextBodyData } from '../utils/types';
import { DEBUG, WEBRTC_CONFIG } from '../utils/constants';
import { WorkerPool } from '../workers/WorkerPool';

export { MessageType } from './BinaryProtocol';
export type ConnectionState = 'new' | 'connecting' | 'connected' | 'failed' | 'closed';

export class WebRTCConnection {
    private peerConnection: RTCPeerConnection;
    private dataChannel: RTCDataChannel | null = null;
    private messageHandlers: Map<MessageType, (data: any) => void> = new Map();
    private readonly RENEGOTIATION_ATTEMPTS = 3;
    private renegotiationCount = 0;
    private workerPool: WorkerPool;

    public clearMessageHandlers(): void {
        this.messageHandlers.clear();
    }
    private connectionState: ConnectionState = 'new';
    private statsInterval: number | undefined;
    private connectionStats: {
        rtt?: number;
        bandwidth?: number;
        packetsLost?: number;
        timestamp: number;
    } = { timestamp: 0 };

    private startStatsMonitoring(): void {
        this.statsInterval = window.setInterval(async () => {
            if (this.peerConnection.connectionState === 'connected') {
                const stats = await this.peerConnection.getStats();
                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        this.connectionStats.rtt = report.currentRoundTripTime;
                    }
                    if (report.type === 'inbound-rtp') {
                        this.connectionStats.packetsLost = report.packetsLost;
                        this.connectionStats.bandwidth = report.bytesReceived / (Date.now() - report.timestamp);
                    }
                });
                this.connectionStats.timestamp = Date.now();

               /* if (DEBUG.network) {
                    console.log('Connection stats:', this.connectionStats);
                }*/
            }
        }, 1000);
    }

    public getConnectionStats(): typeof this.connectionStats {
        return { ...this.connectionStats };
    }

    private networkOnline: boolean = navigator.onLine;
    private readonly isInitiator: boolean;
    private networkHandlers: {
        online: () => void;
        offline: () => void;
    };
    
    constructor(isInitiator: boolean = false) {
        this.isInitiator = isInitiator;
        
        // Setup network handlers
        this.networkHandlers = {
            online: () => this.handleNetworkChange(true),
            offline: () => this.handleNetworkChange(false)
        };
        window.addEventListener('online', this.networkHandlers.online);
        window.addEventListener('offline', this.networkHandlers.offline);
        this.peerConnection = this.createPeerConnection();
        this.setupPeerConnectionHandlers();
        this.startStatsMonitoring();
        this.workerPool = new WorkerPool();
        
        if (DEBUG.network) {
            console.log('WebRTC connection created:', {
                isInitiator: this.isInitiator,
                connectionState: this.peerConnection.connectionState,
                signalingState: this.peerConnection.signalingState
            });
        }

        // For initiator, create data channel immediately
        if (this.isInitiator) {
            const channelConfig: RTCDataChannelInit = {
                ordered: false,
                maxRetransmits: 0
            };

            try {
                if (DEBUG.network) {
                    console.log('Creating initial data channel as initiator');
                }
                this.dataChannel = this.peerConnection.createDataChannel('gameData', channelConfig);
                this.setupDataChannel(this.dataChannel).catch(error => {
                    if (DEBUG.network) {
                        console.error('Failed to setup initial data channel:', error);
                    }
                });
            } catch (error) {
                if (DEBUG.network) {
                    console.error('Failed to create data channel:', error);
                }
            }
        }
    }

    private createPeerConnection(): RTCPeerConnection {
const config: RTCConfiguration = {
            iceServers: [
                // STUN servers
                ...WEBRTC_CONFIG.stunServers.map((url: string) => ({ urls: url })),
                // TURN servers
                ...WEBRTC_CONFIG.turnServer.urls.map((url: string) => ({
                    urls: url,
                    username: WEBRTC_CONFIG.turnServer.username,
                    credential: WEBRTC_CONFIG.turnServer.credential
                }))
            ],
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceCandidatePoolSize: 10
        };

        const connection = new RTCPeerConnection(config);
        
        // Enhanced logging for ICE failures
        connection.addEventListener('icecandidateerror', (event) => {
            if (DEBUG.network) {
                console.warn('ICE candidate error:', {
                    errorCode: event.errorCode,
                    errorText: event.errorText,
                    address: event.address,
                    url: event.url
                });
            }
        });

        return connection;
    }

    private setupPeerConnectionHandlers(): void {
        this.peerConnection.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                this.onIceCandidate?.(event.candidate);
                if (DEBUG.network) {
                    console.log('ICE candidate:', {
                        type: event.candidate.type,
                        protocol: event.candidate.protocol,
                        address: event.candidate.address,
                        port: event.candidate.port,
                        priority: event.candidate.priority
                    });
                }
            }
        });

        this.peerConnection.addEventListener('connectionstatechange', () => {
            this.handleConnectionStateChange();
        });

        this.peerConnection.addEventListener('iceconnectionstatechange', () => {
            if (DEBUG.network) {
                console.log('ICE connection state changed:', {
                    state: this.peerConnection.iceConnectionState,
                    connectionState: this.connectionState
                });
            }

            if (this.peerConnection.iceConnectionState === 'failed' || this.peerConnection.iceConnectionState === 'disconnected') {
                if (DEBUG.network) {
                    console.log('ICE connection failed/disconnected, attempting recovery', {
                        state: this.peerConnection.iceConnectionState,
                        connectionState: this.peerConnection.connectionState,
                        signalingState: this.peerConnection.signalingState,
                        timestamp: new Date().toISOString()
                    });
                }
                
                let retryCount = 0;
                const maxRetries = 5;
                const retryDelay = 4000; // 4 seconds
                
                const attemptRecovery = async () => {
                    if (retryCount >= maxRetries) {
                        if (DEBUG.network) {
                            console.log('Max retries reached, creating new connection');
                        }
                        const oldConnection = this.peerConnection;
                        this.peerConnection = this.createPeerConnection();
                        this.setupPeerConnectionHandlers();
                        oldConnection.close();
                        this.onConnectionStateChange?.('connecting');
                        return;
                    }

                    retryCount++;
                    if (DEBUG.network) {
                        console.log(`Recovery attempt ${retryCount}/${maxRetries}`);
                    }

                    // First try restarting ICE
                    this.peerConnection.restartIce();
                    
                    // Wait for recovery
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    
                    // If still failed, try again
                    if (this.peerConnection.iceConnectionState === 'failed' || 
                        this.peerConnection.iceConnectionState === 'disconnected') {
                        attemptRecovery();
                    }
                };

                attemptRecovery();
            }
        });

        this.peerConnection.addEventListener('negotiationneeded', async () => {
            if (DEBUG.network) {
                console.log('Negotiation needed:', {
                    state: this.connectionState,
                    iceGatheringState: this.peerConnection.iceGatheringState,
                    signalingState: this.peerConnection.signalingState,
                    attempt: this.renegotiationCount + 1
                });
            }

            // Only handle renegotiation for the initiator
            if (this.isInitiator && this.renegotiationCount < this.RENEGOTIATION_ATTEMPTS) {
                this.renegotiationCount++;
                try {
                    const offer = await this.peerConnection.createOffer();
                    await this.peerConnection.setLocalDescription(offer);
                    // Here you would send the offer through your signaling channel
                } catch (error) {
                    if (DEBUG.network) {
                        console.error('Renegotiation failed:', error);
                    }
                }
            }
        });

        this.peerConnection.addEventListener('icegatheringstatechange', () => {
            if (DEBUG.network) {
                console.log('ICE gathering state changed:', {
                    state: this.peerConnection.iceGatheringState,
                    connectionState: this.connectionState
                });
            }
        });

        this.peerConnection.addEventListener('signalingstatechange', () => {
            if (DEBUG.network) {
                console.log('Signaling state changed:', {
                    state: this.peerConnection.signalingState,
                    connectionState: this.connectionState
                });
            }
        });

        this.peerConnection.addEventListener('datachannel', (event) => {
            this.setupDataChannel(event.channel);
        });
    }

    private handleConnectionStateChange(isRenegotiation: boolean = false): void {
        const state = this.peerConnection.connectionState as ConnectionState;
        this.connectionState = state;
        
        if (DEBUG.network) {
            console.log(`WebRTC connection state changed to: ${state}`, {
                iceState: this.peerConnection.iceConnectionState,
                signalingState: this.peerConnection.signalingState,
                dataChannelState: this.dataChannel?.readyState
            });
        }

        // Notify state change first
        this.onConnectionStateChange?.(state);

        // For failed state, handle error without throwing
        if (state === 'failed') {
            if (!isRenegotiation && this.renegotiationCount < this.RENEGOTIATION_ATTEMPTS) {
                // Try to recover through renegotiation
                if (DEBUG.network) {
                    console.log('Attempting connection recovery through renegotiation');
                }
                this.peerConnection.restartIce();
                this.handleConnectionStateChange(true);
            } else {
                NetworkErrorHandler.handle(new NetworkError(
                    NetworkErrorType.PEER_CONNECTION_FAILED,
                    { 
                        state,
                        iceState: this.peerConnection.iceConnectionState,
                        signalingState: this.peerConnection.signalingState,
                        dataChannelState: this.dataChannel?.readyState,
                        renegotiationAttempts: this.renegotiationCount
                    },
                    true // Make it recoverable
                ));
            }
        }
    }

    private setupDataChannel(channel: RTCDataChannel | null): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!channel) {
                reject(new NetworkError(
                    NetworkErrorType.DATA_CHANNEL_ERROR,
                    { error: 'Null data channel provided' },
                    false
                ));
                return;
            }

            try {
                if (DEBUG.network) {
                    console.log('Setting up data channel:', {
                        id: channel.id,
                        label: channel.label,
                        state: channel.readyState,
                        ordered: channel.ordered,
                        maxRetransmits: channel.maxRetransmits
                    });
                }

                this.dataChannel = channel;
                channel.binaryType = 'arraybuffer';  // Use ArrayBuffer for binary messages

                channel.addEventListener('open', () => {
                    this.onDataChannelOpen?.();
                    if (DEBUG.network) {
                        console.log('Data channel opened:', {
                            channelId: channel.id,
                            state: channel.readyState,
                            reliable: channel.ordered,
                            maxRetransmits: channel.maxRetransmits,
                            negotiated: channel.negotiated,
                            protocol: channel.protocol
                        });
                    }
                    resolve();
                });

                channel.addEventListener('close', async () => {
                    this.onDataChannelClose?.();
                    if (DEBUG.network) {
                        console.log('Data channel closed:', {
                            channelId: channel.id,
                            state: channel.readyState,
                            bufferedAmount: channel.bufferedAmount,
                            connectionState: this.peerConnection.connectionState,
                            iceState: this.peerConnection.iceConnectionState
                        });
                    }

                    // Only attempt reconnect if main connection is still viable
                    if (this.peerConnection.connectionState === 'connected' && 
                        this.peerConnection.iceConnectionState === 'connected') {
                        if (DEBUG.network) {
                            console.log('Attempting to re-establish data channel');
                        }
                        
                        // Retry with backoff
                        try {
                            await NetworkErrorHandler.retry(
                                async () => {
                                    await this.setupDataChannel(this.peerConnection.createDataChannel('gameData', {
                                        ordered: false,
                                        maxRetransmits: 0
                                    }));
                                },
                                5, // max attempts
                                2000, // initial delay
                                NetworkErrorType.DATA_CHANNEL_ERROR
                            );
                        } catch (error) {
                            // Log but don't throw - let connection state change handle it
                            if (DEBUG.network) {
                                console.error('Failed to re-establish data channel:', error);
                            }
                        }
                    }
                });

                /*if (DEBUG.network) {
                    channel.addEventListener('bufferedamountlow', () => {
                        console.log('Data channel buffer low:', {
                            channelId: channel.id,
                            bufferedAmount: channel.bufferedAmount,
                            threshold: channel.bufferedAmountLowThreshold
                        });
                    });
                }*/

                channel.addEventListener('error', async (event: RTCErrorEvent) => {
                    if (DEBUG.network) {
                        console.error('Data channel error:', {
                            event,
                            channelState: channel.readyState,
                            connectionState: this.peerConnection.connectionState,
                            iceState: this.peerConnection.iceConnectionState
                        });
                    }
                    
                    // Only attempt recovery if main connection is still good
                    if (this.peerConnection.connectionState === 'connected' && 
                        this.peerConnection.iceConnectionState === 'connected') {
                        if (DEBUG.network) {
                            console.log('Attempting to recover from data channel error');
                        }
                        try {
                            await NetworkErrorHandler.retry(
                                async () => {
                                    await this.setupDataChannel(this.peerConnection.createDataChannel('gameData', {
                                        ordered: false,
                                        maxRetransmits: 0
                                    }));
                                },
                                3, // max attempts
                                1000, // initial delay
                                NetworkErrorType.DATA_CHANNEL_ERROR
                            );
                        } catch (error) {
                            // Let connection state change handle persistent failures
                            if (DEBUG.network) {
                                console.error('Failed to recover data channel:', error);
                            }
                        }
                    }
                    // Don't reject - let connection state change handle it
                });

                channel.addEventListener('message', this.handleMessage.bind(this));
            } catch (error) {
                reject(new NetworkError(
                    NetworkErrorType.DATA_CHANNEL_ERROR,
                    { error },
                    false
                ));
            }
        });
    }

    private async handleMessage(event: MessageEvent<ArrayBuffer>): Promise<void> {
        try {
            if (DEBUG.network) {
                console.log('Received message:', {
                    size: event.data.byteLength,
                    channelId: this.dataChannel?.id,
                    channelState: this.dataChannel?.readyState
                });
            }

            // Decode message using worker pool
            const decodedBuffer = await this.workerPool.processMessage('decode', event.data);
            if (DEBUG.network) {
                console.log('Decoded message buffer:', decodedBuffer);
            }
            const decodedData = JSON.parse(new TextDecoder().decode(decodedBuffer));
            const message = decodedData;

            if (DEBUG.network) {
                console.log('Decoded message:', {
                    type: MessageType[message.type],
                    hasHandler: this.messageHandlers.has(message.type)
                });
            }

            const handler = this.messageHandlers.get(message.type);
            if (handler) {
                handler(message.data);
            } else if (DEBUG.network) {
                console.warn('No handler for message type:', MessageType[message.type]);
            }
        } catch (error) {
            if (DEBUG.network) {
                console.error('Failed to handle message:', {
                    error,
                    dataSize: event.data.byteLength,
                    channelState: this.dataChannel?.readyState
                });
            }
            throw new NetworkError(
                NetworkErrorType.INVALID_MESSAGE,
                { error, data: event.data },
                true
            );
        }
    }

    // No queue methods needed

    public async createOffer(): Promise<RTCSessionDescriptionInit> {
        try {
            // Data channel should already exist from constructor
            if (!this.dataChannel) {
                throw new NetworkError(
                    NetworkErrorType.DATA_CHANNEL_ERROR,
                    { error: 'No data channel available for offer' },
                    false
                );
            }

            // Create and set local description
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            if (DEBUG.network) {
                console.log('Created offer:', {
                    dataChannelState: this.dataChannel.readyState,
                    signalingState: this.peerConnection.signalingState,
                    iceGatheringState: this.peerConnection.iceGatheringState
                });
            }

            // Wait for ICE gathering with progressive timeouts
            const gatheringPromise = new Promise<RTCSessionDescriptionInit>((resolve, reject) => {
                let timeoutDuration = 15000; // Initial 15-second timeout
                let hasCandidates = false;

                const timeout = setTimeout(() => {
                    if (DEBUG.network) {
                        console.warn('ICE gathering timeout - checking candidate status');
                    }

                    // If we have any candidates, use what we've got
                    if (hasCandidates && this.peerConnection.localDescription) {
                        if (DEBUG.network) {
                            console.log('Using partial ICE candidate set');
                        }
                        resolve(this.peerConnection.localDescription);
                    } else {
                        // No candidates at all - try waiting a bit longer
                        const extendedTimeout = setTimeout(() => {
                            if (DEBUG.network) {
                                console.warn('Extended ICE gathering timeout - using current state');
                            }
                            if (this.peerConnection.localDescription) {
                                resolve(this.peerConnection.localDescription);
                            } else {
                                reject(new Error('No local description after extended timeout'));
                            }
                        }, 8000); // Additional 8 seconds

                        // Clear extended timeout if we get candidates during extension
                        this.peerConnection.addEventListener('icecandidate', event => {
                            if (event.candidate) {
                                clearTimeout(extendedTimeout);
                                hasCandidates = true;
                            }
                        });
                    }
                }, timeoutDuration);

                const checkState = () => {
                    if (this.peerConnection.iceGatheringState === 'complete' && this.peerConnection.localDescription) {
                        clearTimeout(timeout);
                        if (DEBUG.network) {
                            console.log('ICE gathering completed normally');
                        }
                        resolve(this.peerConnection.localDescription);
                    } else if (this.peerConnection.connectionState === 'failed') {
                        clearTimeout(timeout);
                        reject(new Error('Connection failed during ICE gathering'));
                    } else {
                        // Keep track if we have any candidates
                        if (this.peerConnection.localDescription?.sdp?.includes('a=candidate')) {
                            hasCandidates = true;
                        }
                        setTimeout(checkState, 100);
                    }
                };
                checkState();
            });

            return await gatheringPromise;
        } catch (error) {
            throw new NetworkError(
                NetworkErrorType.PEER_CONNECTION_FAILED,
                { error, operation: 'createOffer' },
                true
            );
        }
    }

    public async createAnswer(): Promise<RTCSessionDescriptionInit> {
        try {
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            return answer;
        } catch (error) {
            throw new NetworkError(
                NetworkErrorType.PEER_CONNECTION_FAILED,
                { error, operation: 'createAnswer' },
                true
            );
        }
    }

    public async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
        // Add state validation
        if (this.peerConnection.signalingState === 'closed') {
            throw new NetworkError(
                NetworkErrorType.PEER_CONNECTION_FAILED,
                { error: 'Connection closed', operation: 'setRemoteDescription' },
                false
            );
        }

        // Add retry with backoff
        return NetworkErrorHandler.retry(
            async () => {
                try {
                    await this.peerConnection.setRemoteDescription(description);
                } catch (error) {
                    if (DEBUG.network) {
                        console.error('setRemoteDescription failed:', {
                            signalingState: this.peerConnection.signalingState,
                            connectionState: this.peerConnection.connectionState,
                            iceGatheringState: this.peerConnection.iceGatheringState,
                            error
                        });
                    }
                    throw error;
                }
            },
            3, // max attempts
            1000, // initial delay
            NetworkErrorType.PEER_CONNECTION_FAILED
        );
    }

    public async addIceCandidate(candidate: RTCIceCandidate): Promise<void> {
        try {
            await this.peerConnection.addIceCandidate(candidate);
        } catch (error) {
            throw new NetworkError(
                NetworkErrorType.ICE_CONNECTION_FAILED,
                { error, candidate },
                true
            );
        }
    }

    public sendRaw(data: ArrayBuffer, priority: number = 1): void {
        if (!this.dataChannel) {
            if (DEBUG.network) {
                console.warn('Cannot send message - data channel not created yet');
            }
            return;
        }
        
        if (this.dataChannel.readyState !== 'open') {
            if (DEBUG.network) {
                console.warn('Cannot send - data channel state:', {
                    state: this.dataChannel.readyState,
                    connectionState: this.connectionState
                });
            }
            return;
        }

        try {
            this.dataChannel.send(data);
        } catch (error) {
            if (DEBUG.network) {
                console.warn('Failed to send raw data:', { error });
            }
            throw new NetworkError(
                NetworkErrorType.DATA_CHANNEL_ERROR,
                { error },
                true
            );
        }
    }

    public async send(type: MessageType, data: any, priority: number = 1): Promise<void> {
        if (!this.dataChannel) {
            if (DEBUG.network) {
                console.warn('Cannot send message - data channel not created yet');
            }
            return;
        }
        
        if (this.dataChannel.readyState !== 'open') {
            if (DEBUG.network) {
                console.warn('Cannot send - data channel state:', {
                    state: this.dataChannel.readyState,
                    type: MessageType[type],
                    connectionState: this.connectionState
                });
            }
            return;
        }

        try {
            if (DEBUG.network) {
                console.log('Sending message:', {
                    type: MessageType[type],
                    priority,
                    channelState: this.dataChannel.readyState,
                    connectionState: this.connectionState,
                    channelId: this.dataChannel.id
                });
            }
            
            // Encode message using worker pool
            const messageData = { messageType: type, messageData: data };
            const encodedData = await this.workerPool.processMessage(
                'encode',
                new TextEncoder().encode(JSON.stringify(messageData)).buffer
            );

            this.sendRaw(encodedData, priority);
        } catch (error) {
            if (DEBUG.network) {
                console.warn('Failed to send message:', { error, type: MessageType[type] });
            }
            throw new NetworkError(
                NetworkErrorType.DATA_CHANNEL_ERROR,
                { error, type, data },
                true
            );
        }
    }

    public onMessage(type: MessageType, handler: (data: any) => void): void {
        this.messageHandlers.set(type, handler);
    }

    public onIceCandidate?: (candidate: RTCIceCandidate) => void;
    public onDataChannelOpen?: () => void;
    public onDataChannelClose?: () => void;
    public onConnectionStateChange?: (state: ConnectionState) => void;

    public getState(): ConnectionState {
        return this.connectionState;
    }

    public isDataChannelOpen(): boolean {
        return this.dataChannel?.readyState === 'open';
    }

    private async handleNetworkChange(isOnline: boolean): Promise<void> {
        const wasOnline = this.networkOnline;
        this.networkOnline = isOnline;

        // When coming back online
        if (!wasOnline && isOnline) {
            if (DEBUG.network) {
                console.log('Network connection restored, reinitializing WebRTC connection');
            }
            // Wait for network stability
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (this.peerConnection) {
                // Clean up old connection
                this.peerConnection.close();
                // Create fresh connection
                this.peerConnection = this.createPeerConnection();
                this.setupPeerConnectionHandlers();
            }
        }
    }

    public close(): void {
        // Remove network handlers
        window.removeEventListener('online', this.networkHandlers.online);
        window.removeEventListener('offline', this.networkHandlers.offline);

        // Clear stats monitoring
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = undefined;
        }
        this.connectionStats = { timestamp: 0 };

        // Clean up network connections
        this.dataChannel?.close();
        this.peerConnection.close();
        this.connectionState = 'closed';

        // Terminate worker pool
        this.workerPool.terminate();

        // Clear message handlers
        this.messageHandlers.clear();
    }
}

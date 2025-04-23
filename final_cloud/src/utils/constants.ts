import { NETWORK_CONFIG as SharedNetworkConfig, PHYSICS_CONFIG as SharedPhysicsConfig, NETWORK_ID_FORMAT } from './sharedConstants';

// Environment validation
function requireEnvVar(name: string, fallback?: string): string {
    const value = import.meta.env[name];
    if (!value && !fallback) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value || fallback || '';
}

// Network configuration
export const SIGNALING_SERVER_URL = requireEnvVar('VITE_SIGNALING_SERVER_URL', 'ws://localhost:9000');

// WebRTC configuration
export const WEBRTC_CONFIG = {
    turnServer: {
        username: requireEnvVar('VITE_TURN_SERVER_USERNAME', 'your_username'),
        credential: requireEnvVar('VITE_TURN_SERVER_CREDENTIAL', 'your_credential'),
        urls: [
            'turn:43.208.156.216:3478?transport=udp',  // Using IP directly
            'turn:43.208.156.216:3478?transport=tcp'   // Adding TCP fallback
        ]
    },
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10,
    iceServersTimeout: 15000,     // 15 seconds for ICE gathering
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
    ]
};

// Debug settings
export const DEBUG = {
    enabled: import.meta.env.VITE_ENABLE_DEBUG === 'true',
    physics: import.meta.env.VITE_DEBUG_PHYSICS === 'true',
    network: import.meta.env.VITE_DEBUG_NETWORK === 'true',
    peerConnection: true // Always log peer connection attempts
};

// Re-export shared configs with browser-specific additions
export const NETWORK_CONFIG = {
    ...SharedNetworkConfig,
    maxPeerConnections: Number(import.meta.env.VITE_MAX_PEER_CONNECTIONS || 10),
    updateInterval: Number(import.meta.env.VITE_UPDATE_INTERVAL || 16.667), // 60 FPS base interval
    reconnectAttempts: Number(import.meta.env.VITE_RECONNECT_ATTEMPTS || 5),
    reconnectDelay: Number(import.meta.env.VITE_RECONNECT_DELAY || 1000),
    positionSyncInterval: Number(import.meta.env.VITE_POSITION_SYNC_INTERVAL || 50),  // Increased to reduce network load
    dragSyncInterval: Number(import.meta.env.VITE_DRAG_SYNC_INTERVAL || 50),  // Match position sync interval
    clickThrottle: 100,
    initialStateTimeout: Number(import.meta.env.VITE_INITIAL_STATE_TIMEOUT || 10000),
    initialStateRetryCount: Number(import.meta.env.VITE_INITIAL_STATE_RETRIES || 3),
    initialStateRetryDelay: Number(import.meta.env.VITE_INITIAL_STATE_RETRY_DELAY || 2000),
    reliableMessageTimeout: Number(import.meta.env.VITE_RELIABLE_MESSAGE_TIMEOUT || 5000),
    maxQueuedMessages: Number(import.meta.env.VITE_MAX_QUEUED_MESSAGES || 1000),
    physicsTimestep: 1000 / 60,  // Fixed 60 FPS physics timestep
    roundingPrecision: 100,      // Round positions to 2 decimal places
    syncInterval: 50,            // 50ms periodic sync interval for smoother updates
    workerTimeout: 5000         // 5 second timeout for worker operations
};

// Browser-specific configuration
export const CLOUD_CONFIG = {
    maxBodies: Number(import.meta.env.VITE_MAX_BODIES || 100),
    textStyle: {
        font: '16px Arial',
        fill: '#000000'
    },
    initialSpeed: 3,  // Reduced initial speed for better control
    padding: 20,
    defaultRoomSettings: {
        maxTexts: 50,  // Default max texts per room
        maxUsers: 10   // Default max users per room
    }
};

// Re-export shared physics config with browser-specific additions
export const PHYSICS_CONFIG = {
    ...SharedPhysicsConfig,
    bodies: {
        ...SharedPhysicsConfig.bodies,
        text: {
            offset: { x: 0, y: 0 }
        },
        boundaries: {
            thickness: 10,
            restitution: 0.8
        }
    }
};

// Browser-only canvas configuration
export const CANVAS_CONFIG = {
    background: 'transparent',
    showBroadphase: DEBUG.physics,
    showAxes: DEBUG.physics,
    showConvexHulls: DEBUG.physics,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
};

// Log configuration if debug is enabled
if (DEBUG.enabled) {
    console.log('Environment:', import.meta.env.MODE);
    console.log('Debug Settings:', DEBUG);
    console.log('Network Config:', NETWORK_CONFIG);
    console.log('Cloud Config:', CLOUD_CONFIG);
}

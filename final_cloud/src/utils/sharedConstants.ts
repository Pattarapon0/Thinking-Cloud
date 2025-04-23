// Network ID Format
export const NETWORK_ID_FORMAT = {
    PREFIX_LENGTH: 5,     // "text-"
    TIMESTAMP_LENGTH: 13, // Date.now()
    SEPARATOR_LENGTH: 1,  // "-"
    RANDOM_LENGTH: 9,     // random string
    TOTAL_LENGTH: 28      // total fixed length
};

// Shared configuration safe for workers
export const NETWORK_CONFIG = {
    NETWORK_ID_FORMAT,
    syncInterval: 50,           // 50ms periodic sync interval for smoother updates
    workerTimeout: 5000,        // 5 second timeout for worker operations
    physicsTimestep: 1000 / 60, // Fixed 60 FPS physics timestep
    roundingPrecision: 100,     // Round positions to 2 decimal places
    maxQueuedMessages: 1000,    // Maximum queued messages
    reliableMessageTimeout: 5000 // Message timeout
};

// Physics configuration (safe for workers)
export const PHYSICS_CONFIG = {
    world: {
        gravity: { x: 0, y: 0 }
    },
    bodies: {
        density: 0.1,
        friction: 0,
        frictionAir: 0.0005,
        restitution: 0.7,
        speeds: {
            min: 2,    // Minimum speed - keep moving
            max: 8     // Maximum speed - prevent too fast
        }
    }
};

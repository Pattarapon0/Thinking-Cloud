import uWS from 'uWebSockets.js';
import { randomUUID } from 'crypto';


const port = process.env.PORT || 9000;
// Timeout and recovery configuration
const CONNECTION_SETTINGS = {
  IDLE_TIMEOUT: 120,               // WebSocket idle timeout in seconds
  STALE_CONNECTION_TIMEOUT: 30000, // 30 seconds before connection considered stale
  CLEANUP_INTERVAL: 10000,         // Check for stale connections every 10 seconds
  RECOVERY_ATTEMPTS: 5,            // Number of connection recovery attempts
  RECOVERY_DELAY: 4000,           // Delay between recovery attempts
  PING_INTERVAL: 30000            // Send ping every 30 seconds
};

const app = uWS.App();

// Store connected clients and rooms
const clients = new Map();
const rooms = new Map();

// Store peer connections being established
const pendingConnections = new Map();

// Setup ping interval for all clients
setInterval(() => {
  clients.forEach((ws, clientId) => {
    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch (error) {
      logError('Failed to send ping', { clientId, error });
    }
  });
}, CONNECTION_SETTINGS.PING_INTERVAL);
const allowedOrigins =  [
  'http://localhost:*',
  'http://host.docker.internal:*',
  'http://172.17.0.1:*',
  '.cloudfront.net',
  '.s3-website-*.amazonaws.com',
  '.s3.amazonaws.com'
]

const logError = (error, context) => {
  console.error(`[${new Date().toISOString()}] Error:`, {
    message: error.message || 'Unknown error',
    context,
    stack: error.stack
  });
};

const logInfo = (message, data) => {
  console.log(`[${new Date().toISOString()}] ${message}`, data || '');
};

// Room List Handler - For landing page
app.ws('/rooms-list', {
  compression: uWS.SHARED_COMPRESSOR,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: CONNECTION_SETTINGS.IDLE_TIMEOUT,
  upgrade: (res, req, context) => {
    const secWebSocketKey = req.getHeader('sec-websocket-key');
    const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
    const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');
    const origin = req.getHeader('origin'); // Good practice to check origin
    if (!origin || !allowedOrigins.some(allowed => 
      allowed.startsWith('http') ? origin.split(':')[0] === allowed.split(':')[0] : origin.endsWith(allowed)
    )) return res.writeStatus('403 Forbidden').end('Invalid origin', true);
    res.upgrade(
      {
        url: req.getUrl(), // Store the URL for later use if needed
      },
      secWebSocketKey,
      secWebSocketProtocol,
      secWebSocketExtensions,
      context
    );

  },
  open: (ws) => {
    try {
      const clientId = randomUUID();
      ws.id = clientId;
      ws.subscribe('rooms/list');

      // Send initial room list
      const roomList = Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        currentUsers: room.peers.size,
        maxUsers: room.maxUsers,
        hasPassword: !!room.password
      }));

      ws.send(JSON.stringify({
        type: 'room-list',
        rooms: roomList
      }));

      logInfo('List client connected', {
        clientId
      });
    } catch (error) {
      logError(error, { context: 'room_list_connection' });
    }
  },

  message: (ws, message) => {
    try {
      const data = JSON.parse(Buffer.from(message).toString());

      if (data.type === 'create-room') {
        const newRoom = {
          id: randomUUID(),
          name: data.name,
          maxUsers: data.maxUsers || 10, // Default from CLOUD_CONFIG.defaultRoomSettings
          maxTexts: data.maxTexts || 50, // Default from CLOUD_CONFIG.defaultRoomSettings
          password: data.password,
          peers: new Set(),
          createdAt: new Date()
        };
        rooms.set(newRoom.id, newRoom);

        const roomInfo = {
          id: newRoom.id,
          name: newRoom.name,
          currentUsers: 0,
          maxUsers: newRoom.maxUsers,
          hasPassword: !!newRoom.password
        };

        // Send success to creator with room data, password and settings
        ws.send(JSON.stringify({
          type: 'room-create-success',
          room: roomInfo,
          password: newRoom.password,
          roomSettings: {
            maxTexts: newRoom.maxTexts,
            maxUsers: newRoom.maxUsers
          }
        }));

        // Publish new room to all landing page clients
        ws.publish('rooms/list', JSON.stringify({
          type: 'room-created',
          room: roomInfo
        }));

        logInfo('Room created', {
          roomId: newRoom.id,
          name: newRoom.name
        });
      }
      if (data.type === 'enter-room') {
        const roomId = data.roomId;
        const room = rooms.get(roomId);
        const password = data.password || null; // Default to null if not provided
        if (!room) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'room-not-found'
          }));
          return;
        }
        else if (room.password && room.password !== password) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'invalid-password'
          }));
          return;
        }
        else if (room.maxUsers && room.peers.size >= room.maxUsers) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'room-full'
          }));
          return;
        }
        // If room exists and password is correct (or not set), send success message
          ws.send(JSON.stringify({
            type: 'room-enter-success',
              roomId: room.id,
              password: room.password,
          }));
          logInfo('enter room ', { roomId });
          return;
      }
    } catch (error) {
      logError(error, { context: 'room_list_message' });
      ws.send(JSON.stringify({
        type: 'error',
        error: 'invalid-message'
      }));
    }
  },

  close: (ws) => {
    logInfo('List client disconnected', {
      clientId: ws.id
    });
  }
});

// Room Handler - For room connections

app.ws('/room/:roomId', {
  /* WebSocket behavior */
  compression: uWS.SHARED_COMPRESSOR,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: CONNECTION_SETTINGS.IDLE_TIMEOUT,

  /* --- UPGRADE HANDLER --- */
  // This runs BEFORE the WebSocket connection is established.
  // It handles the initial HTTP Upgrade request.
  upgrade: (res, req, context) => {
    const roomId = req.getParameter(0); // Extract ':roomId' from URL
    const secWebSocketKey = req.getHeader('sec-websocket-key');
    const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
    const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');
    const origin = req.getHeader('origin'); // Good practice to check origin

    logInfo('Upgrade request received', { roomId, origin });

    // --- Validation ---
    // 1. Basic Room ID Check (add more specific checks if needed)
    if (!roomId) {
      logError('Upgrade failed: Missing roomId parameter');
      // You MUST respond to the HTTP request if upgrade fails
      res.writeStatus('400 Bad Request').end('Missing room ID', true);
      return; // Stop processing
    }

    //2. Check Origin Header for security
   
    if (!origin || !allowedOrigins.some(allowed => 
      allowed.startsWith('http') ? origin.split(':')[0] === allowed.split(':')[0] : origin.endsWith(allowed)
    )) return res.writeStatus('403 Forbidden').end('Invalid origin', true);

 
    /* --- Perform Upgrade --- */
    // Pass data to the WebSocket context. This data will be available
    // in open, message, close via ws.getUserData().
    res.upgrade(
      {
        // Store the extracted data needed by other handlers
        roomId: roomId,
        // You could add other things extracted from req here if needed
        // e.g., authenticated userId from headers/cookies
        // userId: extractUserIdFromRequest(req),
      },
      secWebSocketKey,
      secWebSocketProtocol,
      secWebSocketExtensions,
      context
    );
    // Note: No 'return' needed here, res.upgrade handles the response.
  },

  /* --- OPEN HANDLER --- */
  // Runs AFTER the WebSocket connection is established.
  open: (ws) => {
    try {
      // Retrieve the data passed from the upgrade handler
      const userData = ws.getUserData();
      const roomId = userData.roomId;
      // const userId = userData.userId; // If you passed userId in upgrade

      // Generate a unique ID for this specific connection
      const clientId = randomUUID();
      ws.id = clientId; // Attach the ID to the WebSocket object itself for easy access

      // --- Room Logic ---
      const room = rooms.get(roomId);

      if (!room) {
        logError('Client connection failed: Room not found', { clientId, roomId });
        ws.send(JSON.stringify({ type: 'error', error: 'room-not-found' }), false, true); // isBinary=false, compress=true
        ws.close();
        return;
      }

      // Check if room is full
      if (room.peers.size >= room.maxUsers) {
        logInfo('Client connection failed: Room full', { clientId, roomId, size: room.peers.size, max: room.maxUsers });
        ws.send(JSON.stringify({ type: 'error', error: 'room-full' }), false, true);
        ws.close();
        return;
      }

      // --- Success ---
      logInfo('Room client connected', { clientId, roomId, peersCount: room.peers.size + 1 });

      // Subscribe this WebSocket to the room's topic for broadcasts
      ws.subscribe(`rooms/${roomId}/peers`);

      // Add client to local tracking
      clients.set(clientId, ws);
      room.peers.add(clientId);

      // Send current peer list (excluding self) and room settings to the new client
      ws.send(JSON.stringify({ 
        type: 'init', 
        peerId: clientId,
        roomSettings: {
          maxTexts: room.maxTexts,
          maxUsers: room.maxUsers
        }
      }), false, true);

      // Publish peer joined event to OTHERS in the room
      // Note: publish often doesn't send to the publisher itself by default
      // We send the peer list separately above, so this is okay.
      app.publish(`rooms/${roomId}/peers`, JSON.stringify({
        type: 'peer-join',
        peerId: clientId
      }), false, true); // Publish as text, compress

      // Update general room list subscribers (if you have a lobby system)
      app.publish('rooms/list', JSON.stringify({
        type: 'room-updated',
        roomId,
        currentUsers: room.peers.size
      }), false, true);

    } catch (error) {
      logError(error, { context: 'room_connection_open', wsId: ws.id });
      // Attempt to close gracefully if something unexpected happened
      try { ws.close(); } catch (e) { /* ignore close error */ }
    }
  },

  /* --- MESSAGE HANDLER --- */
  message: (ws, message, isBinary) => {
    try {
      // Retrieve context data and client ID
      const userData = ws.getUserData();
      const roomId = userData.roomId;
      const clientId = ws.id; // Get client ID attached in 'open'

      if (!roomId || !clientId) {
        logError('Message received from client without proper context', { hasRoomId: !!roomId, hasClientId: !!clientId });
        ws.close(); // Close connection if state is invalid
        return;
      }

      // Process message (ensure it's parsed correctly)
      let data;
      try {
        // Important: Assume message is ArrayBuffer, convert to string for JSON
        const messageString = Buffer.from(message).toString();
        data = JSON.parse(messageString);
        logInfo('Received message', { clientId, roomId, type: data.type, target: data.targetId });
      } catch (parseError) {
        logError('Failed to parse message JSON', { clientId, roomId, error: parseError });
        ws.send(JSON.stringify({ type: 'error', error: 'invalid-message-format' }), false, true);
        return;
      }


      // Example: WebRTC signaling logic
      if (['offer', 'answer', 'ice-candidate'].includes(data.type)) {
        if (data.targetId) {
          const targetClient = clients.get(data.targetId);
          if (targetClient) {
            // Add the sender's ID to the message before forwarding
            data.peerId = clientId;

            // Log signaling attempts
            if (data.type === 'offer') logInfo('Forwarding WebRTC offer', { from: clientId, to: data.targetId, roomId });
            if (data.type === 'answer') logInfo('Forwarding WebRTC answer', { from: clientId, to: data.targetId, roomId });
            if (data.type === 'ice-candidate') logInfo('Forwarding ICE candidate', { from: clientId, to: data.targetId, roomId });

            // Send the message directly to the target client
            // Pass isBinary and compress flags appropriately if needed
            targetClient.send(JSON.stringify(data), false, true);

            // Track/untrack pending connections (if necessary for your logic)
            if (data.type === 'offer') {
              pendingConnections.set(`${clientId}-${data.targetId}`, { initiator: clientId, receiver: data.targetId, timestamp: Date.now() });
            } else if (data.type === 'answer') {
              pendingConnections.delete(`${data.targetId}-${clientId}`); // Initiator first in key
            }

          } else {
            logInfo('Message target client not found', { clientId, roomId, targetId: data.targetId });
            // Optionally notify sender that target is gone
            ws.send(JSON.stringify({ type: 'error', error: 'peer-not-found', peerId: data.targetId }), false, true);
          }
        } else {
          logError('Signaling message missing targetId', { clientId, roomId, type: data.type });
          ws.send(JSON.stringify({ type: 'error', error: 'missing-target-id' }), false, true);
        }
        // Handle other message types if needed
      } else if (data.type === 'join') {
        // Re-validate password IF the join message is part of your flow
        // (Often password check is done via HTTP before upgrade)
        const room = rooms.get(roomId);
        if (room && room.password && room.password !== data.password) {
          logInfo('Invalid password attempt post-connection', { clientId, roomId });
          ws.send(JSON.stringify({ type: 'error', error: 'invalid-password' }), false, true);
          ws.close();
        } else {
          // Acknowledge successful join if needed
        }
      } else {
        logInfo('Received unhandled message type', { clientId, roomId, type: data.type });
        // Optionally send an error for unknown message types
        // ws.send(JSON.stringify({ type: 'error', error: 'unknown-message-type' }), false, true);
      }

    } catch (error) {
      logError(error, { context: 'room_message', wsId: ws.id });
      // Avoid crashing the server on a bad message; inform client if possible
      try {
        ws.send(JSON.stringify({ type: 'error', error: 'server-error-processing-message' }), false, true);
      } catch (e) { /* ignore if send fails */ }
    }
  },

  /* --- CLOSE HANDLER --- */
  // Runs when the WebSocket connection closes for any reason.
  close: (ws, code, message) => {
    try {
      // Retrieve context data and client ID (might fail if open didn't complete)
      const userData = ws.getUserData() || {}; // Use default object if getUserData fails
      const roomId = userData.roomId;
      const clientId = ws.id; // Get ID attached in 'open'

      logInfo('Room client disconnected', { clientId: clientId || 'unknown', roomId: roomId || 'unknown', code });

      // Guard against missing clientId (if connection failed before 'open' completed fully)
      if (!clientId) {
        logError('Client disconnected without a clientId assigned');
        return; // Nothing more to do if we don't know who it was
      }

      // Remove from global client list
      clients.delete(clientId);

      // Clean up pending WebRTC connections involving this client
      for (const [key, conn] of pendingConnections) {
        if (conn.initiator === clientId || conn.receiver === clientId) {
          pendingConnections.delete(key);
          logInfo('Cleaned up pending WebRTC connection', { key });
        }
      }

      // Guard against missing roomId (less likely if upgrade worked, but good practice)
      if (!roomId) {
        logError('Client disconnected without roomId in context', { clientId });
        return; // Cannot update room state without roomId
      }

      // Remove client from the specific room
      const room = rooms.get(roomId);
      if (room) {
        const deleted = room.peers.delete(clientId);

        if (deleted) { // Only publish/update if they were actually in the room set
          logInfo('Removed peer from room', { clientId, roomId, peersRemaining: room.peers.size });

          // Publish peer left event to OTHERS remaining in the room
          app.publish(`rooms/${roomId}/peers`, JSON.stringify({
            type: 'peer-leave',
            peerId: clientId
          }), false, true);

          // Always update the room list about peer count changes
          app.publish('rooms/list', JSON.stringify({
            type: 'room-updated',
            roomId,
            currentUsers: room.peers.size
          }), false, true);
          // If room is now empty, remove it entirely
          if (room.peers.size === 0) {
            rooms.delete(roomId);
            logInfo('Room empty, deleting room', { roomId });
            // Notify room list subscribers that the room is gone
            app.publish('rooms/list', JSON.stringify({
              type: 'room-deleted',
              roomId
            }), false, true);
          }
        } else {
          logInfo('Client closed connection but was not found in room peer set', { clientId, roomId });
        }
      } else {
        logInfo('Client closed connection for a room that no longer exists', { clientId, roomId });
      }

    } catch (error) {
      logError(error, { context: 'room_close', wsId: ws ? ws.id : 'unknown' });
    }
  }
});
// Clean up stale pending connections
const STALE_CONNECTION_TIMEOUT = CONNECTION_SETTINGS.STALE_CONNECTION_TIMEOUT;
const CLEANUP_INTERVAL = CONNECTION_SETTINGS.CLEANUP_INTERVAL;

setInterval(() => {
  const now = Date.now();
  for (const [key, conn] of pendingConnections) {
    const age = now - conn.timestamp;
    
    // If connection is getting old but not yet stale, try to recover
    if (age > STALE_CONNECTION_TIMEOUT * 0.7) {
      let recoveryAttempts = 0;
      const attemptRecovery = async () => {
        if (recoveryAttempts >= CONNECTION_SETTINGS.RECOVERY_ATTEMPTS) {
          logInfo('Max recovery attempts reached', { connectionKey: key });
          return;
        }
        
        recoveryAttempts++;
        const initiatorClient = clients.get(conn.initiator);
        const receiverClient = clients.get(conn.receiver);

        if (initiatorClient && receiverClient) {
          logInfo('Connection aging, attempting recovery', {
            connectionKey: key,
            age: age,
            attempt: recoveryAttempts,
            initiatorState: initiatorClient.connectionState,
            receiverState: receiverClient.connectionState
          });

          // Try to re-trigger ICE negotiation
          try {
            initiatorClient.send(JSON.stringify({
              type: 'renegotiate',
              targetId: conn.receiver,
              attempt: recoveryAttempts
            }));

            // Schedule next recovery attempt if needed
            setTimeout(() => {
              if (pendingConnections.has(key)) {
                attemptRecovery();
              }
            }, CONNECTION_SETTINGS.RECOVERY_DELAY);

          } catch (error) {
            logError('Recovery attempt failed', { error, connectionKey: key, attempt: recoveryAttempts });
          }
        }
      };

      // Start recovery process
      attemptRecovery();
    }

    // Remove connections older than timeout
    if (age > STALE_CONNECTION_TIMEOUT) {
      pendingConnections.delete(key);
      logInfo('Removed stale connection', {
        connectionKey: key,
        age: age,
        timeout: STALE_CONNECTION_TIMEOUT
      });

      // Notify peers about the cleanup
      const initiatorClient = clients.get(conn.initiator);
      const receiverClient = clients.get(conn.receiver);

      if (initiatorClient) {
        initiatorClient.send(JSON.stringify({
          type: 'connection-timeout',
          peerId: conn.receiver
        }));
      }
      if (receiverClient) {
        receiverClient.send(JSON.stringify({
          type: 'connection-timeout',
          peerId: conn.initiator
        }));
      }
    }
  }
}, CLEANUP_INTERVAL);

app.listen('0.0.0.0', port, (token) => {
  // ... rest of your callback logic
  if (token) {
    console.log(`Signaling server running on 0.0.0.0:${port}`);
  } else {
    console.error(`Failed to start signaling server on 0.0.0.0:${port}`);
    process.exit(1);
  }
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nShutting down signaling server...');
  clients.forEach((ws) => {
    ws.end(1001, 'Server shutting down');
  });
  process.exit(0);
});

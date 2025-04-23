# Cloud Game Frontend

A multiplayer browser game using WebRTC for peer-to-peer connections.

## Features

- Real-time multiplayer interaction
- WebRTC peer-to-peer connections
- Physics-based gameplay
- Room management system
- Network quality monitoring
- Sound effects

## Tech Stack

- TypeScript
- Vite
- Matter.js for physics
- WebRTC for peer connections
- Web Workers for binary protocol

## Project Structure

```
├── public/            # Static assets
│   ├── images/
│   └── sounds/       # Game sound effects
├── src/
│   ├── components/   # UI components
│   ├── networking/   # WebRTC & network code
│   ├── physics/      # Game physics
│   ├── utils/        # Utilities
│   └── workers/      # Web Workers
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment:
```bash
cp .env.example .env
```

3. Configure environment variables:
```env
# Local development
VITE_SIGNALING_SERVER_URL=ws://localhost:9000

# AWS deployment
#VITE_SIGNALING_SERVER_URL=ws://your-ecs-instance:9000

# TURN server (from your EC2)
VITE_TURN_SERVER_USERNAME="your_username"
VITE_TURN_SERVER_CREDENTIAL="your_password"
```

4. Start development server:
```bash
npm run dev
```

## Building

```bash
npm run build
```

Production files will be in the `dist` directory.

## Components

### Networking

- `SignalingClient.ts`: WebSocket connection to signaling server
- `WebRTCConnection.ts`: P2P connection management
- `NetworkManager.ts`: Overall network state
- `BinaryProtocol.ts`: Efficient binary message protocol

### Physics

- `engine.ts`: Matter.js physics setup
- `bodies.ts`: Game object definitions
- `CloudAnimation.ts`: Cloud movement animations

### UI Components

- `Cloud.ts`: Main game object
- `RoomPasswordModal.ts`: Room access control
- `NetworkStatus.ts`: Connection quality indicator
- `AddRoomButton.ts`: Room creation

## Web Workers

Binary protocol processing is offloaded to Web Workers for better performance:

- `BinaryWorker.ts`: Message encoding/decoding
- `WorkerPool.ts`: Worker thread management

## Network Architecture

1. Initial Connection:
   - Connect to signaling server
   - Receive room information
   - Establish WebRTC connections

2. Data Flow:
   - Game state synced via binary protocol
   - Position updates at configurable intervals
   - Reliable channel for important messages

3. Reconnection:
   - Automatic reconnect attempts
   - State recovery on reconnection
   - Progressive backoff

## AWS Deployment

See main README.md in the root directory for complete AWS deployment instructions using Terraform.

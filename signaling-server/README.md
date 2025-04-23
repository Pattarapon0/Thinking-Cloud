# WebRTC Signaling Server

A lightweight signaling server for WebRTC peer connections, built with uWebSockets.js.

## Requirements

- Node.js >= 18.0.0
- pnpm >= 8.0.0 (or npm/yarn)
- Docker (for AWS deployment)

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## AWS Deployment

The server is deployed to AWS ECS using the scripts in the `terraform` directory:

1. Initial deployment:
```bash
cd ../terraform
./deploy.sh
```

2. For updates/redeployment:
```bash
cd ../terraform
./redeploy.sh
```

The deployment scripts handle:
- Building Docker image
- Pushing to ECR
- Deploying to ECS
- Managing task definitions

## WebSocket Protocol

### Connection Events

- `init`: Initial connection event with peer ID
- `peer-join`: New peer connection
- `peer-leave`: Peer disconnection
- `offer`: WebRTC offer
- `answer`: WebRTC answer
- `ice-candidate`: ICE candidate exchange

### Message Format

```typescript
interface SignalingMessage {
    type: string;      // Message type
    targetId?: string; // Target peer ID
    senderId?: string; // Source peer ID
    data?: any;        // Message payload
}
```

## Docker

The server includes a Dockerfile for containerization:

```bash
# Build image
docker build -t signaling-server .

# Run container
docker run -p 9000:9000 signaling-server
```

See main README.md for complete AWS deployment instructions.

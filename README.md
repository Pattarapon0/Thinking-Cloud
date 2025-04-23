# Cloud Final Project - WebRTC Game

A multiplayer browser game using WebRTC for peer-to-peer connections with AWS infrastructure.

## Project Structure

```
├── final_cloud/         # Frontend application
├── signaling-server/    # WebSocket signaling server
└── terraform/          # AWS infrastructure code
```

## Prerequisites

- Node.js = ~22.0.0 
- AWS CLI installed and configured
- Docker installed
- Terraform installed
- AWS account with necessary permissions

## Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd cloud_final
```

2. Setup the frontend:
```bash
cd final_cloud
npm install
cp .env.example .env
```

3. Setup the signaling server:
```bash
cd ../signaling-server
npm install
```

## AWS Deployment

### 1. TURN Server Setup (EC2)

For reliable WebRTC connections, set up a TURN server:

1. Launch EC2 instance:
   - Ubuntu Server
   - t2.micro (free tier eligible)
   - Configure Security Group:
     ```
     TCP/UDP 3478 - STUN/TURN
     TCP/UDP 5349 - TURN over TLS/DTLS
     TCP/UDP 49152-65535 - Media relay
     TCP 22 - SSH
     ```

2. Install coturn:
```bash
sudo apt update
sudo apt install coturn
sudo systemctl enable coturn
```

3. Configure coturn (/etc/turnserver.conf):
```conf
# Basic coturn configuration
listening-port=3478
tls-listening-port=5349

# Allow any client to connect (development only)
no-auth

# Replace with your EC2's public IP
external-ip=<EC2_PUBLIC_IP>

# TURN server ports
min-port=49152
max-port=65535
realm=yourdomain.com

# For production, enable authentication:
# user=your_username:your_password
```

4. Start coturn:
```bash
sudo systemctl start coturn
```

### 2. AWS Infrastructure Deployment

1. Configure AWS credentials:
```bash
cd terraform
cp credentials.template credentials
# Edit credentials with your AWS access keys
```

2. Deploy backend infrastructure:
```bash
./deploy.sh
```
This script will:
- Initialize Terraform
- Create AWS resources (ECS, ECR, etc.)
- Build and push Docker image
- Deploy signaling server
- Output connection URLs

3. Deploy frontend:
```bash
./deploy-frontend.sh
```
This script will:
- Update frontend environment with WebSocket URL
- Build the frontend
- Deploy to S3 bucket
- Output the website URL

### Redeployment

To update the backend:
```bash
cd terraform
./redeploy.sh
```

To update the frontend:
```bash
cd terraform
./deploy-frontend.sh
```

### Cleanup

To remove all AWS resources:
```bash
cd terraform
./cleanup.sh
```

## Local Development

1. Start signaling server:
```bash
cd signaling-server
npm start
```

2. Start frontend:
```bash
cd final_cloud
npm run dev
```

## Architecture

- Frontend: Vite + TypeScript application
- Backend: WebSocket signaling server
- AWS Infrastructure:
  - ECS for container hosting
  - ECR for Docker images
  - S3 for static website hosting
  - EC2 for TURN server

## Important Notes

1. Security:
   - Keep AWS credentials secure
   - Don't commit .env files
   - Use authentication for TURN server in production

2. Costs:
   - Uses AWS free tier eligible resources
   - Monitor EC2, ECS, and S3 usage

3. Troubleshooting:
   - Check security group rules if connection fails
   - Verify TURN server is accessible
   - Monitor ECS service logs for issues
   - Use AWS CloudWatch for debugging

## Additional Documentation

- `final_cloud/README.md` - Frontend details
- `signaling-server/README.md` - WebSocket server info
- `terraform/README.md` - Infrastructure details

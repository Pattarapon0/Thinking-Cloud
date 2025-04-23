pn# Terraform Configuration for Cloud Game Project

This Terraform configuration deploys both backend (WebSocket signaling server) and frontend infrastructure.

## Prerequisites

1. AWS CLI installed and configured
2. Terraform installed
3. Docker installed
4. Node.js and npm installed
5. Permission to create AWS resources

## AWS Credentials Setup

1. Copy the credentials template:
```bash
cp credentials.template credentials
```

2. Edit the credentials file with your AWS access keys:
```ini
[default]
aws_access_key_id = YOUR_ACCESS_KEY_HERE
aws_secret_access_key = YOUR_SECRET_KEY_HERE
```

## Infrastructure Components

### Backend
- ECS Cluster running on EC2 (t2.micro)
- ECR Repository for Docker images
- WebSocket server (non-SSL)

### Frontend
- S3 bucket with static website hosting
- Public read access for website files
- HTTP endpoint (no SSL required)

## Deployment Steps

### 1. Deploy Backend Infrastructure
```bash
# Initialize and apply Terraform
terraform init
terraform apply

# Deploy signaling server
./deploy.sh
```

### 2. Deploy Frontend
```bash
# Deploy frontend to S3
./deploy-frontend.sh
```

The deploy-frontend.sh script will:
1. Get the WebSocket URL from backend
2. Update frontend environment variables
3. Build the frontend
4. Upload to S3 bucket
5. Display the website URL

## Accessing the Application

After deployment, you'll get:
1. Frontend URL: http://<bucket-name>.s3-website-<region>.amazonaws.com
2. WebSocket URL: ws://<ec2-instance>:9000

## File Structure

- `provider.tf` - AWS provider configuration
- `variables.tf` - Variable definitions
- `main.tf` - ECS and ECR resources
- `frontend.tf` - S3 website configuration
- `security.tf` - Security groups
- `iam.tf` - IAM roles and policies
- `outputs.tf` - Output values and helper commands
- `deploy.sh` - Backend deployment script
- `deploy-frontend.sh` - Frontend deployment script

## Development Workflow

1. Make changes to frontend code
2. Test locally with:
```bash
cd ../final_cloud
npm run dev
```

3. When ready to deploy:
```bash
cd ../terraform
./deploy-frontend.sh
```

## Cleanup

To destroy all resources:
```bash
terraform destroy
```

## Note
- Frontend uses HTTP to avoid mixed content issues with WebSocket
- Both frontend and backend use non-SSL endpoints
- Free tier eligible configuration

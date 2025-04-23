#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Function to check if command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
    else
        echo -e "${RED}✗ $1${NC}"
        exit 1
    fi
}

echo -e "${GREEN}Starting redeployment...${NC}"

# Get ECR URL from Terraform output
ECR_URL=$(terraform output -raw ecr_repository_url)
check_status "Get ECR URL"

# Step 1: Build new Docker image
echo -e "\n${GREEN}Step 1: Building Docker image...${NC}"
cd ../signaling-server
docker build -t signaling-server:latest .
check_status "Docker build"

# Step 2: Push to ECR
echo -e "\n${GREEN}Step 2: Pushing to ECR...${NC}"
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin $ECR_URL
check_status "ECR login"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker tag signaling-server:latest $ECR_URL:latest
docker tag signaling-server:latest $ECR_URL:$TIMESTAMP
check_status "Docker tag"

docker push $ECR_URL:latest
docker push $ECR_URL:$TIMESTAMP
check_status "Docker push"

# Step 3: Force new deployment
echo -e "\n${GREEN}Step 3: Forcing new deployment...${NC}"
cd ../terraform
CLUSTER_NAME=$(terraform output -raw ecs_cluster_name)
SERVICE_NAME="${var.app_name}-${var.environment}"

aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force-new-deployment
check_status "Force new deployment"

# Step 4: Wait for deployment
echo -e "\n${GREEN}Step 4: Waiting for deployment to stabilize...${NC}"
sleep 30

# Step 5: Get connection details
echo -e "\n${GREEN}Redeployment complete! Connection details:${NC}"
echo -e "WebSocket URL: $(terraform output -raw websocket_url)"
echo -e "Public IP: $(terraform output -raw instance_public_ip)"

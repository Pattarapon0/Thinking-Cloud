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

echo -e "${GREEN}Starting deployment...${NC}"

# Step 1: Terraform init and apply
echo -e "\n${GREEN}Step 1: Initializing Terraform...${NC}"
terraform init
check_status "Terraform init"

echo -e "\n${GREEN}Applying Terraform configuration...${NC}"
terraform apply -auto-approve
check_status "Terraform apply"

# Get ECR URL from Terraform output
ECR_URL=$(terraform output -raw ecr_repository_url)
check_status "Get ECR URL"

# Step 2: Build Docker image
echo -e "\n${GREEN}Step 2: Building Docker image...${NC}"
cd ../signaling-server
docker build -t signaling-server:latest .
check_status "Docker build"

# Step 3: Push to ECR
echo -e "\n${GREEN}Step 3: Pushing to ECR...${NC}"
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin $ECR_URL
check_status "ECR login"

docker tag signaling-server:latest $ECR_URL:latest
check_status "Docker tag"

docker push $ECR_URL:latest
check_status "Docker push"

# Step 4: Wait for deployment
echo -e "\n${GREEN}Step 4: Waiting for deployment...${NC}"
cd ../terraform
sleep 30

# Step 5: Get connection details
echo -e "\n${GREEN}Deployment complete! Connection details:${NC}"
echo -e "WebSocket URL: $(terraform output -raw websocket_url)"
echo -e "Public IP: $(terraform output -raw instance_public_ip)"

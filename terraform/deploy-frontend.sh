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

echo -e "${GREEN}Starting frontend deployment...${NC}"

# Get S3 bucket name and WebSocket URL from Terraform
S3_BUCKET=$(terraform output -raw s3_bucket_name)
WS_URL=$(terraform output -raw websocket_url)
check_status "Get deployment info"

# Update .env file
echo -e "\n${GREEN}Updating environment variables...${NC}"
cd ../final_cloud
echo "VITE_WS_URL=$WS_URL" > .env
check_status "Update .env"

# Install dependencies and build
echo -e "\n${GREEN}Building frontend...${NC}"
npm install
check_status "Install dependencies"

npm run build
check_status "Build frontend"

# Deploy to S3
echo -e "\n${GREEN}Deploying to S3...${NC}"
aws s3 sync dist/ "s3://$S3_BUCKET/" --delete
check_status "Upload to S3"

# Get URLs
cd ../terraform
FRONTEND_URL=$(terraform output -raw frontend_url)
WEBSOCKET_URL=$(terraform output -raw websocket_url)

echo -e "\n${GREEN}Deployment complete!${NC}"
echo -e "Frontend URL: ${FRONTEND_URL}"
echo -e "WebSocket URL: ${WEBSOCKET_URL}"
echo -e "\n${GREEN}Note: Your frontend is now accessible via HTTP, which will work with the WebSocket server.${NC}"

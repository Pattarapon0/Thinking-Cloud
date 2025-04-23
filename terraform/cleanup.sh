
#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
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

echo -e "${RED}Warning: This will destroy all resources. Are you sure? (y/N)${NC}"
read -r response

if [[ ! "$response" =~ ^[yY]$ ]]; then
    echo "Aborting..."
    exit 0
fi

# Get resource names
S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null)
CLUSTER_NAME=$(terraform output -raw ecs_cluster_name 2>/dev/null)
SERVICE_NAME="${var.app_name}-${var.environment}"

# Clean up S3 bucket first
if [ ! -z "$S3_BUCKET" ]; then
    echo -e "\n${YELLOW}Cleaning up S3 bucket...${NC}"
    aws s3 rm "s3://$S3_BUCKET" --recursive
    check_status "Empty S3 bucket"
fi

# Scale down ECS service
if [ ! -z "$CLUSTER_NAME" ]; then
    echo -e "\n${YELLOW}Scaling down ECS service...${NC}"
    aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --desired-count 0
    check_status "Scale down ECS service"
    
    # Wait for tasks to stop
    echo -e "\n${YELLOW}Waiting for tasks to stop...${NC}"
    sleep 30
fi

# Destroy infrastructure
echo -e "\n${YELLOW}Destroying infrastructure...${NC}"
terraform destroy -auto-approve
check_status "Destroy infrastructure"

echo -e "\n${GREEN}Cleanup complete!${NC}"
echo -e "All resources have been destroyed."

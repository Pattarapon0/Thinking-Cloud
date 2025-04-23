# ECR Repository URL
output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

# ECS Cluster Name
output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

# Get instance ID from autoscaling group
data "aws_instances" "ecs_instances" {
  instance_tags = {
    "AmazonECSManaged" = "true"
  }
  
  depends_on = [aws_autoscaling_group.ecs]
}

# Public IP
output "instance_public_ip" {
  value = length(data.aws_instances.ecs_instances.public_ips) > 0 ? data.aws_instances.ecs_instances.public_ips[0] : null
}

# WebSocket URL with actual IP
output "websocket_url" {
  value = length(data.aws_instances.ecs_instances.public_ips) > 0 ? "ws://${data.aws_instances.ecs_instances.public_ips[0]}:${var.container_port}" : null
}

# Helper commands
output "ecr_commands" {
  value = <<EOT
# Login to ECR:
aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.backend.repository_url}

# Tag your image:
docker tag signaling-server:latest ${aws_ecr_repository.backend.repository_url}:latest

# Push to ECR:
docker push ${aws_ecr_repository.backend.repository_url}:latest
EOT
}

# Frontend URLs and IDs
output "frontend_url" {
  value = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
  description = "S3 static website URL"
}

output "s3_bucket_name" {
  value = aws_s3_bucket.frontend.id
}

# Frontend deployment commands
output "frontend_deploy_commands" {
  value = <<EOT
# Build frontend:
cd ../final_cloud && npm run build

# Deploy to S3:
aws s3 sync dist/ s3://${aws_s3_bucket.frontend.id}/ --delete

# Open website:
echo "Website URL: http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
EOT
}

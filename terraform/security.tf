# Security Group for ECS instances
resource "aws_security_group" "ecs" {
  name        = "${var.app_name}-${var.environment}-ecs-sg"
  description = "Security group for ECS instances"
  vpc_id      = data.aws_vpc.default.id

  # WebSocket port
  ingress {
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "WebSocket access"
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  # Allow inbound traffic from within the security group
  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
    description = "Allow internal communication"
  }

  # Allow ECS agent port
  ingress {
    from_port   = 51678
    to_port     = 51678
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "ECS agent port"
  }

  # Allow ECS metrics port
  ingress {
    from_port   = 51679
    to_port     = 51679
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "ECS metrics port"
  }

  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-ecs-sg"
  })
}

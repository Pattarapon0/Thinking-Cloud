# ECS Instance Role
resource "aws_iam_role" "ecs_instance" {
  name = "${var.app_name}-${var.environment}-ecs-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-ecs-instance-role"
  })
}

# ECS Instance Profile
resource "aws_iam_instance_profile" "ecs" {
  name = "${var.app_name}-${var.environment}-ecs-instance-profile"
  role = aws_iam_role.ecs_instance.name
}

# Basic ECS Policy
resource "aws_iam_role_policy_attachment" "ecs_instance_policy" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

# ECR Access Policy
resource "aws_iam_role_policy_attachment" "ecs_ecr_policy" {
  role       = aws_iam_role.ecs_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

# Additional ECS Agent Policy
resource "aws_iam_role_policy" "ecs_agent" {
  name = "${var.app_name}-${var.environment}-ecs-agent-policy"
  role = aws_iam_role.ecs_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RegisterContainerInstance",
          "ecs:DeregisterContainerInstance",
          "ecs:UpdateContainerInstancesState",
          "ecs:StartTelemetrySession",
          "ecs:Submit*",
          "ecs:Poll",
          "ecs:StartTask",
          "ecs:StopTask",
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
      }
    ]
  })
}

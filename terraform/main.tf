# VPC Data Source
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Get latest ECS-optimized AMI
data "aws_ssm_parameter" "ecs_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2/recommended/image_id"
}

# ECR Repository
resource "aws_ecr_repository" "backend" {
  name = "${var.app_name}-${var.environment}"
  
  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-ecr"
  })
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-cluster"
  })
}

# ECS Task Definition
resource "aws_ecs_task_definition" "backend" {
  family                = "${var.app_name}-${var.environment}"
  network_mode          = "bridge"
  container_definitions = jsonencode([
    {
      name  = var.app_name
      image = "${aws_ecr_repository.backend.repository_url}:latest"
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
        }
      ]
      environment = [
        {
          name  = "PORT"
          value = tostring(var.container_port)
        },
        {
          name  = "NODE_ENV"
          value = var.environment
        }
      ]
      memory = 512
      cpu    = 512
      essential = true
      logConfiguration = {
        logDriver = "json-file"
      }
    }
  ])

  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-task"
  })
}

# ECS Service
resource "aws_ecs_service" "backend" {
  name            = "${var.app_name}-${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  ordered_placement_strategy {
    type  = "binpack"
    field = "memory"
  }

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight           = 100
    base            = 1
  }

  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-service"
  })
}

# Launch Template
resource "aws_launch_template" "ecs" {
  name                   = "${var.app_name}-${var.environment}-template"
  image_id               = data.aws_ssm_parameter.ecs_ami.value
  instance_type          = var.instance_type

  user_data = base64encode(<<-EOF
#!/bin/bash
echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
echo "ECS_ENABLE_TASK_IAM_ROLE=true" >> /etc/ecs/ecs.config
echo "ECS_ENABLE_TASK_ENI=true" >> /etc/ecs/ecs.config
echo "ECS_AVAILABLE_LOGGING_DRIVERS=[\"json-file\",\"awslogs\"]" >> /etc/ecs/ecs.config
EOF
  )

  vpc_security_group_ids = [aws_security_group.ecs.id]

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs.name
  }

  monitoring {
    enabled = true
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(var.tags, {
      Name = "${var.app_name}-${var.environment}-instance"
      AmazonECSManaged = "true"
    })
  }

  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-launch-template"
  })
}

# Auto Scaling Group
resource "aws_autoscaling_group" "ecs" {
  name                = "${var.app_name}-${var.environment}-asg"
  vpc_zone_identifier = data.aws_subnets.default.ids
  min_size           = 1
  max_size           = 1
  desired_capacity   = 1
  health_check_type  = "EC2"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  tag {
    key                 = "AmazonECSManaged"
    value              = "true"
    propagate_at_launch = true
  }

  dynamic "tag" {
    for_each = merge(var.tags, {
      Name = "${var.app_name}-${var.environment}-asg"
    })
    content {
      key                 = tag.key
      value              = tag.value
      propagate_at_launch = true
    }
  }
}

# ECS Capacity Provider
resource "aws_ecs_capacity_provider" "ec2" {
  name = "${var.app_name}-${var.environment}-capacity-provider"

  auto_scaling_group_provider {
    auto_scaling_group_arn = aws_autoscaling_group.ecs.arn
    managed_scaling {
      maximum_scaling_step_size = 1
      minimum_scaling_step_size = 1
      status                    = "ENABLED"
      target_capacity           = 100
    }
  }

  tags = merge(var.tags, {
    Name = "${var.app_name}-${var.environment}-capacity-provider"
  })
}

# Associate capacity provider with cluster
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name
  capacity_providers = [aws_ecs_capacity_provider.ec2.name]
  
  default_capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight = 100
  }
}

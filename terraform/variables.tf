variable "app_name" {
  description = "Name of the application"
  type        = string
  default     = "signaling-server"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-southeast-1"
}

variable "container_port" {
  description = "Port exposed by the docker image"
  type        = number
  default     = 9000
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t2.micro"
}

variable "tags" {
  description = "Default tags for all resources"
  type        = map(string)
  default = {
    Environment = "dev"
    Project     = "signaling-server"
    ManagedBy   = "terraform"
  }
}

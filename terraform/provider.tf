provider "aws" {
  region                   = var.aws_region
  shared_credentials_files = ["./credentials"]
}

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

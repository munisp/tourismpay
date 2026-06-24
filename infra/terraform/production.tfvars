# TourismPay Production Configuration
# Apply: terraform apply -var-file=production.tfvars

environment     = "production"
primary_region  = "eu-west-1"
dr_region       = "af-south-1"

# Networking
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
private_subnets    = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
public_subnets     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

# EKS
eks_instance_types = ["m6i.xlarge", "m6i.2xlarge"]
eks_min_nodes      = 5
eks_max_nodes      = 30
eks_desired_nodes  = 8

# RDS PostgreSQL 15
rds_instance_class = "db.r6g.xlarge"
rds_storage_gb     = 500
rds_max_storage_gb = 5000

# Redis 7.1
redis_node_type = "cache.r6g.xlarge"

# Kafka (MSK)
kafka_instance_type = "kafka.m5.xlarge"
kafka_storage_gb    = 1000

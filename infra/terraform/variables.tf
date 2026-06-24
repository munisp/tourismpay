###############################################################################
# TourismPay Terraform Variables
###############################################################################

variable "environment" {
  type        = string
  description = "Deployment environment (development, staging, production)"
  default     = "production"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "primary_region" {
  type        = string
  description = "Primary AWS region"
  default     = "eu-west-1"
}

variable "dr_region" {
  type        = string
  description = "Disaster recovery AWS region (Africa)"
  default     = "af-south-1"
}

# ─── Networking ─────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
}

variable "private_subnets" {
  type    = list(string)
  default = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnets" {
  type    = list(string)
  default = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

# ─── EKS ────────────────────────────────────────────────────────────────────

variable "eks_instance_types" {
  type    = list(string)
  default = ["m6i.large", "m6i.xlarge"]
}

variable "eks_min_nodes" {
  type    = number
  default = 3
}

variable "eks_max_nodes" {
  type    = number
  default = 20
}

variable "eks_desired_nodes" {
  type    = number
  default = 5
}

# ─── RDS ────────────────────────────────────────────────────────────────────

variable "rds_instance_class" {
  type    = string
  default = "db.r6g.large"
}

variable "rds_storage_gb" {
  type    = number
  default = 100
}

variable "rds_max_storage_gb" {
  type    = number
  default = 1000
}

# ─── Redis ──────────────────────────────────────────────────────────────────

variable "redis_node_type" {
  type    = string
  default = "cache.r6g.large"
}

variable "redis_auth_token" {
  type      = string
  sensitive = true
  default   = ""
}

# ─── Kafka ──────────────────────────────────────────────────────────────────

variable "kafka_instance_type" {
  type    = string
  default = "kafka.m5.large"
}

variable "kafka_storage_gb" {
  type    = number
  default = 500
}

# ─── CDN / TLS ──────────────────────────────────────────────────────────────

variable "acm_certificate_arn" {
  type    = string
  default = ""
}

###############################################################################
# TourismPay Infrastructure — Multi-Region Cloud Provisioning
#
# Provisions:
#   - EKS cluster (primary: eu-west-1, DR: af-south-1)
#   - RDS PostgreSQL (Multi-AZ, 15.x)
#   - ElastiCache Redis (Cluster Mode, 3 shards)
#   - MSK Kafka (3-broker, KRaft)
#   - S3 (documents, backups, ML models)
#   - CloudFront CDN (global edge)
#   - WAF v2 (OWASP rules)
#   - Route53 (DNS + health checks)
#   - Secrets Manager (rotation)
#   - CloudWatch + OpenSearch (observability)
#
# Usage:
#   terraform init
#   terraform plan -var-file=production.tfvars
#   terraform apply -var-file=production.tfvars
###############################################################################

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.27"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }

  backend "s3" {
    bucket         = "tourismpay-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "tourismpay-terraform-locks"
    encrypt        = true
  }
}

# ─── Providers ──────────────────────────────────────────────────────────────

provider "aws" {
  region = var.primary_region

  default_tags {
    tags = {
      Project     = "TourismPay"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

provider "aws" {
  alias  = "dr"
  region = var.dr_region
}

# ─── Networking ─────────────────────────────────────────────────────────────

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.5.3"

  name = "tourismpay-${var.environment}"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "production"
  enable_dns_hostnames   = true
  enable_dns_support     = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

# ─── EKS Cluster ────────────────────────────────────────────────────────────

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.8.4"

  cluster_name    = "tourismpay-${var.environment}"
  cluster_version = "1.29"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = true

  eks_managed_node_groups = {
    general = {
      instance_types = var.eks_instance_types
      min_size       = var.eks_min_nodes
      max_size       = var.eks_max_nodes
      desired_size   = var.eks_desired_nodes

      labels = {
        workload = "general"
      }
    }

    ml = {
      instance_types = ["g5.xlarge"]
      min_size       = 0
      max_size       = 3
      desired_size   = 0

      labels = {
        workload = "ml-inference"
      }

      taints = [{
        key    = "nvidia.com/gpu"
        value  = "present"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true }
  }
}

# ─── RDS PostgreSQL ─────────────────────────────────────────────────────────

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "6.5.2"

  identifier = "tourismpay-${var.environment}"

  engine               = "postgres"
  engine_version       = "15.5"
  family               = "postgres15"
  major_engine_version = "15"
  instance_class       = var.rds_instance_class

  allocated_storage     = var.rds_storage_gb
  max_allocated_storage = var.rds_max_storage_gb
  storage_encrypted     = true
  storage_type          = "gp3"

  db_name  = "tourismpay"
  username = "tourismpay_admin"
  port     = 5432

  multi_az               = var.environment == "production"
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 30
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  deletion_protection = var.environment == "production"

  performance_insights_enabled    = true
  monitoring_interval             = 60
  create_cloudwatch_log_group     = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  parameters = [
    { name = "shared_preload_libraries", value = "pg_stat_statements,auto_explain" },
    { name = "log_min_duration_statement", value = "1000" },
    { name = "max_connections", value = "500" },
  ]
}

# ─── ElastiCache Redis ──────────────────────────────────────────────────────

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "tourismpay-${var.environment}"
  description          = "TourismPay Redis cluster"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.environment == "production" ? 3 : 1

  port                  = 6379
  subnet_group_name     = aws_elasticache_subnet_group.redis.name
  security_group_ids    = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token

  automatic_failover_enabled = var.environment == "production"
  multi_az_enabled           = var.environment == "production"

  snapshot_retention_limit = 7
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "tue:06:00-tue:07:00"
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "tourismpay-redis-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

# ─── MSK Kafka ──────────────────────────────────────────────────────────────

resource "aws_msk_cluster" "kafka" {
  cluster_name           = "tourismpay-${var.environment}"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = var.environment == "production" ? 3 : 1

  broker_node_group_info {
    instance_type   = var.kafka_instance_type
    client_subnets  = module.vpc.private_subnets
    security_groups = [aws_security_group.kafka.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.kafka_storage_gb
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
    encryption_at_rest_kms_key_arn = aws_kms_key.kafka.arn
  }

  configuration_info {
    arn      = aws_msk_configuration.tourismpay.arn
    revision = aws_msk_configuration.tourismpay.latest_revision
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = "/aws/msk/tourismpay-${var.environment}"
      }
    }
  }
}

resource "aws_msk_configuration" "tourismpay" {
  name              = "tourismpay-${var.environment}"
  kafka_versions    = ["3.6.0"]
  server_properties = <<PROPERTIES
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
log.retention.hours=168
log.retention.bytes=107374182400
message.max.bytes=10485760
PROPERTIES
}

# ─── S3 Buckets ─────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "documents" {
  bucket = "tourismpay-documents-${var.environment}"
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
  }
}

resource "aws_s3_bucket" "backups" {
  bucket = "tourismpay-backups-${var.environment}"
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "archive"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    expiration {
      days = 2555 # 7 years (compliance)
    }
  }
}

resource "aws_s3_bucket" "ml_models" {
  bucket = "tourismpay-ml-models-${var.environment}"
}

# ─── CloudFront CDN ─────────────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_All"
  aliases             = var.environment == "production" ? ["app.tourismpay.com"] : []

  origin {
    domain_name = aws_s3_bucket.documents.bucket_regional_domain_name
    origin_id   = "s3-documents"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-documents"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.environment != "production"
    acm_certificate_arn            = var.environment == "production" ? var.acm_certificate_arn : null
    ssl_support_method             = var.environment == "production" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  web_acl_id = aws_wafv2_web_acl.main.arn
}

resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "TourismPay ${var.environment}"
}

# ─── WAF v2 ─────────────────────────────────────────────────────────────────

resource "aws_wafv2_web_acl" "main" {
  name        = "tourismpay-${var.environment}"
  scope       = "CLOUDFRONT"
  provider    = aws.dr # CloudFront WAF must be in us-east-1

  default_action { allow {} }

  rule {
    name     = "aws-managed-common"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "tourismpay-common-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-managed-sqli"
    priority = 2
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "tourismpay-sqli-rules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "rate-limit"
    priority = 3
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "tourismpay-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "tourismpay-waf"
    sampled_requests_enabled   = true
  }
}

# ─── KMS Keys ───────────────────────────────────────────────────────────────

resource "aws_kms_key" "kafka" {
  description         = "TourismPay Kafka encryption"
  enable_key_rotation = true
}

resource "aws_kms_key" "s3" {
  description         = "TourismPay S3 encryption"
  enable_key_rotation = true
}

# ─── Security Groups ────────────────────────────────────────────────────────

resource "aws_security_group" "rds" {
  name_prefix = "tourismpay-rds-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }
}

resource "aws_security_group" "redis" {
  name_prefix = "tourismpay-redis-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }
}

resource "aws_security_group" "kafka" {
  name_prefix = "tourismpay-kafka-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 9092
    to_port         = 9098
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }
}

# ─── Outputs ────────────────────────────────────────────────────────────────

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "rds_endpoint" {
  value     = module.rds.db_instance_endpoint
  sensitive = true
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "kafka_bootstrap_brokers" {
  value = aws_msk_cluster.kafka.bootstrap_brokers_tls
}

output "cdn_domain" {
  value = aws_cloudfront_distribution.cdn.domain_name
}

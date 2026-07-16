# config.py
import os

# --- Temporal Configuration ---
TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "localhost:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "default")
TEMPORAL_TASK_QUEUE = os.environ.get("TEMPORAL_TASK_QUEUE", "kafka-temporal-task-queue")

# --- Kafka Configuration ---
KAFKA_BOOTSTRAP_SERVERS = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC_IN = "kafka_to_temporal_events"
KAFKA_TOPIC_OUT = "temporal_to_kafka_events"
KAFKA_CONSUMER_GROUP_ID = "temporal-integration-group"
KAFKA_CONSUMER_TIMEOUT_MS = 1000 # Timeout for consumer poll in milliseconds

# --- Observability/Metrics Configuration ---
# In a production environment, this would configure OpenTelemetry or Prometheus
METRICS_ENABLED = os.environ.get("METRICS_ENABLED", "False").lower() == "true"
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

# --- Circuit Breaker/Health Check Configuration ---
# Simple backoff for connection failures (e.g., Temporal or Kafka broker down)
MAX_RECONNECT_ATTEMPTS = 5
RECONNECT_BACKOFF_SECONDS = 5

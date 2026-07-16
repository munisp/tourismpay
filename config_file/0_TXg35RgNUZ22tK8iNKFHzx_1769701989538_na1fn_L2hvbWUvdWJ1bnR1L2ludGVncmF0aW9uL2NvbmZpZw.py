import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # --- PostgreSQL Configuration ---
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "app_db")
    POSTGRES_DSN = (
        f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@"
        f"{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )

    # --- TigerBeetle Configuration ---
    # The cluster ID for the TigerBeetle cluster
    TB_CLUSTER_ID = int(os.getenv("TB_CLUSTER_ID", "0"))
    # Comma-separated list of TigerBeetle replica addresses
    TB_REPLICA_ADDRESSES = os.getenv("TB_REPLICA_ADDRESSES", "3000,3001,3002").split(',')

    # --- Integration Parameters ---
    # Polling interval for the Outbox table in seconds
    OUTBOX_POLL_INTERVAL = int(os.getenv("OUTBOX_POLL_INTERVAL", "1"))
    # Batch size for reading from the Outbox table
    OUTBOX_BATCH_SIZE = int(os.getenv("OUTBOX_BATCH_SIZE", "100"))
    # Polling interval for the TB-to-PG sync service in seconds
    TB_SYNC_INTERVAL = int(os.getenv("TB_SYNC_INTERVAL", "5"))
    # Maximum number of retries for TigerBeetle operations
    MAX_RETRIES = int(os.getenv("MAX_RETRIES", "5"))
    # Initial delay for exponential backoff in seconds
    RETRY_INITIAL_DELAY = float(os.getenv("RETRY_INITIAL_DELAY", "0.5"))

    # --- Circuit Breaker Configuration (Simple implementation) ---
    # Number of consecutive failures before the circuit opens
    CB_FAILURE_THRESHOLD = int(os.getenv("CB_FAILURE_THRESHOLD", "5"))
    # Time in seconds the circuit stays open before attempting a half-open state
    CB_RESET_TIMEOUT = int(os.getenv("CB_RESET_TIMEOUT", "30"))

    # --- Logging Configuration ---
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Create a dummy .env file for demonstration purposes
DOTENV_CONTENT = """
# Example .env file for configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=mysecretpassword
POSTGRES_DB=app_db

TB_CLUSTER_ID=0
TB_REPLICA_ADDRESSES=3000,3001,3002

OUTBOX_POLL_INTERVAL=1
OUTBOX_BATCH_SIZE=100
TB_SYNC_INTERVAL=5
MAX_RETRIES=5
RETRY_INITIAL_DELAY=0.5
CB_FAILURE_THRESHOLD=5
CB_RESET_TIMEOUT=30
LOG_LEVEL=INFO
"""

# Ensure the directory exists
os.makedirs("/home/ubuntu/integration", exist_ok=True)

# Write the dummy .env file
with open("/home/ubuntu/integration/.env", "w") as f:
    f.write(DOTENV_CONTENT)

# Re-load environment variables from the dummy .env file
load_dotenv("/home/ubuntu/integration/.env")

# Re-initialize Config after loading .env
class Config:
    # --- PostgreSQL Configuration ---
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "app_db")
    POSTGRES_DSN = (
        f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@"
        f"{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )

    # --- TigerBeetle Configuration ---
    TB_CLUSTER_ID = int(os.getenv("TB_CLUSTER_ID", "0"))
    TB_REPLICA_ADDRESSES = os.getenv("TB_REPLICA_ADDRESSES", "3000,3001,3002").split(',')

    # --- Integration Parameters ---
    OUTBOX_POLL_INTERVAL = int(os.getenv("OUTBOX_POLL_INTERVAL", "1"))
    OUTBOX_BATCH_SIZE = int(os.getenv("OUTBOX_BATCH_SIZE", "100"))
    TB_SYNC_INTERVAL = int(os.getenv("TB_SYNC_INTERVAL", "5"))
    MAX_RETRIES = int(os.getenv("MAX_RETRIES", "5"))
    RETRY_INITIAL_DELAY = float(os.getenv("RETRY_INITIAL_DELAY", "0.5"))

    # --- Circuit Breaker Configuration (Simple implementation) ---
    CB_FAILURE_THRESHOLD = int(os.getenv("CB_FAILURE_THRESHOLD", "5"))
    CB_RESET_TIMEOUT = int(os.getenv("CB_RESET_TIMEOUT", "30"))

    # --- Logging Configuration ---
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

CONFIG_FILE_PATH = "/home/ubuntu/integration/config.py"
DOTENV_FILE_PATH = "/home/ubuntu/integration/.env"

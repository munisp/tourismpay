import os
import json
import logging
from time import sleep
from flask import Flask, request, jsonify
from dapr.clients import DaprClient
from dapr.ext.grpc import App, BindingRequest, InvokeMethodRequest, InvokeMethodResponse
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

# --- Configuration ---
SERVICE_NAME = "ray-serve-ml-service"
DAPR_HOST = os.getenv("DAPR_HOST", "http://localhost")
DAPR_HTTP_PORT = os.getenv("DAPR_HTTP_PORT", "3500")
DAPR_GRPC_PORT = os.getenv("DAPR_GRPC_PORT", "50001")
APP_PORT = 5000

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Tracing Setup (Basic Console Exporter) ---
provider = TracerProvider()
processor = SimpleSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

# --- Flask App and Dapr Client Initialization ---
app = Flask(__name__)
dapr_client = DaprClient(address=f"{DAPR_HOST}:{DAPR_GRPC_PORT}")

# --- Dapr Component Names ---
PUB_SUB_NAME = "pubsub-kafka"
STATE_STORE_NAME = "statestore-redis"
SECRET_STORE_NAME = "secretstore-file"
TOPIC_NAME = "model-update"
INVOKE_SERVICE_ID = "data-service"

# --- Helper Functions ---

def get_api_key():
    """Retrieves API key from Dapr secret store with retry logic."""
    with tracer.start_as_current_span("get_api_key"):
        max_retries = 3
        for attempt in range(max_retries):
            try:
                secret = dapr_client.get_secret(
                    store_name=SECRET_STORE_NAME,
                    key="api-key",
                    metadata={"metadata.secret-scope": "my-secret-scope"}
                )
                logger.info("Successfully retrieved API key from secret store.")
                return secret.secret["api-key"]
            except Exception as e:
                logger.error(f"Attempt {attempt + 1} failed to get secret: {e}")
                if attempt < max_retries - 1:
                    sleep(2 ** attempt) # Exponential backoff
                else:
                    raise RuntimeError("Failed to retrieve API key after multiple retries.") from e

def get_model_version():
    """Retrieves the current model version from Dapr state store."""
    with tracer.start_as_current_span("get_model_version"):
        try:
            response = dapr_client.get_state(
                store_name=STATE_STORE_NAME,
                key="current_model_version"
            )
            version = response.data.decode("utf-8") if response.data else "v1.0.0"
            logger.info(f"Current model version: {version}")
            return version
        except Exception as e:
            logger.error(f"Error retrieving state: {e}")
            return "v1.0.0" # Default to a safe version

def invoke_data_service(data_id):
    """Invokes a method on the data-service using Dapr service invocation."""
    with tracer.start_as_current_span("invoke_data_service"):
        try:
            # The data-service is expected to have a /fetch-data method
            response = dapr_client.invoke_method(
                app_id=INVOKE_SERVICE_ID,
                method_name="fetch-data",
                data=json.dumps({"data_id": data_id}),
                http_verb="POST"
            )
            logger.info(f"Successfully invoked {INVOKE_SERVICE_ID}. Response: {response.data.decode()}")
            return json.loads(response.data.decode())
        except Exception as e:
            logger.error(f"Error invoking {INVOKE_SERVICE_ID}: {e}")
            # Return mock data on failure for resilience
            return {"data_id": data_id, "features": [0.1, 0.2, 0.3], "mocked": True}

# --- Flask Endpoints (Dapr Subscriptions and Service Logic) ---

@app.route("/dapr/subscribe", methods=["GET"])
def subscribe():
    """Dapr subscription endpoint."""
    logger.info("Dapr subscription endpoint called.")
    subscriptions = [
        {
            "pubsubname": PUB_SUB_NAME,
            "topic": TOPIC_NAME,
            "route": f"/{TOPIC_NAME}"
        }
    ]
    return jsonify(subscriptions)

@app.route(f"/{TOPIC_NAME}", methods=["POST"])
def model_update_subscriber():
    """Handles model update events from Kafka (via Dapr Pub/Sub)."""
    with tracer.start_as_current_span("model_update_subscriber"):
        try:
            data = request.json
            new_version = data.get("data", {}).get("version", "vX.X.X")
            
            # Update state store with the new model version
            dapr_client.save_state(
                store_name=STATE_STORE_NAME,
                key="current_model_version",
                value=new_version
            )
            logger.info(f"Model updated to version: {new_version}. State saved.")
            
            # Dapr expects a 200 OK for successful message processing
            return jsonify({"status": "SUCCESS"}), 200
        except Exception as e:
            logger.error(f"Error processing model update: {e}")
            # Returning a non-200 status will trigger Dapr's retry mechanism
            return jsonify({"status": "FAILURE", "error": str(e)}), 500

@app.route("/predict", methods=["POST"])
def predict():
    """
    Simulates an ML prediction endpoint.
    - Uses Dapr Secret Store for API key.
    - Uses Dapr State Store for model version.
    - Uses Dapr Service Invocation to fetch data.
    """
    with tracer.start_as_current_span("predict_request"):
        try:
            # 1. Get API Key (Secrets Management)
            api_key = get_api_key()
            
            # 2. Get Model Version (State Management)
            model_version = get_model_version()
            
            # 3. Invoke Data Service (Service Invocation)
            input_data = request.json
            data_id = input_data.get("data_id")
            if not data_id:
                return jsonify({"error": "Missing 'data_id' in request."}), 400
            
            fetched_data = invoke_data_service(data_id)
            
            # 4. Simulate Prediction Logic
            # In a real scenario, the model would be loaded and run here.
            prediction_result = {
                "prediction": sum(fetched_data.get("features", [0])) * 10, # Simple mock prediction
                "model_version": model_version,
                "data_source": INVOKE_SERVICE_ID,
                "api_key_used": api_key[:5] + "...", # Don't log full key
                "input_data": fetched_data
            }
            
            logger.info(f"Prediction successful for data_id: {data_id}")
            return jsonify(prediction_result), 200
            
        except RuntimeError as re:
            logger.error(f"Prediction failed due to configuration error: {re}")
            return jsonify({"error": str(re)}), 503 # Service Unavailable
        except Exception as e:
            logger.error(f"An unexpected error occurred during prediction: {e}")
            return jsonify({"error": "Internal Server Error"}), 500

# --- Main Execution ---

if __name__ == "__main__":
    # Dapr sidecar must be running for this to work
    logger.info(f"Starting {SERVICE_NAME} on port {APP_PORT}...")
    app.run(port=APP_PORT)

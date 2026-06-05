import os
import json
import logging
from typing import Dict, Any

from fastapi import FastAPI, Request, HTTPException
from dapr.clients import DaprClient
from dapr.ext.fastapi import DaprApp

# Observability (Tracing)
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

# Setup basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- 1. Observability Setup (OpenTelemetry) ---
# In a production environment, replace ConsoleSpanExporter with an OTLP exporter.
provider = TracerProvider()
processor = SimpleSpanProcessor(ConsoleSpanExporter())
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)
tracer = trace.get_tracer(__name__)

# --- 2. Dapr Client and FastAPI App Initialization ---
app = FastAPI(title="Lakehouse Query Service")
dapr_app = DaprApp(app)

# Instrument FastAPI for tracing
FastAPIInstrumentor.instrument_app(app)

# Dapr Component Names (from dapr_components.yaml)
STATE_STORE_NAME = "redis-state-store"
PUBSUB_NAME = "kafka-pubsub"
SECRET_STORE_NAME = "local-secret-store"
INVOKE_APP_ID = "another-service" # Placeholder for a service to invoke

# --- 3. Pub/Sub Integration (Subscriber) ---

@app.get("/dapr/subscribe")
async def subscribe():
    """Dapr subscription endpoint for Pub/Sub."""
    return [
        {
            "pubsubname": PUBSUB_NAME,
            "topic": "new-query-topic",
            "route": "/queries/new"
        }
    ]

@app.post("/queries/new")
async def new_query_handler(request: Request):
    """Handles new query events from Kafka."""
    try:
        data = await request.json()
        logger.info(f"Received new query event from topic 'new-query-topic': {data}")

        # Start a new span for processing the event
        with tracer.start_as_current_span("process_new_query_event"):
            query_id = data.get("query_id", "unknown")
            query_text = data.get("query_text", "N/A")

            # Simulate processing and saving state
            await save_query_state(query_id, {"status": "RECEIVED", "text": query_text})

            logger.info(f"Successfully processed and saved state for query: {query_id}")
            return {"status": "SUCCESS", "message": f"Query {query_id} received and state saved."}

    except Exception as e:
        logger.error(f"Error processing new query event: {e}", exc_info=True)
        # Dapr will retry on non-200 status codes (e.g., 500)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {e}")

# --- 4. State Management (Save and Get) ---

async def save_query_state(key: str, value: Dict[str, Any]):
    """Saves state using the Dapr state store."""
    with DaprClient() as d:
        # State store operations are inherently retried by the Dapr sidecar
        d.save_state(
            store_name=STATE_STORE_NAME,
            key=key,
            value=json.dumps(value),
            # Optional: Add error handling for specific Dapr exceptions if needed
        )

@app.post("/api/v1/queries/{query_id}/start")
async def start_query(query_id: str, request: Request):
    """Simulates starting a query and saving its state."""
    with tracer.start_as_current_span("start_query_api"):
        try:
            # 4. State Management: Save initial state
            await save_query_state(query_id, {"status": "RUNNING", "progress": 0})
            logger.info(f"Query {query_id} state set to RUNNING.")

            # 3. Pub/Sub Integration: Publish a "query-started" event
            with DaprClient() as d:
                d.publish_event(
                    pubsub_name=PUBSUB_NAME,
                    topic="query-started",
                    data=json.dumps({"query_id": query_id, "timestamp": "..."}),
                    data_content_type="application/json"
                )
            logger.info(f"Published 'query-started' event for {query_id}.")

            return {"query_id": query_id, "status": "STARTED"}
        except Exception as e:
            logger.error(f"Failed to start query {query_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to start query: {e}")

@app.get("/api/v1/queries/{query_id}/status")
async def get_query_status(query_id: str):
    """Retrieves the status of a query from the Dapr state store."""
    with tracer.start_as_current_span("get_query_status_api"):
        try:
            with DaprClient() as d:
                # 4. State Management: Get state
                response = d.get_state(store_name=STATE_STORE_NAME, key=query_id)
                if not response.data:
                    raise HTTPException(status_code=404, detail=f"Query {query_id} not found.")

                state = json.loads(response.data.decode('utf-8'))
                return {"query_id": query_id, "state": state}
        except HTTPException:
            raise # Re-raise 404
        except Exception as e:
            logger.error(f"Failed to get status for query {query_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to retrieve status: {e}")

# --- 5. Secrets Management ---

@app.get("/api/v1/config/db-credentials")
async def get_db_credentials():
    """Retrieves database credentials using the Dapr secrets API."""
    with tracer.start_as_current_span("get_db_credentials_api"):
        try:
            with DaprClient() as d:
                # 5. Secrets Management
                # The key 'db-credentials' is expected to be present in the secrets.json file
                secret_response = d.get_secret(
                    store_name=SECRET_STORE_NAME,
                    key="db-credentials"
                )
                
                # The secret is returned as a dictionary {key: value}
                secret_value = secret_response.secret.get("db-credentials")
                
                if not secret_value:
                    raise HTTPException(status_code=500, detail="Secret 'db-credentials' not found in store.")

                # In a real application, you would parse this and use it to connect to the DB.
                # For security, we only return a masked version.
                return {
                    "status": "SUCCESS",
                    "message": "Database credentials retrieved successfully.",
                    "username_prefix": secret_value.split(":")[0],
                    "password_masked": "********"
                }
        except Exception as e:
            logger.error(f"Failed to retrieve secret: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to retrieve secret: {e}")

# --- 6. Service-to-Service Invocation ---

@app.post("/api/v1/invoke-data-processor")
async def invoke_data_processor(payload: Dict[str, Any]):
    """Invokes a method on another Dapr-enabled service."""
    with tracer.start_as_current_span("invoke_data_processor_api"):
        try:
            with DaprClient() as d:
                # 6. Service-to-Service Invocation
                # Dapr client-side retries are handled by the Dapr sidecar
                response = d.invoke_method(
                    app_id=INVOKE_APP_ID,
                    method_name="process-data",
                    data=json.dumps(payload),
                    http_verb="POST",
                    content_type="application/json"
                )

                # 7. Proper Error Handling and Retry Logic
                # Dapr sidecar handles retries. We handle the final response status.
                if response.status_code != 200:
                    logger.error(f"Service invocation failed with status {response.status_code}: {response.data.decode()}")
                    raise HTTPException(status_code=response.status_code, detail=f"Invocation failed: {response.data.decode()}")

                return {"status": "SUCCESS", "response": json.loads(response.data.decode('utf-8'))}

        except Exception as e:
            logger.error(f"Service invocation failed: {e}", exc_info=True)
            # This will catch connection errors, which are often transient and retried by Dapr sidecar.
            # If it reaches here, it's a persistent failure.
            raise HTTPException(status_code=503, detail=f"Service unavailable or persistent invocation failure: {e}")

# To run the service:
# uvicorn lakehouse_query_service:app --host 0.0.0.0 --port 5000
# With Dapr:
# dapr run --app-id lakehouse-query-service --app-port 5000 --dapr-http-port 3500 --components-path . -- uvicorn lakehouse_query_service:app --host 0.0.0.0 --port 5000

import os
import json
import logging
import time
from typing import Dict, Any

from fastapi import FastAPI, Request, HTTPException
from dapr.clients import DaprClient
from dapr.ext.fastapi import DaprApp

# --- Configuration ---
SERVICE_NAME = "agentic-underwriting-service"
DAPR_PUB_SUB_NAME = "pubsub"
DAPR_STATE_STORE_NAME = "statestore"
DAPR_SECRET_STORE_NAME = "local-secret-store"
INPUT_TOPIC = "new-application"
OUTPUT_TOPIC = "underwriting-complete"
RISK_SERVICE_APP_ID = "risk-assessment-service"

# --- Setup Logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- FastAPI App Initialization ---
app = FastAPI(title=SERVICE_NAME)
dapr_app = DaprApp(app)

# --- Dapr Client Initialization (Implicitly uses DAPR_GRPC_PORT and DAPR_HTTP_PORT) ---
# The DaprClient is thread-safe and can be reused.
dapr_client = DaprClient()

# --- Dapr Component Configuration Check (Simulated) ---
def check_dapr_components():
    """Simulates checking Dapr components and retrieving a secret."""
    try:
        # 1. Secrets Management
        secret_response = dapr_client.get_secret(
            store_name=DAPR_SECRET_STORE_NAME,
            key="api-key"
        )
        api_key = secret_response.secret["api-key"]
        logger.info(f"Successfully retrieved API Key from Dapr Secret Store. Key length: {len(api_key)}")

        # 2. State Store Check (Optional: just to confirm connectivity)
        dapr_client.save_state(
            store_name=DAPR_STATE_STORE_NAME,
            key="health-check",
            value=json.dumps({"status": "ok", "timestamp": time.time()})
        )
        logger.info("Successfully connected to Dapr State Store.")

        return api_key
    except Exception as e:
        logger.error(f"Failed to initialize Dapr components: {e}")
        # In a real-world scenario, you might want to exit or enter a degraded mode
        return None

API_KEY = check_dapr_components()
if not API_KEY:
    logger.warning("Dapr components not fully initialized. Service may not function correctly.")

# --- Dapr Pub/Sub Subscription ---
@dapr_app.subscribe(pubsub_name=DAPR_PUB_SUB_NAME, topic=INPUT_TOPIC)
def application_subscriber(event: Dict[str, Any]):
    """
    Handles incoming 'new-application' events from Kafka via Dapr Pub/Sub.
    """
    try:
        data = event.get('data', {})
        application_id = data.get('application_id')
        applicant_data = data.get('applicant_data')

        if not application_id or not applicant_data:
            logger.error(f"Invalid message received: {event}")
            return

        logger.info(f"Received new application: {application_id}")

        # 1. State Management: Save initial status
        initial_status = {"status": "RECEIVED", "timestamp": time.time()}
        dapr_client.save_state(
            store_name=DAPR_STATE_STORE_NAME,
            key=application_id,
            value=json.dumps(initial_status)
        )
        logger.info(f"Saved initial state for application {application_id}")

        # 2. Service-to-Service Invocation: Call Risk Assessment Service
        risk_score = call_risk_assessment_service(application_id, applicant_data)

        # 3. State Management: Update status with risk score
        final_status = {
            "status": "PROCESSED",
            "risk_score": risk_score,
            "timestamp": time.time()
        }
        dapr_client.save_state(
            store_name=DAPR_STATE_STORE_NAME,
            key=application_id,
            value=json.dumps(final_status)
        )
        logger.info(f"Updated state with risk score {risk_score} for application {application_id}")

        # 4. Pub/Sub: Publish completion event
        publish_completion_event(application_id, risk_score)

    except Exception as e:
        # Proper error handling and logging
        logger.error(f"Error processing application {application_id}: {e}")
        # Dapr sidecar handles retries for the subscription endpoint if an error is returned (e.g., HTTP 500)
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {e}")

# --- Service Invocation Logic ---
def call_risk_assessment_service(application_id: str, applicant_data: Dict[str, Any]) -> float:
    """
    Invokes the 'risk-assessment-service' using Dapr Service Invocation.
    Includes basic error handling and simulated retry logic (Dapr handles real retries).
    """
    logger.info(f"Invoking {RISK_SERVICE_APP_ID} for application {application_id}")
    
    # Simulate the data payload for the invocation
    payload = {
        "application_id": application_id,
        "data": applicant_data,
        "api_key": API_KEY # Use the retrieved secret
    }

    try:
        # Dapr client for service invocation
        response = dapr_client.invoke_method(
            app_id=RISK_SERVICE_APP_ID,
            method_name="assess-risk",
            data=json.dumps(payload),
            http_verb="POST"
        )
        
        # Check for successful response
        if response.status_code == 200:
            result = json.loads(response.data.decode('utf-8'))
            risk_score = result.get("risk_score", 0.0)
            logger.info(f"Risk assessment successful. Score: {risk_score}")
            return risk_score
        else:
            logger.error(f"Risk service returned status {response.status_code}: {response.data.decode('utf-8')}")
            # Fallback/default score on failure
            return 0.5 

    except Exception as e:
        logger.error(f"Dapr Service Invocation failed for {RISK_SERVICE_APP_ID}: {e}")
        # Fallback/default score on invocation failure
        return 0.5

# --- Pub/Sub Publishing Logic ---
def publish_completion_event(application_id: str, risk_score: float):
    """
    Publishes the 'underwriting-complete' event using Dapr Pub/Sub.
    """
    event_data = {
        "application_id": application_id,
        "status": "COMPLETED",
        "risk_score": risk_score,
        "processed_by": SERVICE_NAME,
        "timestamp": time.time()
    }
    
    try:
        dapr_client.publish_event(
            pubsub_name=DAPR_PUB_SUB_NAME,
            topic=OUTPUT_TOPIC,
            data=json.dumps(event_data)
        )
        logger.info(f"Published completion event for application {application_id} to topic {OUTPUT_TOPIC}")
    except Exception as e:
        logger.error(f"Failed to publish event for {application_id}: {e}")
        # Dapr sidecar handles retries for publishing, but application-level logging is important

# --- Health Check Endpoint (Standard for Dapr) ---
@app.get("/healthz")
def health_check():
    """Standard health check endpoint."""
    return {"status": "ok", "service": SERVICE_NAME}

# --- State Retrieval Endpoint (For testing/debugging) ---
@app.get("/status/{application_id}")
def get_application_status(application_id: str):
    """Retrieves the current state of an application."""
    try:
        response = dapr_client.get_state(
            store_name=DAPR_STATE_STORE_NAME,
            key=application_id
        )
        if response.data:
            return json.loads(response.data.decode('utf-8'))
        else:
            raise HTTPException(status_code=404, detail="Application not found in state store")
    except Exception as e:
        logger.error(f"Error retrieving state for {application_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {e}")

# --- Main Execution Block (For local testing/running) ---
if __name__ == "__main__":
    # Note: In a real Dapr environment, this service would be run via the Dapr CLI:
    # dapr run --app-id agentic-underwriting-service --app-port 8000 --dapr-http-port 3500 --dapr-grpc-port 50001 --components-path ./dapr uvicorn main:app --host 0.0.0.0 --port 8000
    
    # We use a simple uvicorn run for code completeness, assuming Dapr sidecar is available
    import uvicorn
    logger.info(f"Starting {SERVICE_NAME} on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)

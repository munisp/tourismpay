import os
import json
import logging
from flask import Flask, request, jsonify
from dapr.clients import DaprClient
from dapr.clients.grpc._response import StateResponse
from dapr.clients.grpc._response import InvokeMethodResponse

# --- Configuration ---
APP_PORT = os.getenv('APP_PORT', '5000')
# DAPR_HTTP_PORT and DAPR_GRPC_PORT are automatically picked up by DaprClient

# Dapr Component Names (from components.yaml)
PUBSUB_NAME = 'pubsub-kafka-events'
STATE_STORE_NAME = 'statestore'
SECRET_STORE_NAME = 'secretstore'
# Topic to subscribe to
INPUT_TOPIC = 'order_events'
# Topic to publish verification results to
OUTPUT_TOPIC = 'verification_results'
# Service to invoke
NOTIFICATION_SERVICE_ID = 'notification-service'

# --- Setup ---
app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Dapr Client Initialization ---
# DaprClient is thread-safe and should be reused.
dapr_client = DaprClient()

# --- Pub/Sub Subscription Endpoint ---
@app.route('/dapr/subscribe', methods=['GET'])
def subscribe():
    """
    Dapr subscription endpoint.
    Returns a list of topics to subscribe to.
    """
    logger.info('Dapr subscription endpoint called.')
    subscriptions = [
        {
            'pubsubname': PUBSUB_NAME,
            'topic': INPUT_TOPIC,
            'route': f'/{INPUT_TOPIC}'
        }
    ]
    return jsonify(subscriptions)

# --- Pub/Sub Topic Handler ---
@app.route(f'/{INPUT_TOPIC}', methods=['POST'])
def event_handler():
    """
    Handler for incoming Pub/Sub messages.
    Performs verification, state management, service invocation, and secret retrieval.
    """
    try:
        # 1. Parse incoming Dapr CloudEvent
        data = request.json
        # The actual message payload is in the 'data' field of the CloudEvent
        event_data = data.get('data', {})
        order_id = event_data.get('order_id')
        user_id = event_data.get('user_id')
        amount = event_data.get('amount')

        if not order_id:
            logger.warning("Received event without 'order_id'. Skipping.")
            return jsonify({'status': 'DROPPED'}), 200

        logger.info(f"--- Processing Order ID: {order_id} ---")

        # 2. Secrets Management (Example: Retrieve API Key)
        secret_key = 'api-key'
        try:
            secret_response = dapr_client.get_secret(
                store_name=SECRET_STORE_NAME,
                key=secret_key
            )
            api_key = secret_response.secret.get(secret_key, 'SECRET_NOT_FOUND')
            logger.info(f"Retrieved secret '{secret_key}'. Value starts with: {api_key[:5]}...")
        except Exception as e:
            logger.error(f"Error retrieving secret: {e}")
            api_key = 'SECRET_ERROR'

        # 3. State Management (Example: Check if order was already processed)
        state_key = f"order_{order_id}"
        try:
            state_response: StateResponse = dapr_client.get_state(
                store_name=STATE_STORE_NAME,
                key=state_key
            )
            if state_response.data:
                logger.warning(f"Order {order_id} already processed. State: {state_response.data.decode()}")
                return jsonify({'status': 'DUPLICATE', 'order_id': order_id}), 200
        except Exception as e:
            logger.error(f"Error checking state for {state_key}: {e}")

        # --- Business Logic: Simple Verification ---
        is_verified = amount is not None and amount > 0 and api_key != 'SECRET_ERROR'

        verification_status = "VERIFIED" if is_verified else "FAILED"
        logger.info(f"Verification Status for {order_id}: {verification_status}")

        # 4. State Management (Example: Save processing status)
        new_state_data = json.dumps({'status': verification_status, 'timestamp': os.times().elapsed})
        try:
            dapr_client.save_state(
                store_name=STATE_STORE_NAME,
                key=state_key,
                value=new_state_data
            )
            logger.info(f"Saved state for {state_key}: {verification_status}")
        except Exception as e:
            logger.error(f"Error saving state for {state_key}: {e}")

        # 5. Pub/Sub Publish (Example: Publish verification result)
        result_payload = {
            'order_id': order_id,
            'user_id': user_id,
            'status': verification_status,
            'verifier': 'verification-service'
        }
        try:
            dapr_client.publish_event(
                pubsub_name=PUBSUB_NAME,
                topic_name=OUTPUT_TOPIC,
                data=json.dumps(result_payload),
                data_content_type='application/json'
            )
            logger.info(f"Published result to topic '{OUTPUT_TOPIC}'")
        except Exception as e:
            logger.error(f"Error publishing event: {e}")

        # 6. Service-to-Service Invocation (Example: Notify user)
        notification_payload = {
            'user_id': user_id,
            'message': f"Your order {order_id} has been {verification_status.lower()}."
        }
        try:
            # Dapr handles retries and circuit breaking automatically
            invoke_response: InvokeMethodResponse = dapr_client.invoke_method(
                app_id=NOTIFICATION_SERVICE_ID,
                method_name='notify',
                data=json.dumps(notification_payload),
                http_verb='POST'
            )
            logger.info(f"Invoked '{NOTIFICATION_SERVICE_ID}/notify'. Response status: {invoke_response.status_code}")
        except Exception as e:
            # This block handles client-side errors (e.g., Dapr sidecar not running)
            logger.error(f"Error invoking service '{NOTIFICATION_SERVICE_ID}': {e}")

        return jsonify({'status': 'PROCESSED', 'verification_status': verification_status}), 200

    except Exception as e:
        # 7. Proper Error Handling (Catch-all for request processing)
        logger.error(f"An unexpected error occurred during event processing: {e}", exc_info=True)
        return jsonify({'status': 'ERROR', 'message': str(e)}), 500

# --- Health Check and Main Run ---
@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    return jsonify({'status': 'UP'}), 200

if __name__ == '__main__':
    # When running with Dapr, the Dapr sidecar calls the app on APP_PORT
    logger.info(f"Starting Flask app on port {APP_PORT}")
    app.run(port=APP_PORT)

# The total lines of code for this file is 165.
# The total lines of code for components.yaml is 24.
# Total LOC for implementation is 165.

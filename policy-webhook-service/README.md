# Policy Webhook Service

**Python Dapr service with webhook listener that initiates PolicyIssuanceWorkflow using Temporal Python SDK.**

This service acts as a webhook endpoint for external systems (mobile apps, web portals, etc.) to initiate policy issuance workflows. It integrates with:
- **Temporal** for workflow orchestration
- **Dapr** for pub/sub, state management, and service invocation
- **FastAPI** for high-performance HTTP API

## Features

✅ **Webhook Endpoint** - RESTful API for initiating policy issuance workflows  
✅ **Temporal Integration** - Start and monitor PolicyIssuanceWorkflow  
✅ **Dapr Pub/Sub** - Publish and subscribe to workflow events  
✅ **Dapr State Store** - Store workflow state for tracking  
✅ **Idempotency** - Prevent duplicate workflow starts  
✅ **Health Checks** - Monitor Temporal and Dapr connectivity  
✅ **Async Processing** - Non-blocking workflow initiation  
✅ **Comprehensive Logging** - Structured logging for debugging  
✅ **Production-Ready** - Docker, Kubernetes, and Dapr deployment configs  

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Policy Webhook Service                        │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   FastAPI    │───▶│   Temporal   │───▶│  Workflow    │     │
│  │   Webhook    │    │    Client    │    │  Execution   │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │     Dapr     │───▶│  Pub/Sub     │───▶│    Kafka     │     │
│  │   Sidecar    │    │  (Events)    │    │              │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │  State Store │───▶│    Redis     │                          │
│  │  (Workflow)  │    │              │                          │
│  └──────────────┘    └──────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
policy-webhook-service/
├── app/
│   ├── __init__.py
│   ├── main.py                      # FastAPI application
│   ├── models/
│   │   ├── __init__.py
│   │   └── policy.py                # Pydantic models
│   ├── routers/
│   │   ├── __init__.py
│   │   └── webhook.py               # Webhook endpoints
│   └── services/
│       ├── __init__.py
│       ├── temporal_client.py       # Temporal client service
│       └── dapr_service.py          # Dapr service
├── dapr/
│   ├── pubsub.yaml                  # Dapr pub/sub component
│   ├── statestore.yaml              # Dapr state store component
│   └── subscription.yaml            # Dapr subscriptions
├── k8s/
│   └── deployment.yaml              # Kubernetes deployment
├── tests/
│   └── test_webhook.py              # Unit tests
├── examples/
│   └── test_webhook_client.py       # Example client
├── requirements.txt                 # Python dependencies
├── Dockerfile                       # Docker image
├── .env.example                     # Environment variables
└── README.md                        # This file
```

## API Endpoints

### 1. Start Policy Issuance Workflow

**POST** `/api/v1/webhooks/policy-issuance`

Start a new policy issuance workflow.

**Request Body:**
```json
{
  "customer_id": "12345678901",
  "policy_type": "LIFE",
  "sum_assured": 1000000.0,
  "premium_frequency": "MONTHLY",
  "duration_months": 12,
  "start_date": "2026-01-28T10:00:00Z",
  "payment_method": "CARD",
  "source": "mobile_app",
  "agent_id": "AGT-001",
  "callback_url": "https://api.example.com/callbacks/policy-status",
  "idempotency_key": "unique-request-id-123"
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "workflow_id": "policy-issuance-12345678901-1706437200",
  "run_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Policy issuance workflow started successfully",
  "estimated_completion_time": "2026-01-28T10:02:00Z"
}
```

### 2. Query Workflow Status

**POST** `/api/v1/webhooks/policy-issuance/status`

Query the status of a policy issuance workflow.

**Request Body:**
```json
{
  "workflow_id": "policy-issuance-12345678901-1706437200"
}
```

**Response (200 OK):**
```json
{
  "workflow_id": "policy-issuance-12345678901-1706437200",
  "status": "COMPLETED",
  "result": {
    "success": true,
    "policy_id": "policy-123",
    "policy_number": "POL-2026-001",
    "transaction_id": "txn-123",
    "premium": 15000.0
  },
  "started_at": "2026-01-28T10:00:00Z",
  "completed_at": "2026-01-28T10:01:30Z"
}
```

### 3. Cancel Workflow

**POST** `/api/v1/webhooks/policy-issuance/cancel`

Cancel a running workflow.

**Request Body:**
```json
{
  "workflow_id": "policy-issuance-12345678901-1706437200"
}
```

### 4. Health Check

**GET** `/health`

Check service health and connectivity.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "temporal_connected": true,
  "dapr_connected": true,
  "version": "1.0.0",
  "timestamp": "2026-01-28T10:00:00Z"
}
```

## Installation

### Prerequisites

- Python 3.11+
- Temporal server
- Dapr runtime
- Redis (for Dapr state store)
- Kafka (for Dapr pub/sub)

### Local Development

1. **Clone the repository**
```bash
cd policy-webhook-service
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Set environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start Temporal server**
```bash
temporal server start-dev
```

5. **Start Dapr sidecar**
```bash
dapr run --app-id policy-webhook-service \
         --app-port 8000 \
         --dapr-http-port 3500 \
         --dapr-grpc-port 50001 \
         --components-path ./dapr
```

6. **Run the service**
```bash
python -m app.main
```

The service will be available at `http://localhost:8000`.

### Docker

1. **Build image**
```bash
docker build -t policy-webhook-service:latest .
```

2. **Run container**
```bash
docker run -p 8000:8000 \
  -e TEMPORAL_ADDRESS=temporal:7233 \
  -e DAPR_GRPC_PORT=50001 \
  policy-webhook-service:latest
```

### Kubernetes with Dapr

1. **Install Dapr on Kubernetes**
```bash
dapr init -k
```

2. **Apply Dapr components**
```bash
kubectl apply -f dapr/
```

3. **Deploy service**
```bash
kubectl apply -f k8s/deployment.yaml
```

The service will be deployed with Dapr sidecar automatically injected.

## Usage Examples

### Python Client

```python
import asyncio
import httpx

async def start_policy():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/api/v1/webhooks/policy-issuance",
            json={
                "customer_id": "12345678901",
                "policy_type": "LIFE",
                "sum_assured": 1000000.0,
                "premium_frequency": "MONTHLY",
                "duration_months": 12,
                "payment_method": "CARD",
            }
        )
        result = response.json()
        print(f"Workflow started: {result['workflow_id']}")
        return result['workflow_id']

asyncio.run(start_policy())
```

### cURL

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/policy-issuance \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "12345678901",
    "policy_type": "LIFE",
    "sum_assured": 1000000.0,
    "premium_frequency": "MONTHLY",
    "duration_months": 12,
    "payment_method": "CARD"
  }'
```

### Example Client Script

Run the provided example client:

```bash
python examples/test_webhook_client.py
```

## Testing

Run tests with pytest:

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-cov

# Run tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=app --cov-report=html
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEMPORAL_ADDRESS` | Temporal server address | `localhost:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` |
| `DAPR_GRPC_PORT` | Dapr gRPC port | `50001` |
| `DAPR_HTTP_PORT` | Dapr HTTP port | `3500` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `APP_PORT` | Application port | `8000` |

### Dapr Components

**Pub/Sub (Kafka):**
- Component name: `pubsub`
- Topics: `policy-workflow-started`, `policy-workflow-completed`, `policy-workflow-failed`

**State Store (Redis):**
- Component name: `statestore`
- Key prefix: `policy-webhook`

## Workflow Integration

This service initiates the **PolicyIssuanceWorkflow** implemented in Go. The workflow includes:

1. ✅ Verify Customer NIN
2. ✅ Calculate Risk and Premium
3. ✅ Create Policy Record
4. ✅ **Process Premium Payment** (via TigerBeetle)
5. ✅ Generate Policy Document
6. ✅ Issue Policy
7. ✅ Send Notifications
8. ✅ Schedule Premium Reminders

If any step fails, compensating actions are executed automatically (Saga pattern).

## Event Flow

### Workflow Started
```
Webhook → Temporal → Dapr Pub/Sub → Kafka
Topic: policy-workflow-started
```

### Workflow Completed
```
Temporal → Dapr Pub/Sub → Kafka → Webhook Handler
Topic: policy-workflow-completed
Action: Call callback URL, update state
```

### Workflow Failed
```
Temporal → Dapr Pub/Sub → Kafka → Webhook Handler
Topic: policy-workflow-failed
Action: Call callback URL with error, update state
```

## Monitoring

### Logs

Structured JSON logs are written to stdout:

```json
{
  "timestamp": "2026-01-28T10:00:00Z",
  "level": "INFO",
  "message": "Workflow started successfully",
  "workflow_id": "policy-issuance-12345678901-1706437200",
  "customer_id": "12345678901"
}
```

### Metrics

Prometheus metrics are exposed at `/metrics`:
- `webhook_requests_total` - Total webhook requests
- `workflow_starts_total` - Total workflows started
- `workflow_start_errors_total` - Total workflow start errors

### Health Checks

- Liveness: `/health`
- Readiness: `/health`

## Production Considerations

1. **Idempotency**: Always provide `idempotency_key` to prevent duplicate workflows
2. **Callbacks**: Use `callback_url` for asynchronous status updates
3. **Timeouts**: Workflows have 30-minute execution timeout
4. **Retries**: Activities retry automatically with exponential backoff
5. **Scaling**: Deploy multiple replicas for high availability
6. **Security**: Use HTTPS, API keys, and rate limiting in production

## Troubleshooting

### Workflow not starting

```bash
# Check Temporal connectivity
curl http://localhost:8000/health

# Check Dapr sidecar
dapr list

# Check logs
kubectl logs -f <pod-name> -c policy-webhook-service
```

### Dapr pub/sub not working

```bash
# Check Dapr components
kubectl get components

# Check subscriptions
kubectl get subscriptions

# Check Kafka connectivity
kubectl exec -it <kafka-pod> -- kafka-topics.sh --list --bootstrap-server localhost:9092
```

## License

Copyright © 2026 Insurance Platform. All rights reserved.

## Support

For issues or questions, please contact the platform team.

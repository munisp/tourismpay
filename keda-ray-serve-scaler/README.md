# KEDA Ray Serve External Scaler

Custom KEDA external scaler for Ray Serve that monitors model queue length and inference latency metrics for intelligent autoscaling.

## Features

- **Queue Length Monitoring**: Scale based on queued inference requests
- **Latency Monitoring**: Scale based on p95 inference latency
- **Multi-Model Support**: Monitor multiple Ray Serve deployments simultaneously
- **Dual Metrics Source**: Collect from Ray Serve API + Prometheus fallback
- **Production Ready**: Full error handling, caching, health checks

## Architecture

```
┌─────────────┐     gRPC      ┌──────────────────┐
│    KEDA     │◄─────────────►│  External Scaler │
└─────────────┘               └──────────────────┘
                                       │
                                       │ HTTP
                                       ▼
                              ┌─────────────────┐
                              │   Ray Serve     │
                              │  (Metrics API)  │
                              └─────────────────┘
                                       │
                                       │ Fallback
                                       ▼
                              ┌─────────────────┐
                              │   Prometheus    │
                              └─────────────────┘
```

## Quick Start

### 1. Build Docker Image

```bash
docker build -t your-registry/keda-ray-serve-scaler:latest .
docker push your-registry/keda-ray-serve-scaler:latest
```

### 2. Deploy to Kubernetes

```bash
# Deploy external scaler
kubectl apply -f k8s/deployment.yaml

# Deploy ScaledObjects
kubectl apply -f k8s/scaledobject.yaml
```

### 3. Verify Deployment

```bash
# Check scaler pods
kubectl get pods -n ray-serve -l app=keda-ray-serve-scaler

# Check ScaledObjects
kubectl get scaledobject -n ray-serve

# View scaler logs
kubectl logs -n ray-serve -l app=keda-ray-serve-scaler -f
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RAY_SERVE_URL` | `http://ray-serve-service:8000` | Ray Serve API endpoint |
| `PROMETHEUS_URL` | `http://prometheus:9090` | Prometheus endpoint (fallback) |
| `GRPC_PORT` | `50051` | gRPC server port |
| `SCRAPE_INTERVAL` | `10` | Metrics scrape interval (seconds) |

### ScaledObject Metadata

| Parameter | Required | Description |
|-----------|----------|-------------|
| `scalerAddress` | Yes | External scaler gRPC endpoint |
| `modelNames` | Yes | Comma-separated list of model deployments |
| `queueLengthThreshold` | No | Queue length threshold (default: 20) |
| `latencyP95Threshold` | No | p95 latency threshold in ms (default: 500) |
| `metricType` | Yes | `queue`, `latency`, or `combined` |

## Scaling Examples

### Queue-Based Scaling

Scale when queue length exceeds threshold:

```yaml
triggers:
- type: external
  metadata:
    scalerAddress: keda-ray-serve-scaler.ray-serve.svc.cluster.local:50051
    modelNames: fraud-detection,risk-scoring
    queueLengthThreshold: "20"
    metricType: queue
```

### Latency-Based Scaling

Scale when p95 latency exceeds threshold:

```yaml
triggers:
- type: external
  metadata:
    scalerAddress: keda-ray-serve-scaler.ray-serve.svc.cluster.local:50051
    modelNames: fraud-detection
    latencyP95Threshold: "500"
    metricType: latency
```

### Combined Scaling

Scale based on both metrics:

```yaml
triggers:
- type: external
  metadata:
    scalerAddress: keda-ray-serve-scaler.ray-serve.svc.cluster.local:50051
    modelNames: fraud-detection,risk-scoring,claims-prediction
    queueLengthThreshold: "50"
    latencyP95Threshold: "1000"
    metricType: combined
```

## Development

### Generate Protobuf Code

```bash
./generate_proto.sh
```

### Run Tests

```bash
pip install pytest pytest-asyncio
pytest tests/ -v
```

### Local Testing

```bash
# Set environment variables
export RAY_SERVE_URL=http://localhost:8000
export PROMETHEUS_URL=http://localhost:9090

# Run scaler
python src/scaler_service.py
```

## Monitoring

The external scaler exposes metrics and logs for monitoring:

### Logs

```bash
kubectl logs -n ray-serve -l app=keda-ray-serve-scaler -f
```

### Key Log Messages

- `Started Ray Serve metrics collector` - Collector initialized
- `IsActive check for <name>` - Active status check
- `Queue length: X, active: Y` - Queue metrics
- `Max p95 latency: Xms, threshold: Yms` - Latency metrics
- `GetMetrics for <metric>` - Metric value request

## Troubleshooting

### Scaler Not Scaling

1. Check scaler logs for errors
2. Verify Ray Serve URL is accessible
3. Check ScaledObject status: `kubectl describe scaledobject -n ray-serve`
4. Verify metrics are being collected: check logs for "GetMetrics"

### High Latency

1. Increase `pollingInterval` in ScaledObject
2. Reduce `scrape_interval` environment variable
3. Check network latency to Ray Serve/Prometheus

### Metrics Not Available

1. Verify Ray Serve metrics endpoint: `curl http://ray-serve:8000/metrics`
2. Check Prometheus connectivity
3. Verify model names match Ray Serve deployments

## Production Recommendations

1. **High Availability**: Deploy 2+ replicas of external scaler
2. **Monitoring**: Set up alerts for scaler pod failures
3. **Resource Limits**: Adjust CPU/memory based on model count
4. **Caching**: Tune `scrape_interval` based on load patterns
5. **Fallback**: Ensure Prometheus is available as fallback

## License

MIT

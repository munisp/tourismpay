# TLS/HTTPS Configuration

## Production Setup

TourismPay uses TLS termination at the load balancer level (recommended for Kubernetes deployments).

### Option 1: cert-manager (Kubernetes, recommended)
```yaml
# Apply the ClusterIssuer for Let's Encrypt
kubectl apply -f cluster-issuer.yaml

# The Ingress automatically provisions certificates
kubectl apply -f ingress.yaml
```

### Option 2: Application-level TLS (standalone deployments)
Set these environment variables:
```
TLS_CERT_PATH=/etc/ssl/certs/tourismpay.crt
TLS_KEY_PATH=/etc/ssl/private/tourismpay.key
TLS_ENABLED=true
```

### Option 3: Cloudflare/CDN (edge TLS)
Configure Full (strict) SSL mode in Cloudflare dashboard.
Origin certificate: use Cloudflare origin CA.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TLS_ENABLED` | Enable HTTPS on the application server | `false` |
| `TLS_CERT_PATH` | Path to TLS certificate file | - |
| `TLS_KEY_PATH` | Path to TLS private key file | - |
| `TLS_MIN_VERSION` | Minimum TLS version | `1.2` |
| `HSTS_MAX_AGE` | HSTS max-age in seconds | `31536000` |
| `FORCE_HTTPS` | Redirect HTTP to HTTPS | `true` in production |

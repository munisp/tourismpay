# TigerBeetle Payment Service Implementation

Complete, production-ready Go implementation of payment processing with TigerBeetle integration for the insurance platform.

## Overview

This implementation provides atomic financial transaction processing using **TigerBeetle** as the distributed ledger and **Temporal** for workflow orchestration. It includes:

- **TigerBeetle Client Wrapper**: High-level Go client for TigerBeetle operations
- **Payment Service**: Complete payment processing with premium payments, refunds, and commissions
- **Temporal Activities**: Workflow activities for policy issuance including `ProcessPremiumPaymentActivity`
- **Repository Layer**: PostgreSQL integration for payment records
- **Models**: Comprehensive data structures for payments, policies, and transactions
- **Tests**: Unit tests with mocks for all components

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Temporal Workflow                         │
│              (PolicyIssuanceWorkflow)                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              ProcessPremiumPaymentActivity                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Payment Service                            │
│  • Validate request                                          │
│  • Get customer account ID                                   │
│  • Create atomic transfer in TigerBeetle                     │
│  • Record transaction in PostgreSQL                          │
│  • Publish event to Kafka                                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┬──────────────┐
        ▼                   ▼              ▼
┌──────────────┐   ┌──────────────┐   ┌──────────┐
│ TigerBeetle  │   │  PostgreSQL  │   │  Kafka   │
│   (Ledger)   │   │  (Records)   │   │ (Events) │
└──────────────┘   └──────────────┘   └──────────┘
```

## Directory Structure

```
tigerbeetle-implementation/
├── ledger/
│   ├── tigerbeetle_client.go       # TigerBeetle client wrapper
│   └── tigerbeetle_client_test.go  # Client tests
├── service/
│   ├── payment_service.go          # Payment service implementation
│   └── payment_service_test.go     # Service tests
├── workflows/
│   └── activities.go                # Temporal activities
├── models/
│   └── models.go                    # Data models
├── repository/
│   └── payment_repository.go       # Database repository
├── schema.sql                       # PostgreSQL schema
├── go.mod                           # Go dependencies
└── README.md                        # This file
```

## Key Components

### 1. TigerBeetle Client (`ledger/tigerbeetle_client.go`)

High-level wrapper around the TigerBeetle Go client providing:

- **Account Management**: `CreateAccount()`, `CreateAccounts()`, `LookupAccounts()`
- **Transfer Operations**: `CreateTransfer()`, `CreateTransfers()`, `LookupTransfers()`
- **Balance Queries**: `GetAccountBalance()`
- **ID Generation**: `GenerateTransferID()`, `GenerateAccountID()` for deterministic IDs
- **Error Handling**: Custom `TransferError` type with helper methods

**Example Usage:**

```go
// Create client
config := ledger.ClientConfig{
    ClusterID: 1,
    Addresses: []string{"tigerbeetle-0:3000", "tigerbeetle-1:3000"},
    MaxConcurrentBatch: 4096,
}
client, err := ledger.NewTigerBeetleClient(config)

// Create transfer
transfer := types.Transfer{
    ID:              ledger.GenerateTransferID("policy-123", 1),
    DebitAccountID:  customerAccountID,
    CreditAccountID: types.ToUint128(CompanyReceivablesAccountID),
    Amount:          types.ToUint128(5000000), // 50,000.00 NGN in kobo
    Ledger:          1,
    Code:            uint16(ledger.TransferCodePremiumPayment),
}
err = client.CreateTransfer(ctx, transfer)
```

### 2. Payment Service (`service/payment_service.go`)

Handles all payment-related business logic:

- **`ProcessPremiumPayment()`**: Processes premium payments with TigerBeetle integration
- **`ProcessRefund()`**: Handles refund processing
- **`ProcessCommissionPayment()`**: Pays commissions to agents
- **`GetPaymentStatus()`**: Retrieves payment information
- **`GetPaymentsByPolicy()`**: Lists all payments for a policy

**Features:**

- Atomic transfers via TigerBeetle
- Idempotency handling (duplicate detection)
- Insufficient funds detection
- PostgreSQL transaction recording
- Kafka event publishing
- Comprehensive error handling

**Example Usage:**

```go
paymentService := service.NewPaymentService(ledgerClient, paymentRepo, kafkaProducer)

req := models.PaymentRequest{
    PolicyID:      "policy-123",
    CustomerID:    "12345",
    Amount:        50000.00,
    Currency:      "NGN",
    PaymentMethod: models.PaymentMethodCard,
}

response, err := paymentService.ProcessPremiumPayment(ctx, req)
if err != nil {
    log.Fatal(err)
}

fmt.Printf("Payment Status: %s, Transaction ID: %s\n", 
    response.Status, response.TransactionID)
```

### 3. Temporal Activities (`workflows/activities.go`)

Workflow activities for policy issuance:

- **`VerifyCustomerNINActivity`**: Verifies customer NIN with NIMC
- **`CalculateRiskAndPremiumActivity`**: Calculates premium based on risk factors
- **`CreatePolicyRecordActivity`**: Creates policy in database
- **`ProcessPremiumPaymentActivity`**: Processes payment via Payment Service
- **`GeneratePolicyDocumentActivity`**: Generates PDF policy document
- **`IssuePolicyActivity`**: Activates the policy
- **`SendPolicyNotificationsActivity`**: Sends notifications to customer

**ProcessPremiumPaymentActivity Implementation:**

```go
func (a *Activities) ProcessPremiumPaymentActivity(ctx context.Context, req models.PaymentRequest) (*models.PaymentResult, error) {
    // Process payment through Payment Service
    response, err := a.PaymentService.ProcessPremiumPayment(ctx, req)
    if err != nil {
        return &models.PaymentResult{
            Status:        models.PaymentStatusFailed,
            FailureReason: err.Error(),
        }, nil
    }

    if response.Status != models.PaymentStatusCompleted {
        return &models.PaymentResult{
            Status:        response.Status,
            FailureReason: response.FailureReason,
        }, nil
    }

    return &models.PaymentResult{
        Status:        models.PaymentStatusCompleted,
        TransactionID: response.TransactionID,
        PaymentID:     response.PaymentID,
        ProcessedAt:   time.Now(),
    }, nil
}
```

### 4. Models (`models/models.go`)

Comprehensive data structures:

- **Payment Models**: `Payment`, `PaymentRequest`, `PaymentResponse`, `PaymentResult`
- **Policy Models**: `Policy`, `PremiumDetails`
- **Verification Models**: `VerificationResult`
- **Event Models**: `PaymentEvent`
- **Enums**: `PaymentStatus`, `PaymentType`, `PaymentMethod`, `PolicyType`, `PolicyStatus`

### 5. Repository (`repository/payment_repository.go`)

PostgreSQL database operations:

- **`Create()`**: Insert new payment record
- **`GetByID()`**: Retrieve payment by ID
- **`GetByTransferID()`**: Retrieve payment by TigerBeetle transfer ID
- **`GetByPolicyID()`**: List all payments for a policy
- **`UpdateStatus()`**: Update payment status
- **`GetPaymentStats()`**: Retrieve payment statistics

## Database Schema

The `schema.sql` file includes:

- **payments**: Payment transaction records
- **policies**: Insurance policy information
- **customers**: Customer information with NIN verification
- **verification_records**: NIN/CAC verification history
- **agents**: Agent information
- **claims**: Insurance claims

All tables include appropriate indexes for performance and triggers for automatic `updated_at` timestamp updates.

## Testing

### Running Tests

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific package tests
go test ./ledger -v
go test ./service -v

# Run tests with race detection
go test -race ./...
```

### Test Coverage

- **TigerBeetle Client Tests** (`ledger/tigerbeetle_client_test.go`):
  - Account creation (single and batch)
  - Transfer creation (success, insufficient funds, duplicates)
  - Balance queries
  - ID generation
  - Error handling

- **Payment Service Tests** (`service/payment_service_test.go`):
  - Premium payment processing (success, failure, duplicates)
  - Refund processing
  - Request validation
  - Payment status queries
  - Mock-based unit tests

### Prerequisites for Integration Tests

Integration tests require a running TigerBeetle cluster:

```bash
# Start TigerBeetle in Docker
docker run -p 3000:3000 ghcr.io/tigerbeetle/tigerbeetle:latest
```

## Configuration

### Environment Variables

```bash
# TigerBeetle Configuration
TIGERBEETLE_CLUSTER_ID=1
TIGERBEETLE_ADDRESSES=tigerbeetle-0:3000,tigerbeetle-1:3000,tigerbeetle-2:3000

# PostgreSQL Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/insurance_db

# Kafka Configuration
KAFKA_BROKERS=kafka-0:9092,kafka-1:9092
KAFKA_TOPIC_PAYMENTS=payment-events

# Temporal Configuration
TEMPORAL_SERVICE_URL=temporal:7233
TEMPORAL_NAMESPACE=insurance-platform
```

### Initialization

```go
// Initialize TigerBeetle client
ledgerClient, err := ledger.NewTigerBeetleClient(ledger.ClientConfig{
    ClusterID: 1,
    Addresses: strings.Split(os.Getenv("TIGERBEETLE_ADDRESSES"), ","),
    MaxConcurrentBatch: 4096,
})

// Initialize PostgreSQL connection
db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))

// Initialize repository
paymentRepo := repository.NewPaymentRepository(db)

// Initialize Kafka producer
kafkaProducer := kafka.NewProducer(os.Getenv("KAFKA_BROKERS"))

// Initialize Payment Service
paymentService := service.NewPaymentService(ledgerClient, paymentRepo, kafkaProducer)
```

## Deployment

### Docker Deployment

```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o payment-service ./cmd/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/payment-service .

EXPOSE 8080
CMD ["./payment-service"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      containers:
      - name: payment-service
        image: insurance-platform/payment-service:latest
        env:
        - name: TIGERBEETLE_ADDRESSES
          value: "tigerbeetle-0:3000,tigerbeetle-1:3000"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        ports:
        - containerPort: 8080
```

## Performance Considerations

### TigerBeetle Optimizations

1. **Batch Operations**: Use `CreateTransfers()` instead of multiple `CreateTransfer()` calls
2. **Connection Pooling**: Reuse client connections across requests
3. **Deterministic IDs**: Use `GenerateTransferID()` for idempotency

### Payment Service Optimizations

1. **Async Event Publishing**: Kafka publishing doesn't block payment completion
2. **Database Connection Pooling**: Configure appropriate pool size
3. **Timeout Configuration**: Set appropriate context timeouts for operations

## Security

### Best Practices Implemented

1. **Network Isolation**: TigerBeetle should be in a private network
2. **Input Validation**: All payment requests are validated
3. **Idempotency**: Duplicate transfers are detected and handled
4. **Audit Trail**: All transactions are logged in PostgreSQL and TigerBeetle
5. **Error Handling**: Sensitive error details are not exposed to clients

## Monitoring

### Key Metrics

- **Payment Success Rate**: Percentage of successful payments
- **Average Payment Processing Time**: Time from request to completion
- **TigerBeetle Transfer Latency**: Time for transfer execution
- **Database Query Performance**: Repository operation times
- **Kafka Event Publishing Success Rate**: Event delivery success

### Logging

All components include structured logging:

```go
log.Printf("Processing premium payment: PolicyID=%s, Amount=%.2f, Currency=%s",
    req.PolicyID, req.Amount, req.Currency)
```

## Troubleshooting

### Common Issues

1. **Insufficient Funds Error**
   - Check customer account balance in TigerBeetle
   - Verify account was properly funded

2. **Duplicate Transfer Error**
   - This is normal for idempotency - check if original transfer succeeded
   - Use `GetByTransferID()` to retrieve original payment

3. **Database Connection Errors**
   - Verify PostgreSQL is running and accessible
   - Check connection string and credentials

4. **TigerBeetle Connection Errors**
   - Verify TigerBeetle cluster is running
   - Check cluster addresses and network connectivity

## License

Copyright © 2026 Insurance Platform. All rights reserved.

## Support

For questions or issues, please contact the development team or refer to the main platform documentation.

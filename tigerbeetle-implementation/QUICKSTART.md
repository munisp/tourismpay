# Quick Start Guide

Get up and running with the TigerBeetle Payment Service in 5 minutes.

## Prerequisites

- Go 1.21 or later
- Docker and Docker Compose
- PostgreSQL 14+
- TigerBeetle cluster

## Step 1: Start Infrastructure

### Start TigerBeetle

```bash
docker run -d -p 3000:3000 \
  --name tigerbeetle \
  ghcr.io/tigerbeetle/tigerbeetle:latest
```

### Start PostgreSQL

```bash
docker run -d -p 5432:5432 \
  --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=insurance_db \
  postgres:14
```

## Step 2: Initialize Database

```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d insurance_db

# Run schema
\i schema.sql
```

## Step 3: Install Dependencies

```bash
cd tigerbeetle-implementation
go mod download
```

## Step 4: Run Tests

```bash
# Run all tests
go test ./... -v

# Run with coverage
go test ./... -cover
```

## Step 5: Use the Code

### Example 1: Create TigerBeetle Client

```go
package main

import (
    "context"
    "log"
    
    "insurance-platform/ledger"
)

func main() {
    // Create client
    client, err := ledger.NewTigerBeetleClient(ledger.ClientConfig{
        ClusterID: 1,
        Addresses: []string{"localhost:3000"},
        MaxConcurrentBatch: 4096,
    })
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()
    
    // Create company accounts
    ctx := context.Background()
    accounts := []types.Account{
        {
            ID:     types.ToUint128(1),
            Ledger: 1,
            Code:   uint16(ledger.AccountTypeCompanyReceivables),
        },
        {
            ID:     types.ToUint128(2),
            Ledger: 1,
            Code:   uint16(ledger.AccountTypeCompanyPayables),
        },
    }
    
    _, err = client.CreateAccounts(ctx, accounts)
    if err != nil {
        log.Fatal(err)
    }
    
    log.Println("Company accounts created successfully")
}
```

### Example 2: Process a Payment

```go
package main

import (
    "context"
    "database/sql"
    "log"
    
    _ "github.com/lib/pq"
    
    "insurance-platform/ledger"
    "insurance-platform/models"
    "insurance-platform/repository"
    "insurance-platform/service"
)

func main() {
    // Initialize TigerBeetle client
    ledgerClient, err := ledger.NewTigerBeetleClient(ledger.ClientConfig{
        ClusterID: 1,
        Addresses: []string{"localhost:3000"},
    })
    if err != nil {
        log.Fatal(err)
    }
    defer ledgerClient.Close()
    
    // Initialize database
    db, err := sql.Open("postgres", 
        "postgresql://postgres:postgres@localhost:5432/insurance_db?sslmode=disable")
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()
    
    // Initialize repository
    paymentRepo := repository.NewPaymentRepository(db)
    
    // Initialize Kafka producer (mock for this example)
    kafkaProducer := &MockKafkaProducer{}
    
    // Initialize Payment Service
    paymentService := service.NewPaymentService(ledgerClient, paymentRepo, kafkaProducer)
    
    // Process a premium payment
    ctx := context.Background()
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
    
    log.Printf("Payment processed successfully!")
    log.Printf("Status: %s", response.Status)
    log.Printf("Transaction ID: %s", response.TransactionID)
    log.Printf("Payment ID: %d", response.PaymentID)
}

type MockKafkaProducer struct{}

func (m *MockKafkaProducer) PublishPaymentEvent(ctx context.Context, event models.PaymentEvent) error {
    log.Printf("Event published: %s", event.EventType)
    return nil
}
```

### Example 3: Use in Temporal Workflow

```go
package main

import (
    "log"
    
    "go.temporal.io/sdk/client"
    "go.temporal.io/sdk/worker"
    
    "insurance-platform/workflows"
)

func main() {
    // Create Temporal client
    c, err := client.Dial(client.Options{
        HostPort: "localhost:7233",
    })
    if err != nil {
        log.Fatal(err)
    }
    defer c.Close()
    
    // Create worker
    w := worker.New(c, "policy-task-queue", worker.Options{})
    
    // Register workflows
    w.RegisterWorkflow(workflows.PolicyIssuanceWorkflow)
    
    // Register activities
    activities := &workflows.Activities{
        PaymentService: paymentService, // initialized earlier
        // ... other dependencies
    }
    w.RegisterActivity(activities)
    
    // Start worker
    err = w.Run(worker.InterruptCh())
    if err != nil {
        log.Fatal(err)
    }
}
```

## Common Operations

### Check Account Balance

```go
accountID := ledger.GenerateAccountID("customer", 12345)
debits, credits, err := client.GetAccountBalance(ctx, accountID)
if err != nil {
    log.Fatal(err)
}

balance := int64(credits) - int64(debits)
log.Printf("Account balance: %.2f NGN", float64(balance)/100)
```

### Process a Refund

```go
refundReq := models.RefundRequest{
    PaymentID: 1,
    Amount:    25000.00,
    Reason:    "Customer requested refund",
}

response, err := paymentService.ProcessRefund(ctx, refundReq)
if err != nil {
    log.Fatal(err)
}

log.Printf("Refund processed: %s", response.TransactionID)
```

### Get Payment History

```go
payments, err := paymentService.GetPaymentsByPolicy(ctx, "policy-123")
if err != nil {
    log.Fatal(err)
}

for _, payment := range payments {
    log.Printf("Payment: %s, Amount: %.2f, Status: %s", 
        payment.TransactionID, payment.Amount, payment.Status)
}
```

## Environment Variables

Create a `.env` file:

```bash
# TigerBeetle
TIGERBEETLE_CLUSTER_ID=1
TIGERBEETLE_ADDRESSES=localhost:3000

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/insurance_db?sslmode=disable

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC_PAYMENTS=payment-events

# Temporal
TEMPORAL_SERVICE_URL=localhost:7233
TEMPORAL_NAMESPACE=default
```

Load environment variables:

```go
import "github.com/joho/godotenv"

func init() {
    godotenv.Load()
}
```

## Troubleshooting

### TigerBeetle Connection Failed

```bash
# Check if TigerBeetle is running
docker ps | grep tigerbeetle

# Check logs
docker logs tigerbeetle

# Restart if needed
docker restart tigerbeetle
```

### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -U postgres -d insurance_db -c "SELECT 1"
```

### Tests Failing

```bash
# Make sure infrastructure is running
docker ps

# Run tests with verbose output
go test ./... -v

# Run specific test
go test ./service -run TestProcessPremiumPayment_Success -v
```

## Next Steps

1. Read the full [README.md](README.md) for detailed documentation
2. Review the [Digital Transaction Protocols Guide](../DIGITAL_TRANSACTION_PROTOCOLS_GUIDE.md)
3. Explore the test files for more usage examples
4. Integrate with your existing services

## Support

For questions or issues:
- Check the README.md for detailed documentation
- Review test files for usage examples
- Contact the development team

Happy coding! 🚀

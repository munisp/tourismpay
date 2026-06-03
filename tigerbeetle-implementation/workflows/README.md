# Temporal Workflow Implementation

Complete implementation of the **PolicyIssuanceWorkflow** with comprehensive payment handling, saga pattern compensations, and error recovery.

## Overview

The `PolicyIssuanceWorkflow` orchestrates the entire policy issuance process from NIN verification to policy activation. It implements the **Saga pattern** for distributed transaction management, ensuring data consistency through compensating actions when failures occur.

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  PolicyIssuanceWorkflow                          │
│                                                                  │
│  Step 1: Verify Customer NIN                                    │
│  Step 2: Calculate Risk and Premium                             │
│  Step 3: Create Policy Record (status: PENDING)                 │
│  Step 4: Process Premium Payment ◄── CRITICAL STEP              │
│  Step 5: Generate Policy Document                               │
│  Step 6: Issue Policy (status: ACTIVE)                          │
│  Step 7: Send Notifications                                     │
│  Step 8: Schedule Premium Reminders                             │
│                                                                  │
│  If any step fails → Execute Compensations (reverse order)      │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. **Payment Processing with Success/Failure Handling**

The workflow handles three payment scenarios:

#### ✅ **Success Path**
```go
paymentResult.Status == models.PaymentStatusCompleted
→ Continue to next step (document generation)
```

#### ❌ **Payment Failed (Business Logic)**
```go
paymentResult.Status == models.PaymentStatusFailed
→ Execute compensations
→ Return failed result (not error)
```

#### ❌ **Payment Activity Error (Technical Failure)**
```go
err != nil from ProcessPremiumPaymentActivity
→ Execute compensations
→ Return workflow error
```

### 2. **Saga Pattern Compensation**

When a step fails, compensating actions are executed in **reverse order**:

| Completed Step | Compensating Action |
|----------------|---------------------|
| `POLICY_ISSUED` | `CancelPolicyActivity` - Update status to CANCELLED |
| `DOCUMENT_GENERATED` | `DeletePolicyDocumentActivity` - Delete PDF from storage |
| `PAYMENT_COMPLETED` | `ProcessRefundActivity` - Refund customer via TigerBeetle |
| `POLICY_CREATED` | `DeletePolicyRecordActivity` - Delete policy record |
| `PREMIUM_CALCULATED` | No compensation needed |
| `NIN_VERIFIED` | No compensation needed |

### 3. **Error Recovery Strategy**

- **Automatic Retries**: Activities retry with exponential backoff
- **Non-Retryable Errors**: NIN verification failures, payment failures
- **Timeout Protection**: Each activity has start-to-close timeout
- **Idempotency**: All activities are idempotent for safe retries

### 4. **Critical vs Non-Critical Steps**

**Critical Steps** (failure triggers compensations):
- NIN Verification
- Premium Calculation
- Policy Record Creation
- **Payment Processing** ← Most critical
- Document Generation
- Policy Issuance

**Non-Critical Steps** (failure logged but workflow continues):
- Send Notifications
- Schedule Premium Reminders

## Code Structure

### Files

```
workflows/
├── policy_issuance_workflow.go      # Main workflow implementation
├── activities.go                     # All workflow activities
├── compensating_activities.go        # Saga compensation activities
├── policy_issuance_workflow_test.go # Comprehensive tests
└── README.md                         # This file

cmd/worker/
└── main.go                           # Worker registration and startup

examples/
└── start_workflow.go                 # Client examples
```

## Usage

### 1. Start the Worker

```bash
# Set environment variables
export TIGERBEETLE_ADDRESSES=tigerbeetle-0:3000,tigerbeetle-1:3000
export DATABASE_URL=postgresql://user:pass@localhost:5432/insurance_db
export TEMPORAL_SERVICE_URL=localhost:7233
export TEMPORAL_TASK_QUEUE=policy-task-queue

# Run the worker
go run cmd/worker/main.go
```

### 2. Start a Workflow

```go
package main

import (
    "context"
    "time"
    
    "go.temporal.io/sdk/client"
    "insurance-platform/models"
    "insurance-platform/workflows"
)

func main() {
    // Create Temporal client
    c, err := client.Dial(client.Options{
        HostPort: "localhost:7233",
    })
    if err != nil {
        panic(err)
    }
    defer c.Close()

    // Prepare input
    input := workflows.PolicyIssuanceInput{
        CustomerID:       "12345",
        PolicyType:       models.PolicyTypeLife,
        SumAssured:       1000000.00,
        PremiumFrequency: models.PremiumFrequencyMonthly,
        DurationMonths:   12,
        StartDate:        time.Now(),
        PaymentMethod:    models.PaymentMethodCard,
    }

    // Start workflow
    we, err := c.ExecuteWorkflow(
        context.Background(),
        client.StartWorkflowOptions{
            ID:        "policy-workflow-001",
            TaskQueue: "policy-task-queue",
        },
        workflows.PolicyIssuanceWorkflow,
        input,
    )
    if err != nil {
        panic(err)
    }

    // Wait for result
    var result workflows.PolicyIssuanceResult
    err = we.Get(context.Background(), &result)
    if err != nil {
        panic(err)
    }

    if result.Success {
        println("✓ Policy issued:", result.PolicyNumber)
    } else {
        println("✗ Failed:", result.FailureReason)
    }
}
```

## Payment Processing Details

### ProcessPremiumPaymentActivity Implementation

```go
func (a *Activities) ProcessPremiumPaymentActivity(
    ctx context.Context, 
    req models.PaymentRequest,
) (*models.PaymentResult, error) {
    // Call Payment Service
    response, err := a.PaymentService.ProcessPremiumPayment(ctx, req)
    if err != nil {
        // Technical error (TigerBeetle down, DB error, etc.)
        return &models.PaymentResult{
            Status:        models.PaymentStatusFailed,
            FailureReason: err.Error(),
        }, nil
    }

    // Check business logic result
    if response.Status != models.PaymentStatusCompleted {
        // Business failure (insufficient funds, etc.)
        return &models.PaymentResult{
            Status:        response.Status,
            FailureReason: response.FailureReason,
        }, nil
    }

    // Success
    return &models.PaymentResult{
        Status:        models.PaymentStatusCompleted,
        TransactionID: response.TransactionID,
        PaymentID:     response.PaymentID,
        ProcessedAt:   time.Now(),
    }, nil
}
```

### Workflow Payment Handling

```go
// Execute payment activity
var paymentResult models.PaymentResult
err := workflow.ExecuteActivity(ctx, "ProcessPremiumPaymentActivity", paymentRequest).
    Get(ctx, &paymentResult)

// Handle activity error (technical failure)
if err != nil {
    logger.Error("Payment processing activity failed", "error", err)
    executeCompensations(ctx, &workflowState)
    return nil, err
}

// Handle payment failure (business logic)
if paymentResult.Status != models.PaymentStatusCompleted {
    logger.Error("Payment processing failed", 
        "status", paymentResult.Status,
        "reason", paymentResult.FailureReason)
    
    executeCompensations(ctx, &workflowState)
    
    return &PolicyIssuanceResult{
        Success:       false,
        PolicyID:      policyID,
        FailureReason: fmt.Sprintf("Payment failed: %s", paymentResult.FailureReason),
        FailureStep:   "PAYMENT_PROCESSING",
    }, nil // Return nil error but failed result
}

// Payment successful - continue
workflowState.CompletedSteps = append(workflowState.CompletedSteps, "PAYMENT_COMPLETED")
```

## Compensation Flow

### Example: Document Generation Fails

```
Completed Steps: [NIN_VERIFIED, PREMIUM_CALCULATED, POLICY_CREATED, PAYMENT_COMPLETED, DOCUMENT_GENERATED]
                                                                                            ↑
                                                                                     Failure here

Compensation Execution (reverse order):
1. DeletePolicyDocumentActivity (partial document cleanup)
2. ProcessRefundActivity (refund customer via TigerBeetle)
3. DeletePolicyRecordActivity (remove policy from database)
```

### Compensation Code

```go
func executeCompensations(ctx workflow.Context, state *PolicyIssuanceState) {
    logger := workflow.GetLogger(ctx)
    
    // Execute in reverse order
    for i := len(state.CompletedSteps) - 1; i >= 0; i-- {
        step := state.CompletedSteps[i]
        
        switch step {
        case "PAYMENT_COMPLETED":
            refundRequest := models.RefundRequest{
                PaymentID: state.PaymentResult.PaymentID,
                Amount:    state.PremiumDetails.Amount,
                Reason:    "Policy issuance failed - automatic refund",
            }
            err := workflow.ExecuteActivity(ctx, "ProcessRefundActivity", refundRequest).
                Get(ctx, nil)
            if err != nil {
                logger.Error("Failed to process refund", "error", err)
            }
            
        case "POLICY_CREATED":
            err := workflow.ExecuteActivity(ctx, "DeletePolicyRecordActivity", state.PolicyID).
                Get(ctx, nil)
            if err != nil {
                logger.Error("Failed to delete policy record", "error", err)
            }
        }
    }
}
```

## Testing

### Run Tests

```bash
# Run all workflow tests
go test ./workflows -v

# Run specific test
go test ./workflows -run TestPolicyIssuanceWorkflow_Success -v

# Run with coverage
go test ./workflows -cover
```

### Test Scenarios

1. **Success Path** - All steps complete successfully
2. **Payment Failed** - Insufficient funds triggers compensations
3. **Payment Activity Error** - TigerBeetle connection failure
4. **Document Generation Failed** - Triggers refund compensation
5. **NIN Verification Failed** - Early workflow termination
6. **Notification Failure** - Non-critical, workflow continues
7. **Full Compensation Flow** - All compensations executed

## Monitoring

### Temporal UI

Access the Temporal Web UI to monitor workflows:

```
http://localhost:8080
```

### Key Metrics

- **Workflow Success Rate**: Percentage of successful policy issuances
- **Payment Failure Rate**: Percentage of payment failures
- **Compensation Execution Rate**: How often compensations are triggered
- **Average Workflow Duration**: Time from start to completion
- **Step-by-Step Duration**: Time spent in each activity

### Logging

All activities include structured logging:

```go
log.Printf("Processing premium payment: PolicyID=%s, Amount=%.2f", 
    req.PolicyID, req.Amount)
```

## Configuration

### Activity Timeouts

```go
ao := workflow.ActivityOptions{
    StartToCloseTimeout:    10 * time.Minute,
    ScheduleToStartTimeout: 1 * time.Minute,
    RetryPolicy: &workflow.RetryPolicy{
        InitialInterval:    time.Second,
        BackoffCoefficient: 2.0,
        MaximumInterval:    100 * time.Second,
        MaximumAttempts:    5,
    },
}
```

### Compensation Timeouts

```go
compensationAO := workflow.ActivityOptions{
    StartToCloseTimeout: 5 * time.Minute,
    RetryPolicy: &workflow.RetryPolicy{
        InitialInterval: time.Second,
        MaximumAttempts: 3,
    },
}
```

## Best Practices

1. **Always Return PaymentResult** - Even on errors, return a result with failure status
2. **Idempotent Activities** - All activities must be idempotent for safe retries
3. **Deterministic Workflow Code** - No random numbers, time.Now() → use workflow.Now()
4. **Compensate in Reverse Order** - Undo operations in reverse of execution
5. **Log Everything** - Comprehensive logging for debugging and monitoring
6. **Test All Paths** - Success, failure, and compensation scenarios

## Troubleshooting

### Workflow Stuck

```bash
# Check Temporal UI for workflow status
# Check worker logs for activity errors
# Verify all services are running (TigerBeetle, PostgreSQL, Kafka)
```

### Payment Failures

```bash
# Check TigerBeetle cluster status
# Verify customer account exists and has funds
# Check payment service logs
```

### Compensation Failures

```bash
# Check compensation activity logs
# Verify refund was processed in TigerBeetle
# Check policy record status in database
```

## Production Considerations

1. **Worker Scaling**: Run multiple workers for high throughput
2. **Database Connection Pooling**: Configure appropriate pool size
3. **TigerBeetle Cluster**: Use 3+ replicas for high availability
4. **Monitoring**: Set up alerts for workflow failures
5. **Dead Letter Queue**: Handle permanently failed workflows
6. **Compensation Alerts**: Alert on compensation execution

## License

Copyright © 2026 Insurance Platform. All rights reserved.

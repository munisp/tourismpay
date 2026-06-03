package workflows

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/suite"
	"go.temporal.io/sdk/testsuite"

	"insurance-platform/models"
)

type PolicyIssuanceWorkflowTestSuite struct {
	suite.Suite
	testsuite.WorkflowTestSuite
	env *testsuite.TestWorkflowEnvironment
}

func TestPolicyIssuanceWorkflowTestSuite(t *testing.T) {
	suite.Run(t, new(PolicyIssuanceWorkflowTestSuite))
}

func (s *PolicyIssuanceWorkflowTestSuite) SetupTest() {
	s.env = s.NewTestWorkflowEnvironment()
}

func (s *PolicyIssuanceWorkflowTestSuite) AfterTest(suiteName, testName string) {
	s.env.AssertExpectations(s.T())
}

// Test: Successful policy issuance workflow
func (s *PolicyIssuanceWorkflowTestSuite) TestPolicyIssuanceWorkflow_Success() {
	// Setup test input
	input := PolicyIssuanceInput{
		CustomerID:       "12345",
		PolicyType:       models.PolicyTypeLife,
		SumAssured:       1000000.00,
		PremiumFrequency: models.PremiumFrequencyMonthly,
		DurationMonths:   12,
		StartDate:        time.Now(),
		PaymentMethod:    models.PaymentMethodCard,
	}

	// Mock Step 1: NIN Verification
	s.env.OnActivity("VerifyCustomerNINActivity", mock.Anything, input.CustomerID).Return(
		models.VerificationResult{
			Success:    true,
			NIN:        "12345678901",
			FirstName:  "John",
			LastName:   "Doe",
			VerifiedAt: time.Now(),
		}, nil,
	)

	// Mock Step 2: Premium Calculation
	s.env.OnActivity("CalculateRiskAndPremiumActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		models.PremiumDetails{
			Amount:             5000.00,
			AnnualAmount:       60000.00,
			RiskScore:          45.0,
			BasePremium:        4500.00,
			RiskMultiplier:     1.1,
			DurationMultiplier: 0.95,
			Frequency:          models.PremiumFrequencyMonthly,
			Currency:           "NGN",
		}, nil,
	)

	// Mock Step 3: Create Policy Record
	s.env.OnActivity("CreatePolicyRecordActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		"policy-123", nil,
	)

	// Mock Step 4: Process Premium Payment (SUCCESS)
	s.env.OnActivity("ProcessPremiumPaymentActivity", mock.Anything, mock.AnythingOfType("models.PaymentRequest")).Return(
		models.PaymentResult{
			Status:        models.PaymentStatusCompleted,
			TransactionID: "txn-abc123",
			PaymentID:     1,
			ProcessedAt:   time.Now(),
		}, nil,
	)

	// Mock Step 5: Generate Policy Document
	s.env.OnActivity("GeneratePolicyDocumentActivity", mock.Anything, "policy-123").Return(
		"https://storage.example.com/policies/policy-123.pdf", nil,
	)

	// Mock Step 6: Issue Policy
	s.env.OnActivity("IssuePolicyActivity", mock.Anything, "policy-123").Return(nil)

	// Mock Step 7: Send Notifications
	s.env.OnActivity("SendPolicyNotificationsActivity", mock.Anything, mock.AnythingOfType("models.NotificationRequest")).Return(nil)

	// Mock Step 8: Schedule Reminders
	s.env.OnActivity("SchedulePremiumRemindersActivity", mock.Anything, "policy-123").Return(nil)

	// Execute workflow
	s.env.ExecuteWorkflow(PolicyIssuanceWorkflow, input)

	// Assert workflow completed successfully
	s.True(s.env.IsWorkflowCompleted())
	s.NoError(s.env.GetWorkflowError())

	// Get and validate result
	var result PolicyIssuanceResult
	s.NoError(s.env.GetWorkflowResult(&result))

	s.True(result.Success)
	s.Equal("policy-123", result.PolicyID)
	s.Equal("txn-abc123", result.TransactionID)
	s.Equal(int64(1), result.PaymentID)
	s.Equal(5000.00, result.Premium)
	s.Equal(45.0, result.RiskScore)
	s.Contains(result.CompletedSteps, "NIN_VERIFIED")
	s.Contains(result.CompletedSteps, "PAYMENT_COMPLETED")
	s.Contains(result.CompletedSteps, "POLICY_ISSUED")
}

// Test: Payment failure triggers compensations
func (s *PolicyIssuanceWorkflowTestSuite) TestPolicyIssuanceWorkflow_PaymentFailed() {
	input := PolicyIssuanceInput{
		CustomerID:       "12345",
		PolicyType:       models.PolicyTypeLife,
		SumAssured:       1000000.00,
		PremiumFrequency: models.PremiumFrequencyMonthly,
		DurationMonths:   12,
		StartDate:        time.Now(),
		PaymentMethod:    models.PaymentMethodCard,
	}

	// Mock successful steps before payment
	s.env.OnActivity("VerifyCustomerNINActivity", mock.Anything, input.CustomerID).Return(
		models.VerificationResult{Success: true, NIN: "12345678901"}, nil,
	)

	s.env.OnActivity("CalculateRiskAndPremiumActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		models.PremiumDetails{Amount: 5000.00, RiskScore: 45.0}, nil,
	)

	s.env.OnActivity("CreatePolicyRecordActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		"policy-123", nil,
	)

	// Mock FAILED payment
	s.env.OnActivity("ProcessPremiumPaymentActivity", mock.Anything, mock.AnythingOfType("models.PaymentRequest")).Return(
		models.PaymentResult{
			Status:        models.PaymentStatusFailed,
			FailureReason: "Insufficient funds in customer account",
		}, nil,
	)

	// Mock compensation activities
	s.env.OnActivity("DeletePolicyRecordActivity", mock.Anything, "policy-123").Return(nil)

	// Execute workflow
	s.env.ExecuteWorkflow(PolicyIssuanceWorkflow, input)

	// Assert workflow completed (with failed result, not error)
	s.True(s.env.IsWorkflowCompleted())
	s.NoError(s.env.GetWorkflowError())

	// Get and validate result
	var result PolicyIssuanceResult
	s.NoError(s.env.GetWorkflowResult(&result))

	s.False(result.Success)
	s.Equal("policy-123", result.PolicyID)
	s.Contains(result.FailureReason, "Payment failed")
	s.Equal("PAYMENT_PROCESSING", result.FailureStep)
}

// Test: Payment activity error triggers compensations
func (s *PolicyIssuanceWorkflowTestSuite) TestPolicyIssuanceWorkflow_PaymentActivityError() {
	input := PolicyIssuanceInput{
		CustomerID:       "12345",
		PolicyType:       models.PolicyTypeLife,
		SumAssured:       1000000.00,
		PremiumFrequency: models.PremiumFrequencyMonthly,
		DurationMonths:   12,
		StartDate:        time.Now(),
		PaymentMethod:    models.PaymentMethodCard,
	}

	// Mock successful steps before payment
	s.env.OnActivity("VerifyCustomerNINActivity", mock.Anything, input.CustomerID).Return(
		models.VerificationResult{Success: true, NIN: "12345678901"}, nil,
	)

	s.env.OnActivity("CalculateRiskAndPremiumActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		models.PremiumDetails{Amount: 5000.00, RiskScore: 45.0}, nil,
	)

	s.env.OnActivity("CreatePolicyRecordActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		"policy-123", nil,
	)

	// Mock payment activity error (not just failed status)
	s.env.OnActivity("ProcessPremiumPaymentActivity", mock.Anything, mock.AnythingOfType("models.PaymentRequest")).Return(
		models.PaymentResult{}, errors.New("TigerBeetle connection failed"),
	)

	// Mock compensation activities
	s.env.OnActivity("DeletePolicyRecordActivity", mock.Anything, "policy-123").Return(nil)

	// Execute workflow
	s.env.ExecuteWorkflow(PolicyIssuanceWorkflow, input)

	// Assert workflow completed with error
	s.True(s.env.IsWorkflowCompleted())
	s.Error(s.env.GetWorkflowError())
}

// Test: Document generation failure triggers compensations including refund
func (s *PolicyIssuanceWorkflowTestSuite) TestPolicyIssuanceWorkflow_DocumentGenerationFailed() {
	input := PolicyIssuanceInput{
		CustomerID:       "12345",
		PolicyType:       models.PolicyTypeLife,
		SumAssured:       1000000.00,
		PremiumFrequency: models.PremiumFrequencyMonthly,
		DurationMonths:   12,
		StartDate:        time.Now(),
		PaymentMethod:    models.PaymentMethodCard,
	}

	// Mock successful steps up to payment
	s.env.OnActivity("VerifyCustomerNINActivity", mock.Anything, input.CustomerID).Return(
		models.VerificationResult{Success: true, NIN: "12345678901"}, nil,
	)

	s.env.OnActivity("CalculateRiskAndPremiumActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		models.PremiumDetails{Amount: 5000.00, RiskScore: 45.0}, nil,
	)

	s.env.OnActivity("CreatePolicyRecordActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		"policy-123", nil,
	)

	s.env.OnActivity("ProcessPremiumPaymentActivity", mock.Anything, mock.AnythingOfType("models.PaymentRequest")).Return(
		models.PaymentResult{
			Status:        models.PaymentStatusCompleted,
			TransactionID: "txn-abc123",
			PaymentID:     1,
		}, nil,
	)

	// Mock FAILED document generation
	s.env.OnActivity("GeneratePolicyDocumentActivity", mock.Anything, "policy-123").Return(
		"", errors.New("S3 upload failed"),
	)

	// Mock compensation activities (including refund)
	s.env.OnActivity("ProcessRefundActivity", mock.Anything, mock.AnythingOfType("models.RefundRequest")).Return(nil)
	s.env.OnActivity("DeletePolicyRecordActivity", mock.Anything, "policy-123").Return(nil)

	// Execute workflow
	s.env.ExecuteWorkflow(PolicyIssuanceWorkflow, input)

	// Assert workflow completed with error
	s.True(s.env.IsWorkflowCompleted())
	s.Error(s.env.GetWorkflowError())
}

// Test: NIN verification failure stops workflow early
func (s *PolicyIssuanceWorkflowTestSuite) TestPolicyIssuanceWorkflow_NINVerificationFailed() {
	input := PolicyIssuanceInput{
		CustomerID:       "12345",
		PolicyType:       models.PolicyTypeLife,
		SumAssured:       1000000.00,
		PremiumFrequency: models.PremiumFrequencyMonthly,
		DurationMonths:   12,
		StartDate:        time.Now(),
		PaymentMethod:    models.PaymentMethodCard,
	}

	// Mock FAILED NIN verification
	s.env.OnActivity("VerifyCustomerNINActivity", mock.Anything, input.CustomerID).Return(
		models.VerificationResult{
			Success:       false,
			FailureReason: "NIN not found in NIMC database",
		}, nil,
	)

	// Execute workflow
	s.env.ExecuteWorkflow(PolicyIssuanceWorkflow, input)

	// Assert workflow completed with error
	s.True(s.env.IsWorkflowCompleted())
	s.Error(s.env.GetWorkflowError())

	// Verify error type
	err := s.env.GetWorkflowError()
	s.Contains(err.Error(), "NIN_VERIFICATION_FAILED")
}

// Test: Notification failure doesn't fail workflow
func (s *PolicyIssuanceWorkflowTestSuite) TestPolicyIssuanceWorkflow_NotificationFailureNonCritical() {
	input := PolicyIssuanceInput{
		CustomerID:       "12345",
		PolicyType:       models.PolicyTypeLife,
		SumAssured:       1000000.00,
		PremiumFrequency: models.PremiumFrequencyMonthly,
		DurationMonths:   12,
		StartDate:        time.Now(),
		PaymentMethod:    models.PaymentMethodCard,
	}

	// Mock all successful steps
	s.env.OnActivity("VerifyCustomerNINActivity", mock.Anything, input.CustomerID).Return(
		models.VerificationResult{Success: true, NIN: "12345678901"}, nil,
	)

	s.env.OnActivity("CalculateRiskAndPremiumActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		models.PremiumDetails{Amount: 5000.00, RiskScore: 45.0}, nil,
	)

	s.env.OnActivity("CreatePolicyRecordActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		"policy-123", nil,
	)

	s.env.OnActivity("ProcessPremiumPaymentActivity", mock.Anything, mock.AnythingOfType("models.PaymentRequest")).Return(
		models.PaymentResult{
			Status:        models.PaymentStatusCompleted,
			TransactionID: "txn-abc123",
			PaymentID:     1,
		}, nil,
	)

	s.env.OnActivity("GeneratePolicyDocumentActivity", mock.Anything, "policy-123").Return(
		"https://storage.example.com/policies/policy-123.pdf", nil,
	)

	s.env.OnActivity("IssuePolicyActivity", mock.Anything, "policy-123").Return(nil)

	// Mock FAILED notification (should not fail workflow)
	s.env.OnActivity("SendPolicyNotificationsActivity", mock.Anything, mock.AnythingOfType("models.NotificationRequest")).Return(
		errors.New("SMS gateway timeout"),
	)

	// Mock successful reminder scheduling
	s.env.OnActivity("SchedulePremiumRemindersActivity", mock.Anything, "policy-123").Return(nil)

	// Execute workflow
	s.env.ExecuteWorkflow(PolicyIssuanceWorkflow, input)

	// Assert workflow completed successfully despite notification failure
	s.True(s.env.IsWorkflowCompleted())
	s.NoError(s.env.GetWorkflowError())

	// Get and validate result
	var result PolicyIssuanceResult
	s.NoError(s.env.GetWorkflowResult(&result))

	s.True(result.Success)
	s.Equal("policy-123", result.PolicyID)
	// Notification step should not be in completed steps
	s.NotContains(result.CompletedSteps, "NOTIFICATIONS_SENT")
}

// Test: Complete compensation flow
func (s *PolicyIssuanceWorkflowTestSuite) TestPolicyIssuanceWorkflow_FullCompensationFlow() {
	input := PolicyIssuanceInput{
		CustomerID:       "12345",
		PolicyType:       models.PolicyTypeLife,
		SumAssured:       1000000.00,
		PremiumFrequency: models.PremiumFrequencyMonthly,
		DurationMonths:   12,
		StartDate:        time.Now(),
		PaymentMethod:    models.PaymentMethodCard,
	}

	// Mock successful steps up to policy issuance
	s.env.OnActivity("VerifyCustomerNINActivity", mock.Anything, input.CustomerID).Return(
		models.VerificationResult{Success: true, NIN: "12345678901"}, nil,
	)

	s.env.OnActivity("CalculateRiskAndPremiumActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		models.PremiumDetails{Amount: 5000.00, RiskScore: 45.0}, nil,
	)

	s.env.OnActivity("CreatePolicyRecordActivity", mock.Anything, mock.AnythingOfType("models.Policy")).Return(
		"policy-123", nil,
	)

	s.env.OnActivity("ProcessPremiumPaymentActivity", mock.Anything, mock.AnythingOfType("models.PaymentRequest")).Return(
		models.PaymentResult{
			Status:        models.PaymentStatusCompleted,
			TransactionID: "txn-abc123",
			PaymentID:     1,
		}, nil,
	)

	s.env.OnActivity("GeneratePolicyDocumentActivity", mock.Anything, "policy-123").Return(
		"https://storage.example.com/policies/policy-123.pdf", nil,
	)

	// Mock FAILED policy issuance (database error)
	s.env.OnActivity("IssuePolicyActivity", mock.Anything, "policy-123").Return(
		errors.New("database connection lost"),
	)

	// Mock ALL compensation activities in reverse order
	s.env.OnActivity("DeletePolicyDocumentActivity", mock.Anything, "policy-123").Return(nil)
	s.env.OnActivity("ProcessRefundActivity", mock.Anything, mock.AnythingOfType("models.RefundRequest")).Return(nil)
	s.env.OnActivity("DeletePolicyRecordActivity", mock.Anything, "policy-123").Return(nil)

	// Execute workflow
	s.env.ExecuteWorkflow(PolicyIssuanceWorkflow, input)

	// Assert workflow completed with error
	s.True(s.env.IsWorkflowCompleted())
	s.Error(s.env.GetWorkflowError())
}

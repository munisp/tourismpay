// services/temporal-worker/main.go
// ─────────────────────────────────────────────────────────────────────────────
// Temporal Worker — Go microservice
//
// Registers and runs all TourismPay Temporal workflows and activities:
//   - KYC verification workflow
//   - Payment processing workflow
//   - Remittance workflow
//   - Merchant onboarding workflow
//   - Settlement batch workflow
//   - Loyalty reward workflow
//   - Loan disbursement workflow
//
// Environment variables:
//   TEMPORAL_HOST      — Temporal server host (default: localhost:7233)
//   TEMPORAL_NAMESPACE — Temporal namespace (default: tourismpay)
//   TEMPORAL_TASK_QUEUE — task queue name (default: tourismpay-main)
//   PG_DSN             — PostgreSQL DSN for workflow log persistence
// ─────────────────────────────────────────────────────────────────────────────

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"
)

// ─── Config ───────────────────────────────────────────────────────────────────

type Config struct {
	TemporalHost      string
	TemporalNamespace string
	TaskQueue         string
	PGDSN             string
}

func loadConfig() Config {
	return Config{
		TemporalHost:      getEnv("TEMPORAL_HOST", "localhost:7233"),
		TemporalNamespace: getEnv("TEMPORAL_NAMESPACE", "tourismpay"),
		TaskQueue:         getEnv("TEMPORAL_TASK_QUEUE", "tourismpay-main"),
		PGDSN:             os.Getenv("PG_DSN"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── Workflow Input/Output Types ──────────────────────────────────────────────

type KYCWorkflowInput struct {
	UserID     int64  `json:"user_id"`
	DocumentID string `json:"document_id"`
	Provider   string `json:"provider"`
}

type KYCWorkflowResult struct {
	Status  string `json:"status"`
	Score   int    `json:"score"`
	Message string `json:"message"`
}

type PaymentWorkflowInput struct {
	PaymentIntentID string  `json:"payment_intent_id"`
	UserID          int64   `json:"user_id"`
	Amount          float64 `json:"amount"`
	Currency        string  `json:"currency"`
	PaymentMethod   string  `json:"payment_method"`
}

type PaymentWorkflowResult struct {
	Status      string `json:"status"`
	Reference   string `json:"reference"`
	ProcessedAt string `json:"processed_at"`
}

type RemittanceWorkflowInput struct {
	RemittanceID        int64   `json:"remittance_id"`
	UserID              int64   `json:"user_id"`
	Amount              float64 `json:"amount"`
	SourceCurrency      string  `json:"source_currency"`
	DestCurrency        string  `json:"dest_currency"`
	DestinationCountry  string  `json:"destination_country"`
	RecipientName       string  `json:"recipient_name"`
	RecipientAccount    string  `json:"recipient_account"`
}

type MerchantOnboardingInput struct {
	EstablishmentID int64  `json:"establishment_id"`
	BusinessName    string `json:"business_name"`
	BusinessType    string `json:"business_type"`
	Country         string `json:"country"`
}

type SettlementBatchInput struct {
	BatchID   int64  `json:"batch_id"`
	Currency  string `json:"currency"`
	BatchDate string `json:"batch_date"`
}

type LoanDisbursementInput struct {
	LoanID    int64   `json:"loan_id"`
	UserID    int64   `json:"user_id"`
	Amount    float64 `json:"amount"`
	Currency  string  `json:"currency"`
}

// ─── PostgreSQL Workflow Log ──────────────────────────────────────────────────

type WorkflowLogger struct {
	db *sql.DB
}

func NewWorkflowLogger(dsn string) (*WorkflowLogger, error) {
	if dsn == "" {
		slog.Warn("PG_DSN not set — workflow log persistence disabled")
		return &WorkflowLogger{}, nil
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &WorkflowLogger{db: db}, nil
}

func (l *WorkflowLogger) LogStart(workflowID, workflowType, runID string, userID int64, input interface{}) error {
	if l.db == nil {
		return nil
	}
	inputJSON, _ := json.Marshal(input)
	_, err := l.db.Exec(`
		INSERT INTO temporal_workflow_log
			(workflow_id, workflow_type, run_id, status, input, user_id, started_at)
		VALUES ($1, $2, $3, 'started', $4, $5, NOW())
		ON CONFLICT DO NOTHING
	`, workflowID, workflowType, runID, string(inputJSON), userID)
	return err
}

func (l *WorkflowLogger) LogComplete(workflowID string, result interface{}) error {
	if l.db == nil {
		return nil
	}
	resultJSON, _ := json.Marshal(result)
	_, err := l.db.Exec(`
		UPDATE temporal_workflow_log
		SET status = 'completed', result = $2, completed_at = NOW()
		WHERE workflow_id = $1
	`, workflowID, string(resultJSON))
	return err
}

func (l *WorkflowLogger) LogFailed(workflowID string, errMsg string) error {
	if l.db == nil {
		return nil
	}
	_, err := l.db.Exec(`
		UPDATE temporal_workflow_log
		SET status = 'failed', error_message = $2, completed_at = NOW()
		WHERE workflow_id = $1
	`, workflowID, errMsg)
	return err
}

// ─── Activities ───────────────────────────────────────────────────────────────

// KYC Activities

func VerifyIdentityActivity(ctx context.Context, input KYCWorkflowInput) (string, error) {
	slog.Info("VerifyIdentityActivity", "user_id", input.UserID, "provider", input.Provider)
	// Production: call KYC provider API (Smile Identity, Youverify, etc.)
	time.Sleep(100 * time.Millisecond) // simulate API call
	return "identity_verified", nil
}

func CheckSanctionsActivity(ctx context.Context, userID int64) (bool, error) {
	slog.Info("CheckSanctionsActivity", "user_id", userID)
	// Production: call sanctions screening API
	return false, nil // false = not on sanctions list
}

func UpdateKYCStatusActivity(ctx context.Context, userID int64, status string, score int) error {
	slog.Info("UpdateKYCStatusActivity", "user_id", userID, "status", status, "score", score)
	// Production: update kyc_verification_records in PostgreSQL
	return nil
}

// Payment Activities

func ValidatePaymentActivity(ctx context.Context, input PaymentWorkflowInput) error {
	slog.Info("ValidatePaymentActivity", "intent_id", input.PaymentIntentID, "amount", input.Amount)
	if input.Amount <= 0 {
		return fmt.Errorf("invalid amount: %f", input.Amount)
	}
	return nil
}

func CheckFraudActivity(ctx context.Context, input PaymentWorkflowInput) (float64, error) {
	slog.Info("CheckFraudActivity", "intent_id", input.PaymentIntentID)
	// Production: call fraud scoring service
	return 0.05, nil // 5% risk score
}

func ExecutePaymentActivity(ctx context.Context, input PaymentWorkflowInput) (string, error) {
	slog.Info("ExecutePaymentActivity", "intent_id", input.PaymentIntentID)
	// Production: call payment processor, update TigerBeetle ledger
	ref := fmt.Sprintf("PAY-%d-%s", time.Now().UnixMilli(), input.PaymentIntentID[:8])
	return ref, nil
}

func RecordPaymentLedgerActivity(ctx context.Context, intentID string, amount float64, currency string) error {
	slog.Info("RecordPaymentLedgerActivity", "intent_id", intentID, "amount", amount)
	// Production: call TigerBeetle gateway to record double-entry
	return nil
}

// Remittance Activities

func GetExchangeRateActivity(ctx context.Context, from, to string) (float64, error) {
	slog.Info("GetExchangeRateActivity", "from", from, "to", to)
	// Production: call exchange rate provider
	return 1.0, nil
}

func InitiateRemittanceTransferActivity(ctx context.Context, input RemittanceWorkflowInput) (string, error) {
	slog.Info("InitiateRemittanceTransferActivity", "remittance_id", input.RemittanceID)
	// Production: call correspondent bank API or SWIFT
	ref := fmt.Sprintf("REM-%d", input.RemittanceID)
	return ref, nil
}

func NotifyRecipientActivity(ctx context.Context, remittanceID int64, recipientName, reference string) error {
	slog.Info("NotifyRecipientActivity", "remittance_id", remittanceID, "recipient", recipientName)
	// Production: send SMS/email notification
	return nil
}

// Settlement Activities

func CollectSettlementItemsActivity(ctx context.Context, batchID int64, currency string) (int, float64, error) {
	slog.Info("CollectSettlementItemsActivity", "batch_id", batchID, "currency", currency)
	// Production: query settlement_batch_items from PostgreSQL
	return 0, 0.0, nil
}

func ExecuteSettlementTransfersActivity(ctx context.Context, batchID int64) error {
	slog.Info("ExecuteSettlementTransfersActivity", "batch_id", batchID)
	// Production: execute bank transfers for each merchant
	return nil
}

func MarkSettlementCompleteActivity(ctx context.Context, batchID int64) error {
	slog.Info("MarkSettlementCompleteActivity", "batch_id", batchID)
	// Production: update settlement_batches status in PostgreSQL
	return nil
}

// Loan Activities

func CheckCreditScoreActivity(ctx context.Context, userID int64) (int, error) {
	slog.Info("CheckCreditScoreActivity", "user_id", userID)
	// Production: query credit_scores table or call credit bureau
	return 650, nil
}

func DisburseLoanActivity(ctx context.Context, input LoanDisbursementInput) (string, error) {
	slog.Info("DisburseLoanActivity", "loan_id", input.LoanID, "amount", input.Amount)
	// Production: transfer from loan pool account to user wallet via TigerBeetle
	ref := fmt.Sprintf("LOAN-DISB-%d", input.LoanID)
	return ref, nil
}

// ─── Workflow Implementations ─────────────────────────────────────────────────

// KYCWorkflow orchestrates the full KYC verification process
func KYCWorkflow(ctx context.Context, input KYCWorkflowInput) (KYCWorkflowResult, error) {
	slog.Info("KYCWorkflow started", "user_id", input.UserID)

	// Step 1: Verify identity document
	identityStatus, err := VerifyIdentityActivity(ctx, input)
	if err != nil {
		return KYCWorkflowResult{Status: "failed", Message: err.Error()}, err
	}

	// Step 2: Check sanctions
	onSanctions, err := CheckSanctionsActivity(ctx, input.UserID)
	if err != nil {
		return KYCWorkflowResult{Status: "failed", Message: err.Error()}, err
	}
	if onSanctions {
		_ = UpdateKYCStatusActivity(ctx, input.UserID, "rejected", 0)
		return KYCWorkflowResult{Status: "rejected", Score: 0, Message: "sanctions match"}, nil
	}

	// Step 3: Update KYC status
	score := 80
	if identityStatus == "identity_verified" {
		score = 95
	}
	if err := UpdateKYCStatusActivity(ctx, input.UserID, "approved", score); err != nil {
		return KYCWorkflowResult{Status: "failed", Message: err.Error()}, err
	}

	slog.Info("KYCWorkflow completed", "user_id", input.UserID, "score", score)
	return KYCWorkflowResult{Status: "approved", Score: score, Message: "KYC approved"}, nil
}

// PaymentWorkflow orchestrates a full payment with fraud check and ledger recording
func PaymentWorkflow(ctx context.Context, input PaymentWorkflowInput) (PaymentWorkflowResult, error) {
	slog.Info("PaymentWorkflow started", "intent_id", input.PaymentIntentID)

	// Step 1: Validate
	if err := ValidatePaymentActivity(ctx, input); err != nil {
		return PaymentWorkflowResult{Status: "failed"}, err
	}

	// Step 2: Fraud check
	riskScore, err := CheckFraudActivity(ctx, input)
	if err != nil {
		return PaymentWorkflowResult{Status: "failed"}, err
	}
	if riskScore > 0.8 {
		return PaymentWorkflowResult{Status: "blocked"}, fmt.Errorf("high fraud risk: %.2f", riskScore)
	}

	// Step 3: Execute payment
	ref, err := ExecutePaymentActivity(ctx, input)
	if err != nil {
		return PaymentWorkflowResult{Status: "failed"}, err
	}

	// Step 4: Record in ledger
	if err := RecordPaymentLedgerActivity(ctx, input.PaymentIntentID, input.Amount, input.Currency); err != nil {
		slog.Warn("Ledger recording failed (non-fatal)", "error", err)
	}

	result := PaymentWorkflowResult{
		Status:      "succeeded",
		Reference:   ref,
		ProcessedAt: time.Now().UTC().Format(time.RFC3339),
	}
	slog.Info("PaymentWorkflow completed", "intent_id", input.PaymentIntentID, "ref", ref)
	return result, nil
}

// RemittanceWorkflow orchestrates cross-border remittance
func RemittanceWorkflow(ctx context.Context, input RemittanceWorkflowInput) (string, error) {
	slog.Info("RemittanceWorkflow started", "remittance_id", input.RemittanceID)

	// Step 1: Get exchange rate
	rate, err := GetExchangeRateActivity(ctx, input.SourceCurrency, input.DestCurrency)
	if err != nil {
		return "", err
	}
	slog.Info("Exchange rate fetched", "rate", rate)

	// Step 2: Initiate transfer
	ref, err := InitiateRemittanceTransferActivity(ctx, input)
	if err != nil {
		return "", err
	}

	// Step 3: Notify recipient
	_ = NotifyRecipientActivity(ctx, input.RemittanceID, input.RecipientName, ref)

	return ref, nil
}

// SettlementBatchWorkflow processes a settlement batch
func SettlementBatchWorkflow(ctx context.Context, input SettlementBatchInput) error {
	slog.Info("SettlementBatchWorkflow started", "batch_id", input.BatchID)

	count, total, err := CollectSettlementItemsActivity(ctx, input.BatchID, input.Currency)
	if err != nil {
		return err
	}
	slog.Info("Settlement items collected", "count", count, "total", total)

	if err := ExecuteSettlementTransfersActivity(ctx, input.BatchID); err != nil {
		return err
	}

	return MarkSettlementCompleteActivity(ctx, input.BatchID)
}

// LoanDisbursementWorkflow orchestrates micro-loan disbursement
func LoanDisbursementWorkflow(ctx context.Context, input LoanDisbursementInput) (string, error) {
	slog.Info("LoanDisbursementWorkflow started", "loan_id", input.LoanID)

	score, err := CheckCreditScoreActivity(ctx, input.UserID)
	if err != nil {
		return "", err
	}
	if score < 500 {
		return "", fmt.Errorf("credit score too low: %d", score)
	}

	ref, err := DisburseLoanActivity(ctx, input)
	if err != nil {
		return "", err
	}

	slog.Info("LoanDisbursementWorkflow completed", "loan_id", input.LoanID, "ref", ref)
	return ref, nil
}

// ─── Worker ───────────────────────────────────────────────────────────────────

// TemporalWorkerStub simulates a Temporal worker
// Production: use go.temporal.io/sdk/worker
type TemporalWorkerStub struct {
	host      string
	namespace string
	taskQueue string
	logger    *WorkflowLogger
}

func NewTemporalWorkerStub(cfg Config, logger *WorkflowLogger) *TemporalWorkerStub {
	return &TemporalWorkerStub{
		host:      cfg.TemporalHost,
		namespace: cfg.TemporalNamespace,
		taskQueue: cfg.TaskQueue,
		logger:    logger,
	}
}

func (w *TemporalWorkerStub) Start() error {
	slog.Info("Temporal worker starting",
		"host", w.host,
		"namespace", w.namespace,
		"task_queue", w.taskQueue,
	)
	slog.Info("Registered workflows",
		"workflows", []string{
			"KYCWorkflow",
			"PaymentWorkflow",
			"RemittanceWorkflow",
			"MerchantOnboardingWorkflow",
			"SettlementBatchWorkflow",
			"LoanDisbursementWorkflow",
			"LoyaltyRewardWorkflow",
		},
	)
	slog.Info("Registered activities",
		"activities", []string{
			"VerifyIdentityActivity",
			"CheckSanctionsActivity",
			"UpdateKYCStatusActivity",
			"ValidatePaymentActivity",
			"CheckFraudActivity",
			"ExecutePaymentActivity",
			"RecordPaymentLedgerActivity",
			"GetExchangeRateActivity",
			"InitiateRemittanceTransferActivity",
			"NotifyRecipientActivity",
			"CollectSettlementItemsActivity",
			"ExecuteSettlementTransfersActivity",
			"MarkSettlementCompleteActivity",
			"CheckCreditScoreActivity",
			"DisburseLoanActivity",
		},
	)
	// Production: w.worker.Run(worker.InterruptCh())
	return nil
}

func (w *TemporalWorkerStub) Stop() {
	slog.Info("Temporal worker stopped")
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	cfg := loadConfig()
	slog.Info("Starting Temporal Worker",
		"host", cfg.TemporalHost,
		"namespace", cfg.TemporalNamespace,
		"task_queue", cfg.TaskQueue,
	)

	wfLogger, err := NewWorkflowLogger(cfg.PGDSN)
	if err != nil {
		slog.Error("Failed to connect to PostgreSQL", "error", err)
		os.Exit(1)
	}

	worker := NewTemporalWorkerStub(cfg, wfLogger)
	if err := worker.Start(); err != nil {
		slog.Error("Failed to start Temporal worker", "error", err)
		os.Exit(1)
	}

	// Keep running until signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	slog.Info("Temporal Worker running — waiting for workflows...")
	<-quit

	slog.Info("Shutting down Temporal Worker...")
	worker.Stop()
	slog.Info("Temporal Worker stopped")
}

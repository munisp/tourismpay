// Package services provides the core eNaira gateway business logic.
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	"github.com/shopspring/decimal"
	"go.uber.org/zap"

	"github.com/munisp/tourismpay/enaira-gateway/internal/models"
)

const (
	kafkaTopicENairaEvents = "tourismpay.enaira.events"
	kafkaTopicWalletTx     = "tourismpay.wallet.transactions"
	redisPrefixWallet      = "enaira:wallet:"
	redisTTLWalletCache    = 5 * time.Minute
)

// ENairaService orchestrates wallet provisioning, payments, and CBN callbacks.
type ENairaService struct {
	db          *pgxpool.Pool
	redis       *redis.Client
	kafkaWriter *kafka.Writer
	cbnClient   *CBNClient
	logger      *zap.Logger
}

// NewENairaService constructs the service with all dependencies.
func NewENairaService(
	db *pgxpool.Pool,
	rdb *redis.Client,
	kafkaWriter *kafka.Writer,
	cbnClient *CBNClient,
	logger *zap.Logger,
) *ENairaService {
	return &ENairaService{
		db:          db,
		redis:       rdb,
		kafkaWriter: kafkaWriter,
		cbnClient:   cbnClient,
		logger:      logger,
	}
}

// ─── Wallet Provisioning ─────────────────────────────────────────────────────

// ProvisionWallet creates an eNaira wallet for a TourismPay user.
func (s *ENairaService) ProvisionWallet(ctx context.Context, req *models.CreateWalletRequest) (*models.ENairaWallet, error) {
	// Check for existing wallet
	var existing models.ENairaWallet
	err := s.db.QueryRow(ctx,
		`SELECT id, cbn_wallet_id FROM enaira_wallets WHERE user_id=$1 AND wallet_type=$2 AND status!='closed'`,
		req.UserID, req.WalletType,
	).Scan(&existing.ID, &existing.CBNWalletID)
	if err == nil {
		return nil, fmt.Errorf("wallet already exists for user %s type %s", req.UserID, req.WalletType)
	}

	// Provision with CBN
	cbnWalletID, cbnWalletAddr, err := s.cbnClient.ProvisionWallet(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("CBN provisioning failed: %w", err)
	}

	// Determine KYC level and daily limit
	kycLevel := 1
	dailyLimitKobo := int64(20_000_00) // ₦20,000 default (Tier 1)
	if req.NIN != "" {
		kycLevel = 2
		dailyLimitKobo = 100_000_00 // ₦100,000 (Tier 2)
	}
	if req.WalletType == models.WalletTypeMerchant {
		dailyLimitKobo = 500_000_00 // ₦500,000 (Merchant)
	}

	wallet := &models.ENairaWallet{
		ID:               uuid.NewString(),
		UserID:           req.UserID,
		WalletType:       req.WalletType,
		CBNWalletID:      cbnWalletID,
		CBNWalletAddress: cbnWalletAddr,
		BalanceKobo:      0,
		DailyLimitKobo:   dailyLimitKobo,
		Status:           models.WalletStatusActive,
		KYCLevel:         kycLevel,
		CreatedAt:        time.Now().UTC(),
		UpdatedAt:        time.Now().UTC(),
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO enaira_wallets
			(id, user_id, wallet_type, cbn_wallet_id, cbn_wallet_address, balance_kobo, daily_limit_kobo, status, kyc_level, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		wallet.ID, wallet.UserID, wallet.WalletType, wallet.CBNWalletID, wallet.CBNWalletAddress,
		wallet.BalanceKobo, wallet.DailyLimitKobo, wallet.Status, wallet.KYCLevel,
		wallet.CreatedAt, wallet.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("DB insert wallet: %w", err)
	}

	s.publishEvent(ctx, kafkaTopicENairaEvents, wallet.ID, map[string]interface{}{
		"event":      "wallet.provisioned",
		"wallet_id":  wallet.ID,
		"user_id":    wallet.UserID,
		"wallet_type": wallet.WalletType,
		"cbn_wallet_id": cbnWalletID,
	})

	s.logger.Info("eNaira wallet provisioned", zap.String("wallet_id", wallet.ID), zap.String("user_id", req.UserID))
	return wallet, nil
}

// ─── Payment Initiation ──────────────────────────────────────────────────────

// InitiatePayment initiates an eNaira payment and records it in the database.
func (s *ENairaService) InitiatePayment(ctx context.Context, req *models.InitiatePaymentRequest) (*models.ENairaTransaction, error) {
	// Validate sender wallet
	var senderWallet models.ENairaWallet
	err := s.db.QueryRow(ctx,
		`SELECT id, cbn_wallet_id, balance_kobo, daily_limit_kobo, status FROM enaira_wallets WHERE id=$1`,
		req.SenderWalletID,
	).Scan(&senderWallet.ID, &senderWallet.CBNWalletID, &senderWallet.BalanceKobo, &senderWallet.DailyLimitKobo, &senderWallet.Status)
	if err != nil {
		return nil, fmt.Errorf("sender wallet not found: %w", err)
	}
	if senderWallet.Status != models.WalletStatusActive {
		return nil, fmt.Errorf("sender wallet is %s", senderWallet.Status)
	}

	// Validate amount
	amountDec, err := decimal.NewFromString(req.AmountNGN)
	if err != nil {
		return nil, fmt.Errorf("invalid amount: %w", err)
	}
	amountKobo := amountDec.Mul(decimal.NewFromInt(100)).IntPart()
	if amountKobo <= 0 {
		return nil, fmt.Errorf("amount must be positive")
	}

	// Calculate platform fee (0.5% capped at ₦500)
	feeKobo := amountKobo / 200 // 0.5%
	if feeKobo > 50000 {        // ₦500 cap
		feeKobo = 50000
	}

	// Create pending transaction record
	tx := &models.ENairaTransaction{
		ID:               uuid.NewString(),
		SenderWalletID:   req.SenderWalletID,
		ReceiverWalletID: req.ReceiverWalletID,
		AmountKobo:       amountKobo,
		FeeKobo:          feeKobo,
		TransactionType:  req.TransactionType,
		Status:           models.TxStatusPending,
		NarrationText:    req.Narration,
		CorrelationID:    req.CorrelationID,
		InitiatedAt:      time.Now().UTC(),
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO enaira_transactions
			(id, sender_wallet_id, receiver_wallet_id, amount_kobo, fee_kobo, transaction_type, status, narration_text, correlation_id, initiated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		tx.ID, tx.SenderWalletID, tx.ReceiverWalletID, tx.AmountKobo, tx.FeeKobo,
		tx.TransactionType, tx.Status, tx.NarrationText, tx.CorrelationID, tx.InitiatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("DB insert transaction: %w", err)
	}

	// Submit to CBN
	cbnRef, err := s.cbnClient.InitiatePayment(ctx, req)
	if err != nil {
		// Mark as failed
		s.db.Exec(ctx, `UPDATE enaira_transactions SET status='failed', cbn_response_message=$1 WHERE id=$2`, err.Error(), tx.ID)
		return nil, fmt.Errorf("CBN payment initiation failed: %w", err)
	}

	// Update with CBN reference
	tx.CBNTransactionRef = cbnRef
	tx.Status = models.TxStatusProcessing
	s.db.Exec(ctx, `UPDATE enaira_transactions SET cbn_transaction_ref=$1, status='processing' WHERE id=$2`, cbnRef, tx.ID)

	s.publishEvent(ctx, kafkaTopicWalletTx, tx.ID, map[string]interface{}{
		"event":           "enaira.payment.initiated",
		"transaction_id":  tx.ID,
		"cbn_ref":         cbnRef,
		"amount_kobo":     amountKobo,
		"correlation_id":  req.CorrelationID,
	})

	s.logger.Info("eNaira payment initiated",
		zap.String("tx_id", tx.ID),
		zap.String("cbn_ref", cbnRef),
		zap.Int64("amount_kobo", amountKobo),
	)
	return tx, nil
}

// ─── Tourist Wallet Load ─────────────────────────────────────────────────────

// LoadTouristWallet converts foreign currency to eNaira for a tourist.
func (s *ENairaService) LoadTouristWallet(ctx context.Context, req *models.TouristLoadRequest) (*models.ENairaTransaction, error) {
	// Get tourist's eNaira wallet (speed wallet)
	var wallet models.ENairaWallet
	err := s.db.QueryRow(ctx,
		`SELECT id, cbn_wallet_id, status FROM enaira_wallets WHERE user_id=$1 AND wallet_type='speed' AND status='active'`,
		req.TouristUserID,
	).Scan(&wallet.ID, &wallet.CBNWalletID, &wallet.Status)
	if err != nil {
		return nil, fmt.Errorf("tourist speed wallet not found: %w", err)
	}

	// Calculate NGN amount from source currency
	sourceAmount, err := decimal.NewFromString(req.SourceAmountStr)
	if err != nil {
		return nil, fmt.Errorf("invalid source amount: %w", err)
	}
	fxRate, err := decimal.NewFromString(req.FXRate)
	if err != nil {
		return nil, fmt.Errorf("invalid FX rate: %w", err)
	}
	ngnAmount := sourceAmount.Mul(fxRate)
	amountKobo := ngnAmount.Mul(decimal.NewFromInt(100)).IntPart()

	// Use platform's PSP wallet as the sender for the cash-in
	paymentReq := &models.InitiatePaymentRequest{
		SenderWalletID:   "PLATFORM_PSP_WALLET", // Platform's CBN PSP wallet
		ReceiverWalletID: wallet.ID,
		AmountNGN:        ngnAmount.StringFixed(2),
		TransactionType:  models.TxTypeTouristLoad,
		Narration:        fmt.Sprintf("Tourist load: %s %s @ %s", req.SourceAmountStr, req.SourceCurrency, req.FXRate),
		CorrelationID:    req.CorrelationID,
	}

	tx, err := s.InitiatePayment(ctx, paymentReq)
	if err != nil {
		return nil, fmt.Errorf("tourist load failed: %w", err)
	}

	s.logger.Info("Tourist wallet loaded",
		zap.String("tourist_id", req.TouristUserID),
		zap.String("source_currency", req.SourceCurrency),
		zap.Int64("ngn_kobo", amountKobo),
	)
	return tx, nil
}

// ─── CBN Webhook Handler ─────────────────────────────────────────────────────

// HandleCBNWebhook processes inbound status updates from the CBN eNaira network.
func (s *ENairaService) HandleCBNWebhook(ctx context.Context, event *models.CBNWebhookEvent) error {
	now := time.Now().UTC()

	var txID string
	err := s.db.QueryRow(ctx,
		`SELECT id FROM enaira_transactions WHERE cbn_transaction_ref=$1`,
		event.TransactionRef,
	).Scan(&txID)
	if err != nil {
		return fmt.Errorf("transaction not found for CBN ref %s: %w", event.TransactionRef, err)
	}

	switch event.Status {
	case models.TxStatusCompleted:
		_, err = s.db.Exec(ctx, `
			UPDATE enaira_transactions
			SET status='completed', cbn_response_code=$1, cbn_response_message=$2, completed_at=$3
			WHERE id=$4`,
			event.ResponseCode, event.ResponseMessage, now, txID,
		)
	case models.TxStatusFailed:
		_, err = s.db.Exec(ctx, `
			UPDATE enaira_transactions
			SET status='failed', cbn_response_code=$1, cbn_response_message=$2
			WHERE id=$3`,
			event.ResponseCode, event.ResponseMessage, txID,
		)
	case models.TxStatusReversed:
		_, err = s.db.Exec(ctx, `
			UPDATE enaira_transactions
			SET status='reversed', reversed_at=$1
			WHERE id=$2`,
			now, txID,
		)
	}
	if err != nil {
		return fmt.Errorf("DB update transaction status: %w", err)
	}

	s.publishEvent(ctx, kafkaTopicENairaEvents, txID, map[string]interface{}{
		"event":          "enaira.transaction.status_update",
		"transaction_id": txID,
		"cbn_ref":        event.TransactionRef,
		"status":         event.Status,
		"response_code":  event.ResponseCode,
	})

	s.logger.Info("CBN webhook processed",
		zap.String("tx_id", txID),
		zap.String("cbn_ref", event.TransactionRef),
		zap.String("status", string(event.Status)),
	)
	return nil
}

// ─── Balance Query ────────────────────────────────────────────────────────────

// GetWalletBalance returns the current eNaira wallet balance (cached in Redis).
func (s *ENairaService) GetWalletBalance(ctx context.Context, walletID string) (*models.WalletBalanceResponse, error) {
	cacheKey := redisPrefixWallet + walletID + ":balance"

	// Try cache first
	cached, err := s.redis.Get(ctx, cacheKey).Result()
	if err == nil {
		var resp models.WalletBalanceResponse
		if json.Unmarshal([]byte(cached), &resp) == nil {
			return &resp, nil
		}
	}

	// Fetch from CBN
	var cbnWalletID string
	s.db.QueryRow(ctx, `SELECT cbn_wallet_id FROM enaira_wallets WHERE id=$1`, walletID).Scan(&cbnWalletID)

	balanceKobo, err := s.cbnClient.GetBalance(ctx, cbnWalletID)
	if err != nil {
		// Fall back to DB balance
		s.db.QueryRow(ctx, `SELECT balance_kobo FROM enaira_wallets WHERE id=$1`, walletID).Scan(&balanceKobo)
	}

	balanceNGN := decimal.NewFromInt(balanceKobo).Div(decimal.NewFromInt(100))
	resp := &models.WalletBalanceResponse{
		WalletID:    walletID,
		BalanceNGN:  balanceNGN.StringFixed(2),
		BalanceKobo: balanceKobo,
		Currency:    "NGN",
		AsOf:        time.Now().UTC().Format(time.RFC3339),
	}

	// Cache result
	if data, err := json.Marshal(resp); err == nil {
		s.redis.Set(ctx, cacheKey, data, redisTTLWalletCache)
	}

	return resp, nil
}

// ─── Kafka helper ─────────────────────────────────────────────────────────────

func (s *ENairaService) publishEvent(ctx context.Context, topic, key string, payload map[string]interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		s.logger.Error("Failed to marshal Kafka event", zap.Error(err))
		return
	}
	msg := kafka.Message{
		Topic: topic,
		Key:   []byte(key),
		Value: data,
		Time:  time.Now(),
	}
	if err := s.kafkaWriter.WriteMessages(ctx, msg); err != nil {
		s.logger.Warn("Kafka publish failed (non-fatal)", zap.String("topic", topic), zap.Error(err))
	}
}

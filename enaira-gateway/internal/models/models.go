// Package models defines all data structures for the eNaira/CBDC-NG gateway.
package models

import "time"

// ─── eNaira Wallet Types ─────────────────────────────────────────────────────

// WalletType represents the CBN-defined eNaira wallet tiers.
type WalletType string

const (
	WalletTypeSpeed    WalletType = "speed"    // Tourist/consumer wallet (CBN Tier 1)
	WalletTypeMerchant WalletType = "merchant" // Merchant wallet (CBN Tier 2)
	WalletTypePSP      WalletType = "psp"      // PSP/platform wallet (CBN Tier 3)
)

// WalletStatus represents the lifecycle state of an eNaira wallet.
type WalletStatus string

const (
	WalletStatusActive    WalletStatus = "active"
	WalletStatusSuspended WalletStatus = "suspended"
	WalletStatusClosed    WalletStatus = "closed"
	WalletStatusPending   WalletStatus = "pending_kyc"
)

// ENairaWallet represents a registered eNaira wallet on the TourismPay platform.
type ENairaWallet struct {
	ID               string       `json:"id" db:"id"`
	UserID           string       `json:"user_id" db:"user_id"`
	WalletType       WalletType   `json:"wallet_type" db:"wallet_type"`
	CBNWalletID      string       `json:"cbn_wallet_id" db:"cbn_wallet_id"`       // CBN-assigned wallet ID
	CBNWalletAddress string       `json:"cbn_wallet_address" db:"cbn_wallet_address"` // eNaira address
	BalanceKobo      int64        `json:"balance_kobo" db:"balance_kobo"`          // Balance in kobo (1 NGN = 100 kobo)
	DailyLimitKobo   int64        `json:"daily_limit_kobo" db:"daily_limit_kobo"`
	Status           WalletStatus `json:"status" db:"status"`
	KYCLevel         int          `json:"kyc_level" db:"kyc_level"` // 1=BVN, 2=NIN+BVN, 3=Full
	CreatedAt        time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time    `json:"updated_at" db:"updated_at"`
}

// ─── Transaction Types ───────────────────────────────────────────────────────

// TransactionType represents the eNaira transaction category.
type TransactionType string

const (
	TxTypeP2P          TransactionType = "p2p"           // Person-to-person
	TxTypeMerchantPay  TransactionType = "merchant_pay"  // Consumer-to-merchant
	TxTypeCashIn       TransactionType = "cash_in"       // NGN → eNaira
	TxTypeCashOut      TransactionType = "cash_out"      // eNaira → NGN
	TxTypeRemittance   TransactionType = "remittance"    // Cross-border
	TxTypeTaxRemit     TransactionType = "tax_remittance"
	TxTypeTouristLoad  TransactionType = "tourist_load"  // Foreign tourist wallet load
)

// TransactionStatus tracks the lifecycle of an eNaira transaction.
type TransactionStatus string

const (
	TxStatusPending    TransactionStatus = "pending"
	TxStatusProcessing TransactionStatus = "processing"
	TxStatusCompleted  TransactionStatus = "completed"
	TxStatusFailed     TransactionStatus = "failed"
	TxStatusReversed   TransactionStatus = "reversed"
)

// ENairaTransaction represents a single eNaira transaction record.
type ENairaTransaction struct {
	ID                  string            `json:"id" db:"id"`
	CBNTransactionRef   string            `json:"cbn_transaction_ref" db:"cbn_transaction_ref"`
	SenderWalletID      string            `json:"sender_wallet_id" db:"sender_wallet_id"`
	ReceiverWalletID    string            `json:"receiver_wallet_id" db:"receiver_wallet_id"`
	AmountKobo          int64             `json:"amount_kobo" db:"amount_kobo"`
	FeeKobo             int64             `json:"fee_kobo" db:"fee_kobo"`
	TransactionType     TransactionType   `json:"transaction_type" db:"transaction_type"`
	Status              TransactionStatus `json:"status" db:"status"`
	NarrationText       string            `json:"narration_text" db:"narration_text"`
	MerchantCategoryCode string           `json:"merchant_category_code" db:"merchant_category_code"`
	CorrelationID       string            `json:"correlation_id" db:"correlation_id"` // TourismPay internal ref
	CBNResponseCode     string            `json:"cbn_response_code" db:"cbn_response_code"`
	CBNResponseMessage  string            `json:"cbn_response_message" db:"cbn_response_message"`
	InitiatedAt         time.Time         `json:"initiated_at" db:"initiated_at"`
	CompletedAt         *time.Time        `json:"completed_at,omitempty" db:"completed_at"`
	ReversedAt          *time.Time        `json:"reversed_at,omitempty" db:"reversed_at"`
}

// ─── API Request/Response Types ──────────────────────────────────────────────

// CreateWalletRequest is the payload to provision a new eNaira wallet.
type CreateWalletRequest struct {
	UserID     string     `json:"user_id" binding:"required"`
	WalletType WalletType `json:"wallet_type" binding:"required"`
	BVN        string     `json:"bvn" binding:"required"`
	NIN        string     `json:"nin,omitempty"`
	PhoneNumber string    `json:"phone_number" binding:"required"`
	FullName   string     `json:"full_name" binding:"required"`
}

// InitiatePaymentRequest is the payload to initiate an eNaira payment.
type InitiatePaymentRequest struct {
	SenderWalletID   string          `json:"sender_wallet_id" binding:"required"`
	ReceiverWalletID string          `json:"receiver_wallet_id" binding:"required"`
	AmountNGN        string          `json:"amount_ngn" binding:"required"` // Decimal string e.g. "1500.00"
	TransactionType  TransactionType `json:"transaction_type" binding:"required"`
	Narration        string          `json:"narration,omitempty"`
	CorrelationID    string          `json:"correlation_id" binding:"required"` // TourismPay payment ID
}

// TouristLoadRequest loads a foreign tourist's TourismPay wallet with eNaira.
type TouristLoadRequest struct {
	TouristUserID    string `json:"tourist_user_id" binding:"required"`
	SourceCurrency   string `json:"source_currency" binding:"required"` // e.g. "USD", "GBP"
	SourceAmountStr  string `json:"source_amount" binding:"required"`
	FXRate           string `json:"fx_rate" binding:"required"`
	CorrelationID    string `json:"correlation_id" binding:"required"`
}

// CBNWebhookEvent is the inbound event payload from CBN eNaira webhook.
type CBNWebhookEvent struct {
	EventType       string            `json:"event_type"`
	TransactionRef  string            `json:"transaction_ref"`
	Status          TransactionStatus `json:"status"`
	ResponseCode    string            `json:"response_code"`
	ResponseMessage string            `json:"response_message"`
	Timestamp       int64             `json:"timestamp"`
	Metadata        map[string]string `json:"metadata,omitempty"`
}

// WalletBalanceResponse is the response for balance queries.
type WalletBalanceResponse struct {
	WalletID    string `json:"wallet_id"`
	BalanceNGN  string `json:"balance_ngn"`
	BalanceKobo int64  `json:"balance_kobo"`
	Currency    string `json:"currency"`
	AsOf        string `json:"as_of"`
}

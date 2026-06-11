package models

import (
	"time"
)

type AccountFlags uint16

const (
	AccountFlagLinked                     AccountFlags = 1 << 0
	AccountFlagDebitsMustNotExceedCredits AccountFlags = 1 << 1
	AccountFlagCreditsMustNotExceedDebits AccountFlags = 1 << 2
	AccountFlagHistory                    AccountFlags = 1 << 3
)

type TransferFlags uint16

const (
	TransferFlagLinked              TransferFlags = 1 << 0
	TransferFlagPending             TransferFlags = 1 << 1
	TransferFlagPostPendingTransfer TransferFlags = 1 << 2
	TransferFlagVoidPendingTransfer TransferFlags = 1 << 3
)

type TigerBeetleAccount struct {
	ID             uint64       `json:"id"`
	DebitsPending  uint64       `json:"debits_pending"`
	DebitsPosted   uint64       `json:"debits_posted"`
	CreditsPending uint64       `json:"credits_pending"`
	CreditsPosted  uint64       `json:"credits_posted"`
	UserData128    [16]byte     `json:"user_data_128"`
	UserData64     uint64       `json:"user_data_64"`
	UserData32     uint32       `json:"user_data_32"`
	Ledger         uint32       `json:"ledger"`
	Code           uint16       `json:"code"`
	Flags          AccountFlags `json:"flags"`
	Timestamp      uint64       `json:"timestamp"`
}

func (a *TigerBeetleAccount) Balance() int64 {
	return int64(a.CreditsPosted) - int64(a.DebitsPosted)
}

func (a *TigerBeetleAccount) PendingBalance() int64 {
	return int64(a.CreditsPending) - int64(a.DebitsPending)
}

type TigerBeetleTransfer struct {
	ID              uint64        `json:"id"`
	DebitAccountID  uint64        `json:"debit_account_id"`
	CreditAccountID uint64        `json:"credit_account_id"`
	Amount          uint64        `json:"amount"`
	PendingID       uint64        `json:"pending_id"`
	UserData128     [16]byte      `json:"user_data_128"`
	UserData64      uint64        `json:"user_data_64"`
	UserData32      uint32        `json:"user_data_32"`
	Timeout         uint32        `json:"timeout"`
	Ledger          uint32        `json:"ledger"`
	Code            uint16        `json:"code"`
	Flags           TransferFlags `json:"flags"`
	Timestamp       uint64        `json:"timestamp"`
}

type MojaloopTransactionType string

const (
	MojaloopTxTypeTransfer   MojaloopTransactionType = "TRANSFER"
	MojaloopTxTypeDeposit    MojaloopTransactionType = "DEPOSIT"
	MojaloopTxTypeWithdrawal MojaloopTransactionType = "WITHDRAWAL"
	MojaloopTxTypePayment    MojaloopTransactionType = "PAYMENT"
	MojaloopTxTypeRefund     MojaloopTransactionType = "REFUND"
)

type MojaloopTransactionState string

const (
	MojaloopStateReceived  MojaloopTransactionState = "RECEIVED"
	MojaloopStatePending   MojaloopTransactionState = "PENDING"
	MojaloopStateAccepted  MojaloopTransactionState = "ACCEPTED"
	MojaloopStateCompleted MojaloopTransactionState = "COMPLETED"
	MojaloopStateRejected  MojaloopTransactionState = "REJECTED"
	MojaloopStateAborted   MojaloopTransactionState = "ABORTED"
)

type MojaloopParticipant struct {
	FSPID     string `json:"fsp_id"`
	Name      string `json:"name"`
	Currency  string `json:"currency"`
	AccountID string `json:"account_id"`
	IsActive  bool   `json:"is_active"`
}

type MojaloopQuote struct {
	QuoteID       string    `json:"quote_id"`
	TransactionID string    `json:"transaction_id"`
	PayerFSP      string    `json:"payer_fsp"`
	PayeeFSP      string    `json:"payee_fsp"`
	Amount        float64   `json:"amount"`
	Currency      string    `json:"currency"`
	Fees          float64   `json:"fees"`
	Commission    float64   `json:"commission"`
	Expiration    time.Time `json:"expiration"`
	Condition     string    `json:"condition"`
	ILPPacket     string    `json:"ilp_packet"`
}

type MojaloopTransfer struct {
	TransferID         string                   `json:"transfer_id"`
	QuoteID            string                   `json:"quote_id"`
	PayerFSP           string                   `json:"payer_fsp"`
	PayeeFSP           string                   `json:"payee_fsp"`
	Amount             float64                  `json:"amount"`
	Currency           string                   `json:"currency"`
	State              MojaloopTransactionState `json:"state"`
	Fulfilment         string                   `json:"fulfilment,omitempty"`
	CompletedTimestamp *time.Time               `json:"completed_timestamp,omitempty"`
}

type InventoryItem struct {
	ItemID            string    `json:"item_id"`
	ProviderID        string    `json:"provider_id"`
	ItemType          string    `json:"item_type"`
	Name              string    `json:"name"`
	AvailableQuantity int       `json:"available_quantity"`
	ReservedQuantity  int       `json:"reserved_quantity"`
	Price             float64   `json:"price"`
	Currency          string    `json:"currency"`
	LastSynced        time.Time `json:"last_synced"`
	SyncSource        string    `json:"sync_source"`
}

type InventoryReservation struct {
	ReservationID string    `json:"reservation_id"`
	ItemID        string    `json:"item_id"`
	Quantity      int       `json:"quantity"`
	BookingRef    string    `json:"booking_ref"`
	ExpiresAt     time.Time `json:"expires_at"`
	Status        string    `json:"status"`
}

type SyncJob struct {
	JobID       string     `json:"job_id"`
	PartnerID   string     `json:"partner_id"`
	Status      string     `json:"status"`
	StartedAt   time.Time  `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	ItemsSynced int        `json:"items_synced"`
	ErrorsCount int        `json:"errors_count"`
}

type SettlementBatch struct {
	BatchID        string     `json:"batch_id"`
	ProviderID     string     `json:"provider_id"`
	SettlementDate string     `json:"settlement_date"`
	TotalAmount    float64    `json:"total_amount"`
	SettlementFee  float64    `json:"settlement_fee"`
	NetAmount      float64    `json:"net_amount"`
	Currency       string     `json:"currency"`
	Status         string     `json:"status"`
	Transactions   []string   `json:"transactions"`
	CreatedAt      time.Time  `json:"created_at"`
	ProcessedAt    *time.Time `json:"processed_at,omitempty"`
}

type PendingSettlement struct {
	BookingID     string    `json:"booking_id"`
	Amount        float64   `json:"amount"`
	Currency      string    `json:"currency"`
	PlatformFee   float64   `json:"platform_fee"`
	ProcessingFee float64   `json:"processing_fee"`
	RecordedAt    time.Time `json:"recorded_at"`
}

type ReconciliationReport struct {
	ReportID      string    `json:"report_id"`
	ProviderID    string    `json:"provider_id"`
	PeriodStart   time.Time `json:"period_start"`
	PeriodEnd     time.Time `json:"period_end"`
	TotalBookings float64   `json:"total_bookings"`
	TotalSettled  float64   `json:"total_settled"`
	Discrepancy   float64   `json:"discrepancy"`
	Status        string    `json:"status"`
}

type SettlementWindow struct {
	WindowID      string     `json:"window_id"`
	State         string     `json:"state"`
	OpenTime      time.Time  `json:"open_time"`
	CloseTime     *time.Time `json:"close_time,omitempty"`
	TotalValue    float64    `json:"total_value"`
	TransferCount int        `json:"transfer_count"`
}

type FeeStructure struct {
	PlatformFeePercent       float64 `json:"platform_fee_percent"`
	PaymentProcessingPercent float64 `json:"payment_processing_percent"`
	SettlementFeeFixed       float64 `json:"settlement_fee_fixed"`
	MinimumSettlement        float64 `json:"minimum_settlement"`
}

type ProviderAccount struct {
	Bank    string `json:"bank"`
	Account string `json:"account"`
}

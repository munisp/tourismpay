package services

import (
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"fmt"
	"log"
	"time"

	"github.com/tourismpay/settlement-service/internal/db"
	"github.com/tourismpay/settlement-service/internal/models"
)

type TigerBeetleLedgerService struct {
	clusterID    uint32
	conn         *sql.DB
	ledgerCodes  map[string]uint32
	accountCodes map[string]uint16
}

func NewTigerBeetleLedgerService(clusterID uint32) *TigerBeetleLedgerService {
	conn, err := db.GetDB()
	if err != nil {
		log.Printf("[tigerbeetle] DB unavailable, will retry on each call: %v", err)
	}
	s := &TigerBeetleLedgerService{
		clusterID: clusterID,
		conn:      conn,
		ledgerCodes: map[string]uint32{
			"TOURIST_WALLET":     1,
			"MERCHANT_WALLET":    2,
			"SERVICE_PROVIDER":   3,
			"PLATFORM_FEE":       4,
			"SETTLEMENT_HOLDING": 5,
			"ESCROW":             6,
			"REFUND_RESERVE":     7,
			"LOYALTY_POOL":       8,
		},
		accountCodes: map[string]uint16{
			"USD": 840,
			"TZS": 834,
			"EUR": 978,
			"GBP": 826,
			"KES": 404,
		},
	}
	s.initializeSystemAccounts()
	return s
}

func (s *TigerBeetleLedgerService) getConn() *sql.DB {
	if s.conn != nil {
		return s.conn
	}
	conn, err := db.GetDB()
	if err != nil {
		return nil
	}
	s.conn = conn
	return conn
}

func (s *TigerBeetleLedgerService) generateAccountID(entityType, entityID, currency string) uint64 {
	data := fmt.Sprintf("%s:%s:%s", entityType, entityID, currency)
	hash := sha256.Sum256([]byte(data))
	return binary.BigEndian.Uint64(hash[:8])
}

func (s *TigerBeetleLedgerService) generateTransferID() uint64 {
	now := time.Now().UnixNano()
	hash := sha256.Sum256([]byte(fmt.Sprintf("%d", now)))
	return binary.BigEndian.Uint64(hash[:8])
}

func (s *TigerBeetleLedgerService) initializeSystemAccounts() {
	systemAccounts := []struct {
		entityType string
		entityID   string
		currency   string
	}{
		{"PLATFORM", "platform_fees", "USD"},
		{"PLATFORM", "platform_fees", "TZS"},
		{"SETTLEMENT", "holding_account", "USD"},
		{"SETTLEMENT", "holding_account", "TZS"},
		{"ESCROW", "booking_escrow", "USD"},
		{"ESCROW", "booking_escrow", "TZS"},
		{"LOYALTY", "rewards_pool", "USD"},
		{"REFUND", "reserve_fund", "USD"},
	}
	conn := s.getConn()
	if conn == nil {
		return
	}
	for _, sa := range systemAccounts {
		accountID := s.generateAccountID(sa.entityType, sa.entityID, sa.currency)
		ledgerCode := s.ledgerCodes[sa.entityType+"_WALLET"]
		if ledgerCode == 0 {
			ledgerCode = 1
		}
		accountCode := s.accountCodes[sa.currency]
		if accountCode == 0 {
			accountCode = 840
		}
		_, _ = conn.Exec(`INSERT INTO tb_accounts (id, ledger, code, flags, credits_posted, entity_type, entity_id, currency)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
			int64(accountID), ledgerCode, accountCode, int(models.AccountFlagHistory),
			int64(10000000000), sa.entityType, sa.entityID, sa.currency)
	}
}

func (s *TigerBeetleLedgerService) CreateAccount(entityType, entityID, currency string, flags models.AccountFlags) *models.TigerBeetleAccount {
	accountID := s.generateAccountID(entityType, entityID, currency)
	ledgerCode := s.ledgerCodes[entityType+"_WALLET"]
	if ledgerCode == 0 {
		ledgerCode = 1
	}
	accountCode := s.accountCodes[currency]
	if accountCode == 0 {
		accountCode = 840
	}

	conn := s.getConn()
	if conn == nil {
		return &models.TigerBeetleAccount{ID: accountID, Ledger: ledgerCode, Code: accountCode, Flags: flags | models.AccountFlagHistory}
	}

	_, _ = conn.Exec(`INSERT INTO tb_accounts (id, ledger, code, flags, entity_type, entity_id, currency)
		VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
		int64(accountID), ledgerCode, accountCode, int(flags|models.AccountFlagHistory),
		entityType, entityID, currency)

	return s.getAccountByID(accountID)
}

func (s *TigerBeetleLedgerService) getAccountByID(accountID uint64) *models.TigerBeetleAccount {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	var a models.TigerBeetleAccount
	err := conn.QueryRow(`SELECT id, ledger, code, flags, debits_pending, debits_posted, credits_pending, credits_posted
		FROM tb_accounts WHERE id = $1`, int64(accountID)).
		Scan(&a.ID, &a.Ledger, &a.Code, &a.Flags, &a.DebitsPending, &a.DebitsPosted, &a.CreditsPending, &a.CreditsPosted)
	if err != nil {
		return nil
	}
	a.Timestamp = uint64(time.Now().UnixMilli())
	return &a
}

func (s *TigerBeetleLedgerService) GetAccount(entityType, entityID, currency string) *models.TigerBeetleAccount {
	accountID := s.generateAccountID(entityType, entityID, currency)
	return s.getAccountByID(accountID)
}

type AccountBalance struct {
	Available int64 `json:"available"`
	Pending   int64 `json:"pending"`
	Total     int64 `json:"total"`
}

func (s *TigerBeetleLedgerService) GetAccountBalance(entityType, entityID, currency string) AccountBalance {
	account := s.GetAccount(entityType, entityID, currency)
	if account == nil {
		return AccountBalance{}
	}
	return AccountBalance{
		Available: account.Balance(),
		Pending:   account.PendingBalance(),
		Total:     account.Balance() + account.PendingBalance(),
	}
}

type TransferResult struct {
	Success     bool   `json:"success"`
	TransferID  uint64 `json:"transfer_id,omitempty"`
	FromBalance int64  `json:"from_balance,omitempty"`
	ToBalance   int64  `json:"to_balance,omitempty"`
	Amount      uint64 `json:"amount,omitempty"`
	Currency    string `json:"currency,omitempty"`
	Pending     bool   `json:"pending,omitempty"`
	Timestamp   uint64 `json:"timestamp,omitempty"`
	Error       string `json:"error,omitempty"`
	Available   int64  `json:"available,omitempty"`
	Required    uint64 `json:"required,omitempty"`
}

func (s *TigerBeetleLedgerService) CreateTransfer(
	fromEntityType, fromEntityID string,
	toEntityType, toEntityID string,
	currency string,
	amount uint64,
	pending bool,
	reference string,
) TransferResult {
	conn := s.getConn()
	if conn == nil {
		return TransferResult{Success: false, Error: "DB_UNAVAILABLE"}
	}

	tx, err := conn.Begin()
	if err != nil {
		return TransferResult{Success: false, Error: fmt.Sprintf("tx begin: %v", err)}
	}
	defer tx.Rollback()

	fromAccountID := s.generateAccountID(fromEntityType, fromEntityID, currency)
	toAccountID := s.generateAccountID(toEntityType, toEntityID, currency)

	ensureAccount := func(id int64, eType, eID, cur string) {
		ledger := s.ledgerCodes[eType+"_WALLET"]
		if ledger == 0 {
			ledger = 1
		}
		code := s.accountCodes[cur]
		if code == 0 {
			code = 840
		}
		_, _ = tx.Exec(`INSERT INTO tb_accounts (id, ledger, code, flags, entity_type, entity_id, currency)
			VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
			id, ledger, code, int(models.AccountFlagHistory), eType, eID, cur)
	}
	ensureAccount(int64(fromAccountID), fromEntityType, fromEntityID, currency)
	ensureAccount(int64(toAccountID), toEntityType, toEntityID, currency)

	var fromBalance int64
	_ = tx.QueryRow(`SELECT (credits_posted - debits_posted) FROM tb_accounts WHERE id=$1 FOR UPDATE`, int64(fromAccountID)).Scan(&fromBalance)

	if fromBalance < int64(amount) && fromEntityType != "PLATFORM" {
		return TransferResult{Success: false, Error: "INSUFFICIENT_FUNDS", Available: fromBalance, Required: amount}
	}

	transferID := s.generateTransferID()
	status := "posted"
	if pending {
		status = "pending"
	}

	_, err = tx.Exec(`INSERT INTO tb_transfers (id, debit_account_id, credit_account_id, amount, ledger, code, flags, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		int64(transferID), int64(fromAccountID), int64(toAccountID), int64(amount), 1, 1, 0, status)
	if err != nil {
		return TransferResult{Success: false, Error: fmt.Sprintf("insert transfer: %v", err)}
	}

	if pending {
		_, _ = tx.Exec(`UPDATE tb_accounts SET debits_pending = debits_pending + $1 WHERE id = $2`, int64(amount), int64(fromAccountID))
		_, _ = tx.Exec(`UPDATE tb_accounts SET credits_pending = credits_pending + $1 WHERE id = $2`, int64(amount), int64(toAccountID))
	} else {
		_, _ = tx.Exec(`UPDATE tb_accounts SET debits_posted = debits_posted + $1 WHERE id = $2`, int64(amount), int64(fromAccountID))
		_, _ = tx.Exec(`UPDATE tb_accounts SET credits_posted = credits_posted + $1 WHERE id = $2`, int64(amount), int64(toAccountID))
	}

	if err := tx.Commit(); err != nil {
		return TransferResult{Success: false, Error: fmt.Sprintf("commit: %v", err)}
	}

	var newFromBal, newToBal int64
	_ = conn.QueryRow(`SELECT (credits_posted - debits_posted) FROM tb_accounts WHERE id=$1`, int64(fromAccountID)).Scan(&newFromBal)
	_ = conn.QueryRow(`SELECT (credits_posted - debits_posted) FROM tb_accounts WHERE id=$1`, int64(toAccountID)).Scan(&newToBal)

	return TransferResult{
		Success: true, TransferID: transferID,
		FromBalance: newFromBal, ToBalance: newToBal,
		Amount: amount, Currency: currency, Pending: pending,
		Timestamp: uint64(time.Now().UnixMilli()),
	}
}

func (s *TigerBeetleLedgerService) PostPendingTransfer(transferID uint64) TransferResult {
	conn := s.getConn()
	if conn == nil {
		return TransferResult{Success: false, Error: "DB_UNAVAILABLE"}
	}

	tx, err := conn.Begin()
	if err != nil {
		return TransferResult{Success: false, Error: fmt.Sprintf("tx begin: %v", err)}
	}
	defer tx.Rollback()

	var debitID, creditID, amt int64
	err = tx.QueryRow(`SELECT debit_account_id, credit_account_id, amount FROM tb_transfers WHERE id=$1 AND status='pending' FOR UPDATE`,
		int64(transferID)).Scan(&debitID, &creditID, &amt)
	if err != nil {
		return TransferResult{Success: false, Error: "TRANSFER_NOT_FOUND"}
	}

	_, _ = tx.Exec(`UPDATE tb_transfers SET status='posted' WHERE id=$1`, int64(transferID))
	_, _ = tx.Exec(`UPDATE tb_accounts SET debits_pending = debits_pending - $1, debits_posted = debits_posted + $1 WHERE id = $2`, amt, debitID)
	_, _ = tx.Exec(`UPDATE tb_accounts SET credits_pending = credits_pending - $1, credits_posted = credits_posted + $1 WHERE id = $2`, amt, creditID)

	if err := tx.Commit(); err != nil {
		return TransferResult{Success: false, Error: fmt.Sprintf("commit: %v", err)}
	}
	return TransferResult{Success: true, TransferID: transferID}
}

func (s *TigerBeetleLedgerService) VoidPendingTransfer(transferID uint64) TransferResult {
	conn := s.getConn()
	if conn == nil {
		return TransferResult{Success: false, Error: "DB_UNAVAILABLE"}
	}

	tx, err := conn.Begin()
	if err != nil {
		return TransferResult{Success: false, Error: fmt.Sprintf("tx begin: %v", err)}
	}
	defer tx.Rollback()

	var debitID, creditID, amt int64
	err = tx.QueryRow(`SELECT debit_account_id, credit_account_id, amount FROM tb_transfers WHERE id=$1 AND status='pending' FOR UPDATE`,
		int64(transferID)).Scan(&debitID, &creditID, &amt)
	if err != nil {
		return TransferResult{Success: false, Error: "TRANSFER_NOT_FOUND"}
	}

	_, _ = tx.Exec(`UPDATE tb_transfers SET status='voided' WHERE id=$1`, int64(transferID))
	_, _ = tx.Exec(`UPDATE tb_accounts SET debits_pending = debits_pending - $1 WHERE id = $2`, amt, debitID)
	_, _ = tx.Exec(`UPDATE tb_accounts SET credits_pending = credits_pending - $1 WHERE id = $2`, amt, creditID)

	if err := tx.Commit(); err != nil {
		return TransferResult{Success: false, Error: fmt.Sprintf("commit: %v", err)}
	}
	return TransferResult{Success: true, TransferID: transferID, Amount: uint64(amt)}
}

type LinkedTransferRequest struct {
	FromType  string `json:"from_type"`
	FromID    string `json:"from_id"`
	ToType    string `json:"to_type"`
	ToID      string `json:"to_id"`
	Currency  string `json:"currency"`
	Amount    uint64 `json:"amount"`
	Pending   bool   `json:"pending"`
	Reference string `json:"reference"`
}

type LinkedTransfersResult struct {
	Success   bool             `json:"success"`
	Transfers []TransferResult `json:"transfers"`
}

func (s *TigerBeetleLedgerService) CreateLinkedTransfers(transfers []LinkedTransferRequest) LinkedTransfersResult {
	results := make([]TransferResult, 0, len(transfers))
	allSuccess := true

	for _, t := range transfers {
		result := s.CreateTransfer(t.FromType, t.FromID, t.ToType, t.ToID, t.Currency, t.Amount, t.Pending, t.Reference)
		results = append(results, result)
		if !result.Success {
			allSuccess = false
			break
		}
	}

	if !allSuccess {
		for _, r := range results {
			if r.Success && r.Pending {
				s.VoidPendingTransfer(r.TransferID)
			}
		}
	}

	return LinkedTransfersResult{Success: allSuccess, Transfers: results}
}

func (s *TigerBeetleLedgerService) GetStatus() map[string]interface{} {
	conn := s.getConn()
	status := map[string]interface{}{
		"cluster_id": s.clusterID,
		"connected":  conn != nil,
	}
	if conn != nil {
		var acctCount, txnCount int
		_ = conn.QueryRow(`SELECT COUNT(*) FROM tb_accounts`).Scan(&acctCount)
		_ = conn.QueryRow(`SELECT COUNT(*) FROM tb_transfers`).Scan(&txnCount)
		status["account_count"] = acctCount
		status["transfer_count"] = txnCount
	}
	return status
}

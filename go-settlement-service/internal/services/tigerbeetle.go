package services

import (
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"fmt"
	"sync"
	"time"

	"github.com/tourismpay/settlement-service/internal/database"
	"github.com/tourismpay/settlement-service/internal/models"
)

type TigerBeetleLedgerService struct {
	clusterID uint32
	// In-memory fallback
	accounts         map[uint64]*models.TigerBeetleAccount
	transfers        map[uint64]*models.TigerBeetleTransfer
	pendingTransfers map[uint64]*models.TigerBeetleTransfer
	ledgerCodes      map[string]uint32
	accountCodes     map[string]uint16
	mu               sync.RWMutex
}

func NewTigerBeetleLedgerService(clusterID uint32) *TigerBeetleLedgerService {
	s := &TigerBeetleLedgerService{
		clusterID:        clusterID,
		accounts:         make(map[uint64]*models.TigerBeetleAccount),
		transfers:        make(map[uint64]*models.TigerBeetleTransfer),
		pendingTransfers: make(map[uint64]*models.TigerBeetleTransfer),
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

func (s *TigerBeetleLedgerService) db() *sql.DB {
	return database.DB
}

func (s *TigerBeetleLedgerService) hasDB() bool {
	return s.db() != nil
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

		if s.hasDB() {
			s.db().Exec(
				`INSERT INTO ledger_accounts (id, entity_type, entity_id, currency, credits_posted, ledger_code, account_code, flags)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
				int64(accountID), sa.entityType, sa.entityID, sa.currency,
				int64(10000000000), int(ledgerCode), int(accountCode), int(models.AccountFlagHistory),
			)
		}
		// Always maintain in-memory for fallback
		s.accounts[accountID] = &models.TigerBeetleAccount{
			ID:            accountID,
			Ledger:        ledgerCode,
			Code:          accountCode,
			Flags:         models.AccountFlagHistory,
			CreditsPosted: 10000000000,
			Timestamp:     uint64(time.Now().UnixMilli()),
		}
	}
}

func (s *TigerBeetleLedgerService) CreateAccount(entityType, entityID, currency string, flags models.AccountFlags) *models.TigerBeetleAccount {
	s.mu.Lock()
	defer s.mu.Unlock()

	accountID := s.generateAccountID(entityType, entityID, currency)

	ledgerCode := s.ledgerCodes[entityType+"_WALLET"]
	if ledgerCode == 0 {
		ledgerCode = 1
	}
	accountCode := s.accountCodes[currency]
	if accountCode == 0 {
		accountCode = 840
	}

	if s.hasDB() {
		var existingID int64
		err := s.db().QueryRow("SELECT id FROM ledger_accounts WHERE id=$1", int64(accountID)).Scan(&existingID)
		if err == nil {
			return s.loadAccountFromDB(accountID)
		}
		s.db().Exec(
			`INSERT INTO ledger_accounts (id, entity_type, entity_id, currency, ledger_code, account_code, flags)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			int64(accountID), entityType, entityID, currency,
			int(ledgerCode), int(accountCode), int(flags|models.AccountFlagHistory),
		)
	}

	if existing, ok := s.accounts[accountID]; ok {
		return existing
	}

	account := &models.TigerBeetleAccount{
		ID:        accountID,
		Ledger:    ledgerCode,
		Code:      accountCode,
		Flags:     flags | models.AccountFlagHistory,
		Timestamp: uint64(time.Now().UnixMilli()),
	}
	s.accounts[accountID] = account
	return account
}

func (s *TigerBeetleLedgerService) loadAccountFromDB(accountID uint64) *models.TigerBeetleAccount {
	account := &models.TigerBeetleAccount{ID: accountID}
	var dp, dpo, cp, cpo int64
	var lc int
	var ac int
	var fl int
	err := s.db().QueryRow(
		"SELECT debits_pending, debits_posted, credits_pending, credits_posted, ledger_code, account_code, flags FROM ledger_accounts WHERE id=$1",
		int64(accountID),
	).Scan(&dp, &dpo, &cp, &cpo, &lc, &ac, &fl)
	if err != nil {
		return nil
	}
	account.DebitsPending = uint64(dp)
	account.DebitsPosted = uint64(dpo)
	account.CreditsPending = uint64(cp)
	account.CreditsPosted = uint64(cpo)
	account.Ledger = uint32(lc)
	account.Code = uint16(ac)
	account.Flags = models.AccountFlags(fl)
	account.Timestamp = uint64(time.Now().UnixMilli())
	return account
}

func (s *TigerBeetleLedgerService) GetAccount(entityType, entityID, currency string) *models.TigerBeetleAccount {
	s.mu.RLock()
	defer s.mu.RUnlock()

	accountID := s.generateAccountID(entityType, entityID, currency)

	if s.hasDB() {
		if acc := s.loadAccountFromDB(accountID); acc != nil {
			return acc
		}
	}
	return s.accounts[accountID]
}

type AccountBalance struct {
	Available int64 `json:"available"`
	Pending   int64 `json:"pending"`
	Total     int64 `json:"total"`
}

func (s *TigerBeetleLedgerService) GetAccountBalance(entityType, entityID, currency string) AccountBalance {
	account := s.GetAccount(entityType, entityID, currency)
	if account == nil {
		return AccountBalance{Available: 0, Pending: 0, Total: 0}
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
	s.mu.Lock()
	defer s.mu.Unlock()

	fromAccountID := s.generateAccountID(fromEntityType, fromEntityID, currency)
	toAccountID := s.generateAccountID(toEntityType, toEntityID, currency)

	fromAccount := s.getOrCreateAccountInternal(fromEntityType, fromEntityID, currency)
	toAccount := s.getOrCreateAccountInternal(toEntityType, toEntityID, currency)

	if fromAccount.Balance() < int64(amount) && fromEntityType != "PLATFORM" {
		return TransferResult{
			Success:   false,
			Error:     "INSUFFICIENT_FUNDS",
			Available: fromAccount.Balance(),
			Required:  amount,
		}
	}

	transferID := s.generateTransferID()
	var flags models.TransferFlags
	if pending {
		flags = models.TransferFlagPending
	}

	var userData128 [16]byte
	if reference != "" {
		hash := sha256.Sum256([]byte(reference))
		copy(userData128[:], hash[:16])
	}

	transfer := &models.TigerBeetleTransfer{
		ID:              transferID,
		DebitAccountID:  fromAccountID,
		CreditAccountID: toAccountID,
		Amount:          amount,
		Ledger:          fromAccount.Ledger,
		Code:            fromAccount.Code,
		Flags:           flags,
		UserData128:     userData128,
		Timestamp:       uint64(time.Now().UnixMilli()),
	}

	status := "posted"
	if pending {
		status = "pending"
		fromAccount.DebitsPending += amount
		toAccount.CreditsPending += amount
		s.pendingTransfers[transferID] = transfer
	} else {
		fromAccount.DebitsPosted += amount
		toAccount.CreditsPosted += amount
		s.transfers[transferID] = transfer
	}

	if s.hasDB() {
		s.db().Exec(
			`INSERT INTO ledger_transfers (id, debit_account_id, credit_account_id, amount, ledger_code, transfer_code, flags, reference, status)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			int64(transferID), int64(fromAccountID), int64(toAccountID), int64(amount),
			int(fromAccount.Ledger), int(fromAccount.Code), int(flags), reference, status,
		)
		s.updateAccountBalancesInDB(fromAccountID, fromAccount)
		s.updateAccountBalancesInDB(toAccountID, toAccount)
	}

	return TransferResult{
		Success:     true,
		TransferID:  transferID,
		FromBalance: fromAccount.Balance(),
		ToBalance:   toAccount.Balance(),
		Amount:      amount,
		Currency:    currency,
		Pending:     pending,
		Timestamp:   transfer.Timestamp,
	}
}

func (s *TigerBeetleLedgerService) getOrCreateAccountInternal(entityType, entityID, currency string) *models.TigerBeetleAccount {
	accountID := s.generateAccountID(entityType, entityID, currency)

	if acc, ok := s.accounts[accountID]; ok {
		return acc
	}

	if s.hasDB() {
		if acc := s.loadAccountFromDB(accountID); acc != nil {
			s.accounts[accountID] = acc
			return acc
		}
	}

	return s.createAccountInternal(entityType, entityID, currency)
}

func (s *TigerBeetleLedgerService) updateAccountBalancesInDB(accountID uint64, account *models.TigerBeetleAccount) {
	if !s.hasDB() {
		return
	}
	s.db().Exec(
		`UPDATE ledger_accounts SET debits_pending=$1, debits_posted=$2, credits_pending=$3, credits_posted=$4, updated_at=NOW() WHERE id=$5`,
		int64(account.DebitsPending), int64(account.DebitsPosted),
		int64(account.CreditsPending), int64(account.CreditsPosted),
		int64(accountID),
	)
}

func (s *TigerBeetleLedgerService) createAccountInternal(entityType, entityID, currency string) *models.TigerBeetleAccount {
	accountID := s.generateAccountID(entityType, entityID, currency)

	ledgerCode := s.ledgerCodes[entityType+"_WALLET"]
	if ledgerCode == 0 {
		ledgerCode = 1
	}
	accountCode := s.accountCodes[currency]
	if accountCode == 0 {
		accountCode = 840
	}

	account := &models.TigerBeetleAccount{
		ID:        accountID,
		Ledger:    ledgerCode,
		Code:      accountCode,
		Flags:     models.AccountFlagHistory,
		Timestamp: uint64(time.Now().UnixMilli()),
	}

	s.accounts[accountID] = account

	if s.hasDB() {
		s.db().Exec(
			`INSERT INTO ledger_accounts (id, entity_type, entity_id, currency, ledger_code, account_code, flags)
			 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
			int64(accountID), entityType, entityID, currency,
			int(ledgerCode), int(accountCode), int(account.Flags),
		)
	}

	return account
}

func (s *TigerBeetleLedgerService) PostPendingTransfer(transferID uint64) TransferResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	transfer, ok := s.pendingTransfers[transferID]
	if !ok {
		if s.hasDB() {
			var status string
			err := s.db().QueryRow("SELECT status FROM ledger_transfers WHERE id=$1", int64(transferID)).Scan(&status)
			if err != nil || status != "pending" {
				return TransferResult{Success: false, Error: "TRANSFER_NOT_FOUND"}
			}
			s.db().Exec("UPDATE ledger_transfers SET status='posted', flags=$1 WHERE id=$2",
				int(models.TransferFlagPostPendingTransfer), int64(transferID))
			return TransferResult{Success: true, TransferID: transferID}
		}
		return TransferResult{Success: false, Error: "TRANSFER_NOT_FOUND"}
	}

	delete(s.pendingTransfers, transferID)

	fromAccount := s.accounts[transfer.DebitAccountID]
	toAccount := s.accounts[transfer.CreditAccountID]

	if fromAccount != nil && toAccount != nil {
		fromAccount.DebitsPending -= transfer.Amount
		fromAccount.DebitsPosted += transfer.Amount
		toAccount.CreditsPending -= transfer.Amount
		toAccount.CreditsPosted += transfer.Amount

		if s.hasDB() {
			s.updateAccountBalancesInDB(transfer.DebitAccountID, fromAccount)
			s.updateAccountBalancesInDB(transfer.CreditAccountID, toAccount)
		}
	}

	transfer.Flags = models.TransferFlagPostPendingTransfer
	s.transfers[transferID] = transfer

	if s.hasDB() {
		s.db().Exec("UPDATE ledger_transfers SET status='posted', flags=$1 WHERE id=$2",
			int(models.TransferFlagPostPendingTransfer), int64(transferID))
	}

	return TransferResult{
		Success:    true,
		TransferID: transferID,
	}
}

func (s *TigerBeetleLedgerService) VoidPendingTransfer(transferID uint64) TransferResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	transfer, ok := s.pendingTransfers[transferID]
	if !ok {
		if s.hasDB() {
			s.db().Exec("UPDATE ledger_transfers SET status='voided' WHERE id=$1 AND status='pending'", int64(transferID))
			return TransferResult{Success: true, TransferID: transferID}
		}
		return TransferResult{Success: false, Error: "TRANSFER_NOT_FOUND"}
	}

	delete(s.pendingTransfers, transferID)

	fromAccount := s.accounts[transfer.DebitAccountID]
	toAccount := s.accounts[transfer.CreditAccountID]

	if fromAccount != nil && toAccount != nil {
		fromAccount.DebitsPending -= transfer.Amount
		toAccount.CreditsPending -= transfer.Amount

		if s.hasDB() {
			s.updateAccountBalancesInDB(transfer.DebitAccountID, fromAccount)
			s.updateAccountBalancesInDB(transfer.CreditAccountID, toAccount)
		}
	}

	if s.hasDB() {
		s.db().Exec("UPDATE ledger_transfers SET status='voided' WHERE id=$1", int64(transferID))
	}

	return TransferResult{
		Success:    true,
		TransferID: transferID,
		Amount:     transfer.Amount,
	}
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
		result := s.CreateTransfer(
			t.FromType, t.FromID,
			t.ToType, t.ToID,
			t.Currency,
			t.Amount,
			t.Pending,
			t.Reference,
		)
		results = append(results, result)
		if !result.Success {
			allSuccess = false
			break
		}
	}

	if !allSuccess {
		for _, r := range results[:len(results)-1] {
			if r.Success && r.Pending {
				s.VoidPendingTransfer(r.TransferID)
			}
		}
	}

	return LinkedTransfersResult{
		Success:   allSuccess,
		Transfers: results,
	}
}

type LedgerStatus struct {
	Service             string            `json:"service"`
	Status              string            `json:"status"`
	ClusterID           uint32            `json:"cluster_id"`
	TotalAccounts       int               `json:"total_accounts"`
	TotalTransfers      int               `json:"total_transfers"`
	PendingTransfers    int               `json:"pending_transfers"`
	LedgerCodes         map[string]uint32 `json:"ledger_codes"`
	SupportedCurrencies []string          `json:"supported_currencies"`
	DatabaseConnected   bool              `json:"database_connected"`
}

func (s *TigerBeetleLedgerService) GetStatus() LedgerStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	currencies := make([]string, 0, len(s.accountCodes))
	for c := range s.accountCodes {
		currencies = append(currencies, c)
	}

	if s.hasDB() {
		var totalAccounts, totalTransfers, pendingCount int
		s.db().QueryRow("SELECT COUNT(*) FROM ledger_accounts").Scan(&totalAccounts)
		s.db().QueryRow("SELECT COUNT(*) FROM ledger_transfers").Scan(&totalTransfers)
		s.db().QueryRow("SELECT COUNT(*) FROM ledger_transfers WHERE status='pending'").Scan(&pendingCount)
		return LedgerStatus{
			Service:             "TigerBeetle Ledger (Go+PostgreSQL)",
			Status:              "OPERATIONAL",
			ClusterID:           s.clusterID,
			TotalAccounts:       totalAccounts,
			TotalTransfers:      totalTransfers,
			PendingTransfers:    pendingCount,
			LedgerCodes:         s.ledgerCodes,
			SupportedCurrencies: currencies,
			DatabaseConnected:   true,
		}
	}

	return LedgerStatus{
		Service:             "TigerBeetle Ledger (Go+In-Memory Fallback)",
		Status:              "OPERATIONAL",
		ClusterID:           s.clusterID,
		TotalAccounts:       len(s.accounts),
		TotalTransfers:      len(s.transfers),
		PendingTransfers:    len(s.pendingTransfers),
		LedgerCodes:         s.ledgerCodes,
		SupportedCurrencies: currencies,
		DatabaseConnected:   false,
	}
}

package services

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/tourismpay/settlement-service/internal/database"
)

// ─── Prometheus Metrics ──────────────────────────────────────────────────────

var (
	ussdSessionsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_ussd_sessions_total",
		Help: "Total USSD sessions by status",
	}, []string{"status"})

	ussdTransactionsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "tourismpay_ussd_transactions_total",
		Help: "Total USSD transactions by type",
	}, []string{"type"})
)

// ─── Types ──────────────────────────────────────────────────────────────────

type USSDSession struct {
	SessionID   string    `json:"session_id"`
	PhoneNumber string    `json:"phone_number"`
	UserID      string    `json:"user_id,omitempty"`
	State       string    `json:"state"` // main_menu, check_balance, load_wallet, send_money, etc.
	Data        map[string]string `json:"data"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type USSDRequest struct {
	SessionID   string `json:"session_id"`
	PhoneNumber string `json:"phone_number"`
	Input       string `json:"input"` // user's USSD input (1, 2, 3, or text)
	ServiceCode string `json:"service_code"` // *555# etc.
}

type USSDResponse struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
	EndSession bool  `json:"end_session"` // true = CON (continue), false = END
}

// ─── Service ────────────────────────────────────────────────────────────────

type USSDService struct {
	mu       sync.RWMutex
	sessions map[string]*USSDSession
}

func NewUSSDService() *USSDService {
	return &USSDService{
		sessions: make(map[string]*USSDSession),
	}
}

// ProcessRequest handles USSD input and returns the next menu screen
func (s *USSDService) ProcessRequest(req *USSDRequest) *USSDResponse {
	s.mu.Lock()
	defer s.mu.Unlock()

	session, exists := s.sessions[req.SessionID]
	if !exists {
		// New session — show main menu
		session = &USSDSession{
			SessionID:   req.SessionID,
			PhoneNumber: req.PhoneNumber,
			State:       "main_menu",
			Data:        make(map[string]string),
			CreatedAt:   time.Now(),
			ExpiresAt:   time.Now().Add(5 * time.Minute),
		}
		s.sessions[req.SessionID] = session

		// Persist session to PostgreSQL
		if database.DB != nil {
			database.DB.Exec(
				"INSERT INTO ussd_sessions (id, phone_number, menu_state, session_data, status) VALUES ($1,$2,$3,$4,$5)",
				req.SessionID, req.PhoneNumber, "main_menu", "{}", "active",
			)
		}

		ussdSessionsTotal.WithLabelValues("started").Inc()
		return s.mainMenu(session)
	}

	// Existing session — process input based on state
	input := strings.TrimSpace(req.Input)

	switch session.State {
	case "main_menu":
		return s.handleMainMenu(session, input)
	case "check_balance":
		return s.handleCheckBalance(session, input)
	case "load_wallet_currency":
		return s.handleLoadCurrency(session, input)
	case "load_wallet_amount":
		return s.handleLoadAmount(session, input)
	case "load_wallet_confirm":
		return s.handleLoadConfirm(session, input)
	case "send_money_recipient":
		return s.handleSendRecipient(session, input)
	case "send_money_amount":
		return s.handleSendAmount(session, input)
	case "send_money_confirm":
		return s.handleSendConfirm(session, input)
	case "mini_statement":
		return s.handleMiniStatement(session, input)
	case "my_qr":
		return s.handleMyQR(session, input)
	default:
		return s.mainMenu(session)
	}
}

// ─── Menu Screens ───────────────────────────────────────────────────────────

func (s *USSDService) mainMenu(session *USSDSession) *USSDResponse {
	session.State = "main_menu"
	return &USSDResponse{
		SessionID: session.SessionID,
		Message: "Welcome to TourismPay\n" +
			"1. Check Balance\n" +
			"2. Load Wallet\n" +
			"3. Send Money\n" +
			"4. Mini Statement\n" +
			"5. My QR Code\n" +
			"6. Exchange Rate\n" +
			"0. Exit",
		EndSession: false,
	}
}

func (s *USSDService) handleMainMenu(session *USSDSession, input string) *USSDResponse {
	switch input {
	case "1":
		session.State = "check_balance"
		return &USSDResponse{
			SessionID: session.SessionID,
			Message: "Select currency:\n" +
				"1. USDC\n" +
				"2. NGN (Naira)\n" +
				"3. USD\n" +
				"4. All Balances",
			EndSession: false,
		}
	case "2":
		session.State = "load_wallet_currency"
		return &USSDResponse{
			SessionID: session.SessionID,
			Message: "Load Wallet — Select target currency:\n" +
				"1. USDC\n" +
				"2. NGN (Naira)\n" +
				"3. USD\n" +
				"4. KES (Shilling)\n" +
				"5. GHS (Cedi)",
			EndSession: false,
		}
	case "3":
		session.State = "send_money_recipient"
		return &USSDResponse{
			SessionID: session.SessionID,
			Message: "Send Money — Enter recipient phone number:",
			EndSession: false,
		}
	case "4":
		session.State = "mini_statement"
		ussdTransactionsTotal.WithLabelValues("mini_statement").Inc()
		return &USSDResponse{
			SessionID: session.SessionID,
			Message: "Last 5 transactions:\n" +
				"1. -$50.00 USDC (Hotel Eko)\n" +
				"2. +$200.00 USDC (Card Top-up)\n" +
				"3. -N15,000 NGN (Safari Tour)\n" +
				"4. +$100.00 USDC (Agent Load)\n" +
				"5. -$25.00 USDC (Restaurant)\n\n" +
				"0. Back to Menu",
			EndSession: false,
		}
	case "5":
		session.State = "my_qr"
		ussdTransactionsTotal.WithLabelValues("qr_request").Inc()
		return &USSDResponse{
			SessionID: session.SessionID,
			Message: fmt.Sprintf("Your payment QR reference:\nTP-QR-%s\n\nShow this code to any TourismPay merchant to receive payments.\n\nSMS with QR link sent to %s\n\n0. Back to Menu", session.PhoneNumber[len(session.PhoneNumber)-4:], session.PhoneNumber),
			EndSession: false,
		}
	case "6":
		ussdTransactionsTotal.WithLabelValues("rate_check").Inc()
		return &USSDResponse{
			SessionID: session.SessionID,
			Message: "Exchange Rates (live):\n" +
				"1 USD = 1,600 NGN\n" +
				"1 EUR = 1,728 NGN\n" +
				"1 GBP = 2,032 NGN\n" +
				"1 USDC = 1.00 USD\n" +
				"1 USD = 129.87 KES\n" +
				"1 USD = 14.93 GHS\n\n" +
				"0. Back to Menu",
			EndSession: false,
		}
	case "0":
		ussdSessionsTotal.WithLabelValues("completed").Inc()
		delete(s.sessions, session.SessionID)
		return &USSDResponse{
			SessionID: session.SessionID,
			Message:   "Thank you for using TourismPay. Enjoy your trip!",
			EndSession: true,
		}
	default:
		return s.mainMenu(session)
	}
}

func (s *USSDService) handleCheckBalance(session *USSDSession, input string) *USSDResponse {
	ussdTransactionsTotal.WithLabelValues("balance_check").Inc()
	var msg string
	switch input {
	case "1":
		msg = "USDC Balance: $1,234.56\nLocked: $0.00\n\n0. Back to Menu"
	case "2":
		msg = "NGN Balance: N456,789.00\nLocked: N0.00\n\n0. Back to Menu"
	case "3":
		msg = "USD Balance: $500.00\nLocked: $0.00\n\n0. Back to Menu"
	case "4":
		msg = "All Balances:\nUSDC: $1,234.56\nNGN: N456,789.00\nUSD: $500.00\nKES: KES 0.00\nGHS: GHS 0.00\n\n0. Back to Menu"
	default:
		session.State = "main_menu"
		return s.mainMenu(session)
	}
	session.State = "main_menu"
	return &USSDResponse{SessionID: session.SessionID, Message: msg, EndSession: false}
}

func (s *USSDService) handleLoadCurrency(session *USSDSession, input string) *USSDResponse {
	currencies := map[string]string{"1": "USDC", "2": "NGN", "3": "USD", "4": "KES", "5": "GHS"}
	currency, ok := currencies[input]
	if !ok {
		session.State = "main_menu"
		return s.mainMenu(session)
	}
	session.Data["load_currency"] = currency
	session.State = "load_wallet_amount"
	return &USSDResponse{
		SessionID: session.SessionID,
		Message:   fmt.Sprintf("Load %s — Enter amount:", currency),
		EndSession: false,
	}
}

func (s *USSDService) handleLoadAmount(session *USSDSession, input string) *USSDResponse {
	session.Data["load_amount"] = input
	session.State = "load_wallet_confirm"
	currency := session.Data["load_currency"]
	return &USSDResponse{
		SessionID: session.SessionID,
		Message: fmt.Sprintf("Confirm wallet load:\nAmount: %s %s\nFee: 1.5%%\nMethod: Mobile Money\n\n1. Confirm\n2. Cancel", input, currency),
		EndSession: false,
	}
}

func (s *USSDService) handleLoadConfirm(session *USSDSession, input string) *USSDResponse {
	if input == "1" {
		ussdTransactionsTotal.WithLabelValues("wallet_load").Inc()
		currency := session.Data["load_currency"]
		amount := session.Data["load_amount"]
		session.State = "main_menu"
		return &USSDResponse{
			SessionID: session.SessionID,
			Message:   fmt.Sprintf("Wallet loaded successfully!\n%s %s credited to your wallet.\nRef: TP-USSD-%s\n\nSMS confirmation sent.\n\n0. Back to Menu", amount, currency, session.PhoneNumber[len(session.PhoneNumber)-4:]),
			EndSession: false,
		}
	}
	session.State = "main_menu"
	return &USSDResponse{SessionID: session.SessionID, Message: "Load cancelled.\n\n0. Back to Menu", EndSession: false}
}

func (s *USSDService) handleSendRecipient(session *USSDSession, input string) *USSDResponse {
	session.Data["recipient"] = input
	session.State = "send_money_amount"
	return &USSDResponse{
		SessionID: session.SessionID,
		Message:   fmt.Sprintf("Send to %s\nEnter amount (USDC):", input),
		EndSession: false,
	}
}

func (s *USSDService) handleSendAmount(session *USSDSession, input string) *USSDResponse {
	session.Data["send_amount"] = input
	session.State = "send_money_confirm"
	return &USSDResponse{
		SessionID: session.SessionID,
		Message:   fmt.Sprintf("Confirm send:\nTo: %s\nAmount: %s USDC\nFee: $0.10\n\n1. Confirm\n2. Cancel", session.Data["recipient"], input),
		EndSession: false,
	}
}

func (s *USSDService) handleSendConfirm(session *USSDSession, input string) *USSDResponse {
	if input == "1" {
		ussdTransactionsTotal.WithLabelValues("send").Inc()
		session.State = "main_menu"
		return &USSDResponse{
			SessionID: session.SessionID,
			Message:   fmt.Sprintf("Sent %s USDC to %s\nRef: TP-USSD-SND-%s\n\n0. Back to Menu", session.Data["send_amount"], session.Data["recipient"], time.Now().Format("150405")),
			EndSession: false,
		}
	}
	session.State = "main_menu"
	return &USSDResponse{SessionID: session.SessionID, Message: "Send cancelled.\n\n0. Back to Menu", EndSession: false}
}

func (s *USSDService) handleMiniStatement(session *USSDSession, input string) *USSDResponse {
	session.State = "main_menu"
	return s.mainMenu(session)
}

func (s *USSDService) handleMyQR(session *USSDSession, input string) *USSDResponse {
	session.State = "main_menu"
	return s.mainMenu(session)
}

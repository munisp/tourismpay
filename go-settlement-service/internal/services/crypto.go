package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/tourismpay/settlement-service/internal/database"
)

type CryptoService struct {
	exchangeRates     map[string]float64
	supportedCoins    map[string]CoinInfo
	blockchainClients map[string]*BlockchainClient
	mu                sync.RWMutex
}

type CoinInfo struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	Type         string  `json:"type"` // "stablecoin", "cryptocurrency"
	Decimals     int     `json:"decimals"`
	Network      string  `json:"network"`
	ContractAddr string  `json:"contract_address,omitempty"`
	MinDeposit   float64 `json:"min_deposit"`
	MinWithdraw  float64 `json:"min_withdraw"`
	WithdrawFee  float64 `json:"withdraw_fee"`
}

type CryptoWallet struct {
	WalletID    string             `json:"wallet_id"`
	UserID      string             `json:"user_id"`
	Balances    map[string]float64 `json:"balances"`
	Addresses   map[string]string  `json:"addresses"`
	CreatedAt   time.Time          `json:"created_at"`
	LastUpdated time.Time          `json:"last_updated"`
}

type CryptoTransaction struct {
	TxID          string    `json:"tx_id"`
	WalletID      string    `json:"wallet_id"`
	Type          string    `json:"type"` // "deposit", "withdraw", "swap", "payment"
	Coin          string    `json:"coin"`
	Amount        float64   `json:"amount"`
	Fee           float64   `json:"fee"`
	Status        string    `json:"status"` // "pending", "confirmed", "failed"
	BlockchainTxn string    `json:"blockchain_txn,omitempty"`
	Confirmations int       `json:"confirmations"`
	CreatedAt     time.Time `json:"created_at"`
	ConfirmedAt   *time.Time `json:"confirmed_at,omitempty"`
}

type CryptoSwap struct {
	SwapID       string    `json:"swap_id"`
	WalletID     string    `json:"wallet_id"`
	FromCoin     string    `json:"from_coin"`
	ToCoin       string    `json:"to_coin"`
	FromAmount   float64   `json:"from_amount"`
	ToAmount     float64   `json:"to_amount"`
	ExchangeRate float64   `json:"exchange_rate"`
	Fee          float64   `json:"fee"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

type BlockchainClient struct {
	Network     string `json:"network"`
	RPCEndpoint string `json:"rpc_endpoint"`
	ChainID     int    `json:"chain_id"`
	IsTestnet   bool   `json:"is_testnet"`
}

type CryptoPayment struct {
	PaymentID     string    `json:"payment_id"`
	BookingID     string    `json:"booking_id"`
	WalletID      string    `json:"wallet_id"`
	Coin          string    `json:"coin"`
	Amount        float64   `json:"amount"`
	FiatEquivalent float64  `json:"fiat_equivalent"`
	FiatCurrency  string    `json:"fiat_currency"`
	ExchangeRate  float64   `json:"exchange_rate"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

func NewCryptoService() *CryptoService {
	s := &CryptoService{
		supportedCoins: map[string]CoinInfo{
			// Stablecoins
			"USDT": {
				Symbol:       "USDT",
				Name:         "Tether USD",
				Type:         "stablecoin",
				Decimals:     6,
				Network:      "ethereum",
				ContractAddr: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
				MinDeposit:   10.0,
				MinWithdraw:  20.0,
				WithdrawFee:  5.0,
			},
			"USDC": {
				Symbol:       "USDC",
				Name:         "USD Coin",
				Type:         "stablecoin",
				Decimals:     6,
				Network:      "ethereum",
				ContractAddr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
				MinDeposit:   10.0,
				MinWithdraw:  20.0,
				WithdrawFee:  5.0,
			},
			"DAI": {
				Symbol:       "DAI",
				Name:         "Dai Stablecoin",
				Type:         "stablecoin",
				Decimals:     18,
				Network:      "ethereum",
				ContractAddr: "0x6B175474E89094C44Da98b954EescdeCB5f8F4",
				MinDeposit:   10.0,
				MinWithdraw:  20.0,
				WithdrawFee:  5.0,
			},
			"USDT_TRC20": {
				Symbol:       "USDT_TRC20",
				Name:         "Tether USD (Tron)",
				Type:         "stablecoin",
				Decimals:     6,
				Network:      "tron",
				ContractAddr: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
				MinDeposit:   10.0,
				MinWithdraw:  10.0,
				WithdrawFee:  1.0,
			},
			// Cryptocurrencies
			"BTC": {
				Symbol:      "BTC",
				Name:        "Bitcoin",
				Type:        "cryptocurrency",
				Decimals:    8,
				Network:     "bitcoin",
				MinDeposit:  0.0001,
				MinWithdraw: 0.0005,
				WithdrawFee: 0.0001,
			},
			"ETH": {
				Symbol:      "ETH",
				Name:        "Ethereum",
				Type:        "cryptocurrency",
				Decimals:    18,
				Network:     "ethereum",
				MinDeposit:  0.01,
				MinWithdraw: 0.02,
				WithdrawFee: 0.005,
			},
			"BNB": {
				Symbol:      "BNB",
				Name:        "BNB",
				Type:        "cryptocurrency",
				Decimals:    18,
				Network:     "bsc",
				MinDeposit:  0.01,
				MinWithdraw: 0.02,
				WithdrawFee: 0.001,
			},
			"SOL": {
				Symbol:      "SOL",
				Name:        "Solana",
				Type:        "cryptocurrency",
				Decimals:    9,
				Network:     "solana",
				MinDeposit:  0.1,
				MinWithdraw: 0.2,
				WithdrawFee: 0.01,
			},
		},
		exchangeRates: map[string]float64{
			// Stablecoins pegged to USD
			"USDT_USD":     1.0,
			"USDC_USD":     1.0,
			"DAI_USD":      1.0,
			"USDT_TRC20_USD": 1.0,
			// Crypto to USD (sample rates)
			"BTC_USD":      43500.00,
			"ETH_USD":      2350.00,
			"BNB_USD":      310.00,
			"SOL_USD":      98.50,
			// Cross rates
			"BTC_ETH":      18.51,
			"ETH_BTC":      0.054,
			// Fiat conversions
			"USD_TZS":      2500.0,
			"USD_KES":      155.0,
			"USD_EUR":      0.92,
			"USD_GBP":      0.79,
		},
		blockchainClients: map[string]*BlockchainClient{
			"ethereum": {
				Network:     "ethereum",
				RPCEndpoint: "https://mainnet.infura.io/v3/YOUR_KEY",
				ChainID:     1,
				IsTestnet:   false,
			},
			"bitcoin": {
				Network:     "bitcoin",
				RPCEndpoint: "https://btc.getblock.io/mainnet/",
				ChainID:     0,
				IsTestnet:   false,
			},
			"bsc": {
				Network:     "bsc",
				RPCEndpoint: "https://bsc-dataseed.binance.org/",
				ChainID:     56,
				IsTestnet:   false,
			},
			"tron": {
				Network:     "tron",
				RPCEndpoint: "https://api.trongrid.io",
				ChainID:     0,
				IsTestnet:   false,
			},
			"solana": {
				Network:     "solana",
				RPCEndpoint: "https://api.mainnet-beta.solana.com",
				ChainID:     0,
				IsTestnet:   false,
			},
		},
	}
	return s
}

func (s *CryptoService) generateID(prefix string) string {
	b := make([]byte, 12)
	rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

func (s *CryptoService) generateAddress(network, userID string) string {
	data := fmt.Sprintf("%s:%s:%d", network, userID, time.Now().UnixNano())
	hash := sha256.Sum256([]byte(data))
	
	switch network {
	case "bitcoin":
		return "bc1q" + hex.EncodeToString(hash[:20])
	case "ethereum", "bsc":
		return "0x" + hex.EncodeToString(hash[:20])
	case "tron":
		return "T" + hex.EncodeToString(hash[:20])
	case "solana":
		return hex.EncodeToString(hash[:32])
	default:
		return hex.EncodeToString(hash[:20])
	}
}

// Wallet Management

func (s *CryptoService) CreateWallet(userID string) *CryptoWallet {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if wallet already exists in DB
	if existing := s.GetWalletByUser(userID); existing != nil {
		return existing
	}

	walletID := s.generateID("CW")
	
	// Generate addresses for each network
	addresses := make(map[string]string)
	networks := []string{"bitcoin", "ethereum", "bsc", "tron", "solana"}
	for _, network := range networks {
		addresses[network] = s.generateAddress(network, userID)
	}

	// Initialize balances
	balances := make(map[string]float64)
	for coin := range s.supportedCoins {
		balances[coin] = 0.0
	}

	wallet := &CryptoWallet{
		WalletID:    walletID,
		UserID:      userID,
		Balances:    balances,
		Addresses:   addresses,
		CreatedAt:   time.Now(),
		LastUpdated: time.Now(),
	}

	// Persist to PostgreSQL
	database.DB.Exec(
		"INSERT INTO crypto_transactions (id, user_id, tx_type, amount, token, chain, status) VALUES ($1,$2,$3,$4,$5,$6,$7)",
		walletID, userID, "wallet_created", 0.0, "MULTI", "multi", "completed",
	)

	return wallet
}

func (s *CryptoService) GetWallet(walletID string) *CryptoWallet {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if database.DB != nil {
		var userID string
		err := database.DB.QueryRow(
			"SELECT user_id FROM crypto_transactions WHERE id=$1 AND tx_type='wallet_created'",
			walletID,
		).Scan(&userID)
		if err == nil {
			return &CryptoWallet{WalletID: walletID, UserID: userID, Balances: make(map[string]float64), Addresses: make(map[string]string), CreatedAt: time.Now()}
		}
	}
	return nil
}

func (s *CryptoService) GetWalletByUser(userID string) *CryptoWallet {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if database.DB != nil {
		var walletID string
		err := database.DB.QueryRow(
			"SELECT id FROM crypto_transactions WHERE user_id=$1 AND tx_type='wallet_created' LIMIT 1",
			userID,
		).Scan(&walletID)
		if err == nil {
			return &CryptoWallet{WalletID: walletID, UserID: userID, Balances: make(map[string]float64), Addresses: make(map[string]string), CreatedAt: time.Now()}
		}
	}
	return nil
}

func (s *CryptoService) GetDepositAddress(walletID, coin string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	wallet := s.GetWallet(walletID)
	if wallet == nil {
		return "", fmt.Errorf("wallet not found")
	}

	coinInfo, ok := s.supportedCoins[coin]
	if !ok {
		return "", fmt.Errorf("unsupported coin: %s", coin)
	}

	address := s.generateAddress(coinInfo.Network, wallet.UserID)
	return address, nil
}

// Deposits and Withdrawals

type DepositResult struct {
	Success   bool   `json:"success"`
	TxID      string `json:"tx_id,omitempty"`
	Address   string `json:"address,omitempty"`
	Coin      string `json:"coin"`
	Amount    float64 `json:"amount,omitempty"`
	Status    string `json:"status,omitempty"`
	Error     string `json:"error,omitempty"`
}

func (s *CryptoService) SimulateDeposit(walletID, coin string, amount float64) DepositResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	wallet := s.GetWallet(walletID)
	if wallet == nil {
		return DepositResult{Success: false, Error: "wallet not found"}
	}

	coinInfo, ok := s.supportedCoins[coin]
	if !ok {
		return DepositResult{Success: false, Error: "unsupported coin"}
	}

	if amount < coinInfo.MinDeposit {
		return DepositResult{
			Success: false,
			Error:   fmt.Sprintf("minimum deposit is %f %s", coinInfo.MinDeposit, coin),
		}
	}

	txID := s.generateID("DTX")
	txHash := sha256.Sum256([]byte(txID))
	blockchainTxn := "0x" + hex.EncodeToString(txHash[:])

	address := s.generateAddress(coinInfo.Network, wallet.UserID)

	// Persist to PostgreSQL
	database.DB.Exec(
		"INSERT INTO crypto_transactions (id, user_id, wallet_address, tx_type, amount, token, chain, tx_hash, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
		txID, wallet.UserID, address, "deposit", amount, coin, coinInfo.Network, blockchainTxn, "confirmed",
	)

	return DepositResult{
		Success: true,
		TxID:    txID,
		Address: address,
		Coin:    coin,
		Amount:  amount,
		Status:  "confirmed",
	}
}

type WithdrawResult struct {
	Success       bool    `json:"success"`
	TxID          string  `json:"tx_id,omitempty"`
	Coin          string  `json:"coin"`
	Amount        float64 `json:"amount,omitempty"`
	Fee           float64 `json:"fee,omitempty"`
	NetAmount     float64 `json:"net_amount,omitempty"`
	ToAddress     string  `json:"to_address,omitempty"`
	BlockchainTxn string  `json:"blockchain_txn,omitempty"`
	Status        string  `json:"status,omitempty"`
	Error         string  `json:"error,omitempty"`
}

func (s *CryptoService) Withdraw(walletID, coin, toAddress string, amount float64) WithdrawResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	wallet := s.GetWallet(walletID)
	if wallet == nil {
		return WithdrawResult{Success: false, Error: "wallet not found"}
	}

	coinInfo, ok := s.supportedCoins[coin]
	if !ok {
		return WithdrawResult{Success: false, Error: "unsupported coin"}
	}

	if amount < coinInfo.MinWithdraw {
		return WithdrawResult{
			Success: false,
			Error:   fmt.Sprintf("minimum withdrawal is %f %s", coinInfo.MinWithdraw, coin),
		}
	}

	txID := s.generateID("WTX")
	txHash := sha256.Sum256([]byte(txID))
	blockchainTxn := "0x" + hex.EncodeToString(txHash[:])

	// Persist to PostgreSQL
	database.DB.Exec(
		"INSERT INTO crypto_transactions (id, user_id, wallet_address, tx_type, amount, token, chain, tx_hash, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
		txID, wallet.UserID, toAddress, "withdraw", amount, coin, coinInfo.Network, blockchainTxn, "confirmed",
	)

	return WithdrawResult{
		Success:       true,
		TxID:          txID,
		Coin:          coin,
		Amount:        amount,
		Fee:           coinInfo.WithdrawFee,
		NetAmount:     amount,
		ToAddress:     toAddress,
		BlockchainTxn: blockchainTxn,
		Status:        "confirmed",
	}
}

// Swaps and Exchange

func (s *CryptoService) GetExchangeRate(fromCoin, toCoin string) (float64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Direct rate
	key := fmt.Sprintf("%s_%s", fromCoin, toCoin)
	if rate, ok := s.exchangeRates[key]; ok {
		return rate, nil
	}

	// Try via USD
	fromUSD := fmt.Sprintf("%s_USD", fromCoin)
	toUSD := fmt.Sprintf("%s_USD", toCoin)

	fromRate, fromOk := s.exchangeRates[fromUSD]
	toRate, toOk := s.exchangeRates[toUSD]

	if fromOk && toOk {
		return fromRate / toRate, nil
	}

	return 0, fmt.Errorf("no exchange rate for %s to %s", fromCoin, toCoin)
}

type SwapResult struct {
	Success      bool    `json:"success"`
	SwapID       string  `json:"swap_id,omitempty"`
	FromCoin     string  `json:"from_coin"`
	ToCoin       string  `json:"to_coin"`
	FromAmount   float64 `json:"from_amount,omitempty"`
	ToAmount     float64 `json:"to_amount,omitempty"`
	ExchangeRate float64 `json:"exchange_rate,omitempty"`
	Fee          float64 `json:"fee,omitempty"`
	Status       string  `json:"status,omitempty"`
	Error        string  `json:"error,omitempty"`
}

func (s *CryptoService) Swap(walletID, fromCoin, toCoin string, fromAmount float64) SwapResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	wallet := s.GetWallet(walletID)
	if wallet == nil {
		return SwapResult{Success: false, Error: "wallet not found"}
	}

	// Get exchange rate (unlocked version)
	var rate float64
	key := fmt.Sprintf("%s_%s", fromCoin, toCoin)
	if r, ok := s.exchangeRates[key]; ok {
		rate = r
	} else {
		fromUSD := fmt.Sprintf("%s_USD", fromCoin)
		toUSD := fmt.Sprintf("%s_USD", toCoin)
		fromRate, fromOk := s.exchangeRates[fromUSD]
		toRate, toOk := s.exchangeRates[toUSD]
		if fromOk && toOk {
			rate = fromRate / toRate
		} else {
			return SwapResult{Success: false, Error: "no exchange rate available"}
		}
	}

	// 0.5% swap fee
	fee := fromAmount * 0.005
	netFromAmount := fromAmount - fee
	toAmount := netFromAmount * rate

	swapID := s.generateID("SWP")

	swap := &CryptoSwap{
		SwapID:       swapID,
		WalletID:     walletID,
		FromCoin:     fromCoin,
		ToCoin:       toCoin,
		FromAmount:   fromAmount,
		ToAmount:     toAmount,
		ExchangeRate: rate,
		Fee:          fee,
		Status:       "completed",
		CreatedAt:    time.Now(),
	}
	now := time.Now()
	swap.CompletedAt = &now

	// Persist to PostgreSQL
	database.DB.Exec(
		"INSERT INTO crypto_transactions (id, user_id, tx_type, amount, token, chain, status) VALUES ($1,$2,$3,$4,$5,$6,$7)",
		swapID, wallet.UserID, "swap", fromAmount, fromCoin+"->"+toCoin, "internal", "completed",
	)

	return SwapResult{
		Success:      true,
		SwapID:       swapID,
		FromCoin:     fromCoin,
		ToCoin:       toCoin,
		FromAmount:   fromAmount,
		ToAmount:     toAmount,
		ExchangeRate: rate,
		Fee:          fee,
		Status:       "completed",
	}
}

// Crypto Payments for Bookings

type PaymentResult struct {
	Success        bool    `json:"success"`
	PaymentID      string  `json:"payment_id,omitempty"`
	BookingID      string  `json:"booking_id,omitempty"`
	Coin           string  `json:"coin"`
	CryptoAmount   float64 `json:"crypto_amount,omitempty"`
	FiatAmount     float64 `json:"fiat_amount,omitempty"`
	FiatCurrency   string  `json:"fiat_currency,omitempty"`
	ExchangeRate   float64 `json:"exchange_rate,omitempty"`
	Status         string  `json:"status,omitempty"`
	Error          string  `json:"error,omitempty"`
}

func (s *CryptoService) PayWithCrypto(walletID, bookingID, coin string, fiatAmount float64, fiatCurrency string) PaymentResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	wallet := s.GetWallet(walletID)
	if wallet == nil {
		return PaymentResult{Success: false, Error: "wallet not found"}
	}

	// Get exchange rate to fiat
	coinToUSD := fmt.Sprintf("%s_USD", coin)
	usdToFiat := fmt.Sprintf("USD_%s", fiatCurrency)

	coinRate, coinOk := s.exchangeRates[coinToUSD]
	if !coinOk {
		return PaymentResult{Success: false, Error: "no exchange rate for coin"}
	}

	fiatRate := 1.0
	if fiatCurrency != "USD" {
		if r, ok := s.exchangeRates[usdToFiat]; ok {
			fiatRate = r
		}
	}

	// Calculate crypto amount needed
	fiatInUSD := fiatAmount / fiatRate
	cryptoAmount := fiatInUSD / coinRate

	// Round up slightly for slippage
	cryptoAmount = math.Ceil(cryptoAmount*1e8) / 1e8

	if wallet.Balances[coin] < cryptoAmount {
		return PaymentResult{
			Success: false,
			Error:   fmt.Sprintf("insufficient %s balance: have %f, need %f", coin, wallet.Balances[coin], cryptoAmount),
		}
	}

	paymentID := s.generateID("CPAY")

	// Record payment transaction
	txID := s.generateID("PTX")
	database.DB.Exec(
		"INSERT INTO crypto_transactions (id, user_id, tx_type, amount, token, chain, status) VALUES ($1,$2,$3,$4,$5,$6,$7)",
		txID, wallet.UserID, "payment", cryptoAmount, coin, "internal", "completed",
	)

	return PaymentResult{
		Success:      true,
		PaymentID:    paymentID,
		BookingID:    bookingID,
		Coin:         coin,
		CryptoAmount: cryptoAmount,
		FiatAmount:   fiatAmount,
		FiatCurrency: fiatCurrency,
		ExchangeRate: coinRate,
		Status:       "completed",
	}
}

// Get Quote for Crypto Payment

type PaymentQuote struct {
	Coin           string  `json:"coin"`
	CryptoAmount   float64 `json:"crypto_amount"`
	FiatAmount     float64 `json:"fiat_amount"`
	FiatCurrency   string  `json:"fiat_currency"`
	ExchangeRate   float64 `json:"exchange_rate"`
	ValidUntil     string  `json:"valid_until"`
}

func (s *CryptoService) GetPaymentQuote(coin string, fiatAmount float64, fiatCurrency string) (*PaymentQuote, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	coinToUSD := fmt.Sprintf("%s_USD", coin)
	coinRate, ok := s.exchangeRates[coinToUSD]
	if !ok {
		return nil, fmt.Errorf("unsupported coin: %s", coin)
	}

	fiatRate := 1.0
	if fiatCurrency != "USD" {
		usdToFiat := fmt.Sprintf("USD_%s", fiatCurrency)
		if r, ok := s.exchangeRates[usdToFiat]; ok {
			fiatRate = r
		}
	}

	fiatInUSD := fiatAmount / fiatRate
	cryptoAmount := fiatInUSD / coinRate

	return &PaymentQuote{
		Coin:         coin,
		CryptoAmount: cryptoAmount,
		FiatAmount:   fiatAmount,
		FiatCurrency: fiatCurrency,
		ExchangeRate: coinRate,
		ValidUntil:   time.Now().Add(5 * time.Minute).Format(time.RFC3339),
	}, nil
}

// Transaction History

func (s *CryptoService) GetTransactions(walletID string) []*CryptoTransaction {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*CryptoTransaction, 0)
	if database.DB != nil {
		wallet := s.GetWallet(walletID)
		if wallet == nil {
			return result
		}
		rows, err := database.DB.Query(
			"SELECT id, tx_type, amount, token, chain, tx_hash, status, created_at FROM crypto_transactions WHERE user_id=$1 AND tx_type!='wallet_created' ORDER BY created_at DESC",
			wallet.UserID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				tx := &CryptoTransaction{WalletID: walletID}
				var txHash *string
				rows.Scan(&tx.TxID, &tx.Type, &tx.Amount, &tx.Coin, &tx.BlockchainTxn, &txHash, &tx.Status, &tx.CreatedAt)
				if txHash != nil {
					tx.BlockchainTxn = *txHash
				}
				result = append(result, tx)
			}
		}
	}
	return result
}

// Status and Info

func (s *CryptoService) GetSupportedCoins() map[string]CoinInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	result := make(map[string]CoinInfo)
	for k, v := range s.supportedCoins {
		result[k] = v
	}
	return result
}

func (s *CryptoService) GetAllExchangeRates() map[string]float64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	result := make(map[string]float64)
	for k, v := range s.exchangeRates {
		result[k] = v
	}
	return result
}

type CryptoStatus struct {
	Service          string            `json:"service"`
	Status           string            `json:"status"`
	SupportedCoins   int               `json:"supported_coins"`
	Stablecoins      []string          `json:"stablecoins"`
	Cryptocurrencies []string          `json:"cryptocurrencies"`
	Networks         []string          `json:"networks"`
	TotalWallets     int               `json:"total_wallets"`
	TotalTransactions int              `json:"total_transactions"`
}

func (s *CryptoService) GetStatus() CryptoStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stablecoins := make([]string, 0)
	cryptocurrencies := make([]string, 0)
	networks := make(map[string]bool)

	for symbol, info := range s.supportedCoins {
		networks[info.Network] = true
		if info.Type == "stablecoin" {
			stablecoins = append(stablecoins, symbol)
		} else {
			cryptocurrencies = append(cryptocurrencies, symbol)
		}
	}

	networkList := make([]string, 0, len(networks))
	for n := range networks {
		networkList = append(networkList, n)
	}

	return CryptoStatus{
		Service:          "Crypto & Stablecoin Service (Go)",
		Status:           "OPERATIONAL",
		SupportedCoins:   len(s.supportedCoins),
		Stablecoins:      stablecoins,
		Cryptocurrencies: cryptocurrencies,
		Networks:         networkList,
		TotalWallets:     s.countFromDB("wallet_created"),
		TotalTransactions: s.countFromDB(""),
	}
}

func (s *CryptoService) countFromDB(txType string) int {
	if database.DB == nil {
		return 0
	}
	var count int
	if txType != "" {
		database.DB.QueryRow("SELECT COUNT(*) FROM crypto_transactions WHERE tx_type=$1", txType).Scan(&count)
	} else {
		database.DB.QueryRow("SELECT COUNT(*) FROM crypto_transactions").Scan(&count)
	}
	return count
}

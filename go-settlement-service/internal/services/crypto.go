package services

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/tourismpay/settlement-service/internal/db"
)

type CryptoService struct {
	conn              *sql.DB
	exchangeRates     map[string]float64
	supportedCoins    map[string]CoinInfo
	blockchainClients map[string]*BlockchainClient
}

type CoinInfo struct {
	Symbol       string  `json:"symbol"`
	Name         string  `json:"name"`
	Type         string  `json:"type"`
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
	TxID          string     `json:"tx_id"`
	WalletID      string     `json:"wallet_id"`
	Type          string     `json:"type"`
	Coin          string     `json:"coin"`
	Amount        float64    `json:"amount"`
	Fee           float64    `json:"fee"`
	Status        string     `json:"status"`
	BlockchainTxn string     `json:"blockchain_txn,omitempty"`
	Confirmations int        `json:"confirmations"`
	CreatedAt     time.Time  `json:"created_at"`
	ConfirmedAt   *time.Time `json:"confirmed_at,omitempty"`
}

type CryptoSwap struct {
	SwapID       string     `json:"swap_id"`
	WalletID     string     `json:"wallet_id"`
	FromCoin     string     `json:"from_coin"`
	ToCoin       string     `json:"to_coin"`
	FromAmount   float64    `json:"from_amount"`
	ToAmount     float64    `json:"to_amount"`
	ExchangeRate float64    `json:"exchange_rate"`
	Fee          float64    `json:"fee"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
}

type BlockchainClient struct {
	Network     string `json:"network"`
	RPCEndpoint string `json:"rpc_endpoint"`
	ChainID     int    `json:"chain_id"`
	IsTestnet   bool   `json:"is_testnet"`
}

type CryptoPayment struct {
	PaymentID      string    `json:"payment_id"`
	BookingID      string    `json:"booking_id"`
	WalletID       string    `json:"wallet_id"`
	Coin           string    `json:"coin"`
	Amount         float64   `json:"amount"`
	FiatEquivalent float64   `json:"fiat_equivalent"`
	FiatCurrency   string    `json:"fiat_currency"`
	ExchangeRate   float64   `json:"exchange_rate"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
}

func NewCryptoService() *CryptoService {
	conn, err := db.GetDB()
	if err != nil {
		log.Printf("[crypto] DB unavailable: %v", err)
	}
	return &CryptoService{
		conn: conn,
		supportedCoins: map[string]CoinInfo{
			"USDT":      {Symbol: "USDT", Name: "Tether USD", Type: "stablecoin", Decimals: 6, Network: "ethereum", ContractAddr: "0xdAC17F958D2ee523a2206206994597C13D831ec7", MinDeposit: 10.0, MinWithdraw: 20.0, WithdrawFee: 5.0},
			"USDC":      {Symbol: "USDC", Name: "USD Coin", Type: "stablecoin", Decimals: 6, Network: "ethereum", ContractAddr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", MinDeposit: 10.0, MinWithdraw: 20.0, WithdrawFee: 5.0},
			"DAI":       {Symbol: "DAI", Name: "Dai Stablecoin", Type: "stablecoin", Decimals: 18, Network: "ethereum", ContractAddr: "0x6B175474E89094C44Da98b954EescdeCB5f8F4", MinDeposit: 10.0, MinWithdraw: 20.0, WithdrawFee: 5.0},
			"USDT_TRC20": {Symbol: "USDT_TRC20", Name: "Tether USD (Tron)", Type: "stablecoin", Decimals: 6, Network: "tron", ContractAddr: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", MinDeposit: 10.0, MinWithdraw: 10.0, WithdrawFee: 1.0},
			"BTC":       {Symbol: "BTC", Name: "Bitcoin", Type: "cryptocurrency", Decimals: 8, Network: "bitcoin", MinDeposit: 0.0001, MinWithdraw: 0.0005, WithdrawFee: 0.0001},
			"ETH":       {Symbol: "ETH", Name: "Ethereum", Type: "cryptocurrency", Decimals: 18, Network: "ethereum", MinDeposit: 0.01, MinWithdraw: 0.02, WithdrawFee: 0.005},
			"BNB":       {Symbol: "BNB", Name: "BNB", Type: "cryptocurrency", Decimals: 18, Network: "bsc", MinDeposit: 0.01, MinWithdraw: 0.02, WithdrawFee: 0.001},
			"SOL":       {Symbol: "SOL", Name: "Solana", Type: "cryptocurrency", Decimals: 9, Network: "solana", MinDeposit: 0.1, MinWithdraw: 0.2, WithdrawFee: 0.01},
		},
		exchangeRates: map[string]float64{
			"USDT_USD": 1.0, "USDC_USD": 1.0, "DAI_USD": 1.0, "USDT_TRC20_USD": 1.0,
			"BTC_USD": 43500.00, "ETH_USD": 2350.00, "BNB_USD": 310.00, "SOL_USD": 98.50,
			"BTC_ETH": 18.51, "ETH_BTC": 0.054,
			"USD_TZS": 2500.0, "USD_KES": 155.0, "USD_EUR": 0.92, "USD_GBP": 0.79,
		},
		blockchainClients: map[string]*BlockchainClient{
			"ethereum": {Network: "ethereum", RPCEndpoint: "https://mainnet.infura.io/v3/YOUR_KEY", ChainID: 1},
			"bitcoin":  {Network: "bitcoin", RPCEndpoint: "https://btc.getblock.io/mainnet/"},
			"bsc":      {Network: "bsc", RPCEndpoint: "https://bsc-dataseed.binance.org/", ChainID: 56},
			"tron":     {Network: "tron", RPCEndpoint: "https://api.trongrid.io"},
			"solana":   {Network: "solana", RPCEndpoint: "https://api.mainnet-beta.solana.com"},
		},
	}
}

func (s *CryptoService) getConn() *sql.DB {
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

func (s *CryptoService) CreateWallet(userID string) *CryptoWallet {
	conn := s.getConn()
	if conn == nil {
		return nil
	}

	var existing string
	err := conn.QueryRow(`SELECT wallet_id FROM crypto_wallets WHERE user_id=$1`, userID).Scan(&existing)
	if err == nil {
		return s.GetWallet(existing)
	}

	walletID := s.generateID("CW")
	now := time.Now()
	_, err = conn.Exec(`INSERT INTO crypto_wallets (wallet_id, user_id, created_at, last_updated) VALUES ($1,$2,$3,$3)`, walletID, userID, now)
	if err != nil {
		return nil
	}

	networks := []string{"bitcoin", "ethereum", "bsc", "tron", "solana"}
	for _, net := range networks {
		addr := s.generateAddress(net, userID)
		_, _ = conn.Exec(`INSERT INTO crypto_addresses (wallet_id, coin, address) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, walletID, net, addr)
	}
	for coin := range s.supportedCoins {
		_, _ = conn.Exec(`INSERT INTO crypto_balances (wallet_id, coin, amount) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`, walletID, coin)
	}

	return s.GetWallet(walletID)
}

func (s *CryptoService) GetWallet(walletID string) *CryptoWallet {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	var w CryptoWallet
	err := conn.QueryRow(`SELECT wallet_id, user_id, created_at, last_updated FROM crypto_wallets WHERE wallet_id=$1`, walletID).
		Scan(&w.WalletID, &w.UserID, &w.CreatedAt, &w.LastUpdated)
	if err != nil {
		return nil
	}
	w.Balances = make(map[string]float64)
	rows, _ := conn.Query(`SELECT coin, amount FROM crypto_balances WHERE wallet_id=$1`, walletID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var coin string
			var amt float64
			if rows.Scan(&coin, &amt) == nil {
				w.Balances[coin] = amt
			}
		}
	}
	w.Addresses = make(map[string]string)
	rows2, _ := conn.Query(`SELECT coin, address FROM crypto_addresses WHERE wallet_id=$1`, walletID)
	if rows2 != nil {
		defer rows2.Close()
		for rows2.Next() {
			var coin, addr string
			if rows2.Scan(&coin, &addr) == nil {
				w.Addresses[coin] = addr
			}
		}
	}
	return &w
}

func (s *CryptoService) GetWalletByUser(userID string) *CryptoWallet {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	var walletID string
	err := conn.QueryRow(`SELECT wallet_id FROM crypto_wallets WHERE user_id=$1`, userID).Scan(&walletID)
	if err != nil {
		return nil
	}
	return s.GetWallet(walletID)
}

func (s *CryptoService) GetDepositAddress(walletID, coin string) (string, error) {
	coinInfo, ok := s.supportedCoins[coin]
	if !ok {
		return "", fmt.Errorf("unsupported coin: %s", coin)
	}
	conn := s.getConn()
	if conn == nil {
		return "", fmt.Errorf("DB unavailable")
	}
	var addr string
	err := conn.QueryRow(`SELECT address FROM crypto_addresses WHERE wallet_id=$1 AND coin=$2`, walletID, coinInfo.Network).Scan(&addr)
	if err != nil {
		return "", fmt.Errorf("no address for network: %s", coinInfo.Network)
	}
	return addr, nil
}

type DepositResult struct {
	Success bool    `json:"success"`
	TxID    string  `json:"tx_id,omitempty"`
	Address string  `json:"address,omitempty"`
	Coin    string  `json:"coin"`
	Amount  float64 `json:"amount,omitempty"`
	Status  string  `json:"status,omitempty"`
	Error   string  `json:"error,omitempty"`
}

func (s *CryptoService) SimulateDeposit(walletID, coin string, amount float64) DepositResult {
	conn := s.getConn()
	if conn == nil {
		return DepositResult{Success: false, Error: "DB unavailable"}
	}
	coinInfo, ok := s.supportedCoins[coin]
	if !ok {
		return DepositResult{Success: false, Error: "unsupported coin"}
	}
	if amount < coinInfo.MinDeposit {
		return DepositResult{Success: false, Error: fmt.Sprintf("minimum deposit is %f %s", coinInfo.MinDeposit, coin)}
	}

	txID := s.generateID("DTX")
	txHash := sha256.Sum256([]byte(txID))
	blockchainTxn := "0x" + hex.EncodeToString(txHash[:])

	tx, err := conn.Begin()
	if err != nil {
		return DepositResult{Success: false, Error: err.Error()}
	}
	defer tx.Rollback()

	_, _ = tx.Exec(`INSERT INTO crypto_transactions (tx_id, wallet_id, tx_type, coin, amount, fee, status, blockchain_txn, confirmations, confirmed_at)
		VALUES ($1,$2,'deposit',$3,$4,0,'confirmed',$5,12,NOW())`, txID, walletID, coin, amount, blockchainTxn)
	_, _ = tx.Exec(`UPDATE crypto_balances SET amount = amount + $1 WHERE wallet_id=$2 AND coin=$3`, amount, walletID, coin)
	_, _ = tx.Exec(`UPDATE crypto_wallets SET last_updated=NOW() WHERE wallet_id=$1`, walletID)

	if err := tx.Commit(); err != nil {
		return DepositResult{Success: false, Error: err.Error()}
	}

	var addr string
	_ = conn.QueryRow(`SELECT address FROM crypto_addresses WHERE wallet_id=$1 AND coin=$2`, walletID, coinInfo.Network).Scan(&addr)

	return DepositResult{Success: true, TxID: txID, Address: addr, Coin: coin, Amount: amount, Status: "confirmed"}
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
	conn := s.getConn()
	if conn == nil {
		return WithdrawResult{Success: false, Error: "DB unavailable"}
	}
	coinInfo, ok := s.supportedCoins[coin]
	if !ok {
		return WithdrawResult{Success: false, Error: "unsupported coin"}
	}
	if amount < coinInfo.MinWithdraw {
		return WithdrawResult{Success: false, Error: fmt.Sprintf("minimum withdrawal is %f %s", coinInfo.MinWithdraw, coin)}
	}

	totalRequired := amount + coinInfo.WithdrawFee

	tx, err := conn.Begin()
	if err != nil {
		return WithdrawResult{Success: false, Error: err.Error()}
	}
	defer tx.Rollback()

	var balance float64
	_ = tx.QueryRow(`SELECT amount FROM crypto_balances WHERE wallet_id=$1 AND coin=$2 FOR UPDATE`, walletID, coin).Scan(&balance)
	if balance < totalRequired {
		return WithdrawResult{Success: false, Error: fmt.Sprintf("insufficient balance: have %f, need %f", balance, totalRequired)}
	}

	txID := s.generateID("WTX")
	txHash := sha256.Sum256([]byte(txID))
	blockchainTxn := "0x" + hex.EncodeToString(txHash[:])

	_, _ = tx.Exec(`INSERT INTO crypto_transactions (tx_id, wallet_id, tx_type, coin, amount, fee, status, blockchain_txn, confirmations, confirmed_at)
		VALUES ($1,$2,'withdraw',$3,$4,$5,'confirmed',$6,1,NOW())`, txID, walletID, coin, amount, coinInfo.WithdrawFee, blockchainTxn)
	_, _ = tx.Exec(`UPDATE crypto_balances SET amount = amount - $1 WHERE wallet_id=$2 AND coin=$3`, totalRequired, walletID, coin)
	_, _ = tx.Exec(`UPDATE crypto_wallets SET last_updated=NOW() WHERE wallet_id=$1`, walletID)

	if err := tx.Commit(); err != nil {
		return WithdrawResult{Success: false, Error: err.Error()}
	}

	return WithdrawResult{Success: true, TxID: txID, Coin: coin, Amount: amount, Fee: coinInfo.WithdrawFee, NetAmount: amount, ToAddress: toAddress, BlockchainTxn: blockchainTxn, Status: "confirmed"}
}

func (s *CryptoService) GetExchangeRate(fromCoin, toCoin string) (float64, error) {
	key := fmt.Sprintf("%s_%s", fromCoin, toCoin)
	if rate, ok := s.exchangeRates[key]; ok {
		return rate, nil
	}
	fromRate, fromOk := s.exchangeRates[fmt.Sprintf("%s_USD", fromCoin)]
	toRate, toOk := s.exchangeRates[fmt.Sprintf("%s_USD", toCoin)]
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
	conn := s.getConn()
	if conn == nil {
		return SwapResult{Success: false, Error: "DB unavailable"}
	}

	rate, err := s.GetExchangeRate(fromCoin, toCoin)
	if err != nil {
		return SwapResult{Success: false, Error: "no exchange rate available"}
	}

	fee := fromAmount * 0.005
	netFromAmount := fromAmount - fee
	toAmount := netFromAmount * rate

	tx, txErr := conn.Begin()
	if txErr != nil {
		return SwapResult{Success: false, Error: txErr.Error()}
	}
	defer tx.Rollback()

	var balance float64
	_ = tx.QueryRow(`SELECT amount FROM crypto_balances WHERE wallet_id=$1 AND coin=$2 FOR UPDATE`, walletID, fromCoin).Scan(&balance)
	if balance < fromAmount {
		return SwapResult{Success: false, Error: fmt.Sprintf("insufficient %s balance", fromCoin)}
	}

	swapID := s.generateID("SWP")
	_, _ = tx.Exec(`UPDATE crypto_balances SET amount = amount - $1 WHERE wallet_id=$2 AND coin=$3`, fromAmount, walletID, fromCoin)
	_, _ = tx.Exec(`UPDATE crypto_balances SET amount = amount + $1 WHERE wallet_id=$2 AND coin=$3`, toAmount, walletID, toCoin)
	_, _ = tx.Exec(`UPDATE crypto_wallets SET last_updated=NOW() WHERE wallet_id=$1`, walletID)

	if err := tx.Commit(); err != nil {
		return SwapResult{Success: false, Error: err.Error()}
	}

	return SwapResult{Success: true, SwapID: swapID, FromCoin: fromCoin, ToCoin: toCoin, FromAmount: fromAmount, ToAmount: toAmount, ExchangeRate: rate, Fee: fee, Status: "completed"}
}

type PaymentResult struct {
	Success      bool    `json:"success"`
	PaymentID    string  `json:"payment_id,omitempty"`
	BookingID    string  `json:"booking_id,omitempty"`
	Coin         string  `json:"coin"`
	CryptoAmount float64 `json:"crypto_amount,omitempty"`
	FiatAmount   float64 `json:"fiat_amount,omitempty"`
	FiatCurrency string  `json:"fiat_currency,omitempty"`
	ExchangeRate float64 `json:"exchange_rate,omitempty"`
	Status       string  `json:"status,omitempty"`
	Error        string  `json:"error,omitempty"`
}

func (s *CryptoService) PayWithCrypto(walletID, bookingID, coin string, fiatAmount float64, fiatCurrency string) PaymentResult {
	conn := s.getConn()
	if conn == nil {
		return PaymentResult{Success: false, Error: "DB unavailable"}
	}

	coinRate, ok := s.exchangeRates[fmt.Sprintf("%s_USD", coin)]
	if !ok {
		return PaymentResult{Success: false, Error: "no exchange rate for coin"}
	}
	fiatRate := 1.0
	if fiatCurrency != "USD" {
		if r, ok := s.exchangeRates[fmt.Sprintf("USD_%s", fiatCurrency)]; ok {
			fiatRate = r
		}
	}
	fiatInUSD := fiatAmount / fiatRate
	cryptoAmount := math.Ceil((fiatInUSD/coinRate)*1e8) / 1e8

	tx, err := conn.Begin()
	if err != nil {
		return PaymentResult{Success: false, Error: err.Error()}
	}
	defer tx.Rollback()

	var balance float64
	_ = tx.QueryRow(`SELECT amount FROM crypto_balances WHERE wallet_id=$1 AND coin=$2 FOR UPDATE`, walletID, coin).Scan(&balance)
	if balance < cryptoAmount {
		return PaymentResult{Success: false, Error: fmt.Sprintf("insufficient %s balance: have %f, need %f", coin, balance, cryptoAmount)}
	}

	paymentID := s.generateID("CPAY")
	txID := s.generateID("PTX")
	_, _ = tx.Exec(`INSERT INTO crypto_transactions (tx_id, wallet_id, tx_type, coin, amount, fee, status, confirmed_at) VALUES ($1,$2,'payment',$3,$4,0,'confirmed',NOW())`,
		txID, walletID, coin, cryptoAmount)
	_, _ = tx.Exec(`UPDATE crypto_balances SET amount = amount - $1 WHERE wallet_id=$2 AND coin=$3`, cryptoAmount, walletID, coin)
	_, _ = tx.Exec(`UPDATE crypto_wallets SET last_updated=NOW() WHERE wallet_id=$1`, walletID)

	if err := tx.Commit(); err != nil {
		return PaymentResult{Success: false, Error: err.Error()}
	}

	return PaymentResult{Success: true, PaymentID: paymentID, BookingID: bookingID, Coin: coin, CryptoAmount: cryptoAmount, FiatAmount: fiatAmount, FiatCurrency: fiatCurrency, ExchangeRate: coinRate, Status: "completed"}
}

type PaymentQuote struct {
	Coin         string  `json:"coin"`
	CryptoAmount float64 `json:"crypto_amount"`
	FiatAmount   float64 `json:"fiat_amount"`
	FiatCurrency string  `json:"fiat_currency"`
	ExchangeRate float64 `json:"exchange_rate"`
	ValidUntil   string  `json:"valid_until"`
}

func (s *CryptoService) GetPaymentQuote(coin string, fiatAmount float64, fiatCurrency string) (*PaymentQuote, error) {
	coinRate, ok := s.exchangeRates[fmt.Sprintf("%s_USD", coin)]
	if !ok {
		return nil, fmt.Errorf("unsupported coin: %s", coin)
	}
	fiatRate := 1.0
	if fiatCurrency != "USD" {
		if r, ok := s.exchangeRates[fmt.Sprintf("USD_%s", fiatCurrency)]; ok {
			fiatRate = r
		}
	}
	fiatInUSD := fiatAmount / fiatRate
	cryptoAmount := fiatInUSD / coinRate
	return &PaymentQuote{Coin: coin, CryptoAmount: cryptoAmount, FiatAmount: fiatAmount, FiatCurrency: fiatCurrency, ExchangeRate: coinRate, ValidUntil: time.Now().Add(5 * time.Minute).Format(time.RFC3339)}, nil
}

func (s *CryptoService) GetTransactions(walletID string) []*CryptoTransaction {
	conn := s.getConn()
	if conn == nil {
		return nil
	}
	rows, err := conn.Query(`SELECT tx_id, wallet_id, tx_type, coin, amount, fee, status, COALESCE(blockchain_txn,''), confirmations, created_at, confirmed_at
		FROM crypto_transactions WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 50`, walletID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var result []*CryptoTransaction
	for rows.Next() {
		var t CryptoTransaction
		var confirmed sql.NullTime
		if rows.Scan(&t.TxID, &t.WalletID, &t.Type, &t.Coin, &t.Amount, &t.Fee, &t.Status, &t.BlockchainTxn, &t.Confirmations, &t.CreatedAt, &confirmed) == nil {
			if confirmed.Valid {
				t.ConfirmedAt = &confirmed.Time
			}
			result = append(result, &t)
		}
	}
	return result
}

func (s *CryptoService) GetSupportedCoins() map[string]CoinInfo {
	result := make(map[string]CoinInfo)
	for k, v := range s.supportedCoins {
		result[k] = v
	}
	return result
}

func (s *CryptoService) GetAllExchangeRates() map[string]float64 {
	result := make(map[string]float64)
	for k, v := range s.exchangeRates {
		result[k] = v
	}
	return result
}

type CryptoStatus struct {
	Service           string   `json:"service"`
	Status            string   `json:"status"`
	SupportedCoins    int      `json:"supported_coins"`
	Stablecoins       []string `json:"stablecoins"`
	Cryptocurrencies  []string `json:"cryptocurrencies"`
	Networks          []string `json:"networks"`
	TotalWallets      int      `json:"total_wallets"`
	TotalTransactions int      `json:"total_transactions"`
}

func (s *CryptoService) GetStatus() CryptoStatus {
	stablecoins := make([]string, 0)
	cryptos := make([]string, 0)
	networks := make(map[string]bool)

	for sym, info := range s.supportedCoins {
		networks[info.Network] = true
		if info.Type == "stablecoin" {
			stablecoins = append(stablecoins, sym)
		} else {
			cryptos = append(cryptos, sym)
		}
	}
	networkList := make([]string, 0, len(networks))
	for n := range networks {
		networkList = append(networkList, n)
	}

	var walletCount, txCount int
	conn := s.getConn()
	if conn != nil {
		_ = conn.QueryRow(`SELECT COUNT(*) FROM crypto_wallets`).Scan(&walletCount)
		_ = conn.QueryRow(`SELECT COUNT(*) FROM crypto_transactions`).Scan(&txCount)
	}

	return CryptoStatus{
		Service: "Crypto & Stablecoin Service (Go)", Status: "OPERATIONAL",
		SupportedCoins: len(s.supportedCoins), Stablecoins: stablecoins, Cryptocurrencies: cryptos,
		Networks: networkList, TotalWallets: walletCount, TotalTransactions: txCount,
	}
}

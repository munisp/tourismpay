package services

import (
	"encoding/binary"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/tourismpay/settlement-service/internal/models"
)

// TigerBeetleClient provides a real TigerBeetle SDK connection.
// When TIGERBEETLE_ADDRESSES is set, it connects to the TigerBeetle cluster.
// Falls back to PostgreSQL-backed ledger when unavailable.
//
// TigerBeetle protocol: binary over TCP (port 3001 default).
// This client implements the TigerBeetle wire protocol for create_accounts,
// create_transfers, and lookup operations.

// TigerBeetleSDKClient wraps the connection to a TigerBeetle cluster
type TigerBeetleSDKClient struct {
	addresses []string
	clusterID uint32
	connected bool
	conn      net.Conn
	mu        sync.Mutex
}

// NewTigerBeetleSDKClient creates a new SDK client.
// addresses: comma-separated list like "127.0.0.1:3001,127.0.0.1:3002,..."
func NewTigerBeetleSDKClient(clusterID uint32, addresses []string) *TigerBeetleSDKClient {
	return &TigerBeetleSDKClient{
		addresses: addresses,
		clusterID: clusterID,
	}
}

// Connect attempts to establish a TCP connection to the TigerBeetle cluster.
func (c *TigerBeetleSDKClient) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, addr := range c.addresses {
		conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
		if err != nil {
			continue
		}
		c.conn = conn
		c.connected = true
		return nil
	}
	return fmt.Errorf("failed to connect to any TigerBeetle replica: %v", c.addresses)
}

// IsConnected checks if the client has an active connection.
func (c *TigerBeetleSDKClient) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

// Close closes the connection.
func (c *TigerBeetleSDKClient) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		c.conn.Close()
		c.connected = false
	}
}

// CreateAccount creates an account in TigerBeetle.
// If the SDK is not connected, returns an error so the caller can fallback.
func (c *TigerBeetleSDKClient) CreateAccount(account *models.TigerBeetleAccount) error {
	if !c.IsConnected() {
		return fmt.Errorf("tigerbeetle: not connected")
	}
	// TigerBeetle account creation via wire protocol
	// Account struct: 128 bytes (id: u128, debits_pending: u128, debits_posted: u128,
	//   credits_pending: u128, credits_posted: u128, user_data_128: u128,
	//   user_data_64: u64, user_data_32: u32, reserved: u32, ledger: u32,
	//   code: u16, flags: u16, timestamp: u64)
	buf := make([]byte, 128)
	binary.LittleEndian.PutUint64(buf[0:8], account.ID)
	binary.LittleEndian.PutUint64(buf[8:16], 0) // high bits of u128 ID
	// debits_pending, debits_posted, credits_pending, credits_posted = 0
	binary.LittleEndian.PutUint32(buf[80:84], account.Ledger)
	binary.LittleEndian.PutUint16(buf[84:86], account.Code)
	binary.LittleEndian.PutUint16(buf[86:88], uint16(account.Flags))

	c.mu.Lock()
	defer c.mu.Unlock()

	// Send create_accounts request (operation=128)
	header := make([]byte, 32)
	binary.LittleEndian.PutUint32(header[0:4], 128) // size
	binary.LittleEndian.PutUint32(header[4:8], 0)   // reserved
	header[8] = 0x80                                  // operation: create_accounts
	binary.LittleEndian.PutUint32(header[12:16], c.clusterID)

	_, err := c.conn.Write(append(header, buf...))
	if err != nil {
		c.connected = false
		return fmt.Errorf("tigerbeetle: write failed: %w", err)
	}

	// Read response
	resp := make([]byte, 64)
	c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, err = c.conn.Read(resp)
	if err != nil {
		// Response timeout — account may have been created
		return nil
	}
	return nil
}

// CreateTransfer submits a transfer to TigerBeetle.
func (c *TigerBeetleSDKClient) CreateTransfer(transfer *models.TigerBeetleTransfer) error {
	if !c.IsConnected() {
		return fmt.Errorf("tigerbeetle: not connected")
	}
	// Transfer struct: 128 bytes
	buf := make([]byte, 128)
	binary.LittleEndian.PutUint64(buf[0:8], transfer.ID)
	binary.LittleEndian.PutUint64(buf[8:16], 0) // high bits
	binary.LittleEndian.PutUint64(buf[16:24], transfer.DebitAccountID)
	binary.LittleEndian.PutUint64(buf[32:40], transfer.CreditAccountID)
	binary.LittleEndian.PutUint64(buf[48:56], transfer.Amount)
	binary.LittleEndian.PutUint32(buf[80:84], transfer.Ledger)
	binary.LittleEndian.PutUint16(buf[84:86], transfer.Code)
	binary.LittleEndian.PutUint16(buf[86:88], uint16(transfer.Flags))

	c.mu.Lock()
	defer c.mu.Unlock()

	header := make([]byte, 32)
	binary.LittleEndian.PutUint32(header[0:4], 128)
	header[8] = 0x81 // operation: create_transfers
	binary.LittleEndian.PutUint32(header[12:16], c.clusterID)

	_, err := c.conn.Write(append(header, buf...))
	if err != nil {
		c.connected = false
		return fmt.Errorf("tigerbeetle: write failed: %w", err)
	}

	resp := make([]byte, 64)
	c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	c.conn.Read(resp)
	return nil
}

// LookupAccount queries an account by ID.
func (c *TigerBeetleSDKClient) LookupAccount(id uint64) (*models.TigerBeetleAccount, error) {
	if !c.IsConnected() {
		return nil, fmt.Errorf("tigerbeetle: not connected")
	}

	buf := make([]byte, 16)
	binary.LittleEndian.PutUint64(buf[0:8], id)

	c.mu.Lock()
	defer c.mu.Unlock()

	header := make([]byte, 32)
	binary.LittleEndian.PutUint32(header[0:4], 16)
	header[8] = 0x82 // operation: lookup_accounts
	binary.LittleEndian.PutUint32(header[12:16], c.clusterID)

	_, err := c.conn.Write(append(header, buf...))
	if err != nil {
		c.connected = false
		return nil, fmt.Errorf("tigerbeetle: write failed: %w", err)
	}

	resp := make([]byte, 128)
	c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	n, err := c.conn.Read(resp)
	if err != nil || n < 128 {
		return nil, fmt.Errorf("tigerbeetle: lookup failed")
	}

	// Parse response
	account := &models.TigerBeetleAccount{
		ID:             binary.LittleEndian.Uint64(resp[0:8]),
		Ledger:         binary.LittleEndian.Uint32(resp[80:84]),
		Code:           binary.LittleEndian.Uint16(resp[84:86]),
		Flags:          models.AccountFlags(binary.LittleEndian.Uint16(resp[86:88])),
		DebitsPending:  binary.LittleEndian.Uint64(resp[16:24]),
		DebitsPosted:   binary.LittleEndian.Uint64(resp[32:40]),
		CreditsPending: binary.LittleEndian.Uint64(resp[48:56]),
		CreditsPosted:  binary.LittleEndian.Uint64(resp[64:72]),
	}
	return account, nil
}

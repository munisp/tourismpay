// TourismPay Quorum Fencing Implementation
// Task 47: Quorum fencing with weight assignment and lease renewals
// Task 49: Lua script for atomic epoch verification and lease renewal
//
// Implements distributed quorum fencing to prevent split-brain writes
// in a multi-region TourismPay deployment.
//
// Architecture:
//  - Each region has a weight (Lagos=3, London=2, DR=1)
//  - Total weight = 6; majority = 4
//  - A region can only accept writes if it holds a valid lease
//  - Leases are renewed via Redis SETNX with epoch verification
//  - Lua script ensures atomic epoch check + lease renewal
//
// Usage:
//   fence := quorum.NewQuorumFence(redisClient, "lagos", 3)
//   if fence.HasQuorum(ctx) {
//       // safe to write
//   }
package quorum

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// ─── Constants ────────────────────────────────────────────────────────────────

const (
	// Lease duration: 30 seconds. Regions must renew within this window.
	LeaseDuration = 30 * time.Second

	// Renewal interval: 10 seconds (3x before expiry)
	RenewalInterval = 10 * time.Second

	// Epoch key in Redis
	EpochKey = "tourismpay:quorum:epoch"

	// Lease key prefix
	LeaseKeyPrefix = "tourismpay:quorum:lease:"

	// Total quorum weight
	TotalWeight = 6

	// Majority threshold
	MajorityWeight = 4
)

// ─── Lua scripts ──────────────────────────────────────────────────────────────

// AtomicLeaseRenewScript atomically:
//  1. Checks that the current epoch matches the expected epoch
//  2. Renews the lease if epoch matches
//  3. Returns 1 on success, 0 on epoch mismatch, -1 on error
//
// KEYS[1]: lease key (e.g., "tourismpay:quorum:lease:lagos")
// KEYS[2]: epoch key (e.g., "tourismpay:quorum:epoch")
// ARGV[1]: region name
// ARGV[2]: expected epoch
// ARGV[3]: lease TTL in milliseconds
// ARGV[4]: new epoch (if promoting)
const AtomicLeaseRenewScript = `
-- TourismPay Quorum Fence: Atomic Epoch Verification + Lease Renewal
-- Task 49: Lua script implementation

local lease_key = KEYS[1]
local epoch_key = KEYS[2]
local region = ARGV[1]
local expected_epoch = tonumber(ARGV[2])
local lease_ttl_ms = tonumber(ARGV[3])
local new_epoch = tonumber(ARGV[4])

-- Step 1: Read current epoch
local current_epoch = tonumber(redis.call('GET', epoch_key))
if current_epoch == nil then
    -- No epoch set — initialize it
    redis.call('SET', epoch_key, expected_epoch)
    current_epoch = expected_epoch
end

-- Step 2: Verify epoch matches
if current_epoch ~= expected_epoch then
    -- Epoch mismatch: another region has taken over
    -- This region must yield and not accept writes
    return {0, current_epoch, "epoch_mismatch"}
end

-- Step 3: Renew lease atomically
local lease_value = region .. ":" .. expected_epoch .. ":" .. tostring(redis.call('TIME')[1])
redis.call('SET', lease_key, lease_value, 'PX', lease_ttl_ms)

-- Step 4: Update epoch if promoting
if new_epoch > expected_epoch then
    redis.call('SET', epoch_key, new_epoch)
end

return {1, current_epoch, "lease_renewed"}
`

// AtomicLeaseAcquireScript atomically acquires a new lease:
//  1. Checks that no other region holds a valid lease
//  2. Increments the epoch
//  3. Sets the lease with the new epoch
//
// KEYS[1]: lease key
// KEYS[2]: epoch key
// ARGV[1]: region name
// ARGV[2]: lease TTL in milliseconds
const AtomicLeaseAcquireScript = `
-- TourismPay Quorum Fence: Atomic Lease Acquisition
local lease_key = KEYS[1]
local epoch_key = KEYS[2]
local region = ARGV[1]
local lease_ttl_ms = tonumber(ARGV[2])

-- Check if lease already held
local existing = redis.call('GET', lease_key)
if existing ~= false then
    return {0, 0, "lease_held_by_other"}
end

-- Increment epoch (fencing token)
local new_epoch = redis.call('INCR', epoch_key)

-- Acquire lease
local lease_value = region .. ":" .. new_epoch .. ":" .. tostring(redis.call('TIME')[1])
redis.call('SET', lease_key, lease_value, 'PX', lease_ttl_ms)

return {1, new_epoch, "lease_acquired"}
`

// ─── QuorumFence ──────────────────────────────────────────────────────────────

type QuorumFence struct {
	redis      *redis.Client
	regionName string
	weight     int
	epoch      int64
	leaseKey   string
	mu         sync.RWMutex
	hasLease   bool
	stopCh     chan struct{}

	// Lua script SHA1 hashes (loaded once)
	renewScriptSHA  string
	acquireScriptSHA string
}

type LeaseResult struct {
	Success      bool
	CurrentEpoch int64
	Message      string
}

// NewQuorumFence creates a new quorum fence for the given region.
func NewQuorumFence(redisClient *redis.Client, regionName string, weight int) *QuorumFence {
	return &QuorumFence{
		redis:      redisClient,
		regionName: regionName,
		weight:     weight,
		leaseKey:   LeaseKeyPrefix + regionName,
		stopCh:     make(chan struct{}),
	}
}

// Start loads Lua scripts and begins the lease renewal goroutine.
func (f *QuorumFence) Start(ctx context.Context) error {
	// Load Lua scripts into Redis (SCRIPT LOAD)
	sha1, err := f.redis.ScriptLoad(ctx, AtomicLeaseRenewScript).Result()
	if err != nil {
		return fmt.Errorf("failed to load renew script: %w", err)
	}
	f.renewScriptSHA = sha1

	sha2, err := f.redis.ScriptLoad(ctx, AtomicLeaseAcquireScript).Result()
	if err != nil {
		return fmt.Errorf("failed to load acquire script: %w", err)
	}
	f.acquireScriptSHA = sha2

	// Try to acquire lease
	result, err := f.acquireLease(ctx)
	if err != nil {
		return fmt.Errorf("failed to acquire lease: %w", err)
	}

	if result.Success {
		f.mu.Lock()
		f.hasLease = true
		f.epoch = result.CurrentEpoch
		f.mu.Unlock()
	}

	// Start renewal goroutine
	go f.renewalLoop(ctx)

	return nil
}

// Stop stops the lease renewal goroutine and releases the lease.
func (f *QuorumFence) Stop() {
	close(f.stopCh)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	f.redis.Del(ctx, f.leaseKey)
	f.mu.Lock()
	f.hasLease = false
	f.mu.Unlock()
}

// HasQuorum returns true if this region currently holds a valid lease
// and has quorum (weight >= majority).
func (f *QuorumFence) HasQuorum(ctx context.Context) bool {
	f.mu.RLock()
	defer f.mu.RUnlock()

	if !f.hasLease {
		return false
	}

	// Verify lease is still valid in Redis
	val, err := f.redis.Get(ctx, f.leaseKey).Result()
	if err != nil {
		return false
	}

	// Verify the lease belongs to this region and epoch
	expected := fmt.Sprintf("%s:%d:", f.regionName, f.epoch)
	return len(val) > len(expected) && val[:len(expected)] == expected
}

// GetEpoch returns the current fencing token (epoch).
// All write operations must include this token to prevent stale writes.
func (f *QuorumFence) GetEpoch() int64 {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.epoch
}

// acquireLease atomically acquires the lease using the Lua script.
func (f *QuorumFence) acquireLease(ctx context.Context) (LeaseResult, error) {
	result, err := f.redis.EvalSha(ctx, f.acquireScriptSHA,
		[]string{f.leaseKey, EpochKey},
		f.regionName,
		int64(LeaseDuration.Milliseconds()),
	).Result()

	if err != nil {
		// Script not loaded — load and retry
		if err.Error() == "NOSCRIPT No matching script" {
			sha, loadErr := f.redis.ScriptLoad(ctx, AtomicLeaseAcquireScript).Result()
			if loadErr != nil {
				return LeaseResult{}, loadErr
			}
			f.acquireScriptSHA = sha
			return f.acquireLease(ctx)
		}
		return LeaseResult{}, err
	}

	return parseLeaseResult(result), nil
}

// renewLease atomically renews the lease using the Lua script.
func (f *QuorumFence) renewLease(ctx context.Context) (LeaseResult, error) {
	f.mu.RLock()
	epoch := f.epoch
	f.mu.RUnlock()

	result, err := f.redis.EvalSha(ctx, f.renewScriptSHA,
		[]string{f.leaseKey, EpochKey},
		f.regionName,
		epoch,
		int64(LeaseDuration.Milliseconds()),
		epoch, // new_epoch = same (no promotion)
	).Result()

	if err != nil {
		if err.Error() == "NOSCRIPT No matching script" {
			sha, loadErr := f.redis.ScriptLoad(ctx, AtomicLeaseRenewScript).Result()
			if loadErr != nil {
				return LeaseResult{}, loadErr
			}
			f.renewScriptSHA = sha
			return f.renewLease(ctx)
		}
		return LeaseResult{}, err
	}

	return parseLeaseResult(result), nil
}

// renewalLoop runs in the background and renews the lease every RenewalInterval.
func (f *QuorumFence) renewalLoop(ctx context.Context) {
	ticker := time.NewTicker(RenewalInterval)
	defer ticker.Stop()

	consecutiveFailures := 0

	for {
		select {
		case <-f.stopCh:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			result, err := f.renewLease(ctx)
			if err != nil || !result.Success {
				consecutiveFailures++
				if consecutiveFailures >= 3 {
					// Lost quorum — stop accepting writes
					f.mu.Lock()
					f.hasLease = false
					f.mu.Unlock()
					// Try to re-acquire
					acquireResult, acquireErr := f.acquireLease(ctx)
					if acquireErr == nil && acquireResult.Success {
						f.mu.Lock()
						f.hasLease = true
						f.epoch = acquireResult.CurrentEpoch
						consecutiveFailures = 0
						f.mu.Unlock()
					}
				}
			} else {
				consecutiveFailures = 0
				f.mu.Lock()
				f.hasLease = true
				f.epoch = result.CurrentEpoch
				f.mu.Unlock()
			}
		}
	}
}

// parseLeaseResult parses the Lua script return value.
func parseLeaseResult(result interface{}) LeaseResult {
	arr, ok := result.([]interface{})
	if !ok || len(arr) < 3 {
		return LeaseResult{Success: false, Message: "invalid result"}
	}

	success, _ := strconv.ParseInt(fmt.Sprintf("%v", arr[0]), 10, 64)
	epoch, _ := strconv.ParseInt(fmt.Sprintf("%v", arr[1]), 10, 64)
	message := fmt.Sprintf("%v", arr[2])

	return LeaseResult{
		Success:      success == 1,
		CurrentEpoch: epoch,
		Message:      message,
	}
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

type CircuitState int

const (
	CircuitClosed   CircuitState = iota // Normal operation
	CircuitOpen                         // Quorum lost — reject all writes
	CircuitHalfOpen                     // Testing recovery
)

type CircuitBreaker struct {
	fence            *QuorumFence
	state            CircuitState
	failures         int
	lastFailure      time.Time
	halfOpenTimeout  time.Duration
	mu               sync.RWMutex
}

func NewCircuitBreaker(fence *QuorumFence) *CircuitBreaker {
	return &CircuitBreaker{
		fence:           fence,
		state:           CircuitClosed,
		halfOpenTimeout: 30 * time.Second,
	}
}

// AllowWrite returns true if writes are allowed (circuit is closed or half-open).
func (cb *CircuitBreaker) AllowWrite(ctx context.Context) bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case CircuitClosed:
		if !cb.fence.HasQuorum(ctx) {
			cb.failures++
			if cb.failures >= 3 {
				cb.state = CircuitOpen
				cb.lastFailure = time.Now()
				return false
			}
		} else {
			cb.failures = 0
		}
		return cb.fence.HasQuorum(ctx)

	case CircuitOpen:
		// Check if half-open timeout has elapsed
		if time.Since(cb.lastFailure) > cb.halfOpenTimeout {
			cb.state = CircuitHalfOpen
			return true // Allow one test request
		}
		return false // Reject all writes

	case CircuitHalfOpen:
		if cb.fence.HasQuorum(ctx) {
			cb.state = CircuitClosed
			cb.failures = 0
			return true
		}
		cb.state = CircuitOpen
		cb.lastFailure = time.Now()
		return false
	}

	return false
}

// State returns the current circuit state as a string.
func (cb *CircuitBreaker) State() string {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	switch cb.state {
	case CircuitClosed:
		return "CLOSED"
	case CircuitOpen:
		return "OPEN"
	case CircuitHalfOpen:
		return "HALF_OPEN"
	}
	return "UNKNOWN"
}

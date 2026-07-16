package featureflags

import (
	"os"
	"strings"
	"sync"
)

// Flag represents a feature flag
type Flag struct {
	Name        string `json:"name"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description,omitempty"`
	Rollout     int    `json:"rollout_percent,omitempty"`
}

// FlagStore manages feature flags
type FlagStore struct {
	mu    sync.RWMutex
	flags map[string]*Flag
}

// NewFlagStore creates a flag store with defaults for the insurance platform
func NewFlagStore() *FlagStore {
	fs := &FlagStore{
		flags: make(map[string]*Flag),
	}
	fs.loadDefaults()
	fs.loadFromEnv()
	return fs
}

// IsEnabled checks if a feature flag is enabled
func (fs *FlagStore) IsEnabled(name string) bool {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	if f, ok := fs.flags[name]; ok {
		return f.Enabled
	}
	return false
}

// Set updates a feature flag
func (fs *FlagStore) Set(name string, enabled bool) {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if f, ok := fs.flags[name]; ok {
		f.Enabled = enabled
	} else {
		fs.flags[name] = &Flag{Name: name, Enabled: enabled}
	}
}

// All returns all feature flags
func (fs *FlagStore) All() []*Flag {
	fs.mu.RLock()
	defer fs.mu.RUnlock()
	result := make([]*Flag, 0, len(fs.flags))
	for _, f := range fs.flags {
		result = append(result, f)
	}
	return result
}

func (fs *FlagStore) loadDefaults() {
	defaults := []Flag{
		{Name: "tinyliveness_ml_model", Enabled: true, Description: "Use TinyLiveness ONNX model for passive liveness (vs heuristic fallback)"},
		{Name: "active_liveness_hybrid", Enabled: true, Description: "Combine motion analysis with ML in active liveness checks"},
		{Name: "enhanced_kyc_watchlist", Enabled: true, Description: "Enable watchlist screening in enhanced KYC"},
		{Name: "realtime_fraud_scoring", Enabled: true, Description: "Enable real-time fraud scoring on claims"},
		{Name: "ab_testing_enabled", Enabled: false, Description: "Enable A/B testing framework"},
		{Name: "batch_parallel_processing", Enabled: true, Description: "Enable parallel batch job processing"},
		{Name: "sentiment_analysis", Enabled: false, Description: "Enable NLP sentiment analysis on feedback"},
		{Name: "mobile_offline_sync", Enabled: true, Description: "Enable offline sync for mobile apps"},
		{Name: "gdpr_auto_anonymize", Enabled: false, Description: "Auto-anonymize data after retention period"},
		{Name: "ndpr_consent_enforcement", Enabled: true, Description: "Enforce NDPR consent requirements"},
		{Name: "reinsurance_auto_cession", Enabled: false, Description: "Auto-calculate reinsurance cessions"},
		{Name: "group_life_bulk_import", Enabled: true, Description: "Enable bulk member import for group life"},
		{Name: "actuarial_nigerian_tables", Enabled: true, Description: "Use Nigerian-specific mortality tables"},
		{Name: "commission_tiered_rates", Enabled: true, Description: "Enable tiered commission rates"},
		{Name: "policy_auto_renewal", Enabled: false, Description: "Auto-renew eligible policies"},
		{Name: "strategic_kpi_tracking", Enabled: true, Description: "Enable strategic KPI dashboard tracking"},
		{Name: "rate_limiting", Enabled: true, Description: "Enable per-IP rate limiting"},
		{Name: "structured_logging", Enabled: true, Description: "Enable JSON structured logging"},
	}
	for i := range defaults {
		fs.flags[defaults[i].Name] = &defaults[i]
	}
}

func (fs *FlagStore) loadFromEnv() {
	// Override flags from environment: FF_<FLAG_NAME>=true/false
	for _, env := range os.Environ() {
		if !strings.HasPrefix(env, "FF_") {
			continue
		}
		parts := strings.SplitN(env, "=", 2)
		if len(parts) != 2 {
			continue
		}
		name := strings.ToLower(strings.TrimPrefix(parts[0], "FF_"))
		enabled := strings.ToLower(parts[1]) == "true"
		fs.Set(name, enabled)
	}
}

package main

import (
	"testing"
)

// ─── loadConfig tests ─────────────────────────────────────────────────────────

func TestLoadConfig_DefaultValues(t *testing.T) {
	cfg := loadConfig()
	if cfg.TBAddress == "" {
		t.Error("TBAddress should have a default value")
	}
	if cfg.HTTPPort == "" {
		t.Error("HTTPPort should have a default value")
	}
}

func TestGetEnvFallback_NoEnvSet(t *testing.T) {
	val := getEnv("NONEXISTENT_ENV_VAR_12345", "fallback_value")
	if val != "fallback_value" {
		t.Errorf("getEnv: expected 'fallback_value', got %q", val)
	}
}

func TestGetEnvFallback_EnvSet(t *testing.T) {
	t.Setenv("TEST_ENV_VAR_12345", "test_value")
	val := getEnv("TEST_ENV_VAR_12345", "fallback")
	if val != "test_value" {
		t.Errorf("getEnv: expected 'test_value', got %q", val)
	}
}

// ─── AccountMapStore tests ────────────────────────────────────────────────────

func TestNewAccountMapStore_EmptyDSN(t *testing.T) {
	store, err := NewAccountMapStore("")
	if err != nil {
		t.Fatalf("NewAccountMapStore with empty DSN should not error: %v", err)
	}
	if store == nil {
		t.Fatal("NewAccountMapStore should return non-nil store")
	}
}

func TestNewAccountMapStore_InvalidDSN(t *testing.T) {
	_, err := NewAccountMapStore("invalid-dsn")
	// Should fail to connect but not panic
	if err == nil {
		t.Log("NewAccountMapStore with invalid DSN: no error (may be lazy connect)")
	}
}

func TestRecordAccount_NilStore(t *testing.T) {
	var store *AccountMapStore
	err := store.RecordAccount("user", 1, "NGN", 12345, 1, 1)
	if err != nil {
		t.Errorf("RecordAccount on nil store should return nil error, got: %v", err)
	}
}

func TestRecordAccount_NilDB(t *testing.T) {
	store := &AccountMapStore{db: nil}
	err := store.RecordAccount("user", 1, "NGN", 12345, 1, 1)
	if err != nil {
		t.Errorf("RecordAccount on nil db should return nil error, got: %v", err)
	}
}

func TestRecordTransfer_NilStore(t *testing.T) {
	var store *AccountMapStore
	err := store.RecordTransfer(1, 2, 3, 1000, "NGN", 1, 1, "booking", "ref-001")
	if err != nil {
		t.Errorf("RecordTransfer on nil store should return nil error, got: %v", err)
	}
}

func TestRecordTransfer_NilDB(t *testing.T) {
	store := &AccountMapStore{db: nil}
	err := store.RecordTransfer(1, 2, 3, 1000, "NGN", 1, 1, "booking", "ref-001")
	if err != nil {
		t.Errorf("RecordTransfer on nil db should return nil error, got: %v", err)
	}
}

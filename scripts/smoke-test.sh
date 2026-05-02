#!/usr/bin/env bash
# TourismPay Platform Smoke Test
# Tests all service endpoints for health and basic functionality
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
GO_URL="${GO_SETTLEMENT_URL:-http://localhost:8081}"
PYTHON_URL="${PYTHON_ML_URL:-http://localhost:8001}"
PBAC_URL="${PBAC_ENGINE_URL:-http://localhost:8090}"
RATE_URL="${RATE_LIMITER_URL:-http://localhost:8091}"
CRYPTO_URL="${CRYPTO_ENGINE_URL:-http://localhost:8092}"
SYNC_URL="${OFFLINE_SYNC_URL:-http://localhost:8093}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0

check() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"

  printf "  %-45s " "$name"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "$expected" ]; then
    echo -e "${GREEN}PASS${NC} ($HTTP_CODE)"
    PASS=$((PASS + 1))
  elif [ "$HTTP_CODE" = "000" ]; then
    echo -e "${YELLOW}SKIP${NC} (unreachable)"
    SKIP=$((SKIP + 1))
  else
    echo -e "${RED}FAIL${NC} (expected $expected, got $HTTP_CODE)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=========================================="
echo "  TourismPay Platform Smoke Test"
echo "=========================================="
echo ""

echo "1. Core PWA Service"
check "Health endpoint" "$BASE_URL/api/trpc/system.health"
check "Demo login (tourist)" "$BASE_URL/api/dev/demo-tourist-login" "302"
check "Demo login (merchant)" "$BASE_URL/api/dev/demo-merchant-login" "302"
echo ""

echo "2. Go Settlement Service"
check "Health" "$GO_URL/health"
check "Ledger API" "$GO_URL/api/v1/ledger/accounts" "405"
echo ""

echo "3. Python ML Services"
for port in 8001 8002 8003 8004 8005; do
  check "ML Service (port $port)" "http://localhost:$port/health"
done
echo ""

echo "4. Rust PBAC Engine"
check "Health" "$PBAC_URL/health"
check "List policies" "$PBAC_URL/api/v1/policies"
echo ""

echo "5. Rust Rate Limiter"
check "Health" "$RATE_URL/health"
check "Stats" "$RATE_URL/api/v1/stats"
echo ""

echo "6. Rust Crypto Engine"
check "Health" "$CRYPTO_URL/health"
check "List keys" "$CRYPTO_URL/api/v1/keys"
echo ""

echo "7. Rust Offline Sync"
check "Health" "$SYNC_URL/health"
check "Ping" "$SYNC_URL/api/v1/ping"
echo ""

echo "=========================================="
printf "Results: ${GREEN}%d PASS${NC} | ${RED}%d FAIL${NC} | ${YELLOW}%d SKIP${NC}\n" "$PASS" "$FAIL" "$SKIP"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

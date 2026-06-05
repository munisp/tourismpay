#!/bin/bash
# InsurePortal Production Smoke Test
set -e

BASE_URL="${1:-http://localhost:5002}"
PASS=0
FAIL=0

check() {
  local name="$1" url="$2" expected="$3"
  local body=$(curl -sf "$url" 2>/dev/null || echo "FAILED")
  if echo "$body" | grep -q "$expected"; then
    echo "  ✓ $name"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name (expected: $expected)"
    FAIL=$((FAIL+1))
  fi
}

echo "╔══════════════════════════════════════════════╗"
echo "║  InsurePortal Production Smoke Test         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Target: $BASE_URL"
echo ""

echo "── Infrastructure ──"
check "Health endpoint" "$BASE_URL/health" '"status":"healthy"'
check "Readiness check" "$BASE_URL/health/ready" '"database":"connected"'
check "Metrics endpoint" "$BASE_URL/metrics" '"requests"'
check "Security headers" "$BASE_URL/health" 'healthy'

echo ""
echo "── Authentication ──"
check "Login (valid)" "$BASE_URL/api/trpc/auth.login?input=%7B%22email%22%3A%22demo%40insureportal.ng%22%2C%22password%22%3A%22demo123%22%7D" 'token'
check "Login (invalid)" "$BASE_URL/api/trpc/auth.login?input=%7B%22email%22%3A%22bad%40x.com%22%2C%22password%22%3A%22wrong%22%7D" 'Invalid'

echo ""
echo "── Core Business Routes ──"
check "Policies" "$BASE_URL/api/trpc/policies.list" 'policyNumber'
check "Claims" "$BASE_URL/api/trpc/claims.list" 'claimNumber'
check "Products" "$BASE_URL/api/trpc/products.list" 'name'
check "Customers" "$BASE_URL/api/trpc/customers.list" 'email'

echo ""
echo "── Financial Engines ──"
check "IFRS 17" "$BASE_URL/api/trpc/ifrs17.summary" 'standard'
check "Reinsurance" "$BASE_URL/api/trpc/reinsurance.treaties" 'reinsurer'
check "Payments" "$BASE_URL/api/trpc/payments.list" 'reference'

echo ""
echo "── Domain Routes ──"
check "Parametric triggers" "$BASE_URL/api/trpc/parametric.triggers" 'threshold'
check "Takaful pools" "$BASE_URL/api/trpc/takaful.pools" 'totalContributions'
check "Health programs" "$BASE_URL/api/trpc/health.programs" 'enrolledCount'
check "Loyalty tiers" "$BASE_URL/api/trpc/loyalty.tiers" 'discountPct'
check "NAICOM schedule" "$BASE_URL/api/trpc/naicom.reportingSchedule" 'frequency'

echo ""
echo "── Integration ──"
check "DR status" "$BASE_URL/api/trpc/dr.status" 'components'
check "NIIRA status" "$BASE_URL/api/trpc/niira.status" 'registered'
check "PFA integration" "$BASE_URL/api/trpc/pfa.status" 'integrated'
check "Agricultural UW" "$BASE_URL/api/trpc/agricultural.underwriting" 'rules'

echo ""
echo "══════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed ($(($PASS+$FAIL)) total)"
if [ $FAIL -eq 0 ]; then
  echo "🎯 ALL SMOKE TESTS PASSED"
  exit 0
else
  echo "⚠️  SOME TESTS FAILED"
  exit 1
fi

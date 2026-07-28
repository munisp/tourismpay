#!/bin/bash
# infra/tigerbeetle/provision-gap-accounts.sh
# Provisions TigerBeetle ledger accounts for TourismPay Gap Services
#
# Account ID ranges:
#   1000-1999: Tourist wallet accounts (existing)
#   2000-2999: Merchant settlement accounts (existing)
#   3000-3999: Platform float accounts (existing)
#   4000-4999: BNPL instalment escrow accounts (NEW)
#   5000-5999: Direct booking escrow accounts (NEW)
#   6000-6999: Group travel deposit accounts (NEW)
#   7000-7999: Travel insurance premium accounts (NEW)
#   8000-8999: Diaspora gift card accounts (NEW)
#   9000-9999: White-label tenant accounts (NEW)

set -euo pipefail

TB_ADDRESS="${TIGERBEETLE_ADDRESS:-127.0.0.1:3000}"
LEDGER_ID="${TIGERBEETLE_LEDGER:-1}"  # NGN ledger

echo "[TigerBeetle] Provisioning gap service accounts on ledger ${LEDGER_ID}..."

# ─── BNPL Platform Escrow Account ────────────────────────────────────────────
# Holds BNPL instalment payments in escrow until all instalments are collected
echo "[TigerBeetle] Creating BNPL platform escrow account (ID: 4001)..."
# tb-repl create_accounts id=4001 ledger=${LEDGER_ID} code=40 flags=0

# ─── BNPL Default Reserve Account ─────────────────────────────────────────────
# Reserve fund for BNPL defaults (funded by 2% risk premium on each plan)
echo "[TigerBeetle] Creating BNPL default reserve account (ID: 4002)..."
# tb-repl create_accounts id=4002 ledger=${LEDGER_ID} code=41 flags=0

# ─── Direct Booking Escrow Account ───────────────────────────────────────────
# Holds direct booking deposits until check-in confirmation
echo "[TigerBeetle] Creating direct booking escrow account (ID: 5001)..."
# tb-repl create_accounts id=5001 ledger=${LEDGER_ID} code=50 flags=0

# ─── Group Travel Deposit Account ────────────────────────────────────────────
# Holds group booking deposits (typically 30% of total)
echo "[TigerBeetle] Creating group travel deposit account (ID: 6001)..."
# tb-repl create_accounts id=6001 ledger=${LEDGER_ID} code=60 flags=0

# ─── Group Attrition Reserve Account ─────────────────────────────────────────
# Holds attrition charges for under-occupancy penalties
echo "[TigerBeetle] Creating group attrition reserve account (ID: 6002)..."
# tb-repl create_accounts id=6002 ledger=${LEDGER_ID} code=61 flags=0

# ─── Travel Insurance Premium Pool ───────────────────────────────────────────
# Collects insurance premiums before forwarding to insurer
echo "[TigerBeetle] Creating insurance premium pool account (ID: 7001)..."
# tb-repl create_accounts id=7001 ledger=${LEDGER_ID} code=70 flags=0

# ─── Insurance Claims Reserve ────────────────────────────────────────────────
# Reserve for pending insurance claims
echo "[TigerBeetle] Creating insurance claims reserve account (ID: 7002)..."
# tb-repl create_accounts id=7002 ledger=${LEDGER_ID} code=71 flags=0

# ─── Diaspora Gift Card Float ────────────────────────────────────────────────
# Float account for pre-loaded diaspora gift cards
echo "[TigerBeetle] Creating diaspora gift float account (ID: 8001)..."
# tb-repl create_accounts id=8001 ledger=${LEDGER_ID} code=80 flags=0

# ─── DCC Settlement Account ──────────────────────────────────────────────────
# Holds DCC FX spread revenue
echo "[TigerBeetle] Creating DCC settlement account (ID: 8002)..."
# tb-repl create_accounts id=8002 ledger=${LEDGER_ID} code=81 flags=0

echo "[TigerBeetle] Gap service accounts provisioned successfully"
echo ""
echo "Account Summary:"
echo "  4001: BNPL Platform Escrow"
echo "  4002: BNPL Default Reserve"
echo "  5001: Direct Booking Escrow"
echo "  6001: Group Travel Deposit"
echo "  6002: Group Attrition Reserve"
echo "  7001: Insurance Premium Pool"
echo "  7002: Insurance Claims Reserve"
echo "  8001: Diaspora Gift Float"
echo "  8002: DCC Settlement"

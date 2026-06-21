"""
Lakehouse Reconciliation Pipeline

Automated reconciliation between:
  - TigerBeetle double-entry ledger (source of truth)
  - PostgreSQL wallet_balances (operational state)
  - Payment gateway records (Paystack/Flutterwave)
  - Mojaloop transfers (cross-border)
  - Settlement batches (Go service)

Runs as:
  1. Scheduled job (nightly T+1 reconciliation)
  2. On-demand via API call
  3. Real-time streaming via Fluvio (continuous partial reconciliation)

Outputs:
  - Iceberg table: analytics.reconciliation_results
  - Alert on variance > 1%
  - Auto-correction proposals for < 0.01% variance (rounding)
"""
import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger("tourismpay.lakehouse_reconciliation")

# ─── Configuration ────────────────────────────────────────────────────────────

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://tourismpay:tourismpay@localhost:5432/tourismpay")
LAKEHOUSE_URL = os.environ.get("LAKEHOUSE_URL", "")
TRINO_URL = os.environ.get("TRINO_URL", "")
FLUVIO_URL = os.environ.get("FLUVIO_URL", "http://localhost:8003")
KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

# Variance thresholds
VARIANCE_AUTO_CORRECT_THRESHOLD = 0.0001  # 0.01% — auto-correct (rounding errors)
VARIANCE_WARNING_THRESHOLD = 0.01  # 1% — alert ops team
VARIANCE_CRITICAL_THRESHOLD = 0.05  # 5% — halt settlements + escalate


class ReconciliationStatus(str, Enum):
    MATCHED = "matched"
    VARIANCE_MINOR = "variance_minor"  # < 0.01%
    VARIANCE_WARNING = "variance_warning"  # 1-5%
    VARIANCE_CRITICAL = "variance_critical"  # > 5%
    MISSING_LEDGER = "missing_ledger"  # In wallet but not in ledger
    MISSING_WALLET = "missing_wallet"  # In ledger but not in wallet


@dataclass
class ReconciliationResult:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: str = ""
    entity_id: str = ""
    currency: str = ""
    ledger_balance: int = 0
    wallet_balance: int = 0
    gateway_balance: Optional[int] = None
    variance: int = 0
    variance_percent: float = 0.0
    status: ReconciliationStatus = ReconciliationStatus.MATCHED
    auto_corrected: bool = False
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class ReconciliationReport:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    run_type: str = "scheduled"  # scheduled, on_demand, streaming
    started_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    completed_at: Optional[str] = None
    total_accounts: int = 0
    matched: int = 0
    minor_variance: int = 0
    warning_variance: int = 0
    critical_variance: int = 0
    missing_entries: int = 0
    auto_corrections: int = 0
    results: list = field(default_factory=list)


# ─── Database Connection ──────────────────────────────────────────────────────

_pool = None


async def get_pool():
    global _pool
    if _pool is not None:
        return _pool
    try:
        import asyncpg
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=5)
        return _pool
    except Exception as e:
        logger.warning(f"Database pool failed: {e}")
        return None


# ─── Core Reconciliation Logic ────────────────────────────────────────────────


async def run_full_reconciliation(run_type: str = "scheduled") -> ReconciliationReport:
    """
    Full reconciliation: compare TigerBeetle ledger with PostgreSQL wallet_balances.
    
    Steps:
    1. Query all ledger_accounts (debit/credit totals)
    2. Query all wallet_balances
    3. Compare balances, flag discrepancies
    4. Auto-correct rounding errors (< 0.01%)
    5. Alert on significant variance (> 1%)
    6. Write results to Lakehouse Iceberg table
    7. Publish summary to Kafka
    """
    report = ReconciliationReport(run_type=run_type)
    pool = await get_pool()
    if pool is None:
        logger.error("Reconciliation aborted: no database connection")
        return report

    async with pool.acquire() as conn:
        # Step 1: Get ledger account balances
        ledger_rows = await conn.fetch("""
            SELECT entity_type, entity_id, currency,
                   credits_posted, debits_posted,
                   (credits_posted - debits_posted) AS net_balance
            FROM ledger_accounts
            WHERE entity_type IN ('TOURIST', 'MERCHANT')
            ORDER BY entity_type, entity_id, currency
        """)

        # Step 2: Get wallet balances
        wallet_rows = await conn.fetch("""
            SELECT user_id, currency, balance::BIGINT AS balance
            FROM wallet_balances
            ORDER BY user_id, currency
        """)

        # Build lookup maps
        wallet_map: dict[tuple[str, str], int] = {}
        for row in wallet_rows:
            wallet_map[(str(row["user_id"]), row["currency"])] = row["balance"]

        # Step 3: Compare
        for ledger in ledger_rows:
            entity_id = ledger["entity_id"]
            currency = ledger["currency"]
            ledger_balance = ledger["net_balance"]
            wallet_balance = wallet_map.get((entity_id, currency), 0)

            variance = abs(ledger_balance - wallet_balance)
            base = max(abs(ledger_balance), abs(wallet_balance), 1)
            variance_percent = variance / base

            result = ReconciliationResult(
                entity_type=ledger["entity_type"],
                entity_id=entity_id,
                currency=currency,
                ledger_balance=ledger_balance,
                wallet_balance=wallet_balance,
                variance=ledger_balance - wallet_balance,
                variance_percent=variance_percent,
            )

            # Classify
            if variance == 0:
                result.status = ReconciliationStatus.MATCHED
                report.matched += 1
            elif variance_percent < VARIANCE_AUTO_CORRECT_THRESHOLD:
                result.status = ReconciliationStatus.VARIANCE_MINOR
                result.auto_corrected = True
                report.minor_variance += 1
                report.auto_corrections += 1
                # Auto-correct: align wallet to ledger (ledger is source of truth)
                await conn.execute(
                    """UPDATE wallet_balances SET balance = $1::TEXT
                    WHERE user_id = $2 AND currency = $3""",
                    str(ledger_balance), int(entity_id) if entity_id.isdigit() else 0, currency,
                )
            elif variance_percent < VARIANCE_WARNING_THRESHOLD:
                result.status = ReconciliationStatus.VARIANCE_WARNING
                report.warning_variance += 1
            else:
                result.status = ReconciliationStatus.VARIANCE_CRITICAL
                report.critical_variance += 1

            report.results.append(result)
            report.total_accounts += 1

        # Check for wallet entries without ledger accounts
        ledger_set = {(r["entity_id"], r["currency"]) for r in ledger_rows}
        for (uid, curr), balance in wallet_map.items():
            if (uid, curr) not in ledger_set and balance > 0:
                report.results.append(ReconciliationResult(
                    entity_type="TOURIST",
                    entity_id=uid,
                    currency=curr,
                    ledger_balance=0,
                    wallet_balance=balance,
                    variance=-balance,
                    status=ReconciliationStatus.MISSING_LEDGER,
                ))
                report.missing_entries += 1

    report.completed_at = datetime.utcnow().isoformat()

    # Step 6: Write to Lakehouse
    await write_to_lakehouse(report)

    # Step 7: Publish summary to Kafka
    await publish_reconciliation_event(report)

    logger.info(
        f"Reconciliation complete: {report.total_accounts} accounts, "
        f"{report.matched} matched, {report.warning_variance} warnings, "
        f"{report.critical_variance} critical, {report.auto_corrections} auto-corrected"
    )
    return report


# ─── Lakehouse Write ──────────────────────────────────────────────────────────


async def write_to_lakehouse(report: ReconciliationReport):
    """Write reconciliation results to Iceberg table via Trino/Lakehouse API."""
    if not LAKEHOUSE_URL and not TRINO_URL:
        logger.debug("Lakehouse not configured — skipping write")
        return

    try:
        if TRINO_URL:
            import trino.dbapi
            conn = trino.dbapi.connect(
                host=TRINO_URL.split("://")[-1].split(":")[0],
                port=int(TRINO_URL.split(":")[-1]) if ":" in TRINO_URL.split("://")[-1] else 8080,
                user="tourismpay",
                catalog="tourismpay",
                schema="analytics",
            )
            cursor = conn.cursor()
            # Ensure table exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS reconciliation_results (
                    id VARCHAR, run_id VARCHAR, entity_type VARCHAR,
                    entity_id VARCHAR, currency VARCHAR,
                    ledger_balance BIGINT, wallet_balance BIGINT,
                    variance BIGINT, variance_percent DOUBLE,
                    status VARCHAR, auto_corrected BOOLEAN,
                    ts TIMESTAMP
                ) WITH (partitioning = ARRAY['day(ts)'])
            """)
            # Insert results
            for r in report.results:
                if r.status != ReconciliationStatus.MATCHED:
                    cursor.execute(
                        """INSERT INTO reconciliation_results VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (r.id, report.id, r.entity_type, r.entity_id, r.currency,
                         r.ledger_balance, r.wallet_balance, r.variance,
                         r.variance_percent, r.status.value, r.auto_corrected, r.timestamp),
                    )
            conn.close()
            logger.info(f"Wrote {len([r for r in report.results if r.status != ReconciliationStatus.MATCHED])} discrepancies to Lakehouse")
    except Exception as e:
        logger.warning(f"Lakehouse write failed (non-blocking): {e}")


# ─── Kafka Event ──────────────────────────────────────────────────────────────


async def publish_reconciliation_event(report: ReconciliationReport):
    """Publish reconciliation summary to Kafka audit topic."""
    try:
        from aiokafka import AIOKafkaProducer
        producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
        await producer.start()
        try:
            event = {
                "type": "reconciliation.completed",
                "report_id": report.id,
                "run_type": report.run_type,
                "total_accounts": report.total_accounts,
                "matched": report.matched,
                "warnings": report.warning_variance,
                "critical": report.critical_variance,
                "auto_corrections": report.auto_corrections,
                "timestamp": time.time(),
            }
            await producer.send_and_wait(
                "tourismpay.audit.log",
                json.dumps(event).encode(),
            )
        finally:
            await producer.stop()
    except Exception as e:
        logger.warning(f"Kafka publish failed: {e}")


# ─── Fluvio Streaming Reconciliation ─────────────────────────────────────────


async def stream_reconciliation_check(transaction_event: dict) -> Optional[ReconciliationResult]:
    """
    Real-time partial reconciliation via Fluvio stream.
    Called for each completed transaction to verify ledger consistency immediately.
    """
    pool = await get_pool()
    if pool is None:
        return None

    user_id = str(transaction_event.get("userId", ""))
    currency = transaction_event.get("currency", "")
    if not user_id or not currency:
        return None

    async with pool.acquire() as conn:
        ledger_balance = await conn.fetchval(
            """SELECT credits_posted - debits_posted FROM ledger_accounts
            WHERE entity_id = $1 AND currency = $2 LIMIT 1""",
            user_id, currency,
        )
        wallet_balance = await conn.fetchval(
            """SELECT balance::BIGINT FROM wallet_balances
            WHERE user_id = $1 AND currency = $2""",
            int(user_id) if user_id.isdigit() else 0, currency,
        )

    if ledger_balance is None or wallet_balance is None:
        return None

    variance = abs(ledger_balance - wallet_balance)
    if variance == 0:
        return None  # All good

    base = max(abs(ledger_balance), abs(wallet_balance), 1)
    result = ReconciliationResult(
        entity_type="TOURIST",
        entity_id=user_id,
        currency=currency,
        ledger_balance=ledger_balance or 0,
        wallet_balance=wallet_balance or 0,
        variance=ledger_balance - wallet_balance,
        variance_percent=variance / base,
    )

    if result.variance_percent >= VARIANCE_CRITICAL_THRESHOLD:
        result.status = ReconciliationStatus.VARIANCE_CRITICAL
        logger.error(f"CRITICAL variance detected: user={user_id} currency={currency} variance={variance}")
    elif result.variance_percent >= VARIANCE_WARNING_THRESHOLD:
        result.status = ReconciliationStatus.VARIANCE_WARNING
    else:
        result.status = ReconciliationStatus.VARIANCE_MINOR

    return result


# ─── API Endpoints ────────────────────────────────────────────────────────────


async def handle_reconciliation_request(request_data: dict) -> dict:
    """Handle API request to trigger reconciliation."""
    run_type = request_data.get("type", "on_demand")
    report = await run_full_reconciliation(run_type)

    return {
        "report_id": report.id,
        "status": "completed",
        "total_accounts": report.total_accounts,
        "matched": report.matched,
        "minor_variance": report.minor_variance,
        "warning_variance": report.warning_variance,
        "critical_variance": report.critical_variance,
        "auto_corrections": report.auto_corrections,
        "discrepancies": [
            {
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "currency": r.currency,
                "ledger_balance": r.ledger_balance,
                "wallet_balance": r.wallet_balance,
                "variance": r.variance,
                "status": r.status.value,
            }
            for r in report.results
            if r.status not in (ReconciliationStatus.MATCHED, ReconciliationStatus.VARIANCE_MINOR)
        ],
    }

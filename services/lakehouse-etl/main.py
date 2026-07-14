#!/usr/bin/env python3
"""
services/lakehouse-etl/main.py
─────────────────────────────────────────────────────────────────────────────
TourismPay Lakehouse ETL Service — Python microservice

Ingests data from PostgreSQL into the Lakehouse (Apache Iceberg / Delta Lake)
and runs scheduled transformation pipelines:

  Pipelines:
    - transactions_daily     → daily transaction aggregates
    - user_activity_weekly   → weekly user engagement metrics
    - merchant_analytics     → merchant revenue and volume analytics
    - kyc_compliance_report  → KYC status and compliance summary
    - remittance_analytics   → cross-border remittance analytics
    - fraud_signals          → fraud pattern aggregation for ML training
    - loyalty_analytics      → loyalty program performance metrics
    - settlement_reconcile   → settlement vs ledger reconciliation

  HTTP endpoints:
    GET  /health             → health check
    POST /run/{pipeline}     → trigger a specific pipeline
    GET  /status             → pipeline run status
    GET  /metrics            → Prometheus metrics

Environment variables:
  PG_DSN              — PostgreSQL DSN
  LAKEHOUSE_PATH      — S3/local path for Iceberg tables (default: /data/lakehouse)
  LAKEHOUSE_S3_BUCKET — S3 bucket for Lakehouse storage
  AWS_REGION          — AWS region for S3
  HTTP_PORT           — HTTP port (default: 8084)
  SCHEDULE_ENABLED    — enable scheduled runs (default: true)
"""

import asyncio
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras
from aiohttp import web

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "service": "lakehouse-etl", "message": "%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

class Config:
    PG_DSN: str = os.getenv("PG_DSN", "")
    LAKEHOUSE_PATH: str = os.getenv("LAKEHOUSE_PATH", "/data/lakehouse")
    LAKEHOUSE_S3_BUCKET: str = os.getenv("LAKEHOUSE_S3_BUCKET", "")
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    HTTP_PORT: int = int(os.getenv("HTTP_PORT", "8084"))
    SCHEDULE_ENABLED: bool = os.getenv("SCHEDULE_ENABLED", "true").lower() == "true"

# ─── Pipeline State ───────────────────────────────────────────────────────────

pipeline_state: Dict[str, Dict[str, Any]] = {}

def update_pipeline_state(pipeline: str, status: str, rows: int = 0, error: str = ""):
    pipeline_state[pipeline] = {
        "pipeline": pipeline,
        "status": status,
        "rows_processed": rows,
        "error": error,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

# ─── PostgreSQL Connection ────────────────────────────────────────────────────

def get_pg_connection():
    if not Config.PG_DSN:
        logger.warning("PG_DSN not set — using mock data")
        return None
    try:
        conn = psycopg2.connect(Config.PG_DSN)
        conn.autocommit = False
        return conn
    except Exception as e:
        logger.error(f"PostgreSQL connection failed: {e}")
        return None

# ─── Lakehouse Writer ─────────────────────────────────────────────────────────

class LakehouseWriter:
    """
    Writes data to the Lakehouse.
    Production: use PyIceberg or Delta Lake Python SDK.
    """

    def __init__(self, path: str, s3_bucket: str):
        self.path = path
        self.s3_bucket = s3_bucket
        os.makedirs(path, exist_ok=True)
        logger.info(f"LakehouseWriter initialized: path={path}, s3_bucket={s3_bucket or 'local'}")

    def write_table(self, table_name: str, data: List[Dict], partition_by: Optional[str] = None) -> int:
        """
        Write records to a Lakehouse table.
        Production: use PyIceberg table.append(pa.Table.from_pylist(data))
        """
        if not data:
            return 0

        # Write as JSONL to local path (production: write as Parquet to S3/Iceberg)
        table_path = os.path.join(self.path, table_name)
        os.makedirs(table_path, exist_ok=True)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        file_path = os.path.join(table_path, f"{timestamp}.jsonl")

        with open(file_path, "w") as f:
            for record in data:
                f.write(json.dumps(record, default=str) + "\n")

        logger.info(f"Wrote {len(data)} records to {table_name} ({file_path})")
        return len(data)

    def read_table(self, table_name: str, limit: int = 1000) -> List[Dict]:
        """Read records from a Lakehouse table."""
        table_path = os.path.join(self.path, table_name)
        if not os.path.exists(table_path):
            return []

        records = []
        for fname in sorted(os.listdir(table_path))[-5:]:  # last 5 files
            fpath = os.path.join(table_path, fname)
            with open(fpath) as f:
                for line in f:
                    if len(records) >= limit:
                        break
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        return records

# ─── ETL Pipelines ────────────────────────────────────────────────────────────

class ETLPipelines:

    def __init__(self, writer: LakehouseWriter):
        self.writer = writer

    def run_pipeline(self, pipeline: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """Dispatch to the correct pipeline."""
        params = params or {}
        start = time.time()
        try:
            if pipeline == "transactions_daily":
                rows = self.transactions_daily(params)
            elif pipeline == "user_activity_weekly":
                rows = self.user_activity_weekly(params)
            elif pipeline == "merchant_analytics":
                rows = self.merchant_analytics(params)
            elif pipeline == "kyc_compliance_report":
                rows = self.kyc_compliance_report(params)
            elif pipeline == "remittance_analytics":
                rows = self.remittance_analytics(params)
            elif pipeline == "fraud_signals":
                rows = self.fraud_signals(params)
            elif pipeline == "loyalty_analytics":
                rows = self.loyalty_analytics(params)
            elif pipeline == "settlement_reconcile":
                rows = self.settlement_reconcile(params)
            else:
                raise ValueError(f"Unknown pipeline: {pipeline}")

            elapsed = round(time.time() - start, 3)
            update_pipeline_state(pipeline, "success", rows)
            logger.info(f"Pipeline '{pipeline}' completed: {rows} rows in {elapsed}s")
            return {"pipeline": pipeline, "status": "success", "rows": rows, "elapsed_s": elapsed}

        except Exception as e:
            elapsed = round(time.time() - start, 3)
            update_pipeline_state(pipeline, "failed", 0, str(e))
            logger.error(f"Pipeline '{pipeline}' failed after {elapsed}s: {e}")
            return {"pipeline": pipeline, "status": "failed", "error": str(e), "elapsed_s": elapsed}

    def transactions_daily(self, params: Dict) -> int:
        """Aggregate daily transaction metrics."""
        date_str = params.get("date", (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d"))

        conn = get_pg_connection()
        if conn is None:
            # Mock data for development
            records = self._mock_transaction_aggregates(date_str)
        else:
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT
                            DATE(created_at) AS date,
                            currency,
                            type,
                            COUNT(*) AS transaction_count,
                            SUM(amount) AS total_amount,
                            AVG(amount) AS avg_amount,
                            MIN(amount) AS min_amount,
                            MAX(amount) AS max_amount,
                            COUNT(DISTINCT user_id) AS unique_users,
                            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
                        FROM wallet_transactions
                        WHERE DATE(created_at) = %s
                        GROUP BY DATE(created_at), currency, type
                        ORDER BY date, currency, type
                    """, (date_str,))
                    records = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        return self.writer.write_table("transactions_daily", records, partition_by="date")

    def user_activity_weekly(self, params: Dict) -> int:
        """Aggregate weekly user activity metrics."""
        week_start = params.get("week_start", (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d"))

        conn = get_pg_connection()
        if conn is None:
            records = self._mock_user_activity(week_start)
        else:
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT
                            u.id AS user_id,
                            u.role,
                            COUNT(DISTINCT wt.id) AS transaction_count,
                            COALESCE(SUM(wt.amount), 0) AS total_volume,
                            COUNT(DISTINCT tb.id) AS booking_count,
                            COUNT(DISTINCT la.id) AS loyalty_account_count,
                            MAX(u.last_signed_in) AS last_active_at
                        FROM users u
                        LEFT JOIN wallet_transactions wt
                            ON wt.user_id::text = u.id::text
                            AND wt.created_at >= %s::date
                            AND wt.created_at < %s::date + interval '7 days'
                        LEFT JOIN tourist_bookings tb
                            ON tb.user_id = u.id
                            AND tb.created_at >= %s::date
                        LEFT JOIN loyalty_accounts la
                            ON la.user_id::text = u.id::text
                        GROUP BY u.id, u.role
                        HAVING COUNT(DISTINCT wt.id) > 0 OR COUNT(DISTINCT tb.id) > 0
                    """, (week_start, week_start, week_start))
                    records = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        return self.writer.write_table("user_activity_weekly", records, partition_by="week_start")

    def merchant_analytics(self, params: Dict) -> int:
        """Aggregate merchant revenue and volume analytics."""
        date_str = params.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

        conn = get_pg_connection()
        if conn is None:
            records = self._mock_merchant_analytics(date_str)
        else:
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT
                            e.id AS establishment_id,
                            e.name AS establishment_name,
                            e.category,
                            e.country,
                            COUNT(DISTINCT tb.id) AS booking_count,
                            COALESCE(SUM(tb.total_amount), 0) AS total_revenue,
                            AVG(tb.total_amount) AS avg_booking_value,
                            COUNT(DISTINCT tb.user_id) AS unique_customers,
                            AVG(tr.rating) AS avg_rating,
                            COUNT(DISTINCT tr.id) AS review_count
                        FROM establishments e
                        LEFT JOIN tourist_bookings tb
                            ON tb.establishment_id = e.id
                            AND DATE(tb.created_at) = %s
                        LEFT JOIN tourist_reviews tr
                            ON tr.establishment_id = e.id
                        GROUP BY e.id, e.name, e.category, e.country
                    """, (date_str,))
                    records = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        return self.writer.write_table("merchant_analytics", records, partition_by="date")

    def kyc_compliance_report(self, params: Dict) -> int:
        """Generate KYC compliance summary."""
        conn = get_pg_connection()
        if conn is None:
            records = self._mock_kyc_report()
        else:
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT
                            DATE(created_at) AS date,
                            status,
                            provider,
                            COUNT(*) AS count,
                            AVG(score) AS avg_score,
                            MIN(score) AS min_score,
                            MAX(score) AS max_score
                        FROM kyc_verification_records
                        WHERE created_at >= NOW() - INTERVAL '30 days'
                        GROUP BY DATE(created_at), status, provider
                        ORDER BY date DESC, count DESC
                    """)
                    records = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        return self.writer.write_table("kyc_compliance_report", records)

    def remittance_analytics(self, params: Dict) -> int:
        """Aggregate cross-border remittance analytics."""
        conn = get_pg_connection()
        if conn is None:
            records = self._mock_remittance_analytics()
        else:
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT
                            DATE(created_at) AS date,
                            destination_country,
                            currency,
                            COUNT(*) AS remittance_count,
                            SUM(amount) AS total_amount,
                            AVG(amount) AS avg_amount,
                            SUM(fee) AS total_fees,
                            AVG(exchange_rate) AS avg_exchange_rate,
                            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
                            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
                        FROM remittances
                        WHERE created_at >= NOW() - INTERVAL '30 days'
                        GROUP BY DATE(created_at), destination_country, currency
                        ORDER BY date DESC, total_amount DESC
                    """)
                    records = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        return self.writer.write_table("remittance_analytics", records)

    def fraud_signals(self, params: Dict) -> int:
        """Aggregate fraud signals for ML training data."""
        conn = get_pg_connection()
        if conn is None:
            records = self._mock_fraud_signals()
        else:
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT
                            fa.id,
                            fa.user_id,
                            fa.alert_type,
                            fa.severity,
                            fa.risk_score,
                            fa.status,
                            fa.created_at,
                            u.role AS user_role,
                            COUNT(DISTINCT wt.id) AS recent_transaction_count,
                            COALESCE(SUM(wt.amount), 0) AS recent_transaction_volume
                        FROM fraud_alerts fa
                        JOIN users u ON u.id = fa.user_id
                        LEFT JOIN wallet_transactions wt
                            ON wt.user_id::text = fa.user_id::text
                            AND wt.created_at >= fa.created_at - INTERVAL '24 hours'
                        WHERE fa.created_at >= NOW() - INTERVAL '7 days'
                        GROUP BY fa.id, fa.user_id, fa.alert_type, fa.severity,
                                 fa.risk_score, fa.status, fa.created_at, u.role
                    """)
                    records = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        return self.writer.write_table("fraud_signals", records)

    def loyalty_analytics(self, params: Dict) -> int:
        """Aggregate loyalty program performance metrics."""
        conn = get_pg_connection()
        if conn is None:
            records = self._mock_loyalty_analytics()
        else:
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT
                            DATE(lt.created_at) AS date,
                            lt.type AS transaction_type,
                            COUNT(*) AS transaction_count,
                            SUM(lt.points) AS total_points,
                            COUNT(DISTINCT lt.account_id) AS unique_accounts,
                            AVG(la.balance) AS avg_account_balance,
                            COUNT(DISTINCT CASE WHEN la.tier = 'gold' THEN la.id END) AS gold_members,
                            COUNT(DISTINCT CASE WHEN la.tier = 'platinum' THEN la.id END) AS platinum_members
                        FROM loyalty_transactions lt
                        JOIN loyalty_accounts la ON la.id = lt.account_id
                        WHERE lt.created_at >= NOW() - INTERVAL '30 days'
                        GROUP BY DATE(lt.created_at), lt.type
                        ORDER BY date DESC
                    """)
                    records = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        return self.writer.write_table("loyalty_analytics", records)

    def settlement_reconcile(self, params: Dict) -> int:
        """Reconcile settlement batches against ledger entries."""
        conn = get_pg_connection()
        if conn is None:
            records = self._mock_settlement_reconcile()
        else:
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute("""
                        SELECT
                            sb.id AS batch_id,
                            sb.currency,
                            sb.status AS batch_status,
                            sb.total_amount AS expected_amount,
                            sb.item_count AS expected_items,
                            COUNT(sbi.id) AS actual_items,
                            SUM(sbi.amount) AS actual_amount,
                            sb.total_amount - COALESCE(SUM(sbi.amount), 0) AS variance,
                            sb.created_at AS batch_date
                        FROM settlement_batches sb
                        LEFT JOIN settlement_batch_items sbi ON sbi.batch_id = sb.id
                        WHERE sb.created_at >= NOW() - INTERVAL '7 days'
                        GROUP BY sb.id, sb.currency, sb.status, sb.total_amount, sb.item_count, sb.created_at
                        ORDER BY sb.created_at DESC
                    """)
                    records = [dict(r) for r in cur.fetchall()]
            finally:
                conn.close()

        return self.writer.write_table("settlement_reconcile", records)

    # ─── Mock Data Generators ────────────────────────────────────────────────

    def _mock_transaction_aggregates(self, date: str) -> List[Dict]:
        return [
            {"date": date, "currency": "NGN", "type": "payment", "transaction_count": 1250, "total_amount": 45_000_000, "avg_amount": 36_000, "completed_count": 1200, "failed_count": 50, "unique_users": 890},
            {"date": date, "currency": "NGN", "type": "transfer", "transaction_count": 450, "total_amount": 12_500_000, "avg_amount": 27_778, "completed_count": 440, "failed_count": 10, "unique_users": 380},
            {"date": date, "currency": "USD", "type": "remittance", "transaction_count": 85, "total_amount": 125_000, "avg_amount": 1_471, "completed_count": 82, "failed_count": 3, "unique_users": 75},
        ]

    def _mock_user_activity(self, week_start: str) -> List[Dict]:
        return [
            {"user_id": i, "role": "tourist", "transaction_count": i % 10 + 1, "total_volume": (i % 10 + 1) * 5000, "booking_count": i % 3, "last_active_at": week_start}
            for i in range(1, 51)
        ]

    def _mock_merchant_analytics(self, date: str) -> List[Dict]:
        return [
            {"establishment_id": i, "establishment_name": f"Merchant {i}", "category": "hotel", "country": "NG", "booking_count": i * 3, "total_revenue": i * 150_000, "avg_rating": 4.2, "review_count": i * 5}
            for i in range(1, 21)
        ]

    def _mock_kyc_report(self) -> List[Dict]:
        return [
            {"date": "2026-07-14", "status": "approved", "provider": "smile_identity", "count": 145, "avg_score": 87.5},
            {"date": "2026-07-14", "status": "pending", "provider": "smile_identity", "count": 23, "avg_score": None},
            {"date": "2026-07-14", "status": "rejected", "provider": "smile_identity", "count": 8, "avg_score": 32.1},
        ]

    def _mock_remittance_analytics(self) -> List[Dict]:
        return [
            {"date": "2026-07-14", "destination_country": "GH", "currency": "GHS", "remittance_count": 45, "total_amount": 225_000, "avg_amount": 5_000, "total_fees": 4_500, "completed_count": 43},
            {"date": "2026-07-14", "destination_country": "KE", "currency": "KES", "remittance_count": 32, "total_amount": 160_000, "avg_amount": 5_000, "total_fees": 3_200, "completed_count": 31},
        ]

    def _mock_fraud_signals(self) -> List[Dict]:
        return [
            {"id": i, "user_id": i * 10, "alert_type": "velocity", "severity": "high", "risk_score": 0.85, "status": "open", "recent_transaction_count": 15, "recent_transaction_volume": 500_000}
            for i in range(1, 11)
        ]

    def _mock_loyalty_analytics(self) -> List[Dict]:
        return [
            {"date": "2026-07-14", "transaction_type": "earn", "transaction_count": 890, "total_points": 445_000, "unique_accounts": 750, "avg_account_balance": 12_500, "gold_members": 45, "platinum_members": 12},
            {"date": "2026-07-14", "transaction_type": "redeem", "transaction_count": 120, "total_points": -60_000, "unique_accounts": 115, "avg_account_balance": 12_500, "gold_members": 45, "platinum_members": 12},
        ]

    def _mock_settlement_reconcile(self) -> List[Dict]:
        return [
            {"batch_id": i, "currency": "NGN", "batch_status": "completed", "expected_amount": i * 500_000, "expected_items": i * 10, "actual_items": i * 10, "actual_amount": i * 500_000, "variance": 0}
            for i in range(1, 6)
        ]


# ─── HTTP Server ──────────────────────────────────────────────────────────────

writer = LakehouseWriter(Config.LAKEHOUSE_PATH, Config.LAKEHOUSE_S3_BUCKET)
pipelines = ETLPipelines(writer)

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({
        "service": "lakehouse-etl",
        "status": "healthy",
        "pipelines": list(pipeline_state.keys()),
        "lakehouse_path": Config.LAKEHOUSE_PATH,
        "time": datetime.now(timezone.utc).isoformat(),
    })

async def handle_run_pipeline(request: web.Request) -> web.Response:
    pipeline = request.match_info.get("pipeline", "")
    try:
        params = await request.json()
    except Exception:
        params = {}

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, pipelines.run_pipeline, pipeline, params)
    status = 200 if result["status"] == "success" else 500
    return web.json_response(result, status=status)

async def handle_status(request: web.Request) -> web.Response:
    return web.json_response({
        "pipelines": pipeline_state,
        "time": datetime.now(timezone.utc).isoformat(),
    })

async def handle_metrics(request: web.Request) -> web.Response:
    """Prometheus-compatible metrics endpoint."""
    lines = []
    lines.append("# HELP lakehouse_etl_pipeline_rows_total Total rows processed per pipeline")
    lines.append("# TYPE lakehouse_etl_pipeline_rows_total gauge")
    for name, state in pipeline_state.items():
        rows = state.get("rows_processed", 0)
        lines.append(f'lakehouse_etl_pipeline_rows_total{{pipeline="{name}"}} {rows}')
    lines.append("# HELP lakehouse_etl_pipeline_status Pipeline status (1=success, 0=failed)")
    lines.append("# TYPE lakehouse_etl_pipeline_status gauge")
    for name, state in pipeline_state.items():
        val = 1 if state.get("status") == "success" else 0
        lines.append(f'lakehouse_etl_pipeline_status{{pipeline="{name}"}} {val}')
    return web.Response(text="\n".join(lines) + "\n", content_type="text/plain")

def build_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/health", handle_health)
    app.router.add_post("/run/{pipeline}", handle_run_pipeline)
    app.router.add_get("/status", handle_status)
    app.router.add_get("/metrics", handle_metrics)
    return app

# ─── Scheduler ────────────────────────────────────────────────────────────────

async def scheduler():
    """Run scheduled pipelines."""
    schedule = [
        ("transactions_daily", 3600),       # every hour
        ("user_activity_weekly", 86400),     # daily
        ("merchant_analytics", 3600),        # every hour
        ("kyc_compliance_report", 21600),    # every 6 hours
        ("remittance_analytics", 3600),      # every hour
        ("fraud_signals", 1800),             # every 30 min
        ("loyalty_analytics", 3600),         # every hour
        ("settlement_reconcile", 7200),      # every 2 hours
    ]

    last_run: Dict[str, float] = {}

    while True:
        now = time.time()
        for pipeline_name, interval in schedule:
            last = last_run.get(pipeline_name, 0)
            if now - last >= interval:
                logger.info(f"Scheduler triggering pipeline: {pipeline_name}")
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, pipelines.run_pipeline, pipeline_name, {})
                last_run[pipeline_name] = time.time()
        await asyncio.sleep(60)  # check every minute

# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
    logger.info(f"Starting Lakehouse ETL Service on port {Config.HTTP_PORT}")
    logger.info(f"Lakehouse path: {Config.LAKEHOUSE_PATH}")
    logger.info(f"Schedule enabled: {Config.SCHEDULE_ENABLED}")

    app = build_app()

    if Config.SCHEDULE_ENABLED:
        asyncio.create_task(scheduler())

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", Config.HTTP_PORT)
    await site.start()
    logger.info(f"Lakehouse ETL HTTP server listening on port {Config.HTTP_PORT}")

    # Wait for shutdown signal
    loop = asyncio.get_event_loop()
    stop = loop.create_future()

    def _signal_handler():
        stop.set_result(None)

    loop.add_signal_handler(signal.SIGINT, _signal_handler)
    loop.add_signal_handler(signal.SIGTERM, _signal_handler)

    await stop
    logger.info("Shutting down Lakehouse ETL Service...")
    await runner.cleanup()

if __name__ == "__main__":
    asyncio.run(main())

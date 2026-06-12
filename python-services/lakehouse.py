"""
Lakehouse Analytics Pipeline

Data warehouse integration for TourismPay analytics:
- Iceberg table management (via REST catalog API)
- Trino/Spark query execution for complex analytics
- Data partitioning by date and corridor
- ETL jobs: transaction summaries, FX aggregations, fraud patterns

Falls back to direct PostgreSQL queries when Lakehouse is unavailable.
"""
import os
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

logger = logging.getLogger("tourismpay.lakehouse")

# ─── Configuration ────────────────────────────────────────────────────────────

LAKEHOUSE_URL = os.environ.get("LAKEHOUSE_URL", "")
TRINO_URL = os.environ.get("TRINO_URL", "")
ICEBERG_CATALOG = os.environ.get("ICEBERG_CATALOG", "tourismpay")
ICEBERG_NAMESPACE = os.environ.get("ICEBERG_NAMESPACE", "analytics")

_trino_client = None


def _get_trino():
    """Get Trino client for query execution."""
    global _trino_client
    if _trino_client is not None:
        return _trino_client
    if not TRINO_URL:
        return None
    try:
        import trino.dbapi

        _trino_client = trino.dbapi.connect(
            host=TRINO_URL.split("://")[-1].split(":")[0],
            port=int(TRINO_URL.split(":")[-1]) if ":" in TRINO_URL.split("://")[-1] else 8080,
            user=os.environ.get("TRINO_USER", "tourismpay"),
            catalog=ICEBERG_CATALOG,
            schema=ICEBERG_NAMESPACE,
        )
        logger.info("Trino connected: %s", TRINO_URL)
        return _trino_client
    except Exception as e:
        logger.warning("Trino connection failed: %s", e)
        return None


# ─── Iceberg Table Management (via REST Catalog) ─────────────────────────────

async def create_iceberg_table(table_name: str, schema: dict[str, Any]) -> bool:
    """Create an Iceberg table via the REST catalog API."""
    if not LAKEHOUSE_URL:
        return False
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{LAKEHOUSE_URL}/v1/{ICEBERG_CATALOG}/namespaces/{ICEBERG_NAMESPACE}/tables",
                json={
                    "name": table_name,
                    "schema": schema,
                    "partition-spec": {"fields": [
                        {"source-id": 1, "field-id": 1000, "name": "date_partition", "transform": "day"},
                    ]},
                    "properties": {
                        "write.format.default": "parquet",
                        "write.metadata.compression-codec": "gzip",
                    },
                },
            )
            return resp.status_code < 400
    except Exception as e:
        logger.warning("Create Iceberg table %s failed: %s", table_name, e)
        return False


# ─── Analytics Queries ────────────────────────────────────────────────────────

def query_transaction_summary(
    start_date: str,
    end_date: str,
    corridor: Optional[str] = None,
) -> Optional[list[dict[str, Any]]]:
    """Query transaction summary from the lakehouse."""
    conn = _get_trino()
    if conn is None:
        return None

    try:
        cursor = conn.cursor()
        query = """
            SELECT
                date_trunc('day', created_at) as day,
                corridor,
                COUNT(*) as tx_count,
                SUM(amount) as total_amount,
                AVG(amount) as avg_amount,
                SUM(fee_amount) as total_fees
            FROM transactions
            WHERE created_at BETWEEN TIMESTAMP '%s' AND TIMESTAMP '%s'
        """ % (start_date, end_date)

        if corridor:
            query += f" AND corridor = '{corridor}'"
        query += " GROUP BY 1, 2 ORDER BY 1, 2"

        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        logger.warning("Transaction summary query failed: %s", e)
        return None


def query_fx_aggregations(
    start_date: str,
    end_date: str,
) -> Optional[list[dict[str, Any]]]:
    """Query FX rate aggregations from the lakehouse."""
    conn = _get_trino()
    if conn is None:
        return None

    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                currency_pair,
                date_trunc('hour', timestamp) as hour,
                AVG(rate) as avg_rate,
                MIN(rate) as min_rate,
                MAX(rate) as max_rate,
                STDDEV(rate) as rate_volatility
            FROM fx_rates
            WHERE timestamp BETWEEN TIMESTAMP '%s' AND TIMESTAMP '%s'
            GROUP BY 1, 2
            ORDER BY 1, 2
        """ % (start_date, end_date))
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        logger.warning("FX aggregation query failed: %s", e)
        return None


def query_fraud_patterns(
    lookback_days: int = 30,
) -> Optional[list[dict[str, Any]]]:
    """Analyze fraud patterns from the lakehouse."""
    conn = _get_trino()
    if conn is None:
        return None

    try:
        cursor = conn.cursor()
        cutoff = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()
        cursor.execute("""
            SELECT
                corridor,
                COUNT(*) as alert_count,
                AVG(risk_score) as avg_risk_score,
                SUM(CASE WHEN is_confirmed THEN 1 ELSE 0 END) as confirmed_fraud,
                SUM(amount) as total_flagged_amount
            FROM fraud_alerts
            WHERE created_at > TIMESTAMP '%s'
            GROUP BY corridor
            ORDER BY alert_count DESC
        """ % cutoff)
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except Exception as e:
        logger.warning("Fraud pattern query failed: %s", e)
        return None


# ─── ETL Jobs ─────────────────────────────────────────────────────────────────

async def run_daily_etl(date: Optional[str] = None) -> dict[str, Any]:
    """
    Run the daily ETL job to materialize analytics tables.
    Extracts from PostgreSQL, transforms, and loads into Iceberg tables.
    """
    target_date = date or datetime.utcnow().strftime("%Y-%m-%d")
    results = {"date": target_date, "tables_updated": [], "errors": []}

    conn = _get_trino()
    if conn is None:
        results["errors"].append("Trino not available")
        return results

    etl_queries = [
        ("daily_transaction_summary", """
            INSERT INTO daily_transaction_summary
            SELECT
                DATE '%s' as report_date,
                corridor,
                COUNT(*) as tx_count,
                SUM(amount) as total_amount,
                AVG(amount) as avg_amount,
                SUM(fee_amount) as total_fees,
                COUNT(DISTINCT sender_id) as unique_senders,
                COUNT(DISTINCT recipient_id) as unique_recipients
            FROM transactions
            WHERE DATE(created_at) = DATE '%s'
            GROUP BY corridor
        """ % (target_date, target_date)),
        ("daily_fx_summary", """
            INSERT INTO daily_fx_summary
            SELECT
                DATE '%s' as report_date,
                currency_pair,
                AVG(rate) as avg_rate,
                MIN(rate) as min_rate,
                MAX(rate) as max_rate,
                STDDEV(rate) as volatility,
                COUNT(*) as data_points
            FROM fx_rates
            WHERE DATE(timestamp) = DATE '%s'
            GROUP BY currency_pair
        """ % (target_date, target_date)),
    ]

    cursor = conn.cursor()
    for table_name, query in etl_queries:
        try:
            cursor.execute(query)
            results["tables_updated"].append(table_name)
        except Exception as e:
            results["errors"].append(f"{table_name}: {e}")
            logger.warning("ETL for %s failed: %s", table_name, e)

    return results


def is_lakehouse_enabled() -> bool:
    """Check if Lakehouse is configured."""
    return bool(LAKEHOUSE_URL) or bool(TRINO_URL)

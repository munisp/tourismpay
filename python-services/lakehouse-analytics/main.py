"""TourismPay Lakehouse Analytics Service (Python)

Data lakehouse analytics engine providing materialized views, ETL pipelines,
and OLAP queries for the TourismPay platform. Processes streaming data from
Fluvio and batch data from PostgreSQL.
"""

import os
import json
import time
import uuid
import statistics
from datetime import datetime, timedelta
from typing import Any
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading


# ─── Configuration ───────────────────────────────────────────────────────────

PORT = int(os.getenv("PORT", "8121"))

# ─── Data Models ─────────────────────────────────────────────────────────────

tables: dict[str, dict] = {}
materialized_views: dict[str, dict] = {}
etl_pipelines: dict[str, dict] = {}
query_history: list[dict] = []
stats = {
    "totalTables": 0,
    "totalRows": 0,
    "totalViews": 0,
    "totalQueries": 0,
    "totalPipelines": 0,
    "storageBytes": 0,
    "avgQueryTimeMs": 0.0,
}
lock = threading.Lock()


def init_lakehouse():
    """Initialize the lakehouse with tables, views, and pipelines."""

    # ─── Tables (Delta Lake format simulation) ───────────────────────────
    tables["fact_transactions"] = {
        "schema": {
            "columns": [
                {"name": "transaction_id", "type": "string", "nullable": False},
                {"name": "amount", "type": "decimal(18,2)", "nullable": False},
                {"name": "currency", "type": "string", "nullable": False},
                {"name": "merchant_id", "type": "string", "nullable": False},
                {"name": "tourist_id", "type": "string", "nullable": True},
                {"name": "payment_method", "type": "string", "nullable": False},
                {"name": "status", "type": "string", "nullable": False},
                {"name": "country", "type": "string", "nullable": False},
                {"name": "created_at", "type": "timestamp", "nullable": False},
                {"name": "settled_at", "type": "timestamp", "nullable": True},
                {"name": "fee_amount", "type": "decimal(18,2)", "nullable": True},
                {"name": "exchange_rate", "type": "decimal(18,6)", "nullable": True},
            ],
            "partitionBy": ["country", "created_at"],
        },
        "rows": [
            {"transaction_id": "tx-001", "amount": 150.00, "currency": "USD", "merchant_id": "m-001", "tourist_id": "t-001", "payment_method": "card", "status": "completed", "country": "KE", "created_at": "2026-05-01", "fee_amount": 4.50, "exchange_rate": 1.0},
            {"transaction_id": "tx-002", "amount": 5500.00, "currency": "KES", "merchant_id": "m-002", "tourist_id": "t-002", "payment_method": "mpesa", "status": "completed", "country": "KE", "created_at": "2026-05-01", "fee_amount": 55.00, "exchange_rate": 152.30},
            {"transaction_id": "tx-003", "amount": 320.00, "currency": "USD", "merchant_id": "m-003", "tourist_id": "t-003", "payment_method": "card", "status": "completed", "country": "TZ", "created_at": "2026-05-01", "fee_amount": 9.60, "exchange_rate": 1.0},
            {"transaction_id": "tx-004", "amount": 75.00, "currency": "GHS", "merchant_id": "m-004", "tourist_id": "t-001", "payment_method": "wallet", "status": "completed", "country": "GH", "created_at": "2026-05-01", "fee_amount": 1.50, "exchange_rate": 15.20},
            {"transaction_id": "tx-005", "amount": 85000.00, "currency": "NGN", "merchant_id": "m-005", "tourist_id": "t-004", "payment_method": "card", "status": "completed", "country": "NG", "created_at": "2026-05-01", "fee_amount": 2550.00, "exchange_rate": 1550.00},
            {"transaction_id": "tx-006", "amount": 210.00, "currency": "USD", "merchant_id": "m-001", "tourist_id": "t-005", "payment_method": "card", "status": "completed", "country": "KE", "created_at": "2026-04-30", "fee_amount": 6.30, "exchange_rate": 1.0},
            {"transaction_id": "tx-007", "amount": 180.00, "currency": "USD", "merchant_id": "m-003", "tourist_id": "t-006", "payment_method": "wallet", "status": "completed", "country": "TZ", "created_at": "2026-04-30", "fee_amount": 5.40, "exchange_rate": 1.0},
        ],
        "metadata": {"format": "delta", "version": 3, "numFiles": 7, "sizeBytes": 4200},
    }

    tables["dim_merchants"] = {
        "schema": {
            "columns": [
                {"name": "merchant_id", "type": "string", "nullable": False},
                {"name": "name", "type": "string", "nullable": False},
                {"name": "category", "type": "string", "nullable": False},
                {"name": "country", "type": "string", "nullable": False},
                {"name": "city", "type": "string", "nullable": False},
                {"name": "onboarded_at", "type": "date", "nullable": False},
                {"name": "status", "type": "string", "nullable": False},
                {"name": "tier", "type": "string", "nullable": False},
            ],
        },
        "rows": [
            {"merchant_id": "m-001", "name": "Safari Lodge Nairobi", "category": "accommodation", "country": "KE", "city": "Nairobi", "onboarded_at": "2025-06-15", "status": "active", "tier": "gold"},
            {"merchant_id": "m-002", "name": "Mama Oliech Restaurant", "category": "restaurant", "country": "KE", "city": "Nairobi", "onboarded_at": "2025-08-01", "status": "active", "tier": "silver"},
            {"merchant_id": "m-003", "name": "Zanzibar Beach Resort", "category": "resort", "country": "TZ", "city": "Zanzibar", "onboarded_at": "2025-09-10", "status": "active", "tier": "gold"},
            {"merchant_id": "m-004", "name": "Accra Art Gallery", "category": "retail", "country": "GH", "city": "Accra", "onboarded_at": "2025-10-20", "status": "active", "tier": "bronze"},
            {"merchant_id": "m-005", "name": "Lagos Tour Operators", "category": "tours", "country": "NG", "city": "Lagos", "onboarded_at": "2025-11-05", "status": "active", "tier": "silver"},
        ],
        "metadata": {"format": "delta", "version": 1, "numFiles": 5, "sizeBytes": 1800},
    }

    tables["dim_countries"] = {
        "schema": {
            "columns": [
                {"name": "code", "type": "string", "nullable": False},
                {"name": "name", "type": "string", "nullable": False},
                {"name": "currency", "type": "string", "nullable": False},
                {"name": "region", "type": "string", "nullable": False},
            ],
        },
        "rows": [
            {"code": "KE", "name": "Kenya", "currency": "KES", "region": "East Africa"},
            {"code": "TZ", "name": "Tanzania", "currency": "TZS", "region": "East Africa"},
            {"code": "UG", "name": "Uganda", "currency": "UGX", "region": "East Africa"},
            {"code": "GH", "name": "Ghana", "currency": "GHS", "region": "West Africa"},
            {"code": "NG", "name": "Nigeria", "currency": "NGN", "region": "West Africa"},
            {"code": "ZA", "name": "South Africa", "currency": "ZAR", "region": "Southern Africa"},
            {"code": "RW", "name": "Rwanda", "currency": "RWF", "region": "East Africa"},
            {"code": "ET", "name": "Ethiopia", "currency": "ETB", "region": "East Africa"},
        ],
        "metadata": {"format": "delta", "version": 1, "numFiles": 1, "sizeBytes": 600},
    }

    # ─── Materialized Views ──────────────────────────────────────────────
    materialized_views["mv_daily_revenue"] = {
        "query": "SELECT country, currency, DATE(created_at) as date, SUM(amount) as total, COUNT(*) as txn_count FROM fact_transactions GROUP BY country, currency, date",
        "refresh_interval": "15min",
        "last_refreshed": datetime.utcnow().isoformat() + "Z",
        "data": [
            {"country": "KE", "currency": "USD", "date": "2026-05-01", "total": 150.00, "txn_count": 1},
            {"country": "KE", "currency": "KES", "date": "2026-05-01", "total": 5500.00, "txn_count": 1},
            {"country": "TZ", "currency": "USD", "date": "2026-05-01", "total": 320.00, "txn_count": 1},
            {"country": "GH", "currency": "GHS", "date": "2026-05-01", "total": 75.00, "txn_count": 1},
            {"country": "NG", "currency": "NGN", "date": "2026-05-01", "total": 85000.00, "txn_count": 1},
            {"country": "KE", "currency": "USD", "date": "2026-04-30", "total": 210.00, "txn_count": 1},
            {"country": "TZ", "currency": "USD", "date": "2026-04-30", "total": 180.00, "txn_count": 1},
        ],
    }

    materialized_views["mv_merchant_performance"] = {
        "query": "SELECT m.merchant_id, m.name, m.category, m.country, COUNT(t.transaction_id) as txn_count, SUM(t.amount) as total_revenue, AVG(t.amount) as avg_txn FROM fact_transactions t JOIN dim_merchants m ON t.merchant_id = m.merchant_id GROUP BY m.merchant_id",
        "refresh_interval": "1h",
        "last_refreshed": datetime.utcnow().isoformat() + "Z",
        "data": [
            {"merchant_id": "m-001", "name": "Safari Lodge Nairobi", "category": "accommodation", "country": "KE", "txn_count": 2, "total_revenue": 360.00, "avg_txn": 180.00},
            {"merchant_id": "m-002", "name": "Mama Oliech Restaurant", "category": "restaurant", "country": "KE", "txn_count": 1, "total_revenue": 5500.00, "avg_txn": 5500.00},
            {"merchant_id": "m-003", "name": "Zanzibar Beach Resort", "category": "resort", "country": "TZ", "txn_count": 2, "total_revenue": 500.00, "avg_txn": 250.00},
            {"merchant_id": "m-004", "name": "Accra Art Gallery", "category": "retail", "country": "GH", "txn_count": 1, "total_revenue": 75.00, "avg_txn": 75.00},
            {"merchant_id": "m-005", "name": "Lagos Tour Operators", "category": "tours", "country": "NG", "txn_count": 1, "total_revenue": 85000.00, "avg_txn": 85000.00},
        ],
    }

    materialized_views["mv_country_analytics"] = {
        "query": "SELECT c.code, c.name, c.region, COUNT(t.transaction_id) as txn_count, COUNT(DISTINCT t.merchant_id) as merchant_count, SUM(t.fee_amount) as total_fees FROM fact_transactions t JOIN dim_countries c ON t.country = c.code GROUP BY c.code",
        "refresh_interval": "30min",
        "last_refreshed": datetime.utcnow().isoformat() + "Z",
        "data": [
            {"code": "KE", "name": "Kenya", "region": "East Africa", "txn_count": 3, "merchant_count": 2, "total_fees": 65.80},
            {"code": "TZ", "name": "Tanzania", "region": "East Africa", "txn_count": 2, "merchant_count": 1, "total_fees": 15.00},
            {"code": "GH", "name": "Ghana", "region": "West Africa", "txn_count": 1, "merchant_count": 1, "total_fees": 1.50},
            {"code": "NG", "name": "Nigeria", "region": "West Africa", "txn_count": 1, "merchant_count": 1, "total_fees": 2550.00},
        ],
    }

    materialized_views["mv_payment_method_breakdown"] = {
        "query": "SELECT payment_method, COUNT(*) as count, SUM(amount) as total, AVG(amount) as avg_amount FROM fact_transactions GROUP BY payment_method",
        "refresh_interval": "15min",
        "last_refreshed": datetime.utcnow().isoformat() + "Z",
        "data": [
            {"payment_method": "card", "count": 4, "total": 85555.00, "avg_amount": 21388.75},
            {"payment_method": "mpesa", "count": 1, "total": 5500.00, "avg_amount": 5500.00},
            {"payment_method": "wallet", "count": 2, "total": 255.00, "avg_amount": 127.50},
        ],
    }

    materialized_views["mv_fee_analysis"] = {
        "query": "SELECT country, payment_method, SUM(fee_amount) as total_fees, AVG(fee_amount/amount * 100) as avg_fee_pct FROM fact_transactions GROUP BY country, payment_method",
        "refresh_interval": "1h",
        "last_refreshed": datetime.utcnow().isoformat() + "Z",
        "data": [
            {"country": "KE", "payment_method": "card", "total_fees": 10.80, "avg_fee_pct": 3.0},
            {"country": "KE", "payment_method": "mpesa", "total_fees": 55.00, "avg_fee_pct": 1.0},
            {"country": "TZ", "payment_method": "card", "total_fees": 9.60, "avg_fee_pct": 3.0},
            {"country": "TZ", "payment_method": "wallet", "total_fees": 5.40, "avg_fee_pct": 3.0},
            {"country": "GH", "payment_method": "wallet", "total_fees": 1.50, "avg_fee_pct": 2.0},
            {"country": "NG", "payment_method": "card", "total_fees": 2550.00, "avg_fee_pct": 3.0},
        ],
    }

    # ─── ETL Pipelines ───────────────────────────────────────────────────
    etl_pipelines["postgres-to-lakehouse"] = {
        "source": "postgresql://ndsep_user@localhost:5432/ndsep_db",
        "target": "fact_transactions",
        "schedule": "*/15 * * * *",
        "status": "active",
        "lastRun": datetime.utcnow().isoformat() + "Z",
        "rowsProcessed": 7,
        "avgDurationMs": 1200,
    }

    etl_pipelines["fluvio-stream-ingest"] = {
        "source": "fluvio://transactions",
        "target": "fact_transactions",
        "schedule": "continuous",
        "status": "active",
        "lastRun": datetime.utcnow().isoformat() + "Z",
        "rowsProcessed": 0,
        "avgDurationMs": 50,
    }

    etl_pipelines["merchant-dimension-sync"] = {
        "source": "postgresql://ndsep_user@localhost:5432/ndsep_db",
        "target": "dim_merchants",
        "schedule": "0 */6 * * *",
        "status": "active",
        "lastRun": datetime.utcnow().isoformat() + "Z",
        "rowsProcessed": 5,
        "avgDurationMs": 800,
    }

    stats["totalTables"] = len(tables)
    stats["totalRows"] = sum(len(t["rows"]) for t in tables.values())
    stats["totalViews"] = len(materialized_views)
    stats["totalPipelines"] = len(etl_pipelines)
    stats["storageBytes"] = sum(t["metadata"]["sizeBytes"] for t in tables.values())


# ─── Query Engine ────────────────────────────────────────────────────────────

def execute_query(query_str: str) -> dict:
    """Simple SQL-like query execution on lakehouse tables."""
    start = time.time()
    query_lower = query_str.strip().lower()

    # Parse simple SELECT queries
    if query_lower.startswith("select"):
        # Try to extract table name
        table_name = None
        for tname in tables:
            if tname in query_lower:
                table_name = tname
                break

        if not table_name:
            return {"error": "Table not found in query"}

        rows = tables[table_name]["rows"]

        # Handle WHERE clause
        if "where" in query_lower:
            where_idx = query_lower.index("where")
            where_clause = query_str[where_idx + 6:].strip()
            # Simple equality filter: column = 'value'
            if "=" in where_clause:
                parts = where_clause.split("=", 1)
                col = parts[0].strip().strip("'\"")
                val = parts[1].strip().strip("'\"").rstrip(";")
                rows = [r for r in rows if str(r.get(col, "")) == val]

        # Handle GROUP BY with aggregations
        if "group by" in query_lower:
            gb_idx = query_lower.index("group by")
            gb_col = query_str[gb_idx + 9:].strip().split(",")[0].strip().rstrip(";")
            groups: dict[str, list] = {}
            for row in rows:
                key = str(row.get(gb_col, "unknown"))
                if key not in groups:
                    groups[key] = []
                groups[key].append(row)

            result_rows = []
            for key, group_rows in groups.items():
                result_row = {gb_col: key, "count": len(group_rows)}
                # Detect SUM/AVG in select
                if "sum(" in query_lower:
                    for col in tables[table_name]["schema"]["columns"]:
                        if col["type"].startswith("decimal") or col["type"] == "float":
                            result_row[f"sum_{col['name']}"] = sum(r.get(col["name"], 0) for r in group_rows if isinstance(r.get(col["name"]), (int, float)))
                if "avg(" in query_lower:
                    for col in tables[table_name]["schema"]["columns"]:
                        if col["type"].startswith("decimal") or col["type"] == "float":
                            vals = [r[col["name"]] for r in group_rows if col["name"] in r and isinstance(r[col["name"]], (int, float))]
                            result_row[f"avg_{col['name']}"] = statistics.mean(vals) if vals else 0
                result_rows.append(result_row)
            rows = result_rows

        # Handle LIMIT
        limit = 100
        if "limit" in query_lower:
            limit_idx = query_lower.index("limit")
            try:
                limit = int(query_str[limit_idx + 6:].strip().split()[0].rstrip(";"))
            except (ValueError, IndexError):
                pass
        rows = rows[:limit]

        elapsed_ms = (time.time() - start) * 1000

        with lock:
            stats["totalQueries"] += 1
            stats["avgQueryTimeMs"] = (
                (stats["avgQueryTimeMs"] * (stats["totalQueries"] - 1) + elapsed_ms)
                / stats["totalQueries"]
            )
            query_history.append({
                "query": query_str,
                "table": table_name,
                "rowsReturned": len(rows),
                "durationMs": round(elapsed_ms, 2),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            })
            if len(query_history) > 100:
                del query_history[:len(query_history) - 100]

        return {
            "columns": list(rows[0].keys()) if rows else [],
            "rows": rows,
            "rowCount": len(rows),
            "took": round(elapsed_ms, 2),
        }
    else:
        return {"error": "Only SELECT queries are supported"}


# ─── HTTP Handler ────────────────────────────────────────────────────────────

class LakehouseHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._json_response(200, {
                "status": "healthy",
                "service": "TourismPay Lakehouse Analytics (Python)",
                "version": "1.0.0",
                "tables": len(tables),
                "views": len(materialized_views),
                "pipelines": len(etl_pipelines),
                "timestamp": datetime.utcnow().isoformat() + "Z",
            })
        elif path == "/api/v1/tables":
            result = []
            for name, table in tables.items():
                result.append({
                    "name": name,
                    "rowCount": len(table["rows"]),
                    "schema": table["schema"],
                    "metadata": table["metadata"],
                })
            self._json_response(200, {"tables": result, "total": len(result)})
        elif path.startswith("/api/v1/tables/") and "/rows" not in path:
            table_name = path.split("/")[4]
            if table_name in tables:
                t = tables[table_name]
                self._json_response(200, {
                    "name": table_name,
                    "rowCount": len(t["rows"]),
                    "schema": t["schema"],
                    "metadata": t["metadata"],
                })
            else:
                self._json_response(404, {"error": "table not found"})
        elif path.startswith("/api/v1/tables/") and "/rows" in path:
            table_name = path.split("/")[4]
            params = parse_qs(parsed.query)
            limit = int(params.get("limit", ["50"])[0])
            offset = int(params.get("offset", ["0"])[0])
            if table_name in tables:
                rows = tables[table_name]["rows"][offset:offset + limit]
                self._json_response(200, {"rows": rows, "total": len(tables[table_name]["rows"])})
            else:
                self._json_response(404, {"error": "table not found"})
        elif path == "/api/v1/views":
            result = []
            for name, view in materialized_views.items():
                result.append({
                    "name": name,
                    "query": view["query"],
                    "refreshInterval": view["refresh_interval"],
                    "lastRefreshed": view["last_refreshed"],
                    "rowCount": len(view["data"]),
                })
            self._json_response(200, {"views": result, "total": len(result)})
        elif path.startswith("/api/v1/views/"):
            view_name = path.split("/")[4]
            if view_name in materialized_views:
                self._json_response(200, materialized_views[view_name])
            else:
                self._json_response(404, {"error": "view not found"})
        elif path == "/api/v1/pipelines":
            self._json_response(200, {"pipelines": list(etl_pipelines.values()), "total": len(etl_pipelines)})
        elif path == "/api/v1/stats":
            self._json_response(200, stats)
        elif path == "/api/v1/query-history":
            self._json_response(200, {"queries": query_history, "total": len(query_history)})
        else:
            self._json_response(404, {"error": "not found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}

        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/v1/query":
            query_str = body.get("query", "")
            if not query_str:
                self._json_response(400, {"error": "query is required"})
                return
            result = execute_query(query_str)
            self._json_response(200, result)

        elif path == "/api/v1/ingest":
            table_name = body.get("table", "")
            rows = body.get("rows", [])
            if table_name not in tables:
                self._json_response(404, {"error": f"table '{table_name}' not found"})
                return
            with lock:
                tables[table_name]["rows"].extend(rows)
                stats["totalRows"] += len(rows)
            self._json_response(201, {"ingested": len(rows), "table": table_name})

        elif path == "/api/v1/views/refresh":
            view_name = body.get("view", "")
            if view_name not in materialized_views:
                self._json_response(404, {"error": "view not found"})
                return
            with lock:
                materialized_views[view_name]["last_refreshed"] = datetime.utcnow().isoformat() + "Z"
            self._json_response(200, {"status": "refreshed", "view": view_name})

        elif path == "/api/v1/pipelines/trigger":
            pipeline_name = body.get("pipeline", "")
            if pipeline_name not in etl_pipelines:
                self._json_response(404, {"error": "pipeline not found"})
                return
            with lock:
                etl_pipelines[pipeline_name]["lastRun"] = datetime.utcnow().isoformat() + "Z"
            self._json_response(200, {"status": "triggered", "pipeline": pipeline_name})

        else:
            self._json_response(404, {"error": "not found"})

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def _json_response(self, status: int, data: Any):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id")

    def log_message(self, format, *args):
        pass


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_lakehouse()
    server = HTTPServer(("0.0.0.0", PORT), LakehouseHandler)
    print(f"[Lakehouse Analytics] Starting on port {PORT}")
    print(f"[Lakehouse Analytics] {len(tables)} tables, {len(materialized_views)} views, {len(etl_pipelines)} pipelines")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()

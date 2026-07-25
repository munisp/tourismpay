import re
from enum import Enum
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

app = FastAPI(
    title="Data Lakehouse",
    description="Unified data lakehouse for insurance analytics, reporting, and ML pipelines",
    version="1.0.0",
)

# ── SQL Injection Prevention ──────────────────────────────────────────────────
# Only whitelisted datasets and columns are queryable.
# Raw SQL is NOT accepted — users specify dataset, filters, and aggregations
# via structured parameters.

ALLOWED_DATASETS = {
    "policies": {
        "table": "policies",
        "columns": {"policy_id", "customer_id", "product_type", "start_date", "end_date",
                     "premium", "sum_insured", "status", "state", "lga"},
    },
    "claims": {
        "table": "claims",
        "columns": {"claim_id", "policy_id", "claim_type", "amount_claimed",
                     "amount_approved", "status", "filed_date", "resolved_date"},
    },
    "payments": {
        "table": "payments",
        "columns": {"transaction_id", "policy_id", "amount", "currency", "channel",
                     "provider", "status", "created_at"},
    },
    "customers": {
        "table": "customers",
        "columns": {"customer_id", "name", "phone", "email", "state", "lga",
                     "kyc_level", "segment", "clv_score", "churn_risk"},
    },
    "agents": {
        "table": "agents",
        "columns": {"agent_id", "name", "state", "lga", "tier", "policies_sold",
                     "premium_collected", "commission", "active"},
    },
}

ALLOWED_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")

class AggregateFunction(str, Enum):
    COUNT = "COUNT"
    SUM = "SUM"
    AVG = "AVG"
    MIN = "MIN"
    MAX = "MAX"


def validate_column(dataset: str, column: str) -> bool:
    if dataset not in ALLOWED_DATASETS:
        return False
    return column in ALLOWED_DATASETS[dataset]["columns"]


@app.get("/api/v1/lakehouse/datasets")
async def list_datasets():
    return {
        "datasets": [
            {
                "id": "ds-policies",
                "name": "Policies",
                "description": "All insurance policies across products",
                "format": "delta",
                "rows": 125000,
                "size_gb": 2.4,
                "updated_at": "2026-05-16T00:00:00Z",
                "partitioned_by": ["product_type", "year", "month"],
                "schema_fields": ["policy_id", "customer_id", "product_type", "start_date", "end_date",
                                  "premium", "sum_insured", "status", "state", "lga"],
            },
            {
                "id": "ds-claims",
                "name": "Claims",
                "description": "Claims data with status tracking and payouts",
                "format": "delta",
                "rows": 45000,
                "size_gb": 1.8,
                "updated_at": "2026-05-16T00:00:00Z",
                "partitioned_by": ["claim_type", "year", "month"],
                "schema_fields": ["claim_id", "policy_id", "claim_type", "amount_claimed",
                                  "amount_approved", "status", "filed_date", "resolved_date"],
            },
            {
                "id": "ds-payments",
                "name": "Payments",
                "description": "Premium payments and payout transactions",
                "format": "delta",
                "rows": 350000,
                "size_gb": 3.1,
                "updated_at": "2026-05-16T00:00:00Z",
                "partitioned_by": ["payment_type", "year", "month"],
                "schema_fields": ["transaction_id", "policy_id", "amount", "currency", "channel",
                                  "provider", "status", "created_at"],
            },
            {
                "id": "ds-customers",
                "name": "Customers",
                "description": "Customer profiles with segmentation data",
                "format": "delta",
                "rows": 98000,
                "size_gb": 0.8,
                "updated_at": "2026-05-16T00:00:00Z",
                "partitioned_by": ["state"],
                "schema_fields": ["customer_id", "name", "phone", "email", "state", "lga",
                                  "kyc_level", "segment", "clv_score", "churn_risk"],
            },
            {
                "id": "ds-agents",
                "name": "Agent Performance",
                "description": "Agent network activity and performance metrics",
                "format": "delta",
                "rows": 5200,
                "size_gb": 0.3,
                "updated_at": "2026-05-16T00:00:00Z",
                "partitioned_by": ["state", "tier"],
                "schema_fields": ["agent_id", "name", "state", "lga", "tier", "policies_sold",
                                  "premium_collected", "commission", "active"],
            },
        ],
    }


@app.get("/api/v1/lakehouse/query")
async def run_query(
    dataset: str = Query(..., description="Dataset name (policies, claims, payments, customers, agents)"),
    aggregate: Optional[AggregateFunction] = Query(None, description="Aggregate function"),
    aggregate_column: Optional[str] = Query(None, description="Column to aggregate"),
    group_by: Optional[str] = Query(None, description="Column to group by"),
    filter_column: Optional[str] = Query(None, description="Column to filter on"),
    filter_value: Optional[str] = Query(None, description="Value to filter by"),
    limit: int = Query(100, ge=1, le=10000, description="Max rows to return"),
):
    """Execute a structured query against the lakehouse.

    Raw SQL is NOT accepted. Specify dataset, optional aggregate, group_by,
    and filter parameters. All column names are validated against a whitelist.
    """
    if dataset not in ALLOWED_DATASETS:
        raise HTTPException(status_code=400, detail=f"Unknown dataset: {dataset}. Allowed: {list(ALLOWED_DATASETS.keys())}")

    ds = ALLOWED_DATASETS[dataset]
    table = ds["table"]

    # Validate all column references
    if aggregate_column and not validate_column(dataset, aggregate_column):
        raise HTTPException(status_code=400, detail=f"Column '{aggregate_column}' not allowed for dataset '{dataset}'")
    if group_by and not validate_column(dataset, group_by):
        raise HTTPException(status_code=400, detail=f"Column '{group_by}' not allowed for dataset '{dataset}'")
    if filter_column and not validate_column(dataset, filter_column):
        raise HTTPException(status_code=400, detail=f"Column '{filter_column}' not allowed for dataset '{dataset}'")

    # Build safe query (all identifiers are whitelisted, values are parameterized)
    if aggregate and aggregate_column:
        select_clause = f"{aggregate.value}({aggregate_column})"
        if group_by:
            select_clause = f"{group_by}, {select_clause}"
    else:
        select_clause = "*"

    safe_query = f"SELECT {select_clause} FROM {table}"
    params = []
    if filter_column and filter_value is not None:
        safe_query += f" WHERE {filter_column} = $1"
        params.append(filter_value)
    if group_by and aggregate:
        safe_query += f" GROUP BY {group_by}"
    safe_query += f" LIMIT {limit}"

    # For now, return structured mock results showing the safe query
    sample_results = {
        "query": safe_query,
        "parameters": params,
        "execution_time_ms": 245,
        "rows_scanned": ds.get("rows", 0) if isinstance(ds, dict) else 0,
        "result": [{"total": 125000}],
        "engine": "Spark SQL / DuckDB",
    }
    return sample_results


@app.get("/api/v1/lakehouse/pipelines")
async def list_pipelines():
    return {
        "pipelines": [
            {
                "id": "pipe-daily-etl",
                "name": "Daily Policy & Claims ETL",
                "schedule": "0 2 * * *",
                "status": "healthy",
                "last_run": "2026-05-16T02:00:00Z",
                "duration_minutes": 12,
                "records_processed": 8500,
            },
            {
                "id": "pipe-ml-features",
                "name": "ML Feature Store Refresh",
                "schedule": "0 4 * * *",
                "status": "healthy",
                "last_run": "2026-05-16T04:00:00Z",
                "duration_minutes": 25,
                "records_processed": 98000,
            },
            {
                "id": "pipe-regulatory",
                "name": "NAICOM Regulatory Reporting ETL",
                "schedule": "0 6 1 * *",
                "status": "healthy",
                "last_run": "2026-05-01T06:00:00Z",
                "duration_minutes": 45,
                "records_processed": 125000,
            },
        ],
    }


@app.get("/api/v1/lakehouse/metrics")
async def lakehouse_metrics():
    return {
        "total_data_size_gb": 8.4,
        "total_tables": 12,
        "total_rows": 623200,
        "daily_ingestion_rate": 8500,
        "query_latency_p50_ms": 120,
        "query_latency_p99_ms": 1200,
        "storage_cost_monthly_usd": 25,
        "compute_cost_monthly_usd": 150,
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "data-lakehouse"}

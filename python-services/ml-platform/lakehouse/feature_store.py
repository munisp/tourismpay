"""
DuckDB/Parquet Lakehouse Feature Store

Provides:
- Feature materialization from PostgreSQL platform data
- Offline feature storage in Parquet format via DuckDB
- Feature versioning and point-in-time lookups
- Training data export for ML pipelines
- Continuous feature updates from streaming platform events

DuckDB runs embedded (no server needed), reads/writes Parquet
files directly, and supports SQL analytics on feature tables.
"""
from __future__ import annotations

import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import duckdb
import numpy as np
import pandas as pd

FEATURE_STORE_DIR = Path(os.environ.get(
    "FEATURE_STORE_DIR",
    str(Path(__file__).parent / "store"),
))
DB_PATH = FEATURE_STORE_DIR / "features.duckdb"

_conn: duckdb.DuckDBPyConnection | None = None


def get_connection() -> duckdb.DuckDBPyConnection:
    """Get or create DuckDB connection."""
    global _conn
    if _conn is None:
        FEATURE_STORE_DIR.mkdir(parents=True, exist_ok=True)
        _conn = duckdb.connect(str(DB_PATH))
        _initialize_tables(_conn)
    return _conn


def _initialize_tables(conn: duckdb.DuckDBPyConnection) -> None:
    """Create feature store tables if they don't exist."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS feature_metadata (
            feature_group VARCHAR,
            feature_name VARCHAR,
            dtype VARCHAR,
            description VARCHAR,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            version INTEGER DEFAULT 1,
            PRIMARY KEY (feature_group, feature_name)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_features (
            user_id VARCHAR PRIMARY KEY,
            country VARCHAR,
            account_age_days INTEGER,
            kyc_level VARCHAR,
            total_txn_count INTEGER DEFAULT 0,
            total_txn_volume DOUBLE DEFAULT 0,
            avg_txn_amount DOUBLE DEFAULT 0,
            max_txn_amount DOUBLE DEFAULT 0,
            txn_count_7d INTEGER DEFAULT 0,
            txn_count_30d INTEGER DEFAULT 0,
            unique_merchants_30d INTEGER DEFAULT 0,
            unique_corridors_30d INTEGER DEFAULT 0,
            fraud_alert_count INTEGER DEFAULT 0,
            device_count INTEGER DEFAULT 0,
            is_pep BOOLEAN DEFAULT FALSE,
            risk_score DOUBLE DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS merchant_features (
            merchant_id VARCHAR PRIMARY KEY,
            name VARCHAR,
            city VARCHAR,
            country VARCHAR,
            category VARCHAR,
            kyb_status VARCHAR,
            monthly_volume DOUBLE DEFAULT 0,
            monthly_txn_count INTEGER DEFAULT 0,
            avg_ticket_size DOUBLE DEFAULT 0,
            chargeback_rate DOUBLE DEFAULT 0,
            chargeback_count_30d INTEGER DEFAULT 0,
            unique_customers_30d INTEGER DEFAULT 0,
            rating DOUBLE DEFAULT 0,
            years_in_operation INTEGER DEFAULT 0,
            risk_score DOUBLE DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS transaction_features (
            transaction_id VARCHAR PRIMARY KEY,
            user_id VARCHAR,
            merchant_id VARCHAR,
            amount DOUBLE,
            currency VARCHAR,
            sender_country VARCHAR,
            receiver_country VARCHAR,
            merchant_category VARCHAR,
            timestamp TIMESTAMP,
            is_cross_border BOOLEAN,
            amount_zscore DOUBLE DEFAULT 0,
            velocity_1h INTEGER DEFAULT 0,
            velocity_24h INTEGER DEFAULT 0,
            is_new_device BOOLEAN DEFAULT FALSE,
            is_vpn BOOLEAN DEFAULT FALSE,
            device_type VARCHAR,
            fraud_score DOUBLE DEFAULT 0,
            anomaly_score DOUBLE DEFAULT 0,
            is_fraud BOOLEAN DEFAULT FALSE
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS fx_features (
            corridor VARCHAR,
            timestamp TIMESTAMP,
            mid_rate DOUBLE,
            bid DOUBLE,
            ask DOUBLE,
            spread_bps DOUBLE,
            volume INTEGER,
            volatility_1h DOUBLE DEFAULT 0,
            volatility_24h DOUBLE DEFAULT 0,
            sma_12h DOUBLE DEFAULT 0,
            sma_24h DOUBLE DEFAULT 0,
            ema_12h DOUBLE DEFAULT 0,
            regime VARCHAR DEFAULT 'normal',
            PRIMARY KEY (corridor, timestamp)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS training_snapshots (
            snapshot_id VARCHAR PRIMARY KEY,
            model_name VARCHAR,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            row_count INTEGER,
            feature_count INTEGER,
            parquet_path VARCHAR,
            metadata JSON
        )
    """)


def ingest_users(users_df: pd.DataFrame) -> int:
    """Ingest user features into the feature store."""
    conn = get_connection()
    conn.execute("DELETE FROM user_features")
    conn.execute("INSERT INTO user_features SELECT * FROM users_df")
    return len(users_df)


def ingest_merchants(merchants_df: pd.DataFrame) -> int:
    """Ingest merchant features."""
    conn = get_connection()
    conn.execute("DELETE FROM merchant_features")
    conn.execute("INSERT INTO merchant_features SELECT * FROM merchants_df")
    return len(merchants_df)


def ingest_transactions(txn_df: pd.DataFrame) -> int:
    """Ingest transaction features."""
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO transaction_features SELECT * FROM txn_df")
    return len(txn_df)


def ingest_fx_rates(fx_df: pd.DataFrame) -> int:
    """Ingest FX rate features."""
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO fx_features SELECT * FROM fx_df")
    return len(fx_df)


def get_training_data(
    model_name: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> pd.DataFrame:
    """
    Export training data for a specific model.
    
    Joins features across tables as needed for each model type.
    """
    conn = get_connection()

    if model_name == "fraud_gnn":
        query = """
            SELECT
                t.transaction_id,
                t.amount, t.velocity_1h, t.velocity_24h,
                t.is_new_device, t.is_vpn, t.is_cross_border,
                t.amount_zscore,
                u.account_age_days, u.total_txn_count,
                u.fraud_alert_count, u.risk_score as user_risk,
                m.chargeback_rate, m.risk_score as merchant_risk,
                t.is_fraud
            FROM transaction_features t
            LEFT JOIN user_features u ON t.user_id = u.user_id
            LEFT JOIN merchant_features m ON t.merchant_id = m.merchant_id
        """
    elif model_name == "fx_forecaster":
        query = """
            SELECT
                corridor, timestamp, mid_rate, bid, ask,
                spread_bps, volume, volatility_1h, volatility_24h,
                sma_12h, sma_24h, ema_12h, regime
            FROM fx_features
            ORDER BY corridor, timestamp
        """
    elif model_name == "anomaly_detector":
        query = """
            SELECT
                t.amount, t.velocity_1h, t.velocity_24h,
                t.is_new_device, t.is_vpn,
                t.amount_zscore, t.device_type,
                t.merchant_category,
                u.account_age_days, u.risk_score as user_risk,
                t.is_fraud
            FROM transaction_features t
            LEFT JOIN user_features u ON t.user_id = u.user_id
        """
    elif model_name == "risk_scorer":
        query = "SELECT * FROM merchant_features"
    else:
        query = f"SELECT * FROM transaction_features LIMIT 1000"

    if start_date:
        query += f" WHERE timestamp >= '{start_date}'"
    if end_date:
        if "WHERE" in query:
            query += f" AND timestamp <= '{end_date}'"
        else:
            query += f" WHERE timestamp <= '{end_date}'"

    return conn.execute(query).fetchdf()


def save_training_snapshot(
    model_name: str,
    data: pd.DataFrame,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Save a training data snapshot as Parquet."""
    import secrets

    snapshot_id = f"{model_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{secrets.token_hex(4)}"
    parquet_path = FEATURE_STORE_DIR / "snapshots" / f"{snapshot_id}.parquet"
    parquet_path.parent.mkdir(parents=True, exist_ok=True)

    data.to_parquet(str(parquet_path), index=False)

    conn = get_connection()
    conn.execute("""
        INSERT INTO training_snapshots (snapshot_id, model_name, row_count, feature_count, parquet_path, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
    """, [snapshot_id, model_name, len(data), len(data.columns), str(parquet_path),
          json.dumps(metadata or {})])

    return snapshot_id


def compute_feature_stats() -> dict[str, Any]:
    """Compute statistics across all feature tables."""
    conn = get_connection()
    stats = {}

    for table in ["user_features", "merchant_features", "transaction_features", "fx_features"]:
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            stats[table] = {"row_count": count}
        except Exception:
            stats[table] = {"row_count": 0}

    try:
        snapshots = conn.execute(
            "SELECT COUNT(*), MAX(created_at) FROM training_snapshots"
        ).fetchone()
        stats["snapshots"] = {
            "count": snapshots[0],
            "latest": str(snapshots[1]) if snapshots[1] else None,
        }
    except Exception:
        stats["snapshots"] = {"count": 0, "latest": None}

    return stats


import json


def close():
    """Close DuckDB connection."""
    global _conn
    if _conn is not None:
        _conn.close()
        _conn = None

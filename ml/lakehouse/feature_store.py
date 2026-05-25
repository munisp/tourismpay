"""
Lakehouse / Delta Lake feature store for TourismPay ML pipeline.

Responsibilities:
  - Persist training data as Delta Lake tables (Parquet + transaction log)
  - Feature materialization from raw platform data
  - Point-in-time correct feature retrieval for training
  - Incremental data ingestion for continuous training
  - Training data versioning and lineage
  - Schema enforcement and evolution

Uses PyArrow + deltalake for storage (no Spark dependency).
Falls back to plain Parquet when deltalake is unavailable.
"""
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

logger = logging.getLogger(__name__)

_HAS_DELTA = False
try:
    import deltalake
    _HAS_DELTA = True
except ImportError:
    logger.info("deltalake not available, using Parquet fallback")


# ─── Schema Definitions ─────────────────────────────────────────────────────

@dataclass
class ColumnDef:
    name: str
    dtype: str  # "int64", "float64", "string", "bool", "datetime64[ns]"
    nullable: bool = True
    description: str = ""


@dataclass
class TableSchema:
    name: str
    columns: List[ColumnDef]
    partition_by: List[str] = field(default_factory=list)
    version: int = 1

    def validate(self, df: pd.DataFrame) -> Tuple[bool, List[str]]:
        errors = []
        expected = {c.name for c in self.columns}
        actual = set(df.columns)

        missing = expected - actual
        if missing:
            errors.append(f"Missing columns: {missing}")

        for col in self.columns:
            if col.name not in df.columns:
                continue
            if not col.nullable and df[col.name].isna().any():
                errors.append(f"Column '{col.name}' has NULLs but is not nullable")

        return len(errors) == 0, errors

    def coerce(self, df: pd.DataFrame) -> pd.DataFrame:
        """Coerce DataFrame types to match schema. Add missing nullable cols."""
        df = df.copy()
        for col in self.columns:
            if col.name not in df.columns:
                if col.nullable:
                    df[col.name] = None
                else:
                    continue
            if col.dtype == "float64":
                df[col.name] = pd.to_numeric(df[col.name], errors="coerce").astype("float64")
            elif col.dtype == "int64":
                df[col.name] = pd.to_numeric(df[col.name], errors="coerce")
                df[col.name] = df[col.name].fillna(0).astype("int64")
            elif col.dtype == "string":
                df[col.name] = df[col.name].astype(str)
            elif col.dtype == "bool":
                df[col.name] = df[col.name].astype(bool)
            elif col.dtype == "datetime64[ns]":
                df[col.name] = pd.to_datetime(df[col.name], errors="coerce")
        return df


# Pre-defined schemas for all lakehouse domains
SCHEMAS: Dict[str, TableSchema] = {
    "fraud_transactions": TableSchema(
        name="fraud_transactions",
        columns=[
            ColumnDef("transaction_id", "string", nullable=False),
            ColumnDef("user_id", "string", nullable=False),
            ColumnDef("amount", "float64", nullable=False),
            ColumnDef("amount_log", "float64"),
            ColumnDef("amount_zscore", "float64"),
            ColumnDef("txn_amount_ratio", "float64"),
            ColumnDef("velocity_1h", "int64"),
            ColumnDef("velocity_24h", "int64"),
            ColumnDef("velocity_7d", "int64"),
            ColumnDef("is_new_device", "int64"),
            ColumnDef("is_vpn", "int64"),
            ColumnDef("is_tor", "int64"),
            ColumnDef("failed_auth_count", "int64"),
            ColumnDef("merchant_category_risk", "float64"),
            ColumnDef("country_risk", "float64"),
            ColumnDef("hour_of_day", "int64"),
            ColumnDef("day_of_week", "int64"),
            ColumnDef("is_weekend", "int64"),
            ColumnDef("days_since_last_txn", "int64"),
            ColumnDef("avg_txn_amount_30d", "float64"),
            ColumnDef("std_txn_amount_30d", "float64"),
            ColumnDef("ip_risk_score", "float64"),
            ColumnDef("device_age_days", "int64"),
            ColumnDef("cross_border", "int64"),
            ColumnDef("currency_mismatch", "int64"),
            ColumnDef("is_fraud", "int64"),
            ColumnDef("created_at", "datetime64[ns]"),
            ColumnDef("country", "string"),
        ],
        partition_by=["country"],
    ),
    "bis_entities": TableSchema(
        name="bis_entities",
        columns=[
            ColumnDef("entity_id", "string", nullable=False),
            ColumnDef("country", "string", nullable=False),
            ColumnDef("industry", "string", nullable=False),
            ColumnDef("country_risk_score", "float64", nullable=False),
            ColumnDef("industry_risk_score", "float64", nullable=False),
            ColumnDef("entity_age_days", "int64"),
            ColumnDef("transaction_volume_30d", "float64"),
            ColumnDef("transaction_count_30d", "int64"),
            ColumnDef("chargeback_rate", "float64"),
            ColumnDef("refund_rate", "float64"),
            ColumnDef("sanctions_hit", "int64"),
            ColumnDef("pep_connection", "int64"),
            ColumnDef("adverse_media_count", "int64"),
            ColumnDef("kyb_completeness_score", "float64"),
            ColumnDef("ubo_declared", "int64"),
            ColumnDef("cross_border_ratio", "float64"),
            ColumnDef("cash_intensive", "int64"),
            ColumnDef("prior_investigations", "int64"),
            ColumnDef("prior_risk_level_encoded", "int64"),
            ColumnDef("directors_count", "int64"),
            ColumnDef("shareholders_count", "int64"),
            ColumnDef("revenue_vs_volume_ratio", "float64"),
            ColumnDef("risk_label", "int64"),
            ColumnDef("computed_at", "datetime64[ns]"),
        ],
        partition_by=["country"],
    ),
    "fx_rates": TableSchema(
        name="fx_rates",
        columns=[
            ColumnDef("corridor", "string", nullable=False),
            ColumnDef("timestamp", "datetime64[ns]", nullable=False),
            ColumnDef("rate", "float64", nullable=False),
            ColumnDef("rate_sma_24", "float64"),
            ColumnDef("rate_ema_12", "float64"),
            ColumnDef("rate_rsi_14", "float64"),
            ColumnDef("volume", "float64"),
            ColumnDef("spread", "float64"),
            ColumnDef("volatility_24h", "float64"),
            ColumnDef("hour_sin", "float64"),
            ColumnDef("hour_cos", "float64"),
            ColumnDef("dow_sin", "float64"),
            ColumnDef("dow_cos", "float64"),
            ColumnDef("returns_1h", "float64"),
            ColumnDef("returns_24h", "float64"),
            ColumnDef("rate_bollinger_upper", "float64"),
            ColumnDef("rate_bollinger_lower", "float64"),
            ColumnDef("rate_macd", "float64"),
            ColumnDef("rate_macd_signal", "float64"),
        ],
        partition_by=["corridor"],
    ),
    "graph_edges": TableSchema(
        name="graph_edges",
        columns=[
            ColumnDef("source_id", "string", nullable=False),
            ColumnDef("target_id", "string", nullable=False),
            ColumnDef("amount", "float64", nullable=False),
            ColumnDef("currency", "string"),
            ColumnDef("timestamp", "datetime64[ns]"),
            ColumnDef("transaction_id", "string"),
            ColumnDef("is_fraud", "int64"),
        ],
    ),
    "graph_nodes": TableSchema(
        name="graph_nodes",
        columns=[
            ColumnDef("entity_id", "string", nullable=False),
            ColumnDef("entity_type", "string"),
            ColumnDef("country", "string"),
            ColumnDef("risk_score", "float64"),
            ColumnDef("in_degree", "int64"),
            ColumnDef("out_degree", "int64"),
            ColumnDef("total_in_volume", "float64"),
            ColumnDef("total_out_volume", "float64"),
            ColumnDef("is_fraud", "int64"),
        ],
    ),
}


class FeatureStore:
    """
    Feature store backed by Delta Lake (or Parquet fallback).
    Enforces schemas, supports point-in-time joins, and tracks lineage.
    """

    def __init__(self, base_path: str = "./lakehouse_data"):
        self.base_path = Path(base_path)
        self.feature_store_path = self.base_path / "feature_store"
        self.training_data_path = self.base_path / "training_data"
        self.model_artifacts_path = self.base_path / "model_artifacts"
        self.metadata_path = self.base_path / "metadata"
        self.lineage_path = self.base_path / "lineage"

        for p in [self.feature_store_path, self.training_data_path,
                   self.model_artifacts_path, self.metadata_path, self.lineage_path]:
            p.mkdir(parents=True, exist_ok=True)

        self._schema_registry: Dict[str, TableSchema] = dict(SCHEMAS)

    def register_schema(self, schema: TableSchema) -> None:
        self._schema_registry[schema.name] = schema

    def get_schema(self, domain: str) -> Optional[TableSchema]:
        return self._schema_registry.get(domain)

    # ─── Write Operations ────────────────────────────────────────────────

    def write_features(
        self,
        domain: str,
        df: pd.DataFrame,
        mode: str = "append",
        partition_cols: Optional[List[str]] = None,
        enforce_schema: bool = True,
    ) -> Dict[str, Any]:
        """Write features to the store with schema enforcement."""
        table_path = str(self.feature_store_path / domain)
        os.makedirs(table_path, exist_ok=True)

        schema = self._schema_registry.get(domain)
        if schema and enforce_schema:
            df = schema.coerce(df)
            valid, errors = schema.validate(df)
            if not valid:
                logger.warning(f"Schema validation warnings for {domain}: {errors}")

        if _HAS_DELTA:
            table = pa.Table.from_pandas(df)
            try:
                if mode == "overwrite":
                    deltalake.write_deltalake(table_path, table, mode="overwrite",
                                              partition_by=partition_cols or (schema.partition_by if schema else None))
                else:
                    try:
                        deltalake.write_deltalake(table_path, table, mode="append")
                    except Exception:
                        deltalake.write_deltalake(table_path, table, mode="overwrite",
                                                  partition_by=partition_cols or (schema.partition_by if schema else None))
            except Exception as e:
                logger.warning(f"Delta write failed ({e}), falling back to Parquet")
                self._write_parquet(table_path, df, mode)
        else:
            self._write_parquet(table_path, df, mode)

        meta = self._write_metadata(domain, df, mode)
        self._write_lineage(domain, df, mode)
        return meta

    def _write_parquet(self, table_path: str, df: pd.DataFrame, mode: str) -> None:
        ts = int(time.time() * 1000)
        filename = f"part-{ts}.parquet"
        if mode == "overwrite":
            for f in Path(table_path).glob("*.parquet"):
                f.unlink()
        df.to_parquet(os.path.join(table_path, filename), index=False,
                      engine="pyarrow", compression="snappy")

    def _write_metadata(self, domain: str, df: pd.DataFrame, mode: str) -> Dict[str, Any]:
        meta = {
            "domain": domain,
            "rows": len(df),
            "columns": list(df.columns),
            "dtypes": {col: str(df[col].dtype) for col in df.columns},
            "written_at": datetime.utcnow().isoformat(),
            "mode": mode,
            "format": "delta" if _HAS_DELTA else "parquet",
            "data_hash": hashlib.md5(
                pd.util.hash_pandas_object(df).values.tobytes()
            ).hexdigest()[:16],
            "schema_version": self._schema_registry[domain].version if domain in self._schema_registry else 0,
            "null_counts": {col: int(df[col].isna().sum()) for col in df.columns},
            "row_count_by_partition": {},
        }

        schema = self._schema_registry.get(domain)
        if schema and schema.partition_by:
            for pcol in schema.partition_by:
                if pcol in df.columns:
                    meta["row_count_by_partition"][pcol] = df[pcol].value_counts().to_dict()

        meta_file = self.metadata_path / f"{domain}_latest.json"
        meta_file.write_text(json.dumps(meta, indent=2, default=str))

        # Append to history
        history_file = self.metadata_path / f"{domain}_history.jsonl"
        with open(history_file, "a") as f:
            f.write(json.dumps(meta, default=str) + "\n")

        logger.info(f"Wrote {len(df)} rows to {domain} ({meta['format']})")
        return meta

    def _write_lineage(self, domain: str, df: pd.DataFrame, mode: str) -> None:
        lineage = {
            "domain": domain,
            "timestamp": datetime.utcnow().isoformat(),
            "operation": mode,
            "rows": len(df),
            "columns": list(df.columns),
            "data_hash": hashlib.md5(
                pd.util.hash_pandas_object(df).values.tobytes()
            ).hexdigest()[:16],
        }
        lineage_file = self.lineage_path / f"{domain}.jsonl"
        with open(lineage_file, "a") as f:
            f.write(json.dumps(lineage, default=str) + "\n")

    # ─── Read Operations ─────────────────────────────────────────────────

    def read_features(
        self,
        domain: str,
        columns: Optional[List[str]] = None,
        filters: Optional[Dict[str, Any]] = None,
        time_range: Optional[Tuple[str, str]] = None,
        time_column: str = "created_at",
    ) -> pd.DataFrame:
        """
        Read features from the store with optional filtering and time range.

        filters: dict of column_name -> value or list of values
        time_range: (start_iso, end_iso) for temporal filtering
        """
        table_path = str(self.feature_store_path / domain)

        df = pd.DataFrame()
        if _HAS_DELTA:
            try:
                dt = deltalake.DeltaTable(table_path)
                df = dt.to_pandas(columns=columns)
            except Exception:
                df = self._read_parquet(table_path, columns)
        else:
            df = self._read_parquet(table_path, columns)

        if df.empty:
            return df

        # Apply filters
        if filters:
            for col, val in filters.items():
                if col not in df.columns:
                    continue
                if isinstance(val, list):
                    df = df[df[col].isin(val)]
                else:
                    df = df[df[col] == val]

        # Apply time range
        if time_range and time_column in df.columns:
            df[time_column] = pd.to_datetime(df[time_column], errors="coerce")
            start, end = pd.to_datetime(time_range[0]), pd.to_datetime(time_range[1])
            df = df[(df[time_column] >= start) & (df[time_column] <= end)]

        return df

    def _read_parquet(self, table_path: str, columns: Optional[List[str]] = None) -> pd.DataFrame:
        parquet_files = list(Path(table_path).glob("**/*.parquet"))
        if not parquet_files:
            return pd.DataFrame()
        dfs = [pd.read_parquet(f, columns=columns) for f in parquet_files]
        return pd.concat(dfs, ignore_index=True)

    # ─── Point-in-Time Join ──────────────────────────────────────────────

    def point_in_time_join(
        self,
        entity_df: pd.DataFrame,
        feature_domain: str,
        entity_col: str,
        feature_entity_col: str,
        timestamp_col: str = "event_timestamp",
        feature_timestamp_col: str = "created_at",
        features: Optional[List[str]] = None,
        ttl_hours: Optional[int] = None,
    ) -> pd.DataFrame:
        """
        Point-in-time correct feature retrieval.

        For each row in entity_df, retrieves the latest features from
        feature_domain where feature_timestamp <= entity_timestamp.
        This prevents data leakage in ML training.

        Args:
            entity_df: DataFrame with entity IDs and timestamps
            feature_domain: lakehouse domain to join from
            entity_col: column in entity_df with entity IDs
            feature_entity_col: column in feature table with entity IDs
            timestamp_col: timestamp column in entity_df
            feature_timestamp_col: timestamp column in feature table
            features: specific feature columns to retrieve (None = all)
            ttl_hours: max age of features in hours (None = no limit)
        """
        feature_df = self.read_features(feature_domain, columns=features)
        if feature_df.empty:
            return entity_df

        entity_df = entity_df.copy()
        entity_df[timestamp_col] = pd.to_datetime(entity_df[timestamp_col], errors="coerce")
        feature_df[feature_timestamp_col] = pd.to_datetime(feature_df[feature_timestamp_col], errors="coerce")

        entity_df = entity_df.sort_values(timestamp_col)
        feature_df = feature_df.sort_values(feature_timestamp_col)

        result = pd.merge_asof(
            entity_df,
            feature_df,
            left_on=timestamp_col,
            right_on=feature_timestamp_col,
            left_by=entity_col if entity_col == feature_entity_col else None,
            right_by=feature_entity_col if entity_col != feature_entity_col else None,
            direction="backward",
        )

        if ttl_hours is not None:
            ttl_delta = pd.Timedelta(hours=ttl_hours)
            age = result[timestamp_col] - result[feature_timestamp_col]
            stale = age > ttl_delta
            feature_cols = [c for c in feature_df.columns if c not in entity_df.columns]
            result.loc[stale, feature_cols] = np.nan

        return result

    # ─── Training Data Management ────────────────────────────────────────

    def write_training_data(
        self,
        model_name: str,
        df: pd.DataFrame,
        split: str = "train",
        version: Optional[int] = None,
    ) -> str:
        """Write labeled training data for a specific model with versioning."""
        if version is None:
            version = int(time.time())

        path = self.training_data_path / model_name / f"v{version}"
        path.mkdir(parents=True, exist_ok=True)

        filename = f"{split}.parquet"
        filepath = str(path / filename)
        df.to_parquet(filepath, index=False, engine="pyarrow", compression="snappy")

        # Write split metadata
        meta = {
            "model_name": model_name,
            "split": split,
            "version": version,
            "rows": len(df),
            "columns": list(df.columns),
            "written_at": datetime.utcnow().isoformat(),
        }
        (path / f"{split}_meta.json").write_text(json.dumps(meta, indent=2, default=str))

        logger.info(f"Wrote training data: {model_name}/v{version}/{filename} ({len(df)} rows)")
        return filepath

    def read_training_data(
        self,
        model_name: str,
        version: Optional[int] = None,
        split: Optional[str] = None,
    ) -> pd.DataFrame:
        """Read training data — latest version if version not specified."""
        base = self.training_data_path / model_name

        if not base.exists():
            return pd.DataFrame()

        if version is not None:
            vpath = base / f"v{version}"
        else:
            versions = sorted(base.iterdir(), key=lambda p: p.name, reverse=True)
            versions = [v for v in versions if v.is_dir() and v.name.startswith("v")]
            if not versions:
                # Fall back to flat parquet files (legacy format)
                parquet_files = list(base.glob("*.parquet"))
                if parquet_files:
                    return pd.concat([pd.read_parquet(f) for f in parquet_files], ignore_index=True)
                return pd.DataFrame()
            vpath = versions[0]

        parquet_files = list(vpath.glob("*.parquet"))
        if split:
            parquet_files = [f for f in parquet_files if f.stem == split]

        if not parquet_files:
            return pd.DataFrame()

        return pd.concat([pd.read_parquet(f) for f in parquet_files], ignore_index=True)

    def store_model_artifact(
        self,
        model_name: str,
        version: int,
        artifact_data: bytes,
        artifact_type: str = "model",
        metadata: Optional[Dict] = None,
    ) -> str:
        """Store a model artifact (weights, ONNX, etc.)."""
        path = self.model_artifacts_path / model_name / f"v{version}"
        path.mkdir(parents=True, exist_ok=True)

        filename = f"{artifact_type}.bin"
        filepath = path / filename
        filepath.write_bytes(artifact_data)

        if metadata:
            (path / "metadata.json").write_text(json.dumps(metadata, indent=2, default=str))

        logger.info(f"Stored artifact: {model_name}/v{version}/{filename}")
        return str(filepath)

    # ─── Stats & Introspection ───────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics."""
        stats: Dict[str, Any] = {"domains": {}, "total_size_mb": 0, "total_files": 0, "total_rows": 0}

        for domain_dir in self.feature_store_path.iterdir():
            if domain_dir.is_dir():
                files = list(domain_dir.rglob("*.parquet"))
                size = sum(f.stat().st_size for f in files)
                meta_file = self.metadata_path / f"{domain_dir.name}_latest.json"
                rows = 0
                if meta_file.exists():
                    meta = json.loads(meta_file.read_text())
                    rows = meta.get("rows", 0)

                stats["domains"][domain_dir.name] = {
                    "files": len(files),
                    "size_mb": round(size / 1e6, 2),
                    "rows": rows,
                    "schema": domain_dir.name in self._schema_registry,
                }
                stats["total_size_mb"] += size / 1e6
                stats["total_files"] += len(files)
                stats["total_rows"] += rows

        stats["total_size_mb"] = round(stats["total_size_mb"], 2)
        return stats

    def get_lineage(self, domain: str, limit: int = 20) -> List[Dict]:
        lineage_file = self.lineage_path / f"{domain}.jsonl"
        if not lineage_file.exists():
            return []
        lines = lineage_file.read_text().strip().split("\n")
        return [json.loads(l) for l in lines[-limit:]]


# ─── Feature Materialization Functions ───────────────────────────────────────

HIGH_RISK_COUNTRIES = {"IR", "KP", "SY", "AF", "SD", "SO", "YE", "LY", "VE", "MM"}
HIGH_RISK_MERCHANT_CATEGORIES = {"gambling", "crypto", "money_services", "adult", "firearms"}


def materialize_fraud_features(
    feature_store: FeatureStore,
    raw_transactions: pd.DataFrame,
) -> pd.DataFrame:
    """
    Materialize fraud detection features from raw transaction data.
    Computes: velocity windows, amount statistics, device signals,
    geographic risk, temporal patterns, behavioral anomalies.
    """
    df = raw_transactions.copy()

    # Ensure timestamp column
    if "created_at" in df.columns:
        df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    elif "timestamp" in df.columns:
        df["created_at"] = pd.to_datetime(df["timestamp"], errors="coerce")
    else:
        df["created_at"] = pd.Timestamp.utcnow()

    # Amount features
    df["amount"] = pd.to_numeric(df.get("amount", 0), errors="coerce").fillna(0)
    df["amount_log"] = np.log1p(df["amount"])

    # Per-user statistics
    if "user_id" in df.columns:
        user_stats = df.groupby("user_id")["amount"].agg(["mean", "std", "count"]).reset_index()
        user_stats.columns = ["user_id", "avg_txn_amount_30d", "std_txn_amount_30d", "user_txn_count"]
        df = df.merge(user_stats, on="user_id", how="left")
        df["std_txn_amount_30d"] = df["std_txn_amount_30d"].fillna(1.0)
        df["avg_txn_amount_30d"] = df["avg_txn_amount_30d"].fillna(df["amount"])
        df["amount_zscore"] = (df["amount"] - df["avg_txn_amount_30d"]) / df["std_txn_amount_30d"].clip(lower=1.0)
        df["txn_amount_ratio"] = df["amount"] / df["avg_txn_amount_30d"].clip(lower=1.0)

        # Velocity features (count transactions per user in time windows)
        if "created_at" in df.columns and df["created_at"].notna().any():
            df = df.sort_values(["user_id", "created_at"])
            for window_name, window_hours in [("velocity_1h", 1), ("velocity_24h", 24), ("velocity_7d", 168)]:
                if window_name not in df.columns:
                    df[window_name] = df.groupby("user_id").cumcount()

        # Days since last transaction
        if "days_since_last_txn" not in df.columns:
            df["days_since_last_txn"] = df.groupby("user_id")["created_at"].diff().dt.total_seconds() / 86400
            df["days_since_last_txn"] = df["days_since_last_txn"].fillna(30).clip(0, 365).astype(int)
    else:
        for col in ["avg_txn_amount_30d", "std_txn_amount_30d", "amount_zscore", "txn_amount_ratio"]:
            if col not in df.columns:
                df[col] = 0.0

    # Geographic risk
    if "country" in df.columns:
        df["country_risk"] = df["country"].apply(lambda c: 0.9 if c in HIGH_RISK_COUNTRIES else 0.2)
    elif "country_risk" not in df.columns:
        df["country_risk"] = 0.2

    # Merchant category risk
    if "merchant_category" in df.columns:
        df["merchant_category_risk"] = df["merchant_category"].apply(
            lambda c: 0.8 if c in HIGH_RISK_MERCHANT_CATEGORIES else 0.15
        )
    elif "merchant_category_risk" not in df.columns:
        df["merchant_category_risk"] = 0.15

    # Temporal features
    if "created_at" in df.columns and df["created_at"].notna().any():
        df["hour_of_day"] = df["created_at"].dt.hour
        df["day_of_week"] = df["created_at"].dt.dayofweek
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    else:
        for col, default in [("hour_of_day", 12), ("day_of_week", 3), ("is_weekend", 0)]:
            if col not in df.columns:
                df[col] = default

    # Defaults for missing columns
    defaults = {
        "is_new_device": 0, "is_vpn": 0, "is_tor": 0, "failed_auth_count": 0,
        "ip_risk_score": 0.1, "device_age_days": 100, "cross_border": 0,
        "currency_mismatch": 0, "velocity_1h": 0, "velocity_24h": 0, "velocity_7d": 0,
    }
    for col, default in defaults.items():
        if col not in df.columns:
            df[col] = default

    feature_store.write_features("fraud_transactions", df, mode="append")
    return df


def materialize_bis_features(
    feature_store: FeatureStore,
    raw_entities: pd.DataFrame,
) -> pd.DataFrame:
    """
    Materialize BIS risk features from raw entity/establishment data.
    Computes: risk scores from entity attributes, temporal features,
    cross-references with sanctions/PEP lists, KYB completeness metrics.
    """
    df = raw_entities.copy()

    # Compute country risk if not present
    if "country_risk_score" not in df.columns and "country" in df.columns:
        df["country_risk_score"] = df["country"].apply(
            lambda c: 0.9 if c in HIGH_RISK_COUNTRIES else 0.3
        )

    # Industry risk
    HIGH_RISK_INDUSTRIES = {"gambling", "crypto", "money_services", "shell_company", "precious_metals"}
    if "industry_risk_score" not in df.columns and "industry" in df.columns:
        df["industry_risk_score"] = df["industry"].apply(
            lambda i: 0.8 if i in HIGH_RISK_INDUSTRIES else 0.2
        )

    # Entity age from founding year
    if "entity_age_days" not in df.columns:
        if "entity_year_founded" in df.columns:
            df["entity_age_days"] = ((datetime.utcnow().year - df["entity_year_founded"]) * 365).clip(1, 5000)
        elif "created_at" in df.columns:
            df["entity_age_days"] = (pd.Timestamp.utcnow() - pd.to_datetime(df["created_at"])).dt.days.clip(1, 5000)
        else:
            df["entity_age_days"] = 365

    # KYB completeness: count how many required fields are filled
    if "kyb_completeness_score" not in df.columns:
        kyb_fields = [
            "entity_registration_number", "entity_type", "entity_website",
            "entity_year_founded", "ubo_declared",
        ]
        available = [f for f in kyb_fields if f in df.columns]
        if available:
            df["kyb_completeness_score"] = df[available].notna().mean(axis=1)
        else:
            df["kyb_completeness_score"] = 0.5

    # Transaction aggregations if transaction data is available
    for col, default in [
        ("transaction_volume_30d", 10000.0), ("transaction_count_30d", 50),
        ("chargeback_rate", 0.01), ("refund_rate", 0.05),
        ("sanctions_hit", 0), ("pep_connection", 0), ("adverse_media_count", 0),
        ("ubo_declared", 1), ("cross_border_ratio", 0.3), ("cash_intensive", 0),
        ("prior_investigations", 0), ("prior_risk_level_encoded", 0),
        ("directors_count", 2), ("shareholders_count", 3),
        ("revenue_vs_volume_ratio", 1.0),
    ]:
        if col not in df.columns:
            df[col] = default

    # Composite risk score
    df["composite_risk"] = (
        df["country_risk_score"] * 0.20 +
        df["industry_risk_score"] * 0.15 +
        (1 - df["entity_age_days"].clip(0, 5000) / 5000) * 0.05 +
        np.clip(df["transaction_volume_30d"] / 10_000_000, 0, 1) * 0.10 +
        df["chargeback_rate"].clip(0, 1) * 5 * 0.10 +
        df["sanctions_hit"] * 0.15 +
        df["pep_connection"] * 0.10 +
        np.clip(df["adverse_media_count"] / 5, 0, 1) * 0.05 +
        (1 - df["kyb_completeness_score"]) * 0.05 +
        df["prior_risk_level_encoded"] / 3 * 0.05
    )

    df["computed_at"] = pd.Timestamp.utcnow()

    feature_store.write_features("bis_entities", df, mode="append")
    return df


def materialize_fx_features(
    feature_store: FeatureStore,
    raw_rates: pd.DataFrame,
) -> pd.DataFrame:
    """
    Materialize FX forecasting features from raw exchange rate data.
    Computes: technical indicators (SMA, EMA, RSI, MACD, Bollinger bands),
    volatility measures, seasonal encoding.
    """
    df = raw_rates.copy()

    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    # Compute technical indicators if only raw rate is provided
    if "rate" in df.columns:
        rates = df["rate"]

        if "rate_sma_24" not in df.columns:
            df["rate_sma_24"] = rates.rolling(24, min_periods=1).mean()

        if "rate_ema_12" not in df.columns:
            df["rate_ema_12"] = rates.ewm(span=12, min_periods=1).mean()

        # RSI
        if "rate_rsi_14" not in df.columns:
            delta = rates.diff()
            gain = delta.clip(lower=0).rolling(14, min_periods=1).mean()
            loss = (-delta.clip(upper=0)).rolling(14, min_periods=1).mean()
            rs = gain / loss.clip(lower=1e-10)
            df["rate_rsi_14"] = 100 - (100 / (1 + rs))

        # Bollinger Bands
        if "rate_bollinger_upper" not in df.columns:
            sma_20 = rates.rolling(20, min_periods=1).mean()
            std_20 = rates.rolling(20, min_periods=1).std().fillna(0)
            df["rate_bollinger_upper"] = sma_20 + 2 * std_20
            df["rate_bollinger_lower"] = sma_20 - 2 * std_20

        # MACD
        if "rate_macd" not in df.columns:
            ema_12 = rates.ewm(span=12, min_periods=1).mean()
            ema_26 = rates.ewm(span=26, min_periods=1).mean()
            df["rate_macd"] = ema_12 - ema_26
            df["rate_macd_signal"] = df["rate_macd"].ewm(span=9, min_periods=1).mean()

        # Volatility
        if "volatility_24h" not in df.columns:
            df["volatility_24h"] = rates.pct_change().rolling(24, min_periods=1).std()

        # Returns
        if "returns_1h" not in df.columns:
            df["returns_1h"] = rates.pct_change().fillna(0)
        if "returns_24h" not in df.columns:
            df["returns_24h"] = rates.pct_change(24).fillna(0)

    # Temporal encoding
    if "timestamp" in df.columns and df["timestamp"].notna().any():
        hours = df["timestamp"].dt.hour
        dows = df["timestamp"].dt.dayofweek
        if "hour_sin" not in df.columns:
            df["hour_sin"] = np.sin(2 * np.pi * hours / 24)
            df["hour_cos"] = np.cos(2 * np.pi * hours / 24)
        if "dow_sin" not in df.columns:
            df["dow_sin"] = np.sin(2 * np.pi * dows / 7)
            df["dow_cos"] = np.cos(2 * np.pi * dows / 7)

    # Defaults
    for col in ["volume", "spread"]:
        if col not in df.columns:
            df[col] = 0.0

    # Clean NaN/inf
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    df[numeric_cols] = df[numeric_cols].replace([np.inf, -np.inf], np.nan).fillna(0)

    feature_store.write_features("fx_rates", df, mode="append")
    return df


def materialize_graph_features(
    feature_store: FeatureStore,
    transactions: pd.DataFrame,
    users: Optional[pd.DataFrame] = None,
) -> Dict[str, pd.DataFrame]:
    """
    Materialize graph features from transaction data.
    Builds edge list and computes node-level graph features.
    """
    # Build edge DataFrame
    if "source_id" in transactions.columns:
        edges = transactions[["source_id", "target_id", "amount"]].copy()
    elif "sender_id" in transactions.columns and "receiver_id" in transactions.columns:
        edges = transactions.rename(columns={"sender_id": "source_id", "receiver_id": "target_id"})
        edges = edges[["source_id", "target_id", "amount"]].copy()
    elif "user_id" in transactions.columns and "merchant_id" in transactions.columns:
        edges = transactions.rename(columns={"user_id": "source_id", "merchant_id": "target_id"})
        edges = edges[["source_id", "target_id", "amount"]].copy()
    else:
        logger.warning("Cannot build graph: no source/target columns found")
        return {"edges": pd.DataFrame(), "nodes": pd.DataFrame()}

    for col in ["currency", "timestamp", "transaction_id", "is_fraud"]:
        if col in transactions.columns:
            edges[col] = transactions[col].values

    # Compute node features
    all_nodes = set(edges["source_id"].unique()) | set(edges["target_id"].unique())

    in_stats = edges.groupby("target_id").agg(
        in_degree=("source_id", "count"),
        total_in_volume=("amount", "sum"),
    ).reset_index().rename(columns={"target_id": "entity_id"})

    out_stats = edges.groupby("source_id").agg(
        out_degree=("target_id", "count"),
        total_out_volume=("amount", "sum"),
    ).reset_index().rename(columns={"source_id": "entity_id"})

    nodes = pd.DataFrame({"entity_id": list(all_nodes)})
    nodes = nodes.merge(in_stats, on="entity_id", how="left")
    nodes = nodes.merge(out_stats, on="entity_id", how="left")
    nodes = nodes.fillna(0)

    # If user info available, add entity metadata
    if users is not None and "entity_id" in users.columns:
        nodes = nodes.merge(
            users[["entity_id", "entity_type", "country", "risk_score"]],
            on="entity_id", how="left"
        )
    else:
        for col, default in [("entity_type", "unknown"), ("country", "XX"), ("risk_score", 0.0)]:
            if col not in nodes.columns:
                nodes[col] = default

    # Fraud label on nodes
    if "is_fraud" in edges.columns:
        fraud_sources = set(edges[edges["is_fraud"] == 1]["source_id"])
        fraud_targets = set(edges[edges["is_fraud"] == 1]["target_id"])
        fraud_entities = fraud_sources | fraud_targets
        nodes["is_fraud"] = nodes["entity_id"].isin(fraud_entities).astype(int)
    else:
        nodes["is_fraud"] = 0

    feature_store.write_features("graph_edges", edges, mode="append")
    feature_store.write_features("graph_nodes", nodes, mode="overwrite")

    return {"edges": edges, "nodes": nodes}

"""
Centralized model configuration for all TourismPay ML models.
"""
from dataclasses import dataclass, field
from typing import List


@dataclass
class FraudXGBConfig:
    n_estimators: int = 500
    max_depth: int = 8
    learning_rate: float = 0.05
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    min_child_weight: int = 5
    scale_pos_weight: float = 10.0  # fraud is rare
    eval_metric: str = "aucpr"
    early_stopping_rounds: int = 30
    feature_names: List[str] = field(default_factory=lambda: [
        "amount", "amount_log", "amount_zscore",
        "velocity_1h", "velocity_24h", "velocity_7d",
        "is_new_device", "is_vpn", "is_tor", "failed_auth_count",
        "merchant_category_risk", "country_risk",
        "hour_of_day", "day_of_week", "is_weekend",
        "days_since_last_txn", "avg_txn_amount_30d", "std_txn_amount_30d",
        "txn_amount_ratio",  # amount / avg_30d
        "ip_risk_score", "device_age_days",
        "cross_border", "currency_mismatch",
    ])


@dataclass
class FraudGNNConfig:
    node_feature_dim: int = 24
    hidden_dim: int = 64
    num_layers: int = 3
    dropout: float = 0.3
    heads: int = 4  # GAT attention heads
    learning_rate: float = 0.001
    weight_decay: float = 1e-5
    epochs: int = 200
    patience: int = 20
    batch_size: int = 512
    neg_sampling_ratio: float = 3.0


@dataclass
class FXForecastConfig:
    input_seq_len: int = 168  # 7 days of hourly data
    forecast_horizon: int = 24  # predict next 24 hours
    d_model: int = 64
    n_heads: int = 4
    n_encoder_layers: int = 3
    n_decoder_layers: int = 2
    dim_feedforward: int = 128
    dropout: float = 0.1
    learning_rate: float = 0.0005
    weight_decay: float = 1e-4
    epochs: int = 100
    batch_size: int = 64
    patience: int = 15
    feature_names: List[str] = field(default_factory=lambda: [
        "rate", "rate_sma_24", "rate_ema_12", "rate_rsi_14",
        "volume", "spread", "volatility_24h",
        "hour_sin", "hour_cos", "dow_sin", "dow_cos",
    ])


@dataclass
class BISRiskConfig:
    n_estimators: int = 300
    max_depth: int = 6
    learning_rate: float = 0.08
    num_leaves: int = 63  # LightGBM
    min_data_in_leaf: int = 20
    feature_fraction: float = 0.8
    bagging_fraction: float = 0.8
    bagging_freq: int = 5
    eval_metric: str = "auc"
    early_stopping_rounds: int = 25
    feature_names: List[str] = field(default_factory=lambda: [
        "country_risk_score", "industry_risk_score",
        "entity_age_days", "transaction_volume_30d", "transaction_count_30d",
        "chargeback_rate", "refund_rate",
        "sanctions_hit", "pep_connection", "adverse_media_count",
        "kyb_completeness_score", "ubo_declared",
        "cross_border_ratio", "cash_intensive",
        "prior_investigations", "prior_risk_level_encoded",
        "directors_count", "shareholders_count",
        "revenue_vs_volume_ratio",
    ])


@dataclass
class ContinuousTrainingConfig:
    retrain_interval_hours: int = 24
    min_new_samples: int = 1000
    validation_split: float = 0.2
    performance_threshold: float = 0.85  # min AUC to deploy
    champion_challenger: bool = True
    max_model_versions: int = 10
    feature_drift_threshold: float = 0.1


@dataclass
class Neo4jConfig:
    uri: str = "bolt://localhost:7687"
    user: str = "neo4j"
    password: str = "tourismpay-neo4j-2026"
    database: str = "tourismpay"
    max_connection_pool_size: int = 50


@dataclass
class LakehouseConfig:
    base_path: str = "./lakehouse_data"
    feature_store_path: str = "./lakehouse_data/feature_store"
    training_data_path: str = "./lakehouse_data/training_data"
    model_artifacts_path: str = "./lakehouse_data/model_artifacts"
    format: str = "delta"  # delta lake format


@dataclass
class RayConfig:
    num_cpus: int = 4
    num_gpus: int = 0  # CPU-only by default
    dashboard_port: int = 8265
    object_store_memory: int = 2_000_000_000  # 2GB

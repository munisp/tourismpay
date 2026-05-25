"""
Synthetic fraud transaction data generator.
Produces realistic transaction data with fraud labels for training.
Fraud patterns: velocity abuse, amount anomaly, device fraud, geo anomaly,
account takeover, money laundering layering.
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional


MERCHANT_CATEGORIES = [
    "restaurant", "hotel", "tour_operator", "transport", "retail",
    "grocery", "entertainment", "health", "education", "utilities",
    "gambling", "crypto", "wire_transfer", "jewelry", "electronics",
    "gift_card", "forex", "pawn_shop",
]

HIGH_RISK_CATEGORIES = {"gambling", "crypto", "wire_transfer", "jewelry", "forex", "pawn_shop"}

COUNTRIES = [
    "NG", "KE", "GH", "TZ", "UG", "ZA", "ET", "CM", "CI", "SN",
    "US", "GB", "DE", "FR", "JP", "AE", "IN", "BR",
    "IR", "KP", "SY", "AF",  # sanctioned
]

HIGH_RISK_COUNTRIES = {"IR", "KP", "SY", "AF", "SD", "SO", "YE", "LY"}


def generate_fraud_dataset(
    n_samples: int = 100_000,
    fraud_rate: float = 0.03,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate synthetic fraud transaction dataset.

    Features mirror real payment platform data:
    - Transaction attributes (amount, currency, merchant)
    - Behavioral signals (velocity, device, geo)
    - Historical context (avg amounts, account age)
    - Temporal patterns (hour, day of week)

    Fraud patterns are injected with realistic correlations:
    - High-amount anomalies
    - Velocity spikes
    - New device + high amount
    - Cross-border + high-risk country
    - Night-time unusual activity
    """
    rng = np.random.default_rng(seed)

    n_fraud = int(n_samples * fraud_rate)
    n_legit = n_samples - n_fraud

    # --- Legitimate transactions ---
    legit = _generate_legitimate(n_legit, rng)
    legit["is_fraud"] = 0

    # --- Fraudulent transactions ---
    fraud = _generate_fraudulent(n_fraud, rng)
    fraud["is_fraud"] = 1

    df = pd.concat([legit, fraud], ignore_index=True)
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)

    # Derived features
    df["amount_log"] = np.log1p(df["amount"])
    avg = df.groupby("user_id")["amount"].transform("mean")
    std = df.groupby("user_id")["amount"].transform("std").fillna(1.0)
    df["amount_zscore"] = (df["amount"] - avg) / std.clip(lower=1.0)
    df["txn_amount_ratio"] = df["amount"] / df["avg_txn_amount_30d"].clip(lower=1.0)
    df["merchant_category_risk"] = df["merchant_category"].map(
        lambda c: 0.8 if c in HIGH_RISK_CATEGORIES else 0.2
    )
    df["country_risk"] = df["sender_country"].map(
        lambda c: 0.9 if c in HIGH_RISK_COUNTRIES else 0.3
    )
    df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)

    return df


def _generate_legitimate(n: int, rng: np.random.Generator) -> pd.DataFrame:
    amounts = rng.lognormal(mean=3.5, sigma=1.2, size=n).clip(1, 5000)
    return pd.DataFrame({
        "user_id": rng.integers(1, 10001, size=n),
        "amount": np.round(amounts, 2),
        "currency": rng.choice(["USD", "NGN", "KES", "GHS", "TZS", "ZAR"], size=n),
        "merchant_category": rng.choice(MERCHANT_CATEGORIES[:10], size=n),
        "sender_country": rng.choice(COUNTRIES[:14], size=n),
        "receiver_country": rng.choice(COUNTRIES[:14], size=n),
        "velocity_1h": rng.poisson(1.5, size=n),
        "velocity_24h": rng.poisson(5, size=n),
        "velocity_7d": rng.poisson(20, size=n),
        "is_new_device": rng.choice([0, 1], size=n, p=[0.92, 0.08]),
        "is_vpn": rng.choice([0, 1], size=n, p=[0.95, 0.05]),
        "is_tor": np.zeros(n, dtype=int),
        "failed_auth_count": rng.choice([0, 0, 0, 0, 1], size=n),
        "hour_of_day": rng.integers(6, 23, size=n),
        "day_of_week": rng.integers(0, 7, size=n),
        "days_since_last_txn": rng.exponential(3, size=n).astype(int).clip(0, 90),
        "avg_txn_amount_30d": rng.lognormal(3.5, 0.8, size=n).clip(5, 3000),
        "std_txn_amount_30d": rng.lognormal(2.0, 0.5, size=n).clip(1, 1000),
        "ip_risk_score": rng.beta(2, 20, size=n),
        "device_age_days": rng.exponential(200, size=n).astype(int).clip(1, 1000),
        "cross_border": rng.choice([0, 1], size=n, p=[0.7, 0.3]),
        "currency_mismatch": rng.choice([0, 1], size=n, p=[0.85, 0.15]),
    })


def _generate_fraudulent(n: int, rng: np.random.Generator) -> pd.DataFrame:
    # Fraud patterns: higher amounts, more velocity, new devices, odd hours
    amounts = rng.lognormal(mean=5.5, sigma=1.5, size=n).clip(50, 50000)
    return pd.DataFrame({
        "user_id": rng.integers(1, 10001, size=n),
        "amount": np.round(amounts, 2),
        "currency": rng.choice(["USD", "NGN", "KES", "GHS", "TZS", "ZAR"], size=n),
        "merchant_category": rng.choice(MERCHANT_CATEGORIES, size=n),
        "sender_country": rng.choice(COUNTRIES, size=n, p=_fraud_country_probs()),
        "receiver_country": rng.choice(COUNTRIES, size=n, p=_fraud_country_probs()),
        "velocity_1h": rng.poisson(8, size=n),
        "velocity_24h": rng.poisson(25, size=n),
        "velocity_7d": rng.poisson(60, size=n),
        "is_new_device": rng.choice([0, 1], size=n, p=[0.4, 0.6]),
        "is_vpn": rng.choice([0, 1], size=n, p=[0.5, 0.5]),
        "is_tor": rng.choice([0, 1], size=n, p=[0.85, 0.15]),
        "failed_auth_count": rng.poisson(2, size=n),
        "hour_of_day": rng.choice(range(24), size=n, p=_fraud_hour_probs()),
        "day_of_week": rng.integers(0, 7, size=n),
        "days_since_last_txn": rng.choice([0, 0, 1, 30, 60, 90], size=n),
        "avg_txn_amount_30d": rng.lognormal(3.0, 0.5, size=n).clip(5, 2000),
        "std_txn_amount_30d": rng.lognormal(2.0, 0.5, size=n).clip(1, 500),
        "ip_risk_score": rng.beta(5, 5, size=n),
        "device_age_days": rng.choice([0, 1, 2, 5, 10], size=n),
        "cross_border": rng.choice([0, 1], size=n, p=[0.3, 0.7]),
        "currency_mismatch": rng.choice([0, 1], size=n, p=[0.4, 0.6]),
    })


def _fraud_country_probs() -> list:
    # Higher probability for high-risk countries in fraud set
    n = len(COUNTRIES)
    probs = np.ones(n)
    for i, c in enumerate(COUNTRIES):
        if c in HIGH_RISK_COUNTRIES:
            probs[i] = 5.0
    return (probs / probs.sum()).tolist()


def _fraud_hour_probs() -> list:
    # Fraud peaks at night (0-5 AM)
    probs = np.ones(24)
    probs[0:6] = 3.0  # night
    probs[22:24] = 2.5
    return (probs / probs.sum()).tolist()


def generate_transaction_graph(
    n_users: int = 5000,
    n_transactions: int = 50000,
    n_fraud_rings: int = 10,
    ring_size_range: tuple = (3, 8),
    seed: int = 42,
) -> dict:
    """
    Generate a transaction graph for GNN training.
    Returns: {
        "node_features": np.ndarray (n_users, feature_dim),
        "edge_index": np.ndarray (2, n_edges),
        "edge_features": np.ndarray (n_edges, edge_feature_dim),
        "node_labels": np.ndarray (n_users,)  # 0=legit, 1=fraud
        "edge_labels": np.ndarray (n_edges,)  # 0=legit, 1=fraud
    }
    """
    rng = np.random.default_rng(seed)

    # Node features: user-level aggregates
    node_features = np.column_stack([
        rng.lognormal(3.5, 1.0, n_users),   # avg_amount
        rng.poisson(15, n_users),             # txn_count_30d
        rng.exponential(200, n_users),        # account_age_days
        rng.beta(2, 20, n_users),             # risk_score
        rng.choice([0, 1], n_users, p=[0.9, 0.1]),  # is_merchant
        rng.choice([0, 1], n_users, p=[0.95, 0.05]), # has_kyb
        rng.lognormal(2, 0.8, n_users),      # avg_counterparty_count
        rng.beta(1, 10, n_users),             # chargeback_rate
    ])

    node_labels = np.zeros(n_users, dtype=int)

    # Generate normal edges
    senders = rng.integers(0, n_users, n_transactions)
    receivers = rng.integers(0, n_users, n_transactions)
    # Remove self-loops
    mask = senders != receivers
    senders, receivers = senders[mask], receivers[mask]

    amounts = rng.lognormal(3.5, 1.2, len(senders))
    timestamps = rng.uniform(0, 1, len(senders))  # normalized time
    edge_features = np.column_stack([amounts, timestamps])
    edge_labels = np.zeros(len(senders), dtype=int)

    # Inject fraud rings (circular money flows)
    fraud_senders, fraud_receivers = [], []
    fraud_amounts, fraud_times = [], []
    for _ in range(n_fraud_rings):
        ring_size = rng.integers(ring_size_range[0], ring_size_range[1] + 1)
        ring_nodes = rng.integers(0, n_users, ring_size)
        node_labels[ring_nodes] = 1

        # Create circular edges
        for j in range(ring_size):
            src, dst = ring_nodes[j], ring_nodes[(j + 1) % ring_size]
            n_txns = rng.integers(5, 20)
            for _ in range(n_txns):
                fraud_senders.append(src)
                fraud_receivers.append(dst)
                fraud_amounts.append(rng.lognormal(6, 1.0))
                fraud_times.append(rng.uniform(0, 1))

    if fraud_senders:
        fraud_edge_features = np.column_stack([fraud_amounts, fraud_times])
        senders = np.concatenate([senders, fraud_senders])
        receivers = np.concatenate([receivers, fraud_receivers])
        edge_features = np.vstack([edge_features, fraud_edge_features])
        edge_labels = np.concatenate([edge_labels, np.ones(len(fraud_senders), dtype=int)])

    edge_index = np.stack([senders, receivers])

    return {
        "node_features": node_features.astype(np.float32),
        "edge_index": edge_index.astype(np.int64),
        "edge_features": edge_features.astype(np.float32),
        "node_labels": node_labels,
        "edge_labels": edge_labels,
    }


if __name__ == "__main__":
    print("Generating fraud tabular dataset...")
    df = generate_fraud_dataset(n_samples=100_000)
    df.to_parquet("fraud_transactions.parquet", index=False)
    print(f"  Shape: {df.shape}, Fraud rate: {df['is_fraud'].mean():.3f}")

    print("Generating transaction graph...")
    graph = generate_transaction_graph()
    print(f"  Nodes: {graph['node_features'].shape[0]}, Edges: {graph['edge_index'].shape[1]}")
    print(f"  Fraud nodes: {graph['node_labels'].sum()}, Fraud edges: {graph['edge_labels'].sum()}")
    np.savez("transaction_graph.npz", **graph)
    print("Done.")

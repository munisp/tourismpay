"""
Synthetic Data Generator for TourismPay ML Training

Generates realistic training data for:
1. Fraud detection (transaction-level features + graph edges)
2. FX rate time series (multi-corridor with regime changes)
3. Entity risk profiles (merchants, tourists, institutions)
4. Transaction anomaly patterns

All data is generated with controlled fraud/anomaly rates and
realistic African corridor characteristics (NGN, KES, GHS, TZS, ZAR).
"""
from __future__ import annotations

import json
import os
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

SEED = 42
np.random.seed(SEED)
random.seed(SEED)

OUTPUT_DIR = Path(__file__).parent / "generated"

# --- Constants ---

AFRICAN_COUNTRIES = ["NG", "KE", "GH", "TZ", "ZA", "ET", "CM", "CI", "SN", "UG"]
GLOBAL_COUNTRIES = ["US", "GB", "AE", "CN", "DE", "FR", "IN", "JP", "CA", "AU"]
HIGH_RISK_COUNTRIES = ["IR", "KP", "SY", "AF", "SO", "SS", "YE", "MM"]
CURRENCIES = {
    "NG": "NGN", "KE": "KES", "GH": "GHS", "TZ": "TZS", "ZA": "ZAR",
    "ET": "ETB", "CM": "XAF", "CI": "XOF", "SN": "XOF", "UG": "UGX",
    "US": "USD", "GB": "GBP", "AE": "AED", "CN": "CNY", "DE": "EUR",
    "FR": "EUR", "IN": "INR", "JP": "JPY", "CA": "CAD", "AU": "AUD",
}
MERCHANT_CATEGORIES = [
    "hotel", "restaurant", "tour_operator", "transport", "retail",
    "entertainment", "spa_wellness", "gift_shop", "safari", "cultural_site",
    "gambling", "crypto", "wire_transfer", "money_order", "forex",
]
DEVICE_TYPES = ["mobile_ios", "mobile_android", "web_chrome", "web_firefox", "web_safari", "pos_terminal"]

FX_RATES_VS_USD = {
    "NGN": 1580.0, "KES": 129.5, "GHS": 15.2, "TZS": 2530.0, "ZAR": 18.7,
    "ETB": 56.8, "UGX": 3750.0, "XOF": 602.0, "XAF": 602.0,
    "EUR": 0.92, "GBP": 0.79, "AED": 3.67, "CNY": 7.24, "INR": 83.2,
    "JPY": 149.5, "CAD": 1.36, "AUD": 1.53,
}

NIGERIAN_CITIES = ["Lagos", "Abuja", "Calabar", "Port Harcourt", "Enugu", "Kano"]
NIGERIAN_BANKS = ["GTBank", "Access Bank", "Zenith Bank", "First Bank", "UBA", "Stanbic IBTC"]


def _random_ip(is_suspicious: bool = False) -> str:
    if is_suspicious:
        return f"{random.choice([185, 193, 91, 45])}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}"
    return f"{random.choice([41, 102, 105, 154, 196, 197])}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}"


def _random_device_fingerprint() -> str:
    return f"fp_{random.randint(100000, 999999)}"


def generate_users(n_users: int = 5000) -> pd.DataFrame:
    """Generate user profiles with realistic distributions."""
    users = []
    for i in range(n_users):
        is_tourist = random.random() < 0.6
        if is_tourist:
            country = random.choice(GLOBAL_COUNTRIES)
            role = "tourist"
        else:
            country = random.choice(AFRICAN_COUNTRIES)
            role = random.choice(["merchant", "agent", "admin"])

        account_age = random.randint(1, 1095)  # 1-3 years in days
        users.append({
            "user_id": f"user_{i:06d}",
            "country": country,
            "role": role,
            "account_age_days": account_age,
            "kyc_level": random.choice(["basic", "verified", "enhanced"]),
            "is_pep": random.random() < 0.02,
            "device_count": random.randint(1, 5),
            "avg_monthly_txns": max(1, int(np.random.lognormal(2.5, 1.0))),
            "avg_txn_amount": round(np.random.lognormal(4.0, 1.5), 2),
            "created_at": (datetime.now() - timedelta(days=account_age)).isoformat(),
        })
    return pd.DataFrame(users)


def generate_merchants(n_merchants: int = 1000) -> pd.DataFrame:
    """Generate merchant profiles for Nigerian tourism economy."""
    merchants = []
    for i in range(n_merchants):
        city = random.choice(NIGERIAN_CITIES)
        category = random.choice(MERCHANT_CATEGORIES[:10])  # exclude high-risk for base merchants
        if random.random() < 0.05:
            category = random.choice(MERCHANT_CATEGORIES[10:])  # 5% high-risk

        merchants.append({
            "merchant_id": f"merch_{i:06d}",
            "name": f"{city} {category.title()} #{i}",
            "city": city,
            "country": "NG",
            "category": category,
            "kyb_status": random.choice(["approved", "approved", "approved", "pending", "under_review"]),
            "monthly_volume": round(np.random.lognormal(10.0, 2.0), 2),
            "chargeback_rate": round(max(0, np.random.normal(0.01, 0.008)), 4),
            "years_in_operation": random.randint(0, 20),
            "staff_count": random.randint(1, 50),
            "rating": round(min(5.0, max(1.0, np.random.normal(4.2, 0.5))), 1),
        })
    return pd.DataFrame(merchants)


def generate_transactions(
    users: pd.DataFrame,
    merchants: pd.DataFrame,
    n_transactions: int = 100000,
    fraud_rate: float = 0.03,
) -> pd.DataFrame:
    """
    Generate transaction data with controlled fraud injection.
    
    Fraud patterns injected:
    - Velocity abuse (many txns in short window)
    - Amount anomaly (unusual amounts for user profile)
    - New device + high value
    - Cross-border high-risk corridor
    - Round-number structuring (just below thresholds)
    - Account takeover (device change + country change)
    """
    transactions = []
    user_ids = users["user_id"].tolist()
    merchant_ids = merchants["merchant_id"].tolist()
    user_profiles = {row["user_id"]: row for _, row in users.iterrows()}
    merchant_profiles = {row["merchant_id"]: row for _, row in merchants.iterrows()}

    n_fraud = int(n_transactions * fraud_rate)
    fraud_indices = set(random.sample(range(n_transactions), n_fraud))

    base_time = datetime.now() - timedelta(days=90)

    for i in range(n_transactions):
        is_fraud = i in fraud_indices
        user_id = random.choice(user_ids)
        merchant_id = random.choice(merchant_ids)
        user = user_profiles[user_id]
        merchant = merchant_profiles[merchant_id]

        timestamp = base_time + timedelta(
            seconds=random.randint(0, 90 * 24 * 3600)
        )

        if is_fraud:
            fraud_type = random.choice([
                "velocity_abuse", "amount_anomaly", "new_device_high_value",
                "high_risk_corridor", "structuring", "account_takeover",
            ])
        else:
            fraud_type = None

        # Base transaction amount
        if is_fraud and fraud_type == "amount_anomaly":
            amount = float(user["avg_txn_amount"]) * random.uniform(8, 25)
        elif is_fraud and fraud_type == "structuring":
            threshold = random.choice([5000, 10000, 50000])
            amount = threshold - random.uniform(1, 100)
        else:
            amount = round(max(1.0, np.random.lognormal(
                np.log(max(1.0, float(user["avg_txn_amount"]))), 0.8
            )), 2)

        # Velocity features
        if is_fraud and fraud_type == "velocity_abuse":
            txns_1h = random.randint(15, 50)
            txns_24h = random.randint(80, 200)
        else:
            txns_1h = random.randint(0, 5)
            txns_24h = random.randint(0, 20)

        # Device features
        if is_fraud and fraud_type in ("new_device_high_value", "account_takeover"):
            is_new_device = True
            is_vpn = random.random() < 0.7
        else:
            is_new_device = random.random() < 0.1
            is_vpn = random.random() < 0.05

        # Country features
        sender_country = user["country"]
        receiver_country = merchant["country"]
        if is_fraud and fraud_type == "high_risk_corridor":
            sender_country = random.choice(HIGH_RISK_COUNTRIES)

        # IP
        ip = _random_ip(is_suspicious=is_fraud)

        transactions.append({
            "transaction_id": f"txn_{i:08d}",
            "user_id": user_id,
            "merchant_id": merchant_id,
            "amount": round(amount, 2),
            "currency": CURRENCIES.get(receiver_country, "NGN"),
            "sender_country": sender_country,
            "receiver_country": receiver_country,
            "merchant_category": merchant["category"],
            "timestamp": timestamp.isoformat(),
            "ip_address": ip,
            "device_fingerprint": _random_device_fingerprint(),
            "device_type": random.choice(DEVICE_TYPES),
            "is_new_device": is_new_device,
            "is_vpn": is_vpn,
            "txns_last_hour": txns_1h,
            "txns_last_day": txns_24h,
            "days_since_last_txn": random.randint(0, 30) if not is_fraud else random.randint(0, 90),
            "failed_auth_attempts": random.randint(0, 2) if not is_fraud else random.randint(0, 8),
            "is_fraud": is_fraud,
            "fraud_type": fraud_type,
        })

    return pd.DataFrame(transactions)


def generate_transaction_graph(
    transactions: pd.DataFrame,
    n_edges: int = 100000,
) -> pd.DataFrame:
    """
    Generate transaction graph edges for GNN training.
    
    Edge types:
    - user -> merchant (transaction)
    - user -> user (P2P transfer)
    - merchant -> merchant (supply chain)
    - user -> device (device usage)
    
    Fraud rings are injected as dense subgraphs.
    """
    edges = []
    user_ids = transactions["user_id"].unique().tolist()
    merchant_ids = transactions["merchant_id"].unique().tolist()

    # Transaction edges (user -> merchant)
    sampled = transactions.sample(min(n_edges // 2, len(transactions)))
    for _, row in sampled.iterrows():
        edges.append({
            "source": row["user_id"],
            "target": row["merchant_id"],
            "edge_type": "transacts_with",
            "amount": row["amount"],
            "timestamp": row["timestamp"],
            "is_fraud": row["is_fraud"],
        })

    # P2P transfer edges
    for _ in range(n_edges // 4):
        src = random.choice(user_ids)
        dst = random.choice(user_ids)
        if src == dst:
            continue
        is_fraud = random.random() < 0.05
        edges.append({
            "source": src,
            "target": dst,
            "edge_type": "p2p_transfer",
            "amount": round(np.random.lognormal(4.0, 1.5), 2),
            "timestamp": (datetime.now() - timedelta(days=random.randint(0, 90))).isoformat(),
            "is_fraud": is_fraud,
        })

    # Inject 5 fraud rings (dense subgraphs of 5-10 nodes)
    for ring_id in range(5):
        ring_size = random.randint(5, 10)
        ring_users = random.sample(user_ids, min(ring_size, len(user_ids)))
        for j, src in enumerate(ring_users):
            for dst in ring_users[j+1:]:
                edges.append({
                    "source": src,
                    "target": dst,
                    "edge_type": "p2p_transfer",
                    "amount": round(random.uniform(4900, 9900), 2),
                    "timestamp": (datetime.now() - timedelta(days=random.randint(0, 7))).isoformat(),
                    "is_fraud": True,
                })

    return pd.DataFrame(edges)


def generate_fx_time_series(
    corridors: list[str] | None = None,
    n_hours: int = 2160,  # 90 days
) -> pd.DataFrame:
    """
    Generate realistic FX time series with:
    - Trend components (drift)
    - Volatility clustering (GARCH-like)
    - Regime changes (central bank interventions)
    - Intraday patterns
    - Weekend gaps
    """
    if corridors is None:
        corridors = ["NGN/USD", "KES/USD", "GHS/USD", "TZS/USD", "ZAR/USD", "ETB/USD"]

    all_rows = []
    base_time = datetime.now() - timedelta(hours=n_hours)

    for corridor in corridors:
        base_ccy = corridor.split("/")[0]
        base_rate = FX_RATES_VS_USD.get(base_ccy, 100.0)

        # GARCH-like volatility
        vol = 0.001  # initial volatility
        rate = base_rate
        regime = 0  # 0=normal, 1=crisis, 2=intervention

        for h in range(n_hours):
            t = base_time + timedelta(hours=h)

            # Skip weekends (lower liquidity, wider spreads)
            is_weekend = t.weekday() >= 5

            # Regime changes (every ~30 days)
            if h % 720 == 0 and h > 0:
                regime = random.choice([0, 0, 0, 1, 2])

            # Volatility clustering
            vol = max(0.0005, min(0.05, vol * 0.98 + 0.02 * abs(np.random.normal(0, 0.005))))
            if regime == 1:  # crisis
                vol *= 3
            elif regime == 2:  # intervention
                vol *= 0.3

            # Rate change
            drift = 0.00001 * (1 if regime == 1 else -0.5 if regime == 2 else 0)
            change = np.random.normal(drift, vol)
            rate *= (1 + change)

            # Intraday pattern (higher vol during market open)
            hour_of_day = t.hour
            if 8 <= hour_of_day <= 16:
                intraday_factor = 1.2
            else:
                intraday_factor = 0.7

            # Bid/ask spread
            spread_bps = random.uniform(10, 50) * (2 if is_weekend else 1) * (1.5 if regime == 1 else 1)
            bid = rate * (1 - spread_bps / 20000)
            ask = rate * (1 + spread_bps / 20000)

            volume = int(np.random.lognormal(8, 1.5) * intraday_factor * (0.2 if is_weekend else 1))

            all_rows.append({
                "corridor": corridor,
                "timestamp": t.isoformat(),
                "hour": h,
                "mid_rate": round(rate, 6),
                "bid": round(bid, 6),
                "ask": round(ask, 6),
                "spread_bps": round(spread_bps, 2),
                "volume": volume,
                "volatility": round(vol, 6),
                "regime": regime,
                "is_weekend": is_weekend,
            })

    return pd.DataFrame(all_rows)


def generate_entity_risk_data(
    users: pd.DataFrame,
    merchants: pd.DataFrame,
    n_entities: int = 3000,
) -> pd.DataFrame:
    """Generate entity risk profiles for risk scoring model training."""
    entities = []
    all_users = users.to_dict("records")
    all_merchants = merchants.to_dict("records")

    for i in range(n_entities):
        if random.random() < 0.4:
            # Use merchant data
            m = random.choice(all_merchants)
            entity_type = "merchant"
            country = m["country"]
            volume_30d = float(m["monthly_volume"])
            chargeback_rate = float(m["chargeback_rate"])
            kyb_status = m["kyb_status"]
            is_risky = (
                chargeback_rate > 0.03
                or m["category"] in MERCHANT_CATEGORIES[10:]
                or kyb_status in ("under_review", "rejected")
            )
        else:
            # Use user data
            u = random.choice(all_users)
            entity_type = random.choice(["individual", "institution"])
            country = u["country"]
            volume_30d = float(u["avg_txn_amount"]) * float(u["avg_monthly_txns"])
            chargeback_rate = round(max(0, np.random.normal(0.005, 0.005)), 4)
            kyb_status = "approved" if u["kyc_level"] == "enhanced" else "pending"
            is_risky = (
                u["is_pep"]
                or country in HIGH_RISK_COUNTRIES
                or chargeback_rate > 0.02
            )

        # Add noise to risk label
        if random.random() < 0.05:
            is_risky = not is_risky

        sanctions_hit = random.random() < 0.01
        if sanctions_hit:
            is_risky = True

        entities.append({
            "entity_id": f"entity_{i:06d}",
            "entity_type": entity_type,
            "country": country,
            "volume_30d": round(volume_30d, 2),
            "txn_count_30d": random.randint(1, 500),
            "chargeback_rate": chargeback_rate,
            "kyb_status": kyb_status,
            "sanctions_hit": sanctions_hit,
            "pep_match": random.random() < 0.03,
            "adverse_media_hits": random.randint(0, 3) if is_risky else 0,
            "account_age_days": random.randint(1, 1095),
            "is_high_risk": is_risky,
        })

    return pd.DataFrame(entities)


def generate_all(output_dir: Path | None = None) -> dict[str, pd.DataFrame]:
    """Generate all synthetic datasets and save to parquet."""
    if output_dir is None:
        output_dir = OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Generating users...")
    users = generate_users(5000)

    print("Generating merchants...")
    merchants = generate_merchants(1000)

    print("Generating transactions (100k)...")
    transactions = generate_transactions(users, merchants, 100000, fraud_rate=0.03)

    print("Generating transaction graph edges...")
    graph_edges = generate_transaction_graph(transactions, 50000)

    print("Generating FX time series (6 corridors x 90 days)...")
    fx_series = generate_fx_time_series()

    print("Generating entity risk profiles...")
    entity_risk = generate_entity_risk_data(users, merchants, 3000)

    datasets = {
        "users": users,
        "merchants": merchants,
        "transactions": transactions,
        "graph_edges": graph_edges,
        "fx_time_series": fx_series,
        "entity_risk": entity_risk,
    }

    for name, df in datasets.items():
        path = output_dir / f"{name}.parquet"
        df.to_parquet(path, index=False)
        print(f"  Saved {name}: {len(df):,} rows -> {path}")

    # Summary
    fraud_count = int(transactions["is_fraud"].sum())
    print(f"\n--- Summary ---")
    print(f"Users: {len(users):,}")
    print(f"Merchants: {len(merchants):,}")
    print(f"Transactions: {len(transactions):,} ({fraud_count:,} fraud = {fraud_count/len(transactions)*100:.1f}%)")
    print(f"Graph edges: {len(graph_edges):,}")
    print(f"FX time series: {len(fx_series):,} points")
    print(f"Entity risk profiles: {len(entity_risk):,}")

    return datasets


if __name__ == "__main__":
    generate_all()

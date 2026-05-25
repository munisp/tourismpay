"""
Synthetic BIS (Background Investigation Service) data generator.
Generates labeled investigation data for risk classification training.
"""
import numpy as np
import pandas as pd
from typing import Optional


INDUSTRIES = [
    "tourism", "hospitality", "restaurant", "transport", "retail",
    "finance", "technology", "healthcare", "education", "agriculture",
    "gambling", "crypto", "money_services", "shell_company",
    "precious_metals", "real_estate",
]

HIGH_RISK_INDUSTRIES = {"gambling", "crypto", "money_services", "shell_company", "precious_metals"}

COUNTRIES = [
    "NG", "KE", "GH", "TZ", "UG", "ZA", "ET", "CM", "CI", "SN",
    "US", "GB", "DE", "FR", "JP", "AE",
    "IR", "KP", "SY", "AF", "SD",  # sanctioned
]

HIGH_RISK_COUNTRIES = {"IR", "KP", "SY", "AF", "SD", "SO", "YE", "LY"}


def generate_bis_dataset(
    n_samples: int = 20_000,
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate synthetic BIS investigation dataset with risk labels.

    Labels: 0=low, 1=medium, 2=high, 3=critical
    """
    rng = np.random.default_rng(seed)

    countries = rng.choice(COUNTRIES, n_samples)
    industries = rng.choice(INDUSTRIES, n_samples)

    country_risk = np.array([0.9 if c in HIGH_RISK_COUNTRIES else 0.3 for c in countries])
    industry_risk = np.array([0.8 if i in HIGH_RISK_INDUSTRIES else 0.2 for i in industries])

    entity_age_days = rng.exponential(500, n_samples).clip(1, 5000).astype(int)
    txn_volume_30d = rng.lognormal(8, 2, n_samples).clip(100, 10_000_000)
    txn_count_30d = rng.poisson(50, n_samples)
    chargeback_rate = rng.beta(1, 50, n_samples)
    refund_rate = rng.beta(2, 30, n_samples)

    sanctions_hit = rng.choice([0, 1], n_samples, p=[0.97, 0.03])
    pep_connection = rng.choice([0, 1], n_samples, p=[0.95, 0.05])
    adverse_media = rng.poisson(0.3, n_samples)

    kyb_completeness = rng.beta(8, 2, n_samples)
    ubo_declared = rng.choice([0, 1], n_samples, p=[0.3, 0.7])
    cross_border_ratio = rng.beta(2, 5, n_samples)
    cash_intensive = rng.choice([0, 1], n_samples, p=[0.8, 0.2])

    prior_investigations = rng.poisson(0.5, n_samples)
    prior_risk_encoded = rng.choice([0, 1, 2, 3], n_samples, p=[0.5, 0.3, 0.15, 0.05])

    directors_count = rng.integers(1, 8, n_samples)
    shareholders_count = rng.integers(1, 10, n_samples)
    revenue_vs_volume = rng.lognormal(0, 0.5, n_samples).clip(0.1, 10)

    # Generate labels based on realistic correlations
    risk_score = (
        country_risk * 0.20 +
        industry_risk * 0.15 +
        (1 - entity_age_days / 5000) * 0.05 +
        np.clip(txn_volume_30d / 10_000_000, 0, 1) * 0.10 +
        chargeback_rate * 5 * 0.10 +
        sanctions_hit * 0.15 +
        pep_connection * 0.10 +
        np.clip(adverse_media / 5, 0, 1) * 0.05 +
        (1 - kyb_completeness) * 0.05 +
        prior_risk_encoded / 3 * 0.05 +
        rng.normal(0, 0.05, n_samples)  # noise
    )

    labels = np.digitize(risk_score, bins=[0.25, 0.45, 0.65]) # 0=low, 1=med, 2=high, 3=critical
    # Ensure minimum representation of each class for stratified split
    if (labels == 3).sum() < 50:
        top_indices = np.argsort(risk_score)[-max(50, int(n_samples * 0.005)):]
        labels[top_indices] = 3
    if (labels == 2).sum() < 100:
        high_indices = np.argsort(risk_score)[-max(200, int(n_samples * 0.01)):-max(50, int(n_samples * 0.005))]
        labels[high_indices] = 2

    df = pd.DataFrame({
        "country": countries,
        "industry": industries,
        "country_risk_score": country_risk,
        "industry_risk_score": industry_risk,
        "entity_age_days": entity_age_days,
        "transaction_volume_30d": np.round(txn_volume_30d, 2),
        "transaction_count_30d": txn_count_30d,
        "chargeback_rate": np.round(chargeback_rate, 6),
        "refund_rate": np.round(refund_rate, 6),
        "sanctions_hit": sanctions_hit,
        "pep_connection": pep_connection,
        "adverse_media_count": adverse_media,
        "kyb_completeness_score": np.round(kyb_completeness, 4),
        "ubo_declared": ubo_declared,
        "cross_border_ratio": np.round(cross_border_ratio, 4),
        "cash_intensive": cash_intensive,
        "prior_investigations": prior_investigations,
        "prior_risk_level_encoded": prior_risk_encoded,
        "directors_count": directors_count,
        "shareholders_count": shareholders_count,
        "revenue_vs_volume_ratio": np.round(revenue_vs_volume, 4),
        "risk_label": labels,
    })

    return df


if __name__ == "__main__":
    print("Generating BIS dataset...")
    df = generate_bis_dataset()
    df.to_parquet("bis_investigations.parquet", index=False)
    print(f"  Shape: {df.shape}")
    print(f"  Label distribution:\n{df['risk_label'].value_counts().sort_index()}")
    print("Done.")

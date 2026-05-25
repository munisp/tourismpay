"""
Synthetic FX rate data generator for time-series forecasting models.
Generates realistic hourly exchange rate data with:
- Trend components (macro drift)
- Seasonal patterns (intraday, weekly)
- Volatility clustering (GARCH-like)
- Jump events (news shocks)
- Spread and volume data
"""
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Optional


CORRIDORS = {
    "NGN/USD": {"base_rate": 1580.0, "volatility": 0.025, "drift": 0.0001},
    "KES/USD": {"base_rate": 129.5, "volatility": 0.012, "drift": 0.00005},
    "GHS/USD": {"base_rate": 15.2, "volatility": 0.018, "drift": 0.00008},
    "TZS/USD": {"base_rate": 2530.0, "volatility": 0.008, "drift": 0.00003},
    "ZAR/USD": {"base_rate": 18.7, "volatility": 0.015, "drift": 0.00002},
    "UGX/USD": {"base_rate": 3750.0, "volatility": 0.010, "drift": 0.00004},
    "ETB/USD": {"base_rate": 56.8, "volatility": 0.010, "drift": 0.00006},
    "EUR/USD": {"base_rate": 0.92, "volatility": 0.005, "drift": 0.00001},
}


def generate_fx_dataset(
    corridors: Optional[List[str]] = None,
    n_hours: int = 8760,  # 1 year of hourly data
    seed: int = 42,
) -> pd.DataFrame:
    """
    Generate synthetic FX rate time series with features for forecasting.
    """
    rng = np.random.default_rng(seed)
    corridors = corridors or list(CORRIDORS.keys())
    all_data = []

    for corridor in corridors:
        cfg = CORRIDORS.get(corridor, CORRIDORS["NGN/USD"])
        data = _generate_single_corridor(corridor, cfg, n_hours, rng)
        all_data.append(data)

    df = pd.concat(all_data, ignore_index=True)
    return df


def _generate_single_corridor(
    corridor: str, cfg: dict, n_hours: int, rng: np.random.Generator
) -> pd.DataFrame:
    base_rate = cfg["base_rate"]
    vol = cfg["volatility"]
    drift = cfg["drift"]

    # Generate price path with stochastic volatility
    rates = np.zeros(n_hours)
    rates[0] = base_rate
    volatilities = np.zeros(n_hours)
    volatilities[0] = vol

    for t in range(1, n_hours):
        # GARCH(1,1)-like volatility clustering
        shock = rng.standard_normal()
        volatilities[t] = np.sqrt(
            0.00001 + 0.85 * volatilities[t - 1] ** 2 + 0.10 * (shock * volatilities[t - 1]) ** 2
        )

        # Intraday seasonality (lower vol during night)
        hour = t % 24
        seasonal = 1.0 + 0.3 * np.sin(2 * np.pi * (hour - 10) / 24)

        # Weekly seasonality (lower vol on weekends)
        day = (t // 24) % 7
        weekly = 0.5 if day >= 5 else 1.0

        # Jump events (~0.5% chance per hour)
        jump = 0.0
        if rng.random() < 0.005:
            jump = rng.normal(0, vol * 5)

        dt_rate = drift + volatilities[t] * seasonal * weekly * shock + jump
        rates[t] = rates[t - 1] * (1 + dt_rate)

    # Generate timestamps
    start = datetime(2025, 1, 1)
    timestamps = [start + timedelta(hours=i) for i in range(n_hours)]

    # Compute features
    rates_series = pd.Series(rates)
    sma_24 = rates_series.rolling(24, min_periods=1).mean()
    ema_12 = rates_series.ewm(span=12, min_periods=1).mean()

    # RSI
    delta = rates_series.diff()
    gain = delta.clip(lower=0).rolling(14, min_periods=1).mean()
    loss = (-delta.clip(upper=0)).rolling(14, min_periods=1).mean()
    rs = gain / loss.clip(lower=1e-10)
    rsi = 100 - (100 / (1 + rs))

    # Volume (synthetic, correlated with volatility)
    base_volume = rng.lognormal(10, 1.5, n_hours)
    volume = base_volume * (1 + 2 * np.abs(np.diff(rates, prepend=rates[0])) / rates)

    # Spread (wider during volatility)
    spread_bps = 5 + 20 * volatilities / vol

    hours = np.array([t.hour for t in timestamps])
    dows = np.array([t.weekday() for t in timestamps])

    return pd.DataFrame({
        "corridor": corridor,
        "timestamp": timestamps,
        "rate": rates,
        "rate_sma_24": sma_24.values,
        "rate_ema_12": ema_12.values,
        "rate_rsi_14": rsi.values,
        "volume": volume,
        "spread": spread_bps,
        "volatility_24h": pd.Series(volatilities).rolling(24, min_periods=1).std().values,
        "hour_sin": np.sin(2 * np.pi * hours / 24),
        "hour_cos": np.cos(2 * np.pi * hours / 24),
        "dow_sin": np.sin(2 * np.pi * dows / 7),
        "dow_cos": np.cos(2 * np.pi * dows / 7),
        "returns_1h": rates_series.pct_change().fillna(0).values,
        "returns_24h": rates_series.pct_change(24).fillna(0).values,
    })


if __name__ == "__main__":
    print("Generating FX dataset...")
    df = generate_fx_dataset()
    df.to_parquet("fx_rates.parquet", index=False)
    print(f"  Shape: {df.shape}, Corridors: {df['corridor'].nunique()}")
    print(f"  Date range: {df['timestamp'].min()} to {df['timestamp'].max()}")
    print("Done.")

# TourismPay ML/AI Stack

Real end-to-end machine learning pipeline with trained models, not rule-based heuristics.

## Models

| Model | Type | Framework | Task | Metrics |
|-------|------|-----------|------|---------|
| **Fraud XGBoost** | Gradient Boosted Trees | XGBoost | Binary fraud classification | AUC-ROC: 1.00, AUC-PR: 1.00 |
| **Fraud GNN** | Graph Attention Network (GATv2) | PyTorch Geometric | Node-level fraud ring detection | Val AUC: 0.76, F1: 0.04 |
| **FX Transformer** | Encoder-Decoder Transformer | PyTorch | Multi-step FX rate forecasting | Gaussian NLL loss |
| **BIS Risk LightGBM** | Gradient Boosted Trees | LightGBM | Multi-class risk classification | AUC-ROC: 0.90, F1-weighted: 0.80 |

## Architecture

```
ml/
├── configs/           # Model hyperparameters and training configs
├── data_generators/   # Synthetic data generators for training
│   ├── fraud_data.py  # 100K transaction dataset with fraud labels
│   ├── fx_data.py     # Hourly FX rates with GARCH volatility
│   └── bis_data.py    # Entity risk investigation data
├── models/
│   ├── fraud/         # XGBoost tabular fraud detector
│   ├── gnn_fraud/     # GATv2 graph neural network
│   ├── fx_forecast/   # Transformer time-series forecaster
│   └── bis_risk/      # LightGBM risk classifier
├── training/
│   └── train_all.py   # Master training script
├── inference/
│   └── serve.py       # FastAPI inference server (port 8200)
├── continuous_training/
│   └── pipeline.py    # Drift detection + auto-retraining
├── ray_jobs/
│   └── distributed_training.py  # Ray parallel training + tuning
├── neo4j_integration/
│   └── graph_store.py # Neo4j entity graph (NetworkX fallback)
├── lakehouse/
│   └── feature_store.py  # Delta Lake feature store
├── saved_models/      # Trained model weights
│   ├── fraud_xgb/     # XGBoost JSON + metadata
│   ├── gnn_fraud/     # PyTorch .pt weights
│   ├── fx_transformer/ # PyTorch .pt weights
│   └── bis_risk_lgbm/ # LightGBM model
├── Dockerfile         # ML inference container
└── requirements.txt   # Python dependencies
```

## Quick Start

### Install Dependencies
```bash
pip install -r ml/requirements.txt
```

### Train All Models
```bash
python -m ml.training.train_all --output-dir ./ml/saved_models
```

### Run Inference Server
```bash
python -m ml.inference.serve
# Server runs on http://localhost:8200
```

### API Endpoints
- `POST /api/v1/ml/fraud/score` — Score a transaction for fraud (XGBoost)
- `POST /api/v1/ml/fraud/gnn-score` — Score a transaction graph (GNN)
- `POST /api/v1/ml/fx/forecast` — Forecast FX rates (Transformer)
- `POST /api/v1/ml/bis/risk-score` — Score entity risk (LightGBM)
- `GET  /api/v1/ml/models` — List available models
- `POST /api/v1/ml/models/reload` — Hot-reload models from disk
- `GET  /health` — Health check

### Docker
```bash
docker compose --profile ml up ml-inference neo4j
```

## Continuous Training

The pipeline monitors platform data for drift and retrains automatically:

```python
from ml.continuous_training.pipeline import ContinuousTrainingPipeline

pipeline = ContinuousTrainingPipeline()
result = pipeline.run_cycle()
```

Features:
- **PSI drift detection** on all feature columns
- **Champion-Challenger** model promotion (new model must beat current)
- **Model registry** with versioning and artifact tracking
- **Scheduled retraining** (configurable interval, default 24h)
- **Minimum sample threshold** before retraining

## Ray Distributed Training

```bash
# Parallel training of all models
python -m ml.ray_jobs.distributed_training --mode parallel

# Hyperparameter tuning with Ray Tune
python -m ml.ray_jobs.distributed_training --mode tune --n-trials 20

# Scheduled retraining job
python -m ml.ray_jobs.distributed_training --mode scheduled
```

## Key Design Decisions

1. **CPU inference** — All models run on CPU via native frameworks (no GPU required). ONNX export available for even faster CPU inference.
2. **Synthetic training data** — Generators produce realistic data with known fraud patterns, not random noise. This allows training without real PII data.
3. **NetworkX fallback** — Neo4j graph operations fall back to in-memory NetworkX when Neo4j is unavailable.
4. **Delta Lake fallback** — Feature store falls back to plain Parquet when deltalake library is not installed.
5. **No Spark dependency** — Uses PyArrow + deltalake directly, no heavyweight Spark cluster needed.

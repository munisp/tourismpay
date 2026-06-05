"""
ML Model API Router - Phase 2
Endpoints for training and evaluating ML models
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any

from app.services.ml_model_service import MLModelService
from app.services.database import get_db

router = APIRouter()

@router.post("/train/xgboost")
async def train_xgboost_model(
    min_samples: int = 10000,
    db: Session = Depends(get_db)
):
    """Train XGBoost credit scoring model"""
    service = MLModelService(db)
    result = await service.train_xgboost_model(min_samples)
    return result

@router.post("/train/neural-net")
async def train_neural_network(
    min_samples: int = 10000,
    epochs: int = 50,
    db: Session = Depends(get_db)
):
    """Train Neural Network credit scoring model"""
    service = MLModelService(db)
    result = await service.train_neural_network(min_samples, epochs)
    return result

@router.get("/models/{model_version}/performance")
async def get_model_performance(
    model_version: str,
    db: Session = Depends(get_db)
):
    """Get model performance metrics"""
    service = MLModelService(db)
    metrics = await service.get_model_performance(model_version)
    if not metrics:
        raise HTTPException(status_code=404, detail="Model version not found")
    return metrics

@router.get("/models/compare")
async def compare_models(
    model1: str,
    model2: str,
    db: Session = Depends(get_db)
):
    """Compare two model versions"""
    service = MLModelService(db)
    comparison = await service.compare_models(model1, model2)
    return comparison

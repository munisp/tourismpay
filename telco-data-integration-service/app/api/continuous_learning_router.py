"""
Continuous Learning API Router - Phase 4
Endpoints for automated retraining and monitoring
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.services.continuous_learning_service import ContinuousLearningService
from app.services.database import get_db

router = APIRouter()

@router.post("/retrain")
async def trigger_retraining(
    model_type: str = "xgboost",
    db: Session = Depends(get_db)
):
    """Manually trigger model retraining"""
    service = ContinuousLearningService(db)
    result = await service.retrain_model(model_type)
    return result

@router.get("/drift/check")
async def check_model_drift(
    model_version: str,
    lookback_days: int = 30,
    db: Session = Depends(get_db)
):
    """Check for model drift"""
    service = ContinuousLearningService(db)
    drift_report = await service.check_model_drift(model_version, lookback_days)
    return drift_report

@router.post("/ab-test/start")
async def start_ab_test(
    model_a: str,
    model_b: str,
    traffic_split: float = 0.5,
    db: Session = Depends(get_db)
):
    """Start A/B test between two models"""
    service = ContinuousLearningService(db)
    test_id = await service.start_ab_test(model_a, model_b, traffic_split)
    return {"test_id": test_id, "status": "started"}

@router.get("/ab-test/{test_id}/results")
async def get_ab_test_results(
    test_id: str,
    db: Session = Depends(get_db)
):
    """Get A/B test results"""
    service = ContinuousLearningService(db)
    results = await service.get_ab_test_results(test_id)
    return results

@router.get("/performance/history")
async def get_performance_history(
    model_version: str = None,
    days: int = 90,
    db: Session = Depends(get_db)
):
    """Get model performance history"""
    service = ContinuousLearningService(db)
    history = await service.get_performance_history(model_version, days)
    return history

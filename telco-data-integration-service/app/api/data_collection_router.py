"""
Data Collection API Router - Phase 1
Endpoints for tracking loan outcomes and building ML datasets
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.services.data_collection_service import DataCollectionService
from app.services.database import get_db

router = APIRouter()

@router.post("/loan-applications")
async def record_loan_application(
    customer_id: str,
    phone_number: str,
    credit_score: int,
    loan_amount: float,
    db: Session = Depends(get_db)
):
    """Record a new loan application"""
    service = DataCollectionService(db)
    application = await service.record_loan_application(
        customer_id, phone_number, credit_score, loan_amount
    )
    return {"application_id": str(application.id), "status": "recorded"}

@router.post("/loan-applications/{application_id}/outcome")
async def record_loan_outcome(
    application_id: str,
    defaulted: bool,
    days_to_default: int = None,
    db: Session = Depends(get_db)
):
    """Record loan outcome (default or successful repayment)"""
    service = DataCollectionService(db)
    await service.record_loan_outcome(application_id, defaulted, days_to_default)
    return {"status": "outcome_recorded"}

@router.get("/datasets/export")
async def export_training_dataset(
    min_records: int = 1000,
    db: Session = Depends(get_db)
):
    """Export ML training dataset"""
    service = DataCollectionService(db)
    dataset = await service.export_training_dataset(min_records)
    return {
        "dataset_size": len(dataset),
        "features": dataset[0].keys() if dataset else [],
        "data": dataset
    }

@router.get("/statistics")
async def get_collection_statistics(db: Session = Depends(get_db)):
    """Get data collection statistics"""
    service = DataCollectionService(db)
    stats = await service.get_statistics()
    return stats

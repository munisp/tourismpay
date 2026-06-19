"""
KYC AI Engine — Next-Generation Identity & Document Verification

FastAPI service integrating:
- PaddleOCR for document text extraction (ID cards, passports, business docs)
- Florence-2 VLM for document understanding and fraud detection
- Docling for structured business document parsing (CAC, tax clearance)
- Multi-layered liveness detection (MediaPipe + MiniFAS + MiDaS + LBP)
- InsightFace ArcFace for face matching (selfie vs ID photo)

Endpoints:
  POST /api/v1/ocr/extract         — OCR text + MRZ from document image
  POST /api/v1/vlm/analyze         — VLM document classification + fraud analysis
  POST /api/v1/docling/parse       — Structured business document parsing
  POST /api/v1/liveness/detect     — Multi-layer liveness detection
  POST /api/v1/liveness/challenge  — Generate active challenge sequence
  POST /api/v1/face/match          — Face matching (selfie vs ID)
  POST /api/v1/face/embedding      — Generate face embedding for storage
  POST /api/v1/kyc/verify-full     — Full KYC pipeline (OCR + VLM + face match + liveness)
  POST /api/v1/kyb/verify-document — Full KYB document pipeline (Docling + VLM + cross-check)
  GET  /health                     — Health check with model status

Port: 8100 (configurable via KYC_AI_PORT env var)
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Local modules
from ocr.paddle_ocr import DocumentType, extract_document_text, cross_validate_ocr_mrz
from vlm.document_vlm import analyze_document
from docling_parser.business_docs import BusinessDocType, parse_business_document, validate_business_document
from liveness.detector import detect_liveness, generate_challenge_sequence
from face_matching.matcher import match_faces, generate_embedding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(os.environ.get("KYC_UPLOAD_DIR", "/tmp/kyc-uploads"))
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


# ── Models ───────────────────────────────────────────────────────────────────


class OCRRequest(BaseModel):
    document_type: str = "passport"
    country: str = "NG"


class VLMRequest(BaseModel):
    expected_type: Optional[str] = None


class DoclingRequest(BaseModel):
    expected_type: Optional[str] = None
    claimed_entity: Optional[dict[str, str]] = None


class LivenessRequest(BaseModel):
    challenges: Optional[list[dict[str, Any]]] = None


class ChallengeRequest(BaseModel):
    difficulty: str = "medium"


class FaceMatchRequest(BaseModel):
    threshold: float = 0.45


class FullKYCRequest(BaseModel):
    document_type: str = "passport"
    country: str = "NG"
    full_name: str = ""
    date_of_birth: str = ""
    document_number: str = ""


class FullKYBRequest(BaseModel):
    expected_type: Optional[str] = None
    company_name: str = ""
    rc_number: str = ""
    tin_number: str = ""


class HealthResponse(BaseModel):
    status: str
    version: str
    models: dict[str, str]
    timestamp: str


# ── Lifespan ─────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"KYC AI Engine starting — upload dir: {UPLOAD_DIR}")
    yield
    logger.info("KYC AI Engine shutting down")


app = FastAPI(
    title="TourismPay KYC AI Engine",
    version="1.0.0",
    description="Next-gen identity verification with PaddleOCR, Florence-2, Docling, MediaPipe, InsightFace",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _save_upload(upload: UploadFile) -> str:
    """Save uploaded file to temp directory, return path."""
    ext = Path(upload.filename or "doc.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOAD_DIR / filename

    content = await upload.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large ({len(content)} bytes). Max: {MAX_FILE_SIZE}")

    filepath.write_bytes(content)
    return str(filepath)


async def _download_url(url: str) -> str:
    """Download a file from URL and save locally."""
    ext = Path(url.split("?")[0]).suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOAD_DIR / filename

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        filepath.write_bytes(resp.content)

    return str(filepath)


def _serialize_numpy(obj: Any) -> Any:
    """Convert numpy types to JSON-serializable Python types."""
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    if isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    if isinstance(obj, dict):
        return {k: _serialize_numpy(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize_numpy(v) for v in obj]
    return obj


# ── OCR Endpoint ─────────────────────────────────────────────────────────────


@app.post("/api/v1/ocr/extract")
async def ocr_extract(
    file: UploadFile = File(...),
    document_type: str = Form("passport"),
    country: str = Form("NG"),
):
    """Extract text, MRZ, and structured fields from a document image."""
    filepath = await _save_upload(file)
    try:
        doc_type = DocumentType(document_type)
    except ValueError:
        doc_type = DocumentType.PASSPORT

    result = await extract_document_text(filepath, doc_type, country)
    cross_val = await cross_validate_ocr_mrz(result)

    return _serialize_numpy({
        "success": True,
        "document_type": result.document_type.value,
        "fields": [
            {"key": f.key, "value": f.value, "confidence": f.confidence, "bbox": f.bbox}
            for f in result.fields
        ],
        "mrz": {
            "valid": result.mrz.valid if result.mrz else False,
            "document_number": result.mrz.document_number if result.mrz else None,
            "surname": result.mrz.surname if result.mrz else None,
            "given_names": result.mrz.given_names if result.mrz else None,
            "nationality": result.mrz.nationality if result.mrz else None,
            "date_of_birth": result.mrz.date_of_birth if result.mrz else None,
            "expiry_date": result.mrz.expiry_date if result.mrz else None,
            "check_digits_valid": result.mrz.check_digits_valid if result.mrz else False,
        } if result.mrz else None,
        "cross_validation": cross_val,
        "raw_text": result.raw_text,
        "overall_confidence": result.overall_confidence,
        "warnings": result.warnings,
    })


# ── VLM Endpoint ─────────────────────────────────────────────────────────────


@app.post("/api/v1/vlm/analyze")
async def vlm_analyze(
    file: UploadFile = File(...),
    expected_type: Optional[str] = Form(None),
):
    """Analyze document with VLM for classification, fraud detection, and quality."""
    filepath = await _save_upload(file)
    result = await analyze_document(filepath, expected_type)

    return _serialize_numpy({
        "success": True,
        "classification": {
            "predicted_type": result.classification.predicted_type,
            "confidence": result.classification.confidence,
            "is_id_document": result.classification.is_id_document,
            "country_detected": result.classification.country_detected,
        },
        "fraud_analysis": {
            "is_authentic": result.fraud_analysis.is_authentic,
            "authenticity_score": result.fraud_analysis.authenticity_score,
            "signals": [s.value for s in result.fraud_analysis.signals],
            "details": result.fraud_analysis.details,
            "recommendations": result.fraud_analysis.recommendations,
        },
        "quality": {
            "overall_score": result.quality.overall_score,
            "sharpness": result.quality.sharpness,
            "lighting": result.quality.lighting,
            "glare": result.quality.glare,
            "occlusion": result.quality.occlusion,
            "warnings": result.quality.warnings,
        },
        "visual_fields": result.visual_fields,
        "model_used": result.model_used,
    })


# ── Docling Endpoint ─────────────────────────────────────────────────────────


@app.post("/api/v1/docling/parse")
async def docling_parse(
    file: UploadFile = File(...),
    expected_type: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    rc_number: Optional[str] = Form(None),
    tin_number: Optional[str] = Form(None),
):
    """Parse business document (CAC cert, tax clearance, etc.) with Docling."""
    filepath = await _save_upload(file)
    doc_type = BusinessDocType(expected_type) if expected_type else None

    result = await parse_business_document(filepath, doc_type)

    claimed = {}
    if company_name:
        claimed["company_name"] = company_name
    if rc_number:
        claimed["rc_number"] = rc_number
    if tin_number:
        claimed["tin_number"] = tin_number

    validation = await validate_business_document(result, claimed if claimed else None)

    return _serialize_numpy({
        "success": True,
        "document_type": result.document_type.value,
        "entity": {
            "company_name": result.entity.company_name,
            "rc_number": result.entity.rc_number,
            "tin_number": result.entity.tin_number,
            "registration_date": result.entity.registration_date,
            "registered_address": result.entity.registered_address,
            "nature_of_business": result.entity.nature_of_business,
            "share_capital": result.entity.share_capital,
            "directors": [
                {"name": d.name, "position": d.position, "nationality": d.nationality}
                for d in result.entity.directors
            ],
        },
        "tables": [
            {"headers": t.headers, "rows": t.rows, "confidence": t.confidence}
            for t in result.tables
        ],
        "sections": result.sections,
        "validation": validation,
        "confidence": result.confidence,
        "method": result.method,
        "warnings": result.warnings,
    })


# ── Liveness Endpoints ───────────────────────────────────────────────────────


@app.post("/api/v1/liveness/detect")
async def liveness_detect(
    file: UploadFile = File(...),
    challenges: Optional[str] = Form(None),
):
    """Multi-layered liveness detection with optional active challenges."""
    import json

    filepath = await _save_upload(file)
    challenge_list = json.loads(challenges) if challenges else None

    result = await detect_liveness(filepath, challenge_list)

    return _serialize_numpy({
        "success": True,
        "is_live": result.is_live,
        "overall_score": result.overall_score,
        "anti_spoof": {
            "is_live": result.anti_spoof.is_live,
            "live_probability": result.anti_spoof.live_probability,
            "spoof_type": result.anti_spoof.spoof_type.value,
            "method": result.anti_spoof.method,
            "details": result.anti_spoof.details,
        },
        "depth": {
            "has_3d_structure": result.depth.has_3d_structure,
            "depth_variance": result.depth.depth_variance,
            "nose_protrusion": result.depth.nose_protrusion,
            "score": result.depth.score,
        } if result.depth else None,
        "texture": {
            "lbp_score": result.texture.lbp_score,
            "frequency_score": result.texture.frequency_score,
            "is_natural_texture": result.texture.is_natural_texture,
            "spoof_indicators": result.texture.spoof_indicators,
        },
        "challenges": [
            {
                "type": cr.challenge_type.value,
                "passed": cr.passed,
                "score": cr.score,
                "response_time_ms": cr.response_time_ms,
            }
            for cr in result.challenges
        ],
        "landmarks_detected": result.landmarks_detected,
        "face_quality": result.face_quality,
        "method": result.method,
        "warnings": result.warnings,
    })


@app.post("/api/v1/liveness/challenge")
async def liveness_challenge(req: ChallengeRequest):
    """Generate a liveness challenge sequence."""
    challenges = await generate_challenge_sequence(req.difficulty)
    return {"success": True, "challenges": challenges}


@app.post("/api/v1/liveness/video")
async def liveness_video(
    frames: list[UploadFile] = File(...),
    challenges: Optional[str] = Form(None),
):
    """
    Video-based liveness detection with temporal consistency analysis.

    Accepts multiple video frames (5-30) and analyzes:
    - Per-frame liveness (MediaPipe + MiniFAS + MiDaS + LBP)
    - Landmark trajectory (micro-movements vs static)
    - Blink detection across frames (EAR temporal signal)
    - Head pose variation (involuntary sway)
    - Optical flow (screen replay detection)
    """
    from liveness.detector import detect_video_liveness
    import json

    frame_paths: list[str] = []
    for f in frames:
        fp = await _save_upload(f)
        frame_paths.append(fp)

    parsed_challenges = None
    if challenges:
        try:
            parsed_challenges = json.loads(challenges)
        except (json.JSONDecodeError, TypeError):
            pass

    result = await detect_video_liveness(frame_paths, parsed_challenges)

    return _serialize_numpy({
        "success": True,
        "is_live": result.is_live,
        "overall_score": result.overall_score,
        "per_frame_scores": result.per_frame_scores,
        "temporal": {
            "is_consistent": result.temporal.is_consistent,
            "motion_score": result.temporal.motion_score,
            "landmark_stability": result.temporal.landmark_stability,
            "blink_detected": result.temporal.blink_detected,
            "micro_movements": result.temporal.micro_movements,
            "frame_count": result.temporal.frame_count,
            "fps_estimated": result.temporal.fps_estimated,
            "spoof_indicators": result.temporal.spoof_indicators,
        },
        "single_frame": {
            "is_live": result.single_frame.is_live,
            "overall_score": result.single_frame.overall_score,
            "method": result.single_frame.method,
        },
        "method": result.method,
        "warnings": result.warnings,
    })


# ── Face Matching Endpoints ──────────────────────────────────────────────────


@app.post("/api/v1/face/match")
async def face_match(
    selfie: UploadFile = File(...),
    document: UploadFile = File(...),
    threshold: float = Form(0.45),
):
    """Match selfie face against document photo using ArcFace embeddings."""
    selfie_path = await _save_upload(selfie)
    doc_path = await _save_upload(document)

    result = await match_faces(selfie_path, doc_path, threshold)

    return _serialize_numpy({
        "success": True,
        "is_match": result.is_match,
        "similarity": result.similarity,
        "threshold": result.threshold,
        "confidence_level": result.confidence_level,
        "selfie_quality": {
            "overall": result.selfie_quality.overall,
            "sharpness": result.selfie_quality.sharpness,
            "pose_score": result.selfie_quality.pose_score,
            "is_acceptable": result.selfie_quality.is_acceptable,
            "issues": result.selfie_quality.issues,
        },
        "document_quality": {
            "overall": result.document_quality.overall,
            "sharpness": result.document_quality.sharpness,
            "pose_score": result.document_quality.pose_score,
            "is_acceptable": result.document_quality.is_acceptable,
            "issues": result.document_quality.issues,
        },
        "method": result.method,
        "warnings": result.warnings,
    })


@app.post("/api/v1/face/embedding")
async def face_embedding(file: UploadFile = File(...)):
    """Generate a face embedding for storage/later comparison."""
    filepath = await _save_upload(file)
    result = await generate_embedding(filepath)
    return _serialize_numpy(result)


# ── Full Pipeline Endpoints ──────────────────────────────────────────────────


@app.post("/api/v1/kyc/verify-full")
async def kyc_verify_full(
    document_front: UploadFile = File(...),
    selfie: UploadFile = File(...),
    document_back: Optional[UploadFile] = File(None),
    document_type: str = Form("passport"),
    country: str = Form("NG"),
    full_name: str = Form(""),
    date_of_birth: str = Form(""),
    document_number: str = Form(""),
):
    """
    Full KYC verification pipeline:
    1. PaddleOCR → Extract text + MRZ from document
    2. Florence-2 VLM → Document classification + fraud detection
    3. InsightFace → Face matching (selfie vs document photo)
    4. MediaPipe + MiniFAS → Liveness detection on selfie
    5. Cross-validation of all signals → final risk score
    """
    front_path = await _save_upload(document_front)
    selfie_path = await _save_upload(selfie)
    back_path = await _save_upload(document_back) if document_back else None

    # Run OCR, VLM, face match, and liveness in parallel
    try:
        doc_type = DocumentType(document_type)
    except ValueError:
        doc_type = DocumentType.PASSPORT

    ocr_task = extract_document_text(front_path, doc_type, country)
    vlm_task = analyze_document(front_path, document_type)
    face_task = match_faces(selfie_path, front_path)
    liveness_task = detect_liveness(selfie_path)

    ocr_result, vlm_result, face_result, liveness_result = await asyncio.gather(
        ocr_task, vlm_task, face_task, liveness_task,
    )

    # Cross-validate OCR vs MRZ
    cross_val = await cross_validate_ocr_mrz(ocr_result)

    # Cross-validate OCR vs user input
    input_mismatches: list[dict[str, str]] = []
    if full_name and ocr_result.mrz and ocr_result.mrz.surname:
        name_upper = full_name.upper()
        mrz_name = f"{ocr_result.mrz.surname} {ocr_result.mrz.given_names}".upper()
        if name_upper not in mrz_name and mrz_name not in name_upper:
            input_mismatches.append({"field": "full_name", "input": full_name, "ocr": mrz_name})
    if document_number and ocr_result.mrz and ocr_result.mrz.document_number:
        if document_number.upper() != ocr_result.mrz.document_number.upper():
            input_mismatches.append({"field": "document_number", "input": document_number, "ocr": ocr_result.mrz.document_number})

    # Composite risk score
    scores = {
        "ocr_confidence": ocr_result.overall_confidence,
        "vlm_authenticity": vlm_result.fraud_analysis.authenticity_score,
        "face_similarity": face_result.similarity,
        "liveness_score": liveness_result.overall_score,
        "document_quality": vlm_result.quality.overall_score,
    }

    weights = {"ocr_confidence": 0.15, "vlm_authenticity": 0.20, "face_similarity": 0.25, "liveness_score": 0.25, "document_quality": 0.15}
    overall_score = sum(scores[k] * weights[k] for k in scores)

    # Determine decision
    if overall_score >= 0.70 and face_result.is_match and liveness_result.is_live and not input_mismatches:
        decision = "approved"
    elif overall_score >= 0.50 or (face_result.is_match and liveness_result.is_live):
        decision = "manual_review"
    else:
        decision = "rejected"

    risk_level = "low" if overall_score >= 0.75 else "medium" if overall_score >= 0.50 else "high"

    return _serialize_numpy({
        "success": True,
        "decision": decision,
        "overall_score": overall_score,
        "risk_level": risk_level,
        "scores": scores,
        "ocr": {
            "confidence": ocr_result.overall_confidence,
            "mrz_valid": ocr_result.mrz.valid if ocr_result.mrz else False,
            "fields_extracted": len(ocr_result.fields),
        },
        "vlm": {
            "document_type": vlm_result.classification.predicted_type,
            "authenticity_score": vlm_result.fraud_analysis.authenticity_score,
            "fraud_signals": [s.value for s in vlm_result.fraud_analysis.signals],
            "quality_score": vlm_result.quality.overall_score,
        },
        "face_match": {
            "is_match": face_result.is_match,
            "similarity": face_result.similarity,
            "confidence_level": face_result.confidence_level,
        },
        "liveness": {
            "is_live": liveness_result.is_live,
            "score": liveness_result.overall_score,
            "method": liveness_result.method,
        },
        "cross_validation": {
            "ocr_vs_mrz": cross_val,
            "input_mismatches": input_mismatches,
        },
        "warnings": (
            ocr_result.warnings + vlm_result.quality.warnings
            + face_result.warnings + liveness_result.warnings
        ),
    })


@app.post("/api/v1/kyb/verify-document")
async def kyb_verify_document(
    file: UploadFile = File(...),
    expected_type: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    rc_number: Optional[str] = Form(None),
    tin_number: Optional[str] = Form(None),
):
    """
    Full KYB document verification pipeline:
    1. Docling → Parse business document structure
    2. Florence-2 VLM → Document authenticity + fraud analysis
    3. Cross-validate extracted data against claimed entity info
    """
    filepath = await _save_upload(file)
    doc_type = BusinessDocType(expected_type) if expected_type else None

    # Run Docling and VLM in parallel
    docling_task = parse_business_document(filepath, doc_type)
    vlm_task = analyze_document(filepath, expected_type)

    docling_result, vlm_result = await asyncio.gather(docling_task, vlm_task)

    # Validate against claimed entity
    claimed = {}
    if company_name:
        claimed["company_name"] = company_name
    if rc_number:
        claimed["rc_number"] = rc_number
    if tin_number:
        claimed["tin_number"] = tin_number

    validation = await validate_business_document(docling_result, claimed if claimed else None)

    # Composite score
    extraction_score = docling_result.confidence
    authenticity_score = vlm_result.fraud_analysis.authenticity_score
    validation_score = 1.0 if validation.get("risk_level") == "low" else 0.5 if validation.get("risk_level") == "medium" else 0.2

    overall = extraction_score * 0.35 + authenticity_score * 0.35 + validation_score * 0.30
    decision = "approved" if overall >= 0.65 else "manual_review" if overall >= 0.40 else "rejected"

    return _serialize_numpy({
        "success": True,
        "decision": decision,
        "overall_score": overall,
        "docling": {
            "document_type": docling_result.document_type.value,
            "entity": {
                "company_name": docling_result.entity.company_name,
                "rc_number": docling_result.entity.rc_number,
                "tin_number": docling_result.entity.tin_number,
                "registration_date": docling_result.entity.registration_date,
            },
            "confidence": docling_result.confidence,
            "method": docling_result.method,
        },
        "vlm": {
            "authenticity_score": vlm_result.fraud_analysis.authenticity_score,
            "fraud_signals": [s.value for s in vlm_result.fraud_analysis.signals],
            "quality_score": vlm_result.quality.overall_score,
        },
        "validation": validation,
        "warnings": docling_result.warnings + vlm_result.quality.warnings,
    })


# ── Health Check ─────────────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check with model status."""
    model_status = {}

    try:
        from paddleocr import PaddleOCR
        model_status["paddleocr"] = "available"
    except ImportError:
        model_status["paddleocr"] = "not_installed"

    try:
        from transformers import AutoModelForCausalLM
        model_status["florence2_vlm"] = "available"
    except ImportError:
        model_status["florence2_vlm"] = "not_installed"

    try:
        from docling.document_converter import DocumentConverter
        model_status["docling"] = "available"
    except ImportError:
        model_status["docling"] = "not_installed"

    try:
        import mediapipe
        model_status["mediapipe"] = "available"
    except ImportError:
        model_status["mediapipe"] = "not_installed"

    try:
        from insightface.app import FaceAnalysis
        model_status["insightface"] = "available"
    except ImportError:
        model_status["insightface"] = "not_installed"

    try:
        import onnxruntime
        model_status["onnxruntime"] = "available"
    except ImportError:
        model_status["onnxruntime"] = "not_installed"

    minifas_path = UPLOAD_DIR.parent / "models" / "minifas_anti_spoof.onnx"
    model_status["minifas_model"] = "loaded" if minifas_path.exists() else "not_found"

    return HealthResponse(
        status="healthy",
        version="1.0.0",
        models=model_status,
        timestamp=datetime.utcnow().isoformat(),
    )


# ── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("KYC_AI_PORT", "8100"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

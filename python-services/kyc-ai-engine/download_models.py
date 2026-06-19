#!/usr/bin/env python3
"""
Model Download Script for KYC AI Engine

Downloads and caches all required AI models for production deployment.
Run this during Docker build or as an init container.

Models:
  - PaddleOCR (~150MB) — Document text extraction
  - Florence-2-base (~1GB) — Vision Language Model for document classification
  - InsightFace buffalo_l (~300MB) — ArcFace face matching
  - MediaPipe Face Mesh (~5MB) — 468-landmark facial geometry
  - MiDaS DPT-Hybrid (~400MB) — Monocular depth estimation
  - MiniFAS ONNX (~10MB) — Anti-spoofing binary classifier

Total: ~2GB (compressed download), ~4GB on disk
"""
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)


def download_paddleocr() -> bool:
    """Pre-download PaddleOCR detection + recognition models."""
    logger.info("[1/6] Downloading PaddleOCR models...")
    try:
        from paddleocr import PaddleOCR
        # Initialize triggers model download to ~/.paddleocr/
        ocr = PaddleOCR(use_angle_cls=True, lang="en", use_gpu=False, show_log=False)
        del ocr
        logger.info("[1/6] PaddleOCR models downloaded successfully")
        return True
    except Exception as e:
        logger.warning(f"[1/6] PaddleOCR download failed: {e}")
        return False


def download_florence2() -> bool:
    """Pre-download Florence-2-base model from HuggingFace."""
    logger.info("[2/6] Downloading Florence-2-base VLM...")
    try:
        from transformers import AutoModelForCausalLM, AutoProcessor
        model_id = "microsoft/Florence-2-base"
        processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            model_id, trust_remote_code=True,
        )
        del processor, model
        logger.info("[2/6] Florence-2-base downloaded successfully")
        return True
    except Exception as e:
        logger.warning(f"[2/6] Florence-2 download failed: {e}")
        return False


def download_insightface() -> bool:
    """Pre-download InsightFace buffalo_l (ArcFace) model pack."""
    logger.info("[3/6] Downloading InsightFace buffalo_l (ArcFace)...")
    try:
        from insightface.app import FaceAnalysis
        app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],
        )
        app.prepare(ctx_id=-1, det_size=(640, 640))
        del app
        logger.info("[3/6] InsightFace buffalo_l downloaded successfully")
        return True
    except Exception as e:
        logger.warning(f"[3/6] InsightFace download failed: {e}")
        return False


def download_mediapipe() -> bool:
    """Trigger MediaPipe Face Mesh model download."""
    logger.info("[4/6] Downloading MediaPipe Face Mesh...")
    try:
        import mediapipe as mp
        import numpy as np
        mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
        )
        # Process a dummy image to trigger model download
        dummy = np.zeros((100, 100, 3), dtype=np.uint8)
        mesh.process(dummy)
        mesh.close()
        del mesh
        logger.info("[4/6] MediaPipe Face Mesh ready")
        return True
    except Exception as e:
        logger.warning(f"[4/6] MediaPipe download failed: {e}")
        return False


def download_midas() -> bool:
    """Pre-download MiDaS DPT-Hybrid depth estimation model."""
    logger.info("[5/6] Downloading MiDaS DPT-Hybrid...")
    try:
        import torch
        model = torch.hub.load("intel-isl/MiDaS", "DPT_Hybrid", trust_repo=True)
        del model
        transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
        del transforms
        logger.info("[5/6] MiDaS DPT-Hybrid downloaded successfully")
        return True
    except Exception as e:
        logger.warning(f"[5/6] MiDaS download failed: {e}")
        return False


def download_minifas() -> bool:
    """Download MiniFAS anti-spoofing ONNX model."""
    logger.info("[6/6] Checking MiniFAS ONNX model...")
    model_path = MODELS_DIR / "minifas_anti_spoof.onnx"
    if model_path.exists():
        logger.info("[6/6] MiniFAS ONNX already present")
        return True

    # MiniFAS is typically bundled; create a placeholder that signals absence
    # In production, download from model registry or S3
    minifas_url = os.environ.get(
        "MINIFAS_MODEL_URL",
        "",
    )
    if minifas_url:
        try:
            import urllib.request
            urllib.request.urlretrieve(minifas_url, str(model_path))
            logger.info("[6/6] MiniFAS ONNX downloaded from model registry")
            return True
        except Exception as e:
            logger.warning(f"[6/6] MiniFAS download failed: {e}")
            return False

    logger.info("[6/6] MiniFAS ONNX not available — will use texture-based fallback")
    return False


def main() -> int:
    logger.info("Starting KYC AI Engine model download...")
    logger.info(f"Models directory: {MODELS_DIR}")

    results = {
        "PaddleOCR": download_paddleocr(),
        "Florence-2": download_florence2(),
        "InsightFace": download_insightface(),
        "MediaPipe": download_mediapipe(),
        "MiDaS": download_midas(),
        "MiniFAS": download_minifas(),
    }

    logger.info("\n=== Download Summary ===")
    for name, success in results.items():
        status = "OK" if success else "FAILED (will use fallback)"
        logger.info(f"  {name}: {status}")

    critical_models = ["PaddleOCR", "MediaPipe"]
    critical_ok = all(results.get(m, False) for m in critical_models)

    if critical_ok:
        logger.info("All critical models downloaded — AI engine ready for production")
        return 0
    else:
        logger.warning("Some critical models failed — AI engine will run in degraded mode")
        return 1


if __name__ == "__main__":
    sys.exit(main())

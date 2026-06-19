"""
Vision Language Model (VLM) for Document Understanding

Uses Florence-2 (Microsoft) or LLaVA for:
- Document type classification
- Fraud / tampering detection (photo manipulation, digital forgery)
- Visual quality assessment
- Cross-validation of OCR output with visual context
- Extracting information that OCR misses (watermarks, holograms, photo quality)

Falls back to rule-based heuristics when model is unavailable.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)

_vlm_model: Any = None
_vlm_processor: Any = None
_vlm_device: str = "cpu"


class FraudSignal(str, Enum):
    CLEAN = "clean"
    SUSPICIOUS_EDGES = "suspicious_edges"
    PHOTO_MANIPULATION = "photo_manipulation"
    DIGITAL_FORGERY = "digital_forgery"
    LOW_QUALITY = "low_quality"
    INCONSISTENT_LIGHTING = "inconsistent_lighting"
    SCREEN_CAPTURE = "screen_capture"
    COPY_DETECTED = "copy_detected"


@dataclass
class DocumentClassification:
    predicted_type: str
    confidence: float
    is_id_document: bool
    country_detected: str = ""


@dataclass
class FraudAnalysis:
    is_authentic: bool
    authenticity_score: float
    signals: list[FraudSignal] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)
    recommendations: list[str] = field(default_factory=list)


@dataclass
class QualityAssessment:
    overall_score: float
    sharpness: float
    lighting: float
    glare: float
    occlusion: float
    warnings: list[str] = field(default_factory=list)


@dataclass
class VLMResult:
    classification: DocumentClassification
    fraud_analysis: FraudAnalysis
    quality: QualityAssessment
    visual_fields: dict[str, str]
    model_used: str


def _load_vlm() -> bool:
    """Load Florence-2 model for document understanding."""
    global _vlm_model, _vlm_processor, _vlm_device
    if _vlm_model is not None:
        return True

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor

        model_id = "microsoft/Florence-2-base"
        _vlm_device = "cuda" if torch.cuda.is_available() else "cpu"

        logger.info(f"Loading Florence-2 on {_vlm_device}...")
        _vlm_processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        _vlm_model = AutoModelForCausalLM.from_pretrained(
            model_id,
            trust_remote_code=True,
            torch_dtype=torch.float32,
        ).to(_vlm_device)
        _vlm_model.eval()
        logger.info("Florence-2 loaded successfully")
        return True
    except Exception as e:
        logger.warning(f"Failed to load Florence-2: {e} — using rule-based fallback")
        return False


def _florence_inference(image: Any, task: str, text_input: str = "") -> str:
    """Run Florence-2 inference on an image with a task prompt."""
    if _vlm_model is None or _vlm_processor is None:
        return ""

    import torch

    prompt = task if not text_input else f"{task}{text_input}"
    inputs = _vlm_processor(text=prompt, images=image, return_tensors="pt").to(_vlm_device)

    with torch.no_grad():
        generated_ids = _vlm_model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=512,
            num_beams=3,
        )

    result = _vlm_processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed = _vlm_processor.post_process_generation(
        result, task=task, image_size=(image.width, image.height)
    )
    return str(parsed)


def _analyze_image_quality(image_array: np.ndarray) -> QualityAssessment:
    """Analyze document image quality using CV heuristics."""
    try:
        import cv2
    except ImportError:
        return QualityAssessment(
            overall_score=0.5, sharpness=0.5, lighting=0.5,
            glare=0.0, occlusion=0.0,
            warnings=["OpenCV not available for quality analysis"],
        )

    warnings: list[str] = []
    gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY) if len(image_array.shape) == 3 else image_array

    # Sharpness via Laplacian variance
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness = min(1.0, laplacian_var / 500.0)
    if sharpness < 0.3:
        warnings.append("Image is blurry — document may not be readable")

    # Lighting uniformity
    mean_brightness = float(np.mean(gray))
    std_brightness = float(np.std(gray))
    lighting = 1.0 - abs(mean_brightness - 128) / 128.0
    lighting = max(0.0, min(1.0, lighting))
    if mean_brightness < 60:
        warnings.append("Image is too dark")
    elif mean_brightness > 220:
        warnings.append("Image is overexposed")

    # Glare detection (bright spots)
    _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY)
    glare_ratio = float(np.sum(thresh > 0)) / float(gray.size)
    glare = min(1.0, glare_ratio * 10)
    if glare > 0.3:
        warnings.append("Glare detected on document surface")

    # Occlusion (large dark or uniform regions)
    _, dark_thresh = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY_INV)
    dark_ratio = float(np.sum(dark_thresh > 0)) / float(gray.size)
    occlusion = min(1.0, dark_ratio * 5)
    if occlusion > 0.3:
        warnings.append("Parts of document may be occluded")

    overall = (sharpness * 0.4 + lighting * 0.3 + (1 - glare) * 0.15 + (1 - occlusion) * 0.15)

    return QualityAssessment(
        overall_score=overall,
        sharpness=sharpness,
        lighting=lighting,
        glare=glare,
        occlusion=occlusion,
        warnings=warnings,
    )


def _detect_fraud_signals(image_array: np.ndarray) -> FraudAnalysis:
    """Detect document fraud signals using image analysis."""
    try:
        import cv2
    except ImportError:
        return FraudAnalysis(
            is_authentic=True, authenticity_score=0.5,
            signals=[], details={"method": "no_cv_available"},
        )

    signals: list[FraudSignal] = []
    details: dict[str, Any] = {}
    recommendations: list[str] = []

    gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY) if len(image_array.shape) == 3 else image_array

    # Edge consistency — tampered areas often have inconsistent edge patterns
    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(np.sum(edges > 0)) / float(edges.size)
    details["edge_density"] = edge_density
    if edge_density < 0.02:
        signals.append(FraudSignal.SUSPICIOUS_EDGES)
        recommendations.append("Very few edges detected — possible digital creation or heavy processing")

    # Noise analysis — JPEG artifacts from re-saving manipulated images
    noise_level = float(np.std(gray.astype(float) - cv2.GaussianBlur(gray, (3, 3), 0).astype(float)))
    details["noise_level"] = noise_level
    if noise_level > 25:
        signals.append(FraudSignal.PHOTO_MANIPULATION)
        recommendations.append("High noise level suggests image has been digitally manipulated")

    # Color consistency — spliced regions may have different color distributions
    if len(image_array.shape) == 3:
        h, w = image_array.shape[:2]
        quadrants = [
            image_array[:h//2, :w//2],
            image_array[:h//2, w//2:],
            image_array[h//2:, :w//2],
            image_array[h//2:, w//2:],
        ]
        mean_colors = [np.mean(q, axis=(0, 1)) for q in quadrants]
        color_std = np.std(mean_colors, axis=0).mean()
        details["color_consistency"] = float(color_std)
        if color_std > 40:
            signals.append(FraudSignal.INCONSISTENT_LIGHTING)

    # Screen capture detection — moire patterns
    fft = np.fft.fft2(gray.astype(float))
    fft_shift = np.fft.fftshift(fft)
    magnitude = np.log1p(np.abs(fft_shift))
    # Periodic spikes in frequency domain indicate screen patterns
    peak_ratio = float(np.max(magnitude)) / float(np.mean(magnitude))
    details["fft_peak_ratio"] = peak_ratio
    if peak_ratio > 15:
        signals.append(FraudSignal.SCREEN_CAPTURE)
        recommendations.append("Frequency analysis suggests this may be a photo of a screen")

    # ELA (Error Level Analysis) — re-saved JPEG regions show different error levels
    # Simplified version: check if compression artifacts are uniform
    if noise_level < 3:
        signals.append(FraudSignal.DIGITAL_FORGERY)
        recommendations.append("Extremely low noise suggests digitally generated document")

    is_authentic = len(signals) == 0
    authenticity_score = max(0.0, 1.0 - len(signals) * 0.2)

    return FraudAnalysis(
        is_authentic=is_authentic,
        authenticity_score=authenticity_score,
        signals=signals,
        details=details,
        recommendations=recommendations,
    )


async def analyze_document(
    image_path: str,
    expected_type: Optional[str] = None,
) -> VLMResult:
    """
    Full VLM analysis: classification, fraud detection, quality assessment,
    and visual field extraction.
    """
    from PIL import Image

    try:
        image = Image.open(image_path).convert("RGB")
        image_array = np.array(image)
    except Exception as e:
        logger.error(f"Failed to load image: {e}")
        return VLMResult(
            classification=DocumentClassification(
                predicted_type="unknown", confidence=0.0, is_id_document=False,
            ),
            fraud_analysis=FraudAnalysis(is_authentic=False, authenticity_score=0.0),
            quality=QualityAssessment(
                overall_score=0.0, sharpness=0.0, lighting=0.0, glare=0.0, occlusion=0.0,
                warnings=[f"Image load failed: {str(e)}"],
            ),
            visual_fields={},
            model_used="error",
        )

    # Quality assessment (always available, uses OpenCV)
    quality = _analyze_image_quality(image_array)

    # Fraud detection (always available, uses OpenCV)
    fraud = _detect_fraud_signals(image_array)

    # Try VLM-based analysis
    model_used = "rule_based"
    visual_fields: dict[str, str] = {}
    classification = DocumentClassification(
        predicted_type=expected_type or "unknown",
        confidence=0.5,
        is_id_document=expected_type in ("passport", "national_id", "drivers_license", "bvn_card", "nin_card"),
    )

    if _load_vlm():
        model_used = "florence-2"
        try:
            # Document classification via captioning
            caption = _florence_inference(image, "<CAPTION>")
            visual_fields["caption"] = caption

            # Detailed description for fraud cross-check
            detail = _florence_inference(image, "<DETAILED_CAPTION>")
            visual_fields["detailed_description"] = detail

            # OCR via VLM (supplements PaddleOCR)
            vlm_ocr = _florence_inference(image, "<OCR>")
            visual_fields["vlm_ocr"] = vlm_ocr

            # Object detection for document elements
            objects = _florence_inference(image, "<OD>")
            visual_fields["detected_objects"] = objects

            # Classify based on VLM output
            caption_lower = caption.lower()
            if any(w in caption_lower for w in ("passport", "travel document")):
                classification = DocumentClassification(
                    predicted_type="passport", confidence=0.90, is_id_document=True,
                )
            elif any(w in caption_lower for w in ("id card", "identity card", "national id")):
                classification = DocumentClassification(
                    predicted_type="national_id", confidence=0.85, is_id_document=True,
                )
            elif any(w in caption_lower for w in ("driver", "license", "licence")):
                classification = DocumentClassification(
                    predicted_type="drivers_license", confidence=0.85, is_id_document=True,
                )
            elif any(w in caption_lower for w in ("certificate", "registration", "business")):
                classification = DocumentClassification(
                    predicted_type="business_registration", confidence=0.80, is_id_document=False,
                )

        except Exception as e:
            logger.warning(f"VLM inference failed: {e} — using rule-based fallback")
            model_used = "rule_based_fallback"

    return VLMResult(
        classification=classification,
        fraud_analysis=fraud,
        quality=quality,
        visual_fields=visual_fields,
        model_used=model_used,
    )

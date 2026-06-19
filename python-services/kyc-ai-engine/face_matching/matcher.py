"""
Face Matching Engine using InsightFace (ArcFace)

Provides:
- Face detection and alignment
- 512-d embedding generation via ArcFace
- Cosine similarity matching between selfie and ID photo
- Face quality assessment (blur, pose, illumination)
- Multi-face detection and selection (pick best quality face)

All inference on CPU via ONNX Runtime.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)

_face_app: Any = None
_face_model_loaded = False


@dataclass
class DetectedFace:
    bbox: list[float]  # [x1, y1, x2, y2]
    confidence: float
    landmarks: Optional[np.ndarray] = None  # 5-point landmarks
    embedding: Optional[np.ndarray] = None  # 512-d ArcFace embedding
    age: Optional[int] = None
    gender: Optional[str] = None
    quality_score: float = 0.0


@dataclass
class FaceQuality:
    overall: float
    sharpness: float
    pose_score: float  # frontal = 1.0, profile = 0.0
    illumination: float
    occlusion: float
    is_acceptable: bool
    issues: list[str] = field(default_factory=list)


@dataclass
class MatchResult:
    is_match: bool
    similarity: float
    threshold: float
    confidence_level: str  # "high", "medium", "low"
    selfie_quality: FaceQuality
    document_quality: FaceQuality
    selfie_face: Optional[DetectedFace] = None
    document_face: Optional[DetectedFace] = None
    warnings: list[str] = field(default_factory=list)
    method: str = "insightface_arcface"


def _get_face_app() -> Any:
    """Lazy-load InsightFace app with ArcFace recognition model."""
    global _face_app, _face_model_loaded
    if _face_model_loaded:
        return _face_app

    try:
        from insightface.app import FaceAnalysis
        _face_app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],
        )
        _face_app.prepare(ctx_id=-1, det_size=(640, 640))
        logger.info("InsightFace loaded (buffalo_l, ArcFace, CPU)")
        _face_model_loaded = True
        return _face_app
    except ImportError:
        logger.warning("InsightFace not installed — using fallback embedding")
        _face_model_loaded = True
        return None
    except Exception as e:
        logger.warning(f"InsightFace failed to load: {e} — using fallback")
        _face_model_loaded = True
        return None


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def _assess_face_quality(image: np.ndarray, face: Any) -> FaceQuality:
    """Assess quality of a detected face for verification suitability."""
    try:
        import cv2
    except ImportError:
        return FaceQuality(
            overall=0.5, sharpness=0.5, pose_score=0.5,
            illumination=0.5, occlusion=0.0, is_acceptable=True,
        )

    issues: list[str] = []
    bbox = face.bbox.astype(int) if hasattr(face, 'bbox') else [0, 0, image.shape[1], image.shape[0]]
    x1, y1, x2, y2 = max(0, bbox[0]), max(0, bbox[1]), min(image.shape[1], bbox[2]), min(image.shape[0], bbox[3])
    face_crop = image[y1:y2, x1:x2]

    if face_crop.size == 0:
        return FaceQuality(
            overall=0.0, sharpness=0.0, pose_score=0.0,
            illumination=0.0, occlusion=0.0, is_acceptable=False,
            issues=["Face crop is empty"],
        )

    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY) if len(face_crop.shape) == 3 else face_crop

    # Sharpness (Laplacian variance)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness = min(1.0, lap_var / 300)
    if sharpness < 0.3:
        issues.append("Face image is blurry")

    # Pose score from landmarks (frontal = high score)
    pose_score = 0.7  # default
    if hasattr(face, 'landmark_2d_106') and face.landmark_2d_106 is not None:
        lm = face.landmark_2d_106
        # Symmetry score from landmark positions
        center_x = (x1 + x2) / 2
        left_dist = abs(lm[33][0] - center_x) if len(lm) > 33 else 0
        right_dist = abs(lm[87][0] - center_x) if len(lm) > 87 else 0
        symmetry = 1.0 - abs(left_dist - right_dist) / max(left_dist + right_dist, 1)
        pose_score = max(0.0, min(1.0, symmetry))
    elif hasattr(face, 'pose') and face.pose is not None:
        yaw, pitch, roll = face.pose
        pose_score = max(0.0, 1.0 - (abs(yaw) + abs(pitch)) / 90)

    if pose_score < 0.4:
        issues.append("Face is not frontal — turn to face camera directly")

    # Illumination (brightness uniformity)
    mean_bright = float(np.mean(gray))
    illumination = 1.0 - abs(mean_bright - 128) / 128
    if mean_bright < 50:
        issues.append("Face is too dark — improve lighting")
    elif mean_bright > 220:
        issues.append("Face is overexposed")

    # Occlusion (check for large dark regions in face area)
    _, dark = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY_INV)
    occlusion = float(np.sum(dark > 0)) / float(gray.size)
    if occlusion > 0.2:
        issues.append("Face may be partially occluded")

    overall = sharpness * 0.35 + pose_score * 0.30 + illumination * 0.20 + (1 - occlusion) * 0.15
    is_acceptable = overall > 0.4 and sharpness > 0.2

    return FaceQuality(
        overall=overall,
        sharpness=sharpness,
        pose_score=pose_score,
        illumination=illumination,
        occlusion=occlusion,
        is_acceptable=is_acceptable,
        issues=issues,
    )


def _detect_faces(image: np.ndarray) -> list[DetectedFace]:
    """Detect faces and extract embeddings using InsightFace."""
    app = _get_face_app()
    if app is None:
        return _fallback_detect_faces(image)

    try:
        faces = app.get(image)
        results: list[DetectedFace] = []
        for face in faces:
            quality = _assess_face_quality(image, face)
            results.append(DetectedFace(
                bbox=face.bbox.tolist(),
                confidence=float(face.det_score) if hasattr(face, 'det_score') else 0.9,
                landmarks=face.kps if hasattr(face, 'kps') else None,
                embedding=face.normed_embedding if hasattr(face, 'normed_embedding') else face.embedding,
                age=int(face.age) if hasattr(face, 'age') and face.age else None,
                gender="M" if hasattr(face, 'gender') and face.gender == 1 else "F" if hasattr(face, 'gender') and face.gender == 0 else None,
                quality_score=quality.overall,
            ))
        return results
    except Exception as e:
        logger.warning(f"InsightFace detection failed: {e}")
        return _fallback_detect_faces(image)


def _fallback_detect_faces(image: np.ndarray) -> list[DetectedFace]:
    """Fallback face detection using OpenCV Haar cascade."""
    try:
        import cv2
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))

        results: list[DetectedFace] = []
        for (x, y, w, h) in faces:
            results.append(DetectedFace(
                bbox=[float(x), float(y), float(x+w), float(y+h)],
                confidence=0.7,
                embedding=None,
                quality_score=0.5,
            ))
        return results
    except Exception:
        return []


def _generate_fallback_embedding(image: np.ndarray, bbox: list[float]) -> np.ndarray:
    """Generate a basic face embedding when InsightFace is unavailable."""
    try:
        import cv2
        x1, y1, x2, y2 = [int(v) for v in bbox]
        face_crop = image[max(0, y1):y2, max(0, x1):x2]
        if face_crop.size == 0:
            return np.zeros(512, dtype=np.float32)

        # Resize to fixed size and flatten as basic embedding
        resized = cv2.resize(face_crop, (32, 32))
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized

        # Use DCT as simple feature extractor
        dct = cv2.dct(gray.astype(np.float32))
        features = dct[:16, :16].flatten()

        # Pad/truncate to 512
        embedding = np.zeros(512, dtype=np.float32)
        embedding[:min(256, len(features))] = features[:256]
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm
        return embedding
    except Exception:
        return np.zeros(512, dtype=np.float32)


async def match_faces(
    selfie_path: str,
    document_path: str,
    threshold: float = 0.45,
) -> MatchResult:
    """
    Match a selfie against a document photo using ArcFace embeddings.

    Returns similarity score, match decision, and quality assessment
    for both images.
    """
    try:
        import cv2
    except ImportError:
        return MatchResult(
            is_match=False, similarity=0.0, threshold=threshold,
            confidence_level="low",
            selfie_quality=FaceQuality(overall=0, sharpness=0, pose_score=0, illumination=0, occlusion=0, is_acceptable=False),
            document_quality=FaceQuality(overall=0, sharpness=0, pose_score=0, illumination=0, occlusion=0, is_acceptable=False),
            warnings=["OpenCV not available"],
            method="error",
        )

    warnings: list[str] = []

    # Load images
    selfie_img = cv2.imread(selfie_path)
    doc_img = cv2.imread(document_path)

    if selfie_img is None:
        warnings.append(f"Failed to load selfie: {selfie_path}")
    if doc_img is None:
        warnings.append(f"Failed to load document image: {document_path}")
    if selfie_img is None or doc_img is None:
        return MatchResult(
            is_match=False, similarity=0.0, threshold=threshold,
            confidence_level="low",
            selfie_quality=FaceQuality(overall=0, sharpness=0, pose_score=0, illumination=0, occlusion=0, is_acceptable=False),
            document_quality=FaceQuality(overall=0, sharpness=0, pose_score=0, illumination=0, occlusion=0, is_acceptable=False),
            warnings=warnings,
            method="error",
        )

    # Detect faces
    selfie_faces = _detect_faces(selfie_img)
    doc_faces = _detect_faces(doc_img)

    if not selfie_faces:
        warnings.append("No face detected in selfie")
    if not doc_faces:
        warnings.append("No face detected in document image")
    if not selfie_faces or not doc_faces:
        return MatchResult(
            is_match=False, similarity=0.0, threshold=threshold,
            confidence_level="low",
            selfie_quality=FaceQuality(overall=0, sharpness=0, pose_score=0, illumination=0, occlusion=0, is_acceptable=False),
            document_quality=FaceQuality(overall=0, sharpness=0, pose_score=0, illumination=0, occlusion=0, is_acceptable=False),
            warnings=warnings,
            method="no_face",
        )

    # Pick best quality face from each
    selfie_face = max(selfie_faces, key=lambda f: f.quality_score)
    doc_face = max(doc_faces, key=lambda f: f.quality_score)

    # Generate embeddings if not already available
    if selfie_face.embedding is None:
        selfie_face.embedding = _generate_fallback_embedding(selfie_img, selfie_face.bbox)
        warnings.append("Using fallback embedding for selfie (InsightFace unavailable)")
    if doc_face.embedding is None:
        doc_face.embedding = _generate_fallback_embedding(doc_img, doc_face.bbox)
        warnings.append("Using fallback embedding for document (InsightFace unavailable)")

    # Compute similarity
    similarity = _cosine_similarity(selfie_face.embedding, doc_face.embedding)

    # Quality assessment
    selfie_quality = _assess_face_quality(selfie_img, type("Face", (), {"bbox": np.array(selfie_face.bbox)})())
    doc_quality = _assess_face_quality(doc_img, type("Face", (), {"bbox": np.array(doc_face.bbox)})())

    # Determine match and confidence
    is_match = similarity >= threshold

    if similarity >= 0.6:
        confidence = "high"
    elif similarity >= threshold:
        confidence = "medium"
    else:
        confidence = "low"

    # Adjust threshold warnings
    if selfie_quality.overall < 0.4:
        warnings.append("Selfie quality is poor — results may be unreliable")
    if doc_quality.overall < 0.4:
        warnings.append("Document photo quality is poor — results may be unreliable")

    method = "insightface_arcface" if _face_app is not None else "opencv_dct_fallback"

    return MatchResult(
        is_match=is_match,
        similarity=similarity,
        threshold=threshold,
        confidence_level=confidence,
        selfie_quality=selfie_quality,
        document_quality=doc_quality,
        selfie_face=selfie_face,
        document_face=doc_face,
        warnings=warnings,
        method=method,
    )


async def generate_embedding(image_path: str) -> dict[str, Any]:
    """Generate a face embedding from a single image for storage/comparison."""
    try:
        import cv2
    except ImportError:
        return {"success": False, "error": "OpenCV not available"}

    image = cv2.imread(image_path)
    if image is None:
        return {"success": False, "error": f"Failed to load image: {image_path}"}

    faces = _detect_faces(image)
    if not faces:
        return {"success": False, "error": "No face detected"}

    best = max(faces, key=lambda f: f.quality_score)
    if best.embedding is None:
        best.embedding = _generate_fallback_embedding(image, best.bbox)

    return {
        "success": True,
        "embedding": best.embedding.tolist(),
        "embedding_dim": len(best.embedding),
        "confidence": best.confidence,
        "quality": best.quality_score,
        "age": best.age,
        "gender": best.gender,
        "bbox": best.bbox,
        "method": "insightface_arcface" if _face_app is not None else "opencv_dct_fallback",
    }

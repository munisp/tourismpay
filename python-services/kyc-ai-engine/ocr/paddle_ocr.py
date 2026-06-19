"""
PaddleOCR Document Text Extraction Engine

Handles ID cards, passports, business documents with MRZ parsing,
field extraction, and confidence scoring. Supports Nigerian BVN/NIN cards,
ECOWAS travel documents, and international passports.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import numpy as np

logger = logging.getLogger(__name__)

_ocr_engine: Any = None


class DocumentType(str, Enum):
    PASSPORT = "passport"
    NATIONAL_ID = "national_id"
    DRIVERS_LICENSE = "drivers_license"
    RESIDENCE_PERMIT = "residence_permit"
    BVN_CARD = "bvn_card"
    NIN_CARD = "nin_card"
    BUSINESS_REGISTRATION = "business_registration"
    TAX_CLEARANCE = "tax_clearance"


@dataclass
class OCRField:
    key: str
    value: str
    confidence: float
    bbox: list[float] = field(default_factory=list)


@dataclass
class MRZData:
    raw_lines: list[str]
    document_type: str = ""
    issuing_country: str = ""
    surname: str = ""
    given_names: str = ""
    document_number: str = ""
    nationality: str = ""
    date_of_birth: str = ""
    sex: str = ""
    expiry_date: str = ""
    personal_number: str = ""
    valid: bool = False
    check_digits_valid: bool = False


@dataclass
class OCRResult:
    document_type: DocumentType
    fields: list[OCRField]
    mrz: Optional[MRZData]
    raw_text: str
    overall_confidence: float
    language: str = "en"
    warnings: list[str] = field(default_factory=list)


def _get_ocr_engine() -> Any:
    """Lazy-load PaddleOCR engine (downloads models on first use)."""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from paddleocr import PaddleOCR
            _ocr_engine = PaddleOCR(
                use_angle_cls=True,
                lang="en",
                show_log=False,
                use_gpu=False,
                det_db_thresh=0.3,
                rec_batch_num=6,
            )
            logger.info("PaddleOCR engine initialized (CPU mode)")
        except ImportError:
            logger.warning("PaddleOCR not installed — using stub mode")
            return None
    return _ocr_engine


def _check_digit(s: str) -> int:
    """ICAO 9303 MRZ check digit calculation."""
    weights = [7, 3, 1]
    total = 0
    for i, ch in enumerate(s):
        if ch == "<":
            val = 0
        elif ch.isdigit():
            val = int(ch)
        elif ch.isalpha():
            val = ord(ch.upper()) - 55
        else:
            val = 0
        total += val * weights[i % 3]
    return total % 10


def _parse_mrz_td3(lines: list[str]) -> MRZData:
    """Parse TD3 (passport) MRZ — two lines of 44 characters."""
    mrz = MRZData(raw_lines=lines)
    if len(lines) < 2 or len(lines[0]) < 44 or len(lines[1]) < 44:
        return mrz

    line1, line2 = lines[0][:44], lines[1][:44]
    mrz.document_type = line1[0:2].replace("<", "").strip()
    mrz.issuing_country = line1[2:5].replace("<", "").strip()
    names = line1[5:44].split("<<", 1)
    mrz.surname = names[0].replace("<", " ").strip()
    mrz.given_names = names[1].replace("<", " ").strip() if len(names) > 1 else ""

    mrz.document_number = line2[0:9].replace("<", "").strip()
    mrz.nationality = line2[10:13].replace("<", "").strip()
    dob = line2[13:19]
    mrz.date_of_birth = f"19{dob[0:2]}-{dob[2:4]}-{dob[4:6]}" if dob[0] > "3" else f"20{dob[0:2]}-{dob[2:4]}-{dob[4:6]}"
    mrz.sex = line2[20].replace("<", "U")
    exp = line2[21:27]
    mrz.expiry_date = f"20{exp[0:2]}-{exp[2:4]}-{exp[4:6]}"
    mrz.personal_number = line2[28:42].replace("<", "").strip()

    # Validate check digits
    cd1_ok = _check_digit(line2[0:9]) == int(line2[9]) if line2[9].isdigit() else False
    cd2_ok = _check_digit(line2[13:19]) == int(line2[19]) if line2[19].isdigit() else False
    cd3_ok = _check_digit(line2[21:27]) == int(line2[27]) if line2[27].isdigit() else False
    mrz.check_digits_valid = cd1_ok and cd2_ok and cd3_ok
    mrz.valid = bool(mrz.document_number and mrz.surname)
    return mrz


def _parse_mrz_td1(lines: list[str]) -> MRZData:
    """Parse TD1 (ID card) MRZ — three lines of 30 characters."""
    mrz = MRZData(raw_lines=lines)
    if len(lines) < 3 or len(lines[0]) < 30:
        return mrz

    line1, line2, line3 = lines[0][:30], lines[1][:30], lines[2][:30]
    mrz.document_type = line1[0:2].replace("<", "").strip()
    mrz.issuing_country = line1[2:5].replace("<", "").strip()
    mrz.document_number = line1[5:14].replace("<", "").strip()

    dob = line2[0:6]
    mrz.date_of_birth = f"19{dob[0:2]}-{dob[2:4]}-{dob[4:6]}" if dob[0] > "3" else f"20{dob[0:2]}-{dob[2:4]}-{dob[4:6]}"
    mrz.sex = line2[7].replace("<", "U")
    exp = line2[8:14]
    mrz.expiry_date = f"20{exp[0:2]}-{exp[2:4]}-{exp[4:6]}"
    mrz.nationality = line2[15:18].replace("<", "").strip()

    names = line3.split("<<", 1)
    mrz.surname = names[0].replace("<", " ").strip()
    mrz.given_names = names[1].replace("<", " ").strip() if len(names) > 1 else ""

    mrz.valid = bool(mrz.document_number and mrz.surname)
    return mrz


def _extract_mrz_lines(text_lines: list[str]) -> list[str]:
    """Find MRZ lines in OCR output using pattern matching."""
    mrz_pattern = re.compile(r"^[A-Z0-9<]{20,}$")
    mrz_lines = []
    for line in text_lines:
        cleaned = line.strip().replace(" ", "").upper()
        if mrz_pattern.match(cleaned) and len(cleaned) >= 28:
            mrz_lines.append(cleaned)
    return mrz_lines


def _extract_nigerian_id_fields(text_lines: list[str]) -> list[OCRField]:
    """Extract fields specific to Nigerian BVN/NIN cards."""
    fields: list[OCRField] = []
    full_text = " ".join(text_lines).upper()

    bvn_match = re.search(r"BVN[:\s]*(\d{11})", full_text)
    if bvn_match:
        fields.append(OCRField(key="bvn_number", value=bvn_match.group(1), confidence=0.95))

    nin_match = re.search(r"NIN[:\s]*(\d{11})", full_text)
    if nin_match:
        fields.append(OCRField(key="nin_number", value=nin_match.group(1), confidence=0.95))

    name_patterns = [
        r"(?:FULL\s*NAME|NAME|SURNAME)[:\s]+([A-Z\s]+?)(?:\n|$)",
        r"(?:FIRST\s*NAME)[:\s]+([A-Z\s]+?)(?:\n|$)",
        r"(?:LAST\s*NAME|FAMILY\s*NAME)[:\s]+([A-Z\s]+?)(?:\n|$)",
    ]
    for pat in name_patterns:
        m = re.search(pat, full_text)
        if m:
            fields.append(OCRField(key="name", value=m.group(1).strip(), confidence=0.85))

    dob_match = re.search(r"(?:DATE\s*OF\s*BIRTH|DOB|D\.O\.B)[:\s]*([\d/\-\.]+)", full_text)
    if dob_match:
        fields.append(OCRField(key="date_of_birth", value=dob_match.group(1), confidence=0.85))

    gender_match = re.search(r"(?:SEX|GENDER)[:\s]*(MALE|FEMALE|M|F)", full_text)
    if gender_match:
        fields.append(OCRField(key="gender", value=gender_match.group(1), confidence=0.90))

    return fields


def _extract_business_fields(text_lines: list[str]) -> list[OCRField]:
    """Extract fields from business registration / tax clearance documents."""
    fields: list[OCRField] = []
    full_text = " ".join(text_lines)

    rc_match = re.search(r"RC[:\s]*(\d{4,8})", full_text, re.IGNORECASE)
    if rc_match:
        fields.append(OCRField(key="rc_number", value=rc_match.group(1), confidence=0.90))

    tin_match = re.search(r"(?:TIN|TAX\s*ID)[:\s]*([\d\-]+)", full_text, re.IGNORECASE)
    if tin_match:
        fields.append(OCRField(key="tax_id", value=tin_match.group(1), confidence=0.88))

    company_patterns = [
        r"(?:COMPANY\s*NAME|NAME\s*OF\s*COMPANY|BUSINESS\s*NAME)[:\s]+(.+?)(?:\n|$)",
        r"(?:INCORPORATED\s*AS|REGISTERED\s*AS)[:\s]+(.+?)(?:\n|$)",
    ]
    for pat in company_patterns:
        m = re.search(pat, full_text, re.IGNORECASE)
        if m:
            fields.append(OCRField(key="company_name", value=m.group(1).strip(), confidence=0.85))
            break

    date_match = re.search(
        r"(?:DATE\s*OF\s*(?:INCORPORATION|REGISTRATION))[:\s]*([\d/\-\.]+)",
        full_text, re.IGNORECASE,
    )
    if date_match:
        fields.append(OCRField(key="incorporation_date", value=date_match.group(1), confidence=0.82))

    addr_match = re.search(
        r"(?:REGISTERED\s*(?:ADDRESS|OFFICE)|HEAD\s*OFFICE)[:\s]+(.+?)(?:\n|$)",
        full_text, re.IGNORECASE,
    )
    if addr_match:
        fields.append(OCRField(key="registered_address", value=addr_match.group(1).strip(), confidence=0.78))

    return fields


async def extract_document_text(
    image_path: str,
    document_type: DocumentType,
    country: str = "NG",
) -> OCRResult:
    """
    Run PaddleOCR on a document image and extract structured fields.

    Returns OCRResult with extracted fields, MRZ data (if applicable),
    raw text, and per-field confidence scores.
    """
    engine = _get_ocr_engine()
    warnings: list[str] = []

    if engine is None:
        warnings.append("PaddleOCR not available — returning stub result")
        return OCRResult(
            document_type=document_type,
            fields=[],
            mrz=None,
            raw_text="",
            overall_confidence=0.0,
            warnings=warnings,
        )

    # Run OCR
    try:
        results = engine.ocr(image_path, cls=True)
    except Exception as e:
        logger.error(f"PaddleOCR failed: {e}")
        return OCRResult(
            document_type=document_type,
            fields=[],
            mrz=None,
            raw_text="",
            overall_confidence=0.0,
            warnings=[f"OCR failed: {str(e)}"],
        )

    # Parse OCR results
    text_lines: list[str] = []
    all_confidences: list[float] = []
    ocr_fields: list[OCRField] = []

    if results and results[0]:
        for line in results[0]:
            bbox, (text, conf) = line[0], line[1]
            text_lines.append(text)
            all_confidences.append(conf)
            flat_bbox = [coord for point in bbox for coord in point]
            ocr_fields.append(OCRField(
                key="raw_line",
                value=text,
                confidence=conf,
                bbox=flat_bbox,
            ))

    raw_text = "\n".join(text_lines)
    overall_confidence = float(np.mean(all_confidences)) if all_confidences else 0.0

    # Extract MRZ if present (passports, ID cards)
    mrz_data: Optional[MRZData] = None
    if document_type in (DocumentType.PASSPORT, DocumentType.NATIONAL_ID, DocumentType.RESIDENCE_PERMIT):
        mrz_lines = _extract_mrz_lines(text_lines)
        if len(mrz_lines) >= 2 and len(mrz_lines[0]) >= 44:
            mrz_data = _parse_mrz_td3(mrz_lines)
        elif len(mrz_lines) >= 3 and len(mrz_lines[0]) >= 28:
            mrz_data = _parse_mrz_td1(mrz_lines)

        if mrz_data and mrz_data.valid:
            ocr_fields.extend([
                OCRField(key="mrz_surname", value=mrz_data.surname, confidence=0.95),
                OCRField(key="mrz_given_names", value=mrz_data.given_names, confidence=0.95),
                OCRField(key="mrz_document_number", value=mrz_data.document_number, confidence=0.95),
                OCRField(key="mrz_nationality", value=mrz_data.nationality, confidence=0.95),
                OCRField(key="mrz_date_of_birth", value=mrz_data.date_of_birth, confidence=0.95),
                OCRField(key="mrz_expiry_date", value=mrz_data.expiry_date, confidence=0.95),
            ])

    # Extract document-type-specific fields
    if document_type in (DocumentType.BVN_CARD, DocumentType.NIN_CARD):
        ocr_fields.extend(_extract_nigerian_id_fields(text_lines))
    elif document_type in (DocumentType.BUSINESS_REGISTRATION, DocumentType.TAX_CLEARANCE):
        ocr_fields.extend(_extract_business_fields(text_lines))

    # Quality warnings
    if overall_confidence < 0.6:
        warnings.append(f"Low OCR confidence ({overall_confidence:.2f}) — image may be blurry or low resolution")
    if not text_lines:
        warnings.append("No text detected in document image")
    if document_type == DocumentType.PASSPORT and mrz_data and not mrz_data.check_digits_valid:
        warnings.append("MRZ check digits invalid — possible OCR error or tampered document")

    return OCRResult(
        document_type=document_type,
        fields=[f for f in ocr_fields if f.key != "raw_line"],
        mrz=mrz_data,
        raw_text=raw_text,
        overall_confidence=overall_confidence,
        language="en",
        warnings=warnings,
    )


async def cross_validate_ocr_mrz(ocr_result: OCRResult) -> dict[str, Any]:
    """
    Cross-validate OCR text fields against MRZ data.
    Discrepancies indicate potential document tampering.
    """
    if not ocr_result.mrz or not ocr_result.mrz.valid:
        return {"validated": False, "reason": "No valid MRZ data to cross-validate"}

    mrz = ocr_result.mrz
    mismatches: list[dict[str, str]] = []
    matches: list[str] = []

    field_map = {f.key: f.value for f in ocr_result.fields}

    # Compare names
    for key in ("name", "mrz_surname"):
        if key in field_map and mrz.surname:
            ocr_name = field_map[key].upper().strip()
            mrz_name = mrz.surname.upper().strip()
            if ocr_name and mrz_name and ocr_name not in mrz_name and mrz_name not in ocr_name:
                mismatches.append({"field": "surname", "ocr": ocr_name, "mrz": mrz_name})
            else:
                matches.append("surname")

    # Compare document number
    if "document_number" in field_map and mrz.document_number:
        if field_map["document_number"] != mrz.document_number:
            mismatches.append({
                "field": "document_number",
                "ocr": field_map["document_number"],
                "mrz": mrz.document_number,
            })
        else:
            matches.append("document_number")

    tampering_risk = "low" if not mismatches else ("high" if len(mismatches) >= 2 else "medium")

    return {
        "validated": True,
        "matches": matches,
        "mismatches": mismatches,
        "tampering_risk": tampering_risk,
        "mrz_check_digits_valid": mrz.check_digits_valid,
    }

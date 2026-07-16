"""
Docling-powered Structured Document Parser for KYB

Extracts structured data from business documents:
- CAC incorporation certificates (Nigeria)
- Tax clearance certificates (FIRS)
- Business permits and licenses
- Annual returns
- Board resolutions
- Shareholder agreements

Falls back to PaddleOCR + regex extraction when Docling is unavailable.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_docling_converter: Any = None


class BusinessDocType(str, Enum):
    CAC_CERTIFICATE = "cac_certificate"
    TAX_CLEARANCE = "tax_clearance"
    BUSINESS_PERMIT = "business_permit"
    ANNUAL_RETURN = "annual_return"
    BOARD_RESOLUTION = "board_resolution"
    SHAREHOLDER_AGREEMENT = "shareholder_agreement"
    BANK_REFERENCE = "bank_reference"
    UTILITY_BILL = "utility_bill"
    MEMORANDUM = "memorandum_of_association"
    UNKNOWN = "unknown"


@dataclass
class Director:
    name: str
    position: str = ""
    nationality: str = ""
    address: str = ""
    shares: int = 0
    date_appointed: str = ""


@dataclass
class BusinessEntity:
    company_name: str = ""
    rc_number: str = ""
    tin_number: str = ""
    registration_date: str = ""
    business_type: str = ""
    registered_address: str = ""
    nature_of_business: str = ""
    share_capital: str = ""
    directors: list[Director] = field(default_factory=list)
    shareholders: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class TableData:
    headers: list[str]
    rows: list[list[str]]
    confidence: float


@dataclass
class DoclingResult:
    document_type: BusinessDocType
    entity: BusinessEntity
    tables: list[TableData]
    sections: dict[str, str]
    raw_markdown: str
    confidence: float
    method: str
    warnings: list[str] = field(default_factory=list)


def _get_docling_converter() -> Any:
    """Lazy-load Docling DocumentConverter."""
    global _docling_converter
    if _docling_converter is None:
        try:
            from docling.document_converter import DocumentConverter
            _docling_converter = DocumentConverter()
            logger.info("Docling DocumentConverter initialized")
        except ImportError:
            logger.warning("Docling not installed — using regex fallback")
            return None
    return _docling_converter


def _classify_business_doc(text: str) -> BusinessDocType:
    """Classify a business document based on content."""
    text_upper = text.upper()

    if any(k in text_upper for k in ("CERTIFICATE OF INCORPORATION", "CORPORATE AFFAIRS COMMISSION", "CAC")):
        return BusinessDocType.CAC_CERTIFICATE
    if any(k in text_upper for k in ("TAX CLEARANCE", "FIRS", "FEDERAL INLAND REVENUE")):
        return BusinessDocType.TAX_CLEARANCE
    if any(k in text_upper for k in ("BUSINESS PERMIT", "TRADE LICENSE", "OPERATING PERMIT")):
        return BusinessDocType.BUSINESS_PERMIT
    if any(k in text_upper for k in ("ANNUAL RETURN", "ANNUAL REPORT")):
        return BusinessDocType.ANNUAL_RETURN
    if any(k in text_upper for k in ("BOARD RESOLUTION", "MINUTES OF MEETING")):
        return BusinessDocType.BOARD_RESOLUTION
    if any(k in text_upper for k in ("SHAREHOLDER", "ARTICLES OF ASSOCIATION")):
        return BusinessDocType.SHAREHOLDER_AGREEMENT
    if any(k in text_upper for k in ("BANK REFERENCE", "BANK CONFIRMATION")):
        return BusinessDocType.BANK_REFERENCE
    if any(k in text_upper for k in ("UTILITY BILL", "ELECTRICITY BILL", "WATER BILL")):
        return BusinessDocType.UTILITY_BILL
    if any(k in text_upper for k in ("MEMORANDUM OF ASSOCIATION", "MEMART")):
        return BusinessDocType.MEMORANDUM

    return BusinessDocType.UNKNOWN


def _extract_entity_from_text(text: str) -> BusinessEntity:
    """Extract business entity details from document text using regex."""
    entity = BusinessEntity()

    # Company name
    for pattern in [
        r"(?:THIS IS TO CERTIFY THAT|COMPANY NAME|NAME OF COMPANY)[:\s]+([A-Z\s&.,]+?)(?:\n|LTD|LIMITED|PLC)",
        r"^([A-Z][A-Z\s&.,]+(?:LIMITED|LTD|PLC))\s*$",
    ]:
        m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if m:
            entity.company_name = m.group(1).strip()
            break

    # RC Number
    m = re.search(r"RC[:\s]*(\d{4,8})", text, re.IGNORECASE)
    if m:
        entity.rc_number = m.group(1)

    # TIN
    m = re.search(r"(?:TIN|TAX\s*(?:IDENTIFICATION|ID)\s*(?:NUMBER)?)[:\s]*([\d\-]+)", text, re.IGNORECASE)
    if m:
        entity.tin_number = m.group(1)

    # Registration date
    m = re.search(
        r"(?:DATE\s*OF\s*(?:INCORPORATION|REGISTRATION)|INCORPORATED\s*ON)[:\s]*([\d/\-\.]+\s*[A-Za-z]*\s*\d{0,4})",
        text, re.IGNORECASE,
    )
    if m:
        entity.registration_date = m.group(1).strip()

    # Registered address
    m = re.search(
        r"(?:REGISTERED\s*(?:ADDRESS|OFFICE)|HEAD\s*OFFICE\s*ADDRESS)[:\s]+(.+?)(?:\n\n|\n[A-Z])",
        text, re.IGNORECASE | re.DOTALL,
    )
    if m:
        entity.registered_address = " ".join(m.group(1).split()).strip()

    # Share capital
    m = re.search(r"(?:SHARE\s*CAPITAL|AUTHORIZED\s*CAPITAL)[:\s]*([\w\s,.\d]+)", text, re.IGNORECASE)
    if m:
        entity.share_capital = m.group(1).strip()

    # Nature of business
    m = re.search(r"(?:NATURE\s*OF\s*BUSINESS|PRINCIPAL\s*ACTIVITY)[:\s]+(.+?)(?:\n|$)", text, re.IGNORECASE)
    if m:
        entity.nature_of_business = m.group(1).strip()

    # Directors — extract from DIRECTORS section or inline patterns
    directors_section = re.search(
        r"DIRECTORS?\s*[:\-]?\s*\n(.*?)(?:\n\s*\n|\nSHAREHOLDER|\nWITNESS|\nDATE|\Z)",
        text, re.IGNORECASE | re.DOTALL,
    )
    if directors_section:
        section_text = directors_section.group(1)
        # Match numbered list (e.g., "1. John Obi - Managing Director")
        for dm in re.finditer(
            r"(?:\d+[\.\)]\s*)?([A-Z][A-Za-z\s\-'\.]+?)(?:\s*[-–—]\s*(.+?))?(?:\n|$)",
            section_text,
        ):
            name = dm.group(1).strip().rstrip("-–— ")
            position = (dm.group(2) or "").strip()
            if name and len(name) > 2 and not name.upper().startswith(("SHAREHOLDER", "WITNESS", "DATE")):
                entity.directors.append(Director(name=name, position=position))
    else:
        # Fallback: match inline "DIRECTOR: Name" or "SECRETARY: Name"
        for dm in re.finditer(
            r"(?:DIRECTOR|SECRETARY)[:\s]+([A-Z][A-Za-z\s\-'\.]+?)(?:\n|,\s*(?:NATIONALITY|ADDRESS))",
            text, re.IGNORECASE,
        ):
            entity.directors.append(Director(name=dm.group(1).strip()))

    # Shareholders — extract from SHAREHOLDERS section
    shareholders_section = re.search(
        r"SHAREHOLDERS?\s*[:\-]?\s*\n(.*?)(?:\n\s*\n|\nDIRECTOR|\nWITNESS|\nDATE|\Z)",
        text, re.IGNORECASE | re.DOTALL,
    )
    if shareholders_section:
        section_text = shareholders_section.group(1)
        for sm in re.finditer(
            r"(?:[-•]\s*|\d+[\.\)]\s*)?([A-Z][A-Za-z\s\-'\.]+?)(?:\s*\((\d+(?:\.\d+)?%?)\))?(?:\n|$)",
            section_text,
        ):
            name = sm.group(1).strip().rstrip("-–— ")
            percentage = sm.group(2) or ""
            if name and len(name) > 2:
                entity.shareholders.append({"name": name, "percentage": percentage})

    return entity


def _extract_tables_from_markdown(markdown: str) -> list[TableData]:
    """Extract table data from Docling markdown output."""
    tables: list[TableData] = []
    lines = markdown.split("\n")
    i = 0

    while i < len(lines):
        if "|" in lines[i] and i + 1 < len(lines) and re.match(r"^\|[\s\-:|]+\|$", lines[i + 1]):
            headers = [cell.strip() for cell in lines[i].split("|")[1:-1]]
            rows: list[list[str]] = []
            j = i + 2
            while j < len(lines) and "|" in lines[j]:
                row = [cell.strip() for cell in lines[j].split("|")[1:-1]]
                rows.append(row)
                j += 1
            tables.append(TableData(headers=headers, rows=rows, confidence=0.85))
            i = j
        else:
            i += 1

    return tables


async def parse_business_document(
    file_path: str,
    expected_type: Optional[BusinessDocType] = None,
) -> DoclingResult:
    """
    Parse a business document using Docling for structure + PaddleOCR/regex for fields.

    Handles PDFs, images (JPG/PNG), and scanned documents.
    Returns structured entity data, tables, sections, and raw markdown.
    """
    warnings: list[str] = []
    converter = _get_docling_converter()
    raw_markdown = ""
    tables: list[TableData] = []
    sections: dict[str, str] = {}
    method = "docling"

    if converter is not None:
        try:
            result = converter.convert(file_path)
            raw_markdown = result.document.export_to_markdown()

            # Extract sections from markdown headers
            current_section = "preamble"
            current_content: list[str] = []
            for line in raw_markdown.split("\n"):
                if line.startswith("#"):
                    if current_content:
                        sections[current_section] = "\n".join(current_content).strip()
                    current_section = line.lstrip("#").strip().lower()
                    current_content = []
                else:
                    current_content.append(line)
            if current_content:
                sections[current_section] = "\n".join(current_content).strip()

            # Extract tables
            tables = _extract_tables_from_markdown(raw_markdown)

        except Exception as e:
            logger.warning(f"Docling parsing failed: {e} — falling back to OCR")
            method = "ocr_fallback"
            warnings.append(f"Docling failed: {str(e)}")
    else:
        method = "regex_fallback"
        warnings.append("Docling not available — using regex extraction only")

    # If Docling didn't produce text, try PaddleOCR
    if not raw_markdown:
        try:
            from ..ocr.paddle_ocr import extract_document_text, DocumentType
            ocr_result = await extract_document_text(
                file_path,
                DocumentType.BUSINESS_REGISTRATION,
                country="NG",
            )
            raw_markdown = ocr_result.raw_text
            method = "paddleocr_fallback"
        except Exception as e:
            logger.warning(f"PaddleOCR fallback also failed: {e}")
            warnings.append(f"PaddleOCR fallback failed: {str(e)}")

    # Classify document type
    doc_type = expected_type or _classify_business_doc(raw_markdown)

    # Extract entity from text
    entity = _extract_entity_from_text(raw_markdown)

    # Confidence based on extraction quality
    filled_fields = sum(1 for v in [
        entity.company_name, entity.rc_number, entity.tin_number,
        entity.registration_date, entity.registered_address,
    ] if v)
    confidence = min(1.0, (filled_fields / 5) * 0.8 + 0.2)

    if not entity.company_name:
        warnings.append("Could not extract company name from document")
    if not entity.rc_number and doc_type == BusinessDocType.CAC_CERTIFICATE:
        warnings.append("RC number not found in CAC certificate")

    return DoclingResult(
        document_type=doc_type,
        entity=entity,
        tables=tables,
        sections=sections,
        raw_markdown=raw_markdown,
        confidence=confidence,
        method=method,
        warnings=warnings,
    )


async def validate_business_document(
    doc_result: DoclingResult,
    claimed_entity: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    """
    Validate extracted business data against claimed entity info.

    Cross-checks RC number, company name, TIN, etc. against what the
    applicant provided in their KYB application.
    """
    if claimed_entity is None:
        return {"validated": False, "reason": "No claimed entity data to validate against"}

    mismatches: list[dict[str, str]] = []
    matches: list[str] = []

    entity = doc_result.entity

    # Company name comparison (fuzzy)
    if claimed_entity.get("company_name") and entity.company_name:
        claimed = claimed_entity["company_name"].upper().strip()
        extracted = entity.company_name.upper().strip()
        if claimed in extracted or extracted in claimed:
            matches.append("company_name")
        else:
            mismatches.append({"field": "company_name", "claimed": claimed, "extracted": extracted})

    # RC number (exact)
    if claimed_entity.get("rc_number") and entity.rc_number:
        if claimed_entity["rc_number"].strip() == entity.rc_number.strip():
            matches.append("rc_number")
        else:
            mismatches.append({
                "field": "rc_number",
                "claimed": claimed_entity["rc_number"],
                "extracted": entity.rc_number,
            })

    # TIN (exact)
    if claimed_entity.get("tin_number") and entity.tin_number:
        if claimed_entity["tin_number"].strip() == entity.tin_number.strip():
            matches.append("tin_number")
        else:
            mismatches.append({
                "field": "tin_number",
                "claimed": claimed_entity["tin_number"],
                "extracted": entity.tin_number,
            })

    risk = "low" if not mismatches else ("high" if len(mismatches) >= 2 else "medium")

    return {
        "validated": True,
        "matches": matches,
        "mismatches": mismatches,
        "risk_level": risk,
        "document_type": doc_result.document_type.value,
        "extraction_method": doc_result.method,
        "confidence": doc_result.confidence,
    }

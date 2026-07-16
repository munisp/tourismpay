"""AML Screening Python SDK — PEP/sanctions list screening for Nigerian insurance.

Business Rules:
- Screening sources: OFAC SDN, UN Sanctions, EFCC Watch List, CBN BVN blacklist
- Match threshold: Fuzzy name match > 85% similarity = flag for review
- Auto-clear: Score < 50% = no match, pass through
- Enhanced Due Diligence: Score 50-85% = EDD required
- Block: Score > 85% = immediate block + STR filing
- Re-screening: All customers re-screened quarterly
- Response SLA: < 500ms for real-time, < 5min for batch
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from difflib import SequenceMatcher
from datetime import datetime
from typing import Optional

app = FastAPI(title="AML Screening SDK", version="1.0.0")

SANCTIONS_LIST = [
    {"name": "ABUBAKAR SHEKAU", "list": "EFCC", "type": "individual"},
    {"name": "AHMED KHALIFA", "list": "UN_SANCTIONS", "type": "individual"},
    {"name": "PETROLEUM TRADING CO", "list": "OFAC_SDN", "type": "entity"},
    {"name": "LAGOS MONEY EXCHANGE", "list": "CBN_BLACKLIST", "type": "entity"},
]

class ScreeningRequest(BaseModel):
    name: str
    bvn: Optional[str] = None
    date_of_birth: Optional[str] = None
    nationality: str = "NG"

class ScreeningResult(BaseModel):
    screening_id: str
    name_searched: str
    match_score: float
    decision: str
    matches: list
    timestamp: str

def fuzzy_match(name1: str, name2: str) -> float:
    return SequenceMatcher(None, name1.upper(), name2.upper()).ratio() * 100

@app.get("/health")
def health():
    return {"status": "healthy", "service": "aml-screening-python-sdk"}

@app.post("/api/v1/screen", response_model=ScreeningResult)
def screen_customer(req: ScreeningRequest):
    matches = []
    max_score = 0.0
    for entry in SANCTIONS_LIST:
        score = fuzzy_match(req.name, entry["name"])
        if score > 50:
            matches.append({"name": entry["name"], "list": entry["list"], "score": round(score, 1)})
            max_score = max(max_score, score)

    decision = "clear" if max_score < 50 else "edd_required" if max_score < 85 else "blocked"
    return ScreeningResult(
        screening_id=f"SCR-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        name_searched=req.name, match_score=round(max_score, 1),
        decision=decision, matches=matches, timestamp=datetime.now().isoformat()
    )

@app.get("/api/v1/lists")
def get_lists():
    return {"lists": ["OFAC_SDN", "UN_SANCTIONS", "EFCC", "CBN_BLACKLIST"], "total_entries": len(SANCTIONS_LIST), "last_updated": "2026-05-01"}

@app.post("/api/v1/batch-screen")
def batch_screen(names: list[str]):
    results = []
    for name in names[:100]:
        max_score = max((fuzzy_match(name, e["name"]) for e in SANCTIONS_LIST), default=0)
        decision = "clear" if max_score < 50 else "edd_required" if max_score < 85 else "blocked"
        results.append({"name": name, "score": round(max_score, 1), "decision": decision})
    return {"results": results, "total": len(results)}

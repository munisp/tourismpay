"""
TourismPay Revenue Management Service
Real-time AI-powered room rate optimization for hotels
Port: 8097
"""
import os
import json
import math
from datetime import datetime, timedelta
from typing import Optional, List
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="TourismPay Revenue Management Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/tourismpay")

def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn

def ensure_tables():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS revenue_recommendations (
                id VARCHAR(64) PRIMARY KEY,
                hotel_id VARCHAR(64) NOT NULL,
                room_type VARCHAR(100),
                current_rate DECIMAL(10,2) NOT NULL,
                recommended_rate DECIMAL(10,2) NOT NULL,
                currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
                occupancy_pct DECIMAL(5,2),
                demand_score DECIMAL(5,2),
                competitor_avg DECIMAL(10,2),
                reason TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                applied_at TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS rev_rec_hotel_idx ON revenue_recommendations(hotel_id);
            CREATE TABLE IF NOT EXISTS rate_history (
                id SERIAL PRIMARY KEY,
                hotel_id VARCHAR(64) NOT NULL,
                room_type VARCHAR(100),
                rate DECIMAL(10,2) NOT NULL,
                currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
                occupancy_pct DECIMAL(5,2),
                recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS rate_hist_hotel_idx ON rate_history(hotel_id);
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"WARN: ensure_tables: {e}")

ensure_tables()

class RateRecommendationRequest(BaseModel):
    hotel_id: str
    room_type: str
    current_rate: float
    currency: str = "NGN"
    occupancy_pct: float = 60.0
    check_in_date: str = ""
    days_ahead: int = 7

def calculate_recommended_rate(current_rate: float, occupancy_pct: float, days_ahead: int) -> tuple:
    """Simple revenue management algorithm based on occupancy and lead time."""
    # Base adjustment from occupancy
    if occupancy_pct >= 90:
        occ_multiplier = 1.25
        reason = "High occupancy ({}%) — increase rate to maximize revenue".format(occupancy_pct)
    elif occupancy_pct >= 75:
        occ_multiplier = 1.10
        reason = "Good occupancy ({}%) — slight rate increase recommended".format(occupancy_pct)
    elif occupancy_pct >= 50:
        occ_multiplier = 1.0
        reason = "Moderate occupancy ({}%) — maintain current rate".format(occupancy_pct)
    elif occupancy_pct >= 30:
        occ_multiplier = 0.90
        reason = "Low occupancy ({}%) — reduce rate to stimulate demand".format(occupancy_pct)
    else:
        occ_multiplier = 0.80
        reason = "Very low occupancy ({}%) — significant discount recommended".format(occupancy_pct)

    # Lead time adjustment
    if days_ahead <= 1:
        lead_multiplier = 0.85  # Last-minute discount
        reason += ". Last-minute booking discount applied."
    elif days_ahead <= 3:
        lead_multiplier = 0.95
    elif days_ahead >= 30:
        lead_multiplier = 1.05  # Advance booking premium
    else:
        lead_multiplier = 1.0

    recommended = round(current_rate * occ_multiplier * lead_multiplier, 2)
    demand_score = min(100.0, occupancy_pct * occ_multiplier)
    return recommended, demand_score, reason

@app.get("/health")
def health():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        return {"status": "healthy", "service": "revenue-management-service", "version": "1.0.0"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/recommendations")
def create_recommendation(req: RateRecommendationRequest):
    recommended_rate, demand_score, reason = calculate_recommended_rate(
        req.current_rate, req.occupancy_pct, req.days_ahead
    )
    rec_id = f"REC-{int(datetime.now().timestamp() * 1000) % 999999999999:012X}"
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO revenue_recommendations
            (id, hotel_id, room_type, current_rate, recommended_rate, currency,
             occupancy_pct, demand_score, reason, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', NOW())
        """, (rec_id, req.hotel_id, req.room_type, req.current_rate, recommended_rate,
              req.currency, req.occupancy_pct, demand_score, reason))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "recommendation_id": rec_id,
        "current_rate": req.current_rate,
        "recommended_rate": recommended_rate,
        "currency": req.currency,
        "demand_score": round(demand_score, 1),
        "reason": reason,
        "expected_revpar_change": f"+{round((recommended_rate/req.current_rate - 1)*100, 1)}%"
    }

@app.get("/recommendations")
def list_recommendations(hotel_id: str = Query(...), status: Optional[str] = None, limit: int = 50):
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if status:
            cur.execute("SELECT id,hotel_id,room_type,current_rate,recommended_rate,currency,occupancy_pct,demand_score,reason,status,created_at::text FROM revenue_recommendations WHERE hotel_id=%s AND status=%s ORDER BY created_at DESC LIMIT %s", (hotel_id, status, limit))
        else:
            cur.execute("SELECT id,hotel_id,room_type,current_rate,recommended_rate,currency,occupancy_pct,demand_score,reason,status,created_at::text FROM revenue_recommendations WHERE hotel_id=%s ORDER BY created_at DESC LIMIT %s", (hotel_id, limit))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/recommendations/{rec_id}/apply")
def apply_recommendation(rec_id: str):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE revenue_recommendations SET status='applied', applied_at=NOW() WHERE id=%s AND status='pending'", (rec_id,))
        if cur.rowcount == 0:
            cur.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Recommendation not found or already applied")
        conn.commit()
        cur.close()
        conn.close()
        return {"success": True, "message": "Rate recommendation applied"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/rate-history")
def record_rate(hotel_id: str, room_type: str, rate: float, currency: str = "NGN", occupancy_pct: float = 0.0):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO rate_history (hotel_id, room_type, rate, currency, occupancy_pct, recorded_at) VALUES (%s, %s, %s, %s, %s, NOW())", (hotel_id, room_type, rate, currency, occupancy_pct))
        conn.commit()
        cur.close()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/rate-history/{hotel_id}")
def get_rate_history(hotel_id: str, days: int = 30):
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT room_type, rate, currency, occupancy_pct, recorded_at::text FROM rate_history WHERE hotel_id=%s AND recorded_at > NOW() - INTERVAL '%s days' ORDER BY recorded_at DESC LIMIT 200", (hotel_id, days))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8097"))
    uvicorn.run(app, host="0.0.0.0", port=port)

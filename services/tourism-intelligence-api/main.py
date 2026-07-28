"""
TourismPay Tourism Intelligence API
Aggregated tourism analytics and market intelligence
Port: 8102
"""
import os
import json
from datetime import datetime, timedelta
from typing import Optional
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TourismPay Tourism Intelligence API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/tourismpay")

def get_db():
    return psycopg2.connect(DATABASE_URL)

def ensure_tables():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tourism_intelligence_snapshots (
                id SERIAL PRIMARY KEY,
                snapshot_date DATE NOT NULL,
                country VARCHAR(2) NOT NULL DEFAULT 'NG',
                total_tourists INT NOT NULL DEFAULT 0,
                total_transactions INT NOT NULL DEFAULT 0,
                total_fx_volume_usd DECIMAL(18,2) NOT NULL DEFAULT 0,
                avg_spend_per_tourist_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
                top_nationality VARCHAR(2),
                top_establishment_category VARCHAR(50),
                occupancy_rate_pct DECIMAL(5,2),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ti_snapshot_date_country_idx ON tourism_intelligence_snapshots(snapshot_date, country);
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"WARN: ensure_tables: {e}")

ensure_tables()

@app.get("/health")
def health():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        return {"status": "healthy", "service": "tourism-intelligence-api", "version": "1.0.0"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.get("/dashboard")
def get_dashboard(country: str = "NG", days: int = 30):
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Real aggregated stats from wallet transactions and establishments
        cur.execute("""
            SELECT
                COUNT(DISTINCT u.id) as total_tourists,
                COUNT(wt.id) as total_transactions,
                COALESCE(SUM(wt.amount), 0) as total_volume_ngn,
                COALESCE(AVG(wt.amount), 0) as avg_transaction_ngn
            FROM users u
            LEFT JOIN wallet_transactions wt ON wt.user_id = u.id
                AND wt.created_at > NOW() - INTERVAL '%s days'
            WHERE u.role = 'tourist'
        """, (days,))
        stats = dict(cur.fetchone() or {})

        # Establishment count by category
        cur.execute("""
            SELECT COALESCE(category, 'hotel') as category, COUNT(*) as count
            FROM establishments
            GROUP BY category ORDER BY count DESC LIMIT 5
        """)
        categories = [dict(r) for r in cur.fetchall()]

        # Recent snapshot if available
        cur.execute("""
            SELECT total_tourists, total_transactions, total_fx_volume_usd,
                   avg_spend_per_tourist_usd, occupancy_rate_pct, snapshot_date::text
            FROM tourism_intelligence_snapshots
            WHERE country=%s ORDER BY snapshot_date DESC LIMIT 1
        """, (country,))
        snapshot = cur.fetchone()

        cur.close()
        conn.close()

        return {
            "country": country,
            "period_days": days,
            "live_stats": {
                "total_tourists": stats.get("total_tourists", 0),
                "total_transactions": stats.get("total_transactions", 0),
                "total_volume_ngn": float(stats.get("total_volume_ngn", 0)),
                "avg_transaction_ngn": float(stats.get("avg_transaction_ngn", 0)),
            },
            "establishment_breakdown": categories,
            "latest_snapshot": dict(snapshot) if snapshot else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/snapshots")
def list_snapshots(country: str = "NG", limit: int = 90):
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT snapshot_date::text, country, total_tourists, total_transactions,
                   total_fx_volume_usd, avg_spend_per_tourist_usd, occupancy_rate_pct
            FROM tourism_intelligence_snapshots
            WHERE country=%s ORDER BY snapshot_date DESC LIMIT %s
        """, (country, limit))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/snapshots")
def create_snapshot(country: str = "NG"):
    """Generate a daily intelligence snapshot from live data."""
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                COUNT(DISTINCT u.id) as total_tourists,
                COUNT(wt.id) as total_transactions,
                COALESCE(SUM(wt.amount / 1550.0), 0) as total_fx_volume_usd,
                COALESCE(AVG(wt.amount / 1550.0), 0) as avg_spend_usd
            FROM users u
            LEFT JOIN wallet_transactions wt ON wt.user_id = u.id
                AND wt.created_at > NOW() - INTERVAL '1 day'
            WHERE u.role = 'tourist'
        """)
        stats = dict(cur.fetchone() or {})
        today = datetime.now().date().isoformat()
        cur.execute("""
            INSERT INTO tourism_intelligence_snapshots
            (snapshot_date, country, total_tourists, total_transactions,
             total_fx_volume_usd, avg_spend_per_tourist_usd, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (snapshot_date, country) DO UPDATE SET
                total_tourists=EXCLUDED.total_tourists,
                total_transactions=EXCLUDED.total_transactions,
                total_fx_volume_usd=EXCLUDED.total_fx_volume_usd,
                avg_spend_per_tourist_usd=EXCLUDED.avg_spend_per_tourist_usd
        """, (today, country, stats.get("total_tourists", 0), stats.get("total_transactions", 0),
              float(stats.get("total_fx_volume_usd", 0)), float(stats.get("avg_spend_usd", 0))))
        conn.commit()
        cur.close()
        conn.close()
        return {"success": True, "snapshot_date": today, "country": country}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/market-report")
def get_market_report(country: str = "NG"):
    """Generate a market intelligence report."""
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT COUNT(*) as total FROM establishments WHERE is_active=true")
        est_count = dict(cur.fetchone() or {}).get("total", 0)
        cur.execute("SELECT COUNT(*) as total FROM users WHERE role='tourist'")
        tourist_count = dict(cur.fetchone() or {}).get("total", 0)
        cur.execute("SELECT COUNT(*) as total FROM users WHERE role='merchant'")
        merchant_count = dict(cur.fetchone() or {}).get("total", 0)
        cur.close()
        conn.close()
        return {
            "country": country,
            "generated_at": datetime.now().isoformat(),
            "platform_stats": {
                "active_establishments": est_count,
                "registered_tourists": tourist_count,
                "registered_merchants": merchant_count,
            },
            "market_indicators": {
                "digital_payment_adoption": "72%",
                "avg_hotel_occupancy": "64%",
                "yoy_tourist_growth": "+18%",
                "fx_savings_vs_traditional": "3.2%",
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8102"))
    uvicorn.run(app, host="0.0.0.0", port=port)

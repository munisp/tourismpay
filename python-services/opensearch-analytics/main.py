"""TourismPay OpenSearch Analytics Service (Python)

Full-text search, analytics indexing, and query API for the TourismPay platform.
Manages indices for transactions, audit logs, KYB applications, merchants, and users.
"""

import os
import json
import time
import uuid
import re
from datetime import datetime, timedelta
from typing import Any
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading


# ─── Configuration ───────────────────────────────────────────────────────────

PORT = int(os.getenv("PORT", "8120"))
OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://localhost:9200")

# ─── In-Memory Index Store ───────────────────────────────────────────────────

indices: dict[str, dict] = {}
documents: dict[str, list[dict]] = {}
stats = {
    "totalIndices": 0,
    "totalDocuments": 0,
    "totalSearches": 0,
    "totalIndexed": 0,
    "avgSearchLatencyMs": 0.0,
    "indexSizeBytes": 0,
}
lock = threading.Lock()


def init_indices():
    """Seed default indices with mappings and sample data."""
    index_configs = {
        "transactions": {
            "mappings": {
                "properties": {
                    "transactionId": {"type": "keyword"},
                    "amount": {"type": "float"},
                    "currency": {"type": "keyword"},
                    "merchantId": {"type": "keyword"},
                    "merchantName": {"type": "text"},
                    "touristId": {"type": "keyword"},
                    "paymentMethod": {"type": "keyword"},
                    "status": {"type": "keyword"},
                    "country": {"type": "keyword"},
                    "timestamp": {"type": "date"},
                    "description": {"type": "text"},
                }
            },
            "settings": {"number_of_shards": 3, "number_of_replicas": 1},
        },
        "audit-logs": {
            "mappings": {
                "properties": {
                    "eventId": {"type": "keyword"},
                    "action": {"type": "keyword"},
                    "userId": {"type": "keyword"},
                    "resource": {"type": "keyword"},
                    "details": {"type": "text"},
                    "ipAddress": {"type": "ip"},
                    "userAgent": {"type": "text"},
                    "timestamp": {"type": "date"},
                    "severity": {"type": "keyword"},
                }
            },
            "settings": {"number_of_shards": 2, "number_of_replicas": 1},
        },
        "kyb-applications": {
            "mappings": {
                "properties": {
                    "applicationId": {"type": "keyword"},
                    "businessName": {"type": "text"},
                    "businessType": {"type": "keyword"},
                    "country": {"type": "keyword"},
                    "status": {"type": "keyword"},
                    "submittedAt": {"type": "date"},
                    "reviewedAt": {"type": "date"},
                    "riskScore": {"type": "float"},
                    "assignedOfficer": {"type": "keyword"},
                }
            },
            "settings": {"number_of_shards": 1, "number_of_replicas": 1},
        },
        "merchants": {
            "mappings": {
                "properties": {
                    "merchantId": {"type": "keyword"},
                    "name": {"type": "text"},
                    "category": {"type": "keyword"},
                    "country": {"type": "keyword"},
                    "city": {"type": "text"},
                    "rating": {"type": "float"},
                    "totalTransactions": {"type": "integer"},
                    "totalRevenue": {"type": "float"},
                    "status": {"type": "keyword"},
                    "joinedAt": {"type": "date"},
                    "location": {"type": "geo_point"},
                }
            },
            "settings": {"number_of_shards": 1, "number_of_replicas": 1},
        },
        "users": {
            "mappings": {
                "properties": {
                    "userId": {"type": "keyword"},
                    "email": {"type": "keyword"},
                    "role": {"type": "keyword"},
                    "country": {"type": "keyword"},
                    "kycStatus": {"type": "keyword"},
                    "walletBalance": {"type": "float"},
                    "registeredAt": {"type": "date"},
                    "lastActive": {"type": "date"},
                }
            },
            "settings": {"number_of_shards": 1, "number_of_replicas": 1},
        },
    }

    for name, config in index_configs.items():
        indices[name] = config
        documents[name] = []

    # Seed sample documents
    seed_transactions()
    seed_audit_logs()
    seed_merchants()

    stats["totalIndices"] = len(indices)
    stats["totalDocuments"] = sum(len(docs) for docs in documents.values())
    stats["totalIndexed"] = stats["totalDocuments"]


def seed_transactions():
    txs = [
        {"transactionId": "tx-001", "amount": 150.00, "currency": "USD", "merchantId": "m-001", "merchantName": "Safari Lodge Nairobi", "touristId": "t-001", "paymentMethod": "card", "status": "completed", "country": "KE", "timestamp": "2026-05-01T10:30:00Z", "description": "Safari tour booking"},
        {"transactionId": "tx-002", "amount": 45.50, "currency": "KES", "merchantId": "m-002", "merchantName": "Mama Oliech Restaurant", "touristId": "t-002", "paymentMethod": "mpesa", "status": "completed", "country": "KE", "timestamp": "2026-05-01T12:15:00Z", "description": "Lunch - local cuisine"},
        {"transactionId": "tx-003", "amount": 320.00, "currency": "USD", "merchantId": "m-003", "merchantName": "Zanzibar Beach Resort", "touristId": "t-003", "paymentMethod": "card", "status": "pending", "country": "TZ", "timestamp": "2026-05-01T14:45:00Z", "description": "Hotel room booking 3 nights"},
        {"transactionId": "tx-004", "amount": 75.00, "currency": "GHS", "merchantId": "m-004", "merchantName": "Accra Art Gallery", "touristId": "t-001", "paymentMethod": "wallet", "status": "completed", "country": "GH", "timestamp": "2026-05-01T16:00:00Z", "description": "Art pieces purchase"},
        {"transactionId": "tx-005", "amount": 200.00, "currency": "NGN", "merchantId": "m-005", "merchantName": "Lagos Tour Operators", "touristId": "t-004", "paymentMethod": "card", "status": "failed", "country": "NG", "timestamp": "2026-05-01T18:30:00Z", "description": "City tour - insufficient funds"},
    ]
    documents["transactions"] = [{"_id": t["transactionId"], **t} for t in txs]


def seed_audit_logs():
    logs = [
        {"eventId": "evt-001", "action": "user.login", "userId": "admin-001", "resource": "auth", "details": "Admin login from dashboard", "ipAddress": "192.168.1.1", "timestamp": "2026-05-01T08:00:00Z", "severity": "info"},
        {"eventId": "evt-002", "action": "kyb.submitted", "userId": "merchant-001", "resource": "kyb", "details": "KYB application submitted for Safari Lodge", "ipAddress": "10.0.0.5", "timestamp": "2026-05-01T09:30:00Z", "severity": "info"},
        {"eventId": "evt-003", "action": "payment.failed", "userId": "tourist-004", "resource": "payment", "details": "Payment declined - insufficient funds", "ipAddress": "172.16.0.10", "timestamp": "2026-05-01T18:30:00Z", "severity": "warning"},
        {"eventId": "evt-004", "action": "security.threat", "userId": "unknown", "resource": "waf", "details": "SQL injection attempt blocked", "ipAddress": "203.0.113.50", "timestamp": "2026-05-01T20:00:00Z", "severity": "critical"},
    ]
    documents["audit-logs"] = [{"_id": l["eventId"], **l} for l in logs]


def seed_merchants():
    merchants = [
        {"merchantId": "m-001", "name": "Safari Lodge Nairobi", "category": "accommodation", "country": "KE", "city": "Nairobi", "rating": 4.8, "totalTransactions": 1250, "totalRevenue": 185000.00, "status": "active", "joinedAt": "2025-06-15T00:00:00Z"},
        {"merchantId": "m-002", "name": "Mama Oliech Restaurant", "category": "restaurant", "country": "KE", "city": "Nairobi", "rating": 4.6, "totalTransactions": 3400, "totalRevenue": 42000.00, "status": "active", "joinedAt": "2025-08-01T00:00:00Z"},
        {"merchantId": "m-003", "name": "Zanzibar Beach Resort", "category": "resort", "country": "TZ", "city": "Zanzibar", "rating": 4.9, "totalTransactions": 890, "totalRevenue": 320000.00, "status": "active", "joinedAt": "2025-09-10T00:00:00Z"},
    ]
    documents["merchants"] = [{"_id": m["merchantId"], **m} for m in merchants]


# ─── Search Engine ───────────────────────────────────────────────────────────

def search_documents(index: str, query: dict, size: int = 20, from_offset: int = 0) -> dict:
    """Simple full-text search across indexed documents."""
    start = time.time()

    if index not in documents:
        return {"error": f"Index '{index}' not found"}

    docs = documents[index]
    results = []

    # Handle different query types
    if "match_all" in query:
        results = docs[from_offset : from_offset + size]
    elif "match" in query:
        field, value = next(iter(query["match"].items()))
        value_lower = str(value).lower()
        for doc in docs:
            if field in doc and value_lower in str(doc[field]).lower():
                results.append(doc)
    elif "term" in query:
        field, value = next(iter(query["term"].items()))
        for doc in docs:
            if field in doc and str(doc[field]) == str(value):
                results.append(doc)
    elif "range" in query:
        field, conditions = next(iter(query["range"].items()))
        for doc in docs:
            if field not in doc:
                continue
            val = doc[field]
            match = True
            if "gte" in conditions and val < conditions["gte"]:
                match = False
            if "lte" in conditions and val > conditions["lte"]:
                match = False
            if "gt" in conditions and val <= conditions["gt"]:
                match = False
            if "lt" in conditions and val >= conditions["lt"]:
                match = False
            if match:
                results.append(doc)
    elif "multi_match" in query:
        search_query = str(query["multi_match"].get("query", "")).lower()
        fields = query["multi_match"].get("fields", [])
        for doc in docs:
            for field in fields:
                if field in doc and search_query in str(doc[field]).lower():
                    results.append(doc)
                    break
    elif "bool" in query:
        bool_query = query["bool"]
        must = bool_query.get("must", [])
        should = bool_query.get("should", [])
        must_not = bool_query.get("must_not", [])
        filter_clauses = bool_query.get("filter", [])

        for doc in docs:
            # All must clauses must match
            must_match = all(_matches_clause(doc, clause) for clause in must)
            # At least one should clause must match (if any)
            should_match = not should or any(_matches_clause(doc, clause) for clause in should)
            # No must_not clause can match
            must_not_match = not any(_matches_clause(doc, clause) for clause in must_not)
            # All filter clauses must match
            filter_match = all(_matches_clause(doc, clause) for clause in filter_clauses)

            if must_match and should_match and must_not_match and filter_match:
                results.append(doc)

    # Apply pagination
    paginated = results[from_offset : from_offset + size]

    elapsed_ms = (time.time() - start) * 1000

    with lock:
        stats["totalSearches"] += 1
        stats["avgSearchLatencyMs"] = (
            (stats["avgSearchLatencyMs"] * (stats["totalSearches"] - 1) + elapsed_ms)
            / stats["totalSearches"]
        )

    return {
        "hits": {
            "total": {"value": len(results), "relation": "eq"},
            "hits": [{"_index": index, "_id": doc.get("_id", ""), "_source": doc, "_score": 1.0} for doc in paginated],
        },
        "took": round(elapsed_ms),
        "timed_out": False,
    }


def _matches_clause(doc: dict, clause: dict) -> bool:
    if "match" in clause:
        field, value = next(iter(clause["match"].items()))
        return field in doc and str(value).lower() in str(doc[field]).lower()
    if "term" in clause:
        field, value = next(iter(clause["term"].items()))
        return field in doc and str(doc[field]) == str(value)
    if "range" in clause:
        field, conditions = next(iter(clause["range"].items()))
        if field not in doc:
            return False
        val = doc[field]
        if "gte" in conditions and val < conditions["gte"]:
            return False
        if "lte" in conditions and val > conditions["lte"]:
            return False
        return True
    return True


def aggregate_documents(index: str, aggs: dict) -> dict:
    """Run aggregations on indexed documents."""
    if index not in documents:
        return {"error": f"Index '{index}' not found"}

    docs = documents[index]
    results = {}

    for agg_name, agg_def in aggs.items():
        if "terms" in agg_def:
            field = agg_def["terms"]["field"]
            size = agg_def["terms"].get("size", 10)
            buckets: dict[str, int] = {}
            for doc in docs:
                if field in doc:
                    key = str(doc[field])
                    buckets[key] = buckets.get(key, 0) + 1
            sorted_buckets = sorted(buckets.items(), key=lambda x: x[1], reverse=True)[:size]
            results[agg_name] = {
                "buckets": [{"key": k, "doc_count": v} for k, v in sorted_buckets]
            }
        elif "sum" in agg_def:
            field = agg_def["sum"]["field"]
            total = sum(doc.get(field, 0) for doc in docs if isinstance(doc.get(field), (int, float)))
            results[agg_name] = {"value": total}
        elif "avg" in agg_def:
            field = agg_def["avg"]["field"]
            values = [doc[field] for doc in docs if field in doc and isinstance(doc[field], (int, float))]
            results[agg_name] = {"value": sum(values) / len(values) if values else 0}
        elif "max" in agg_def:
            field = agg_def["max"]["field"]
            values = [doc[field] for doc in docs if field in doc and isinstance(doc[field], (int, float))]
            results[agg_name] = {"value": max(values) if values else 0}
        elif "min" in agg_def:
            field = agg_def["min"]["field"]
            values = [doc[field] for doc in docs if field in doc and isinstance(doc[field], (int, float))]
            results[agg_name] = {"value": min(values) if values else 0}

    return {"aggregations": results}


# ─── HTTP Handler ────────────────────────────────────────────────────────────

class OpenSearchHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if path == "/health":
            self._json_response(200, {
                "status": "healthy",
                "service": "TourismPay OpenSearch Analytics (Python)",
                "version": "1.0.0",
                "indices": len(indices),
                "totalDocuments": stats["totalDocuments"],
                "timestamp": datetime.utcnow().isoformat() + "Z",
            })
        elif path == "/api/v1/indices":
            result = []
            for name, config in indices.items():
                doc_count = len(documents.get(name, []))
                result.append({
                    "name": name,
                    "docCount": doc_count,
                    "settings": config.get("settings", {}),
                    "mappings": config.get("mappings", {}),
                })
            self._json_response(200, {"indices": result, "total": len(result)})
        elif path.startswith("/api/v1/indices/") and path.count("/") == 4:
            index_name = path.split("/")[4]
            if index_name in indices:
                self._json_response(200, {
                    "name": index_name,
                    "docCount": len(documents.get(index_name, [])),
                    **indices[index_name],
                })
            else:
                self._json_response(404, {"error": "index not found"})
        elif path == "/api/v1/stats":
            self._json_response(200, stats)
        elif path.startswith("/api/v1/documents/"):
            parts = path.split("/")
            if len(parts) >= 5:
                index_name = parts[4]
                if index_name in documents:
                    size = int(params.get("size", ["20"])[0])
                    offset = int(params.get("from", ["0"])[0])
                    docs = documents[index_name][offset:offset + size]
                    self._json_response(200, {"documents": docs, "total": len(documents[index_name])})
                else:
                    self._json_response(404, {"error": "index not found"})
        else:
            self._json_response(404, {"error": "not found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}

        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/v1/search":
            index = body.get("index", "")
            query = body.get("query", {"match_all": {}})
            size = body.get("size", 20)
            from_offset = body.get("from", 0)
            result = search_documents(index, query, size, from_offset)
            self._json_response(200, result)

        elif path == "/api/v1/search/multi":
            searches = body.get("searches", [])
            results = []
            for s in searches:
                result = search_documents(
                    s.get("index", ""),
                    s.get("query", {"match_all": {}}),
                    s.get("size", 20),
                )
                results.append(result)
            self._json_response(200, {"responses": results})

        elif path == "/api/v1/aggregate":
            index = body.get("index", "")
            aggs = body.get("aggs", {})
            result = aggregate_documents(index, aggs)
            self._json_response(200, result)

        elif path == "/api/v1/index":
            index = body.get("index", "")
            document = body.get("document", {})
            if index not in documents:
                self._json_response(404, {"error": f"Index '{index}' not found"})
                return
            doc_id = document.get("_id", str(uuid.uuid4()))
            document["_id"] = doc_id
            with lock:
                documents[index].append(document)
                stats["totalDocuments"] += 1
                stats["totalIndexed"] += 1
            self._json_response(201, {"_index": index, "_id": doc_id, "result": "created"})

        elif path == "/api/v1/index/bulk":
            actions = body.get("actions", [])
            results = []
            with lock:
                for action in actions:
                    idx = action.get("index", "")
                    doc = action.get("document", {})
                    if idx in documents:
                        doc_id = doc.get("_id", str(uuid.uuid4()))
                        doc["_id"] = doc_id
                        documents[idx].append(doc)
                        stats["totalDocuments"] += 1
                        stats["totalIndexed"] += 1
                        results.append({"_index": idx, "_id": doc_id, "result": "created"})
                    else:
                        results.append({"_index": idx, "error": "index not found"})
            self._json_response(200, {"items": results, "errors": any("error" in r for r in results)})

        elif path == "/api/v1/indices":
            name = body.get("name", "")
            mappings = body.get("mappings", {})
            settings = body.get("settings", {"number_of_shards": 1, "number_of_replicas": 1})
            if not name:
                self._json_response(400, {"error": "index name required"})
                return
            with lock:
                indices[name] = {"mappings": mappings, "settings": settings}
                documents[name] = []
                stats["totalIndices"] += 1
            self._json_response(201, {"acknowledged": True, "index": name})

        elif path == "/api/v1/suggest":
            index = body.get("index", "")
            field = body.get("field", "")
            prefix = body.get("prefix", "").lower()
            if index not in documents:
                self._json_response(404, {"error": "index not found"})
                return
            suggestions = []
            seen = set()
            for doc in documents[index]:
                if field in doc:
                    val = str(doc[field])
                    if val.lower().startswith(prefix) and val not in seen:
                        suggestions.append(val)
                        seen.add(val)
                    if len(suggestions) >= 10:
                        break
            self._json_response(200, {"suggestions": suggestions})

        else:
            self._json_response(404, {"error": "not found"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/v1/indices/"):
            index_name = path.split("/")[4]
            if index_name in indices:
                with lock:
                    del indices[index_name]
                    del documents[index_name]
                    stats["totalIndices"] -= 1
                self._json_response(200, {"acknowledged": True, "index": index_name})
            else:
                self._json_response(404, {"error": "index not found"})
        else:
            self._json_response(404, {"error": "not found"})

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def _json_response(self, status: int, data: Any):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id")

    def log_message(self, format, *args):
        pass  # Suppress default logging


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_indices()
    server = HTTPServer(("0.0.0.0", PORT), OpenSearchHandler)
    print(f"[OpenSearch Analytics] Starting on port {PORT}")
    print(f"[OpenSearch Analytics] {len(indices)} indices, {stats['totalDocuments']} documents loaded")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()

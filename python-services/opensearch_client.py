"""
OpenSearch Client for Python ML Services

Indexes fraud detection results, BIS investigation data, and compliance
risk assessments into OpenSearch for full-text search and analytics.

Falls back gracefully when OpenSearch is unavailable.
"""
import os
import json
import logging
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger("tourismpay.opensearch")

# Lazy-loaded client
_client = None
_connection_failed = False


def _get_client():
    """Get or create OpenSearch client (lazy initialization)."""
    global _client, _connection_failed
    if _client is not None:
        return _client
    if _connection_failed:
        return None

    url = os.environ.get("OPENSEARCH_URL")
    if not url:
        return None

    try:
        from opensearchpy import OpenSearch

        username = os.environ.get("OPENSEARCH_USERNAME", "admin")
        password = os.environ.get("OPENSEARCH_PASSWORD", "admin")
        verify_ssl = os.environ.get("OPENSEARCH_VERIFY_SSL", "true").lower() != "false"

        _client = OpenSearch(
            hosts=[url],
            http_auth=(username, password),
            use_ssl=url.startswith("https"),
            verify_certs=verify_ssl,
            ssl_show_warn=False,
            timeout=10,
            max_retries=2,
        )
        # Test connection
        _client.cluster.health()
        logger.info("OpenSearch connected: %s", url)
        return _client
    except Exception as e:
        logger.warning("OpenSearch connection failed: %s — falling back to DB", e)
        _connection_failed = True
        _client = None
        return None


# ─── Index Names ──────────────────────────────────────────────────────────────

INDEX_FRAUD_RESULTS = "tourismpay-fraud-results"
INDEX_BIS_INVESTIGATIONS = "tourismpay-bis-investigations"
INDEX_COMPLIANCE_RISK = "tourismpay-compliance-risk"
INDEX_EXCHANGE_RATES = "tourismpay-exchange-rates"


# ─── Index Operations ─────────────────────────────────────────────────────────

def index_document(index: str, doc_id: str, body: dict[str, Any]) -> bool:
    """Index a single document."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.index(index=index, id=doc_id, body=body, refresh="wait_for")
        return True
    except Exception as e:
        logger.warning("OpenSearch index %s/%s failed: %s", index, doc_id, e)
        return False


def search(index: str, query: dict[str, Any], size: int = 20) -> Optional[dict[str, Any]]:
    """Execute a search query."""
    client = _get_client()
    if client is None:
        return None
    try:
        result = client.search(index=index, body={"query": query, "size": size})
        return {
            "total": result["hits"]["total"]["value"],
            "hits": [
                {"id": h["_id"], "score": h["_score"], "source": h["_source"]}
                for h in result["hits"]["hits"]
            ],
        }
    except Exception as e:
        logger.warning("OpenSearch search on %s failed: %s", index, e)
        return None


def bulk_index(index: str, documents: list[dict[str, Any]]) -> int:
    """Bulk index documents."""
    client = _get_client()
    if client is None or not documents:
        return 0
    try:
        from opensearchpy.helpers import bulk

        actions = [
            {"_index": index, "_id": doc.get("id", str(i)), "_source": doc}
            for i, doc in enumerate(documents)
        ]
        success, _ = bulk(client, actions, refresh="wait_for")
        return success
    except Exception as e:
        logger.warning("OpenSearch bulk index to %s failed: %s", index, e)
        return 0


# ─── Convenience Functions ────────────────────────────────────────────────────

def index_fraud_result(
    transaction_id: str,
    risk_score: float,
    is_fraudulent: bool,
    model_version: str,
    features: dict[str, Any],
) -> bool:
    """Index a fraud detection result for analytics."""
    return index_document(INDEX_FRAUD_RESULTS, transaction_id, {
        "transaction_id": transaction_id,
        "risk_score": risk_score,
        "is_fraudulent": is_fraudulent,
        "model_version": model_version,
        "features": json.dumps(features),
        "timestamp": datetime.utcnow().isoformat(),
    })


def index_bis_investigation(
    investigation_id: str,
    title: str,
    status: str,
    severity: str,
    assignee: Optional[str] = None,
) -> bool:
    """Index a BIS investigation for search."""
    return index_document(INDEX_BIS_INVESTIGATIONS, investigation_id, {
        "investigation_id": investigation_id,
        "title": title,
        "status": status,
        "severity": severity,
        "assignee": assignee,
        "timestamp": datetime.utcnow().isoformat(),
    })


def index_compliance_risk(
    entity_id: str,
    entity_type: str,
    risk_level: str,
    risk_score: float,
    factors: list[str],
) -> bool:
    """Index a compliance risk assessment."""
    return index_document(INDEX_COMPLIANCE_RISK, f"{entity_type}-{entity_id}", {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "factors": factors,
        "timestamp": datetime.utcnow().isoformat(),
    })


def search_fraud_results(query: str, size: int = 20) -> Optional[dict[str, Any]]:
    """Full-text search across fraud results."""
    return search(INDEX_FRAUD_RESULTS, {
        "multi_match": {"query": query, "fields": ["transaction_id", "features"], "fuzziness": "AUTO"}
    }, size)


def search_investigations(query: str, size: int = 20) -> Optional[dict[str, Any]]:
    """Full-text search across BIS investigations."""
    return search(INDEX_BIS_INVESTIGATIONS, {
        "multi_match": {"query": query, "fields": ["title^3", "status", "assignee"], "fuzziness": "AUTO"}
    }, size)

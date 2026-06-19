"""
Neo4j Graph Integration for Fraud/Risk Analysis

Provides:
- Transaction graph construction in Neo4j
- Community detection (Louvain) for fraud ring identification
- PageRank for entity influence scoring
- Shortest path analysis for money laundering detection
- Real-time graph feature extraction for ML models
- Fallback to in-memory NetworkX when Neo4j unavailable

Schema:
    (:User {user_id, country, risk_score})
    (:Merchant {merchant_id, category, city, risk_score})
    (:Device {fingerprint, type})
    -[:TRANSACTS {amount, currency, timestamp, is_fraud}]->
    -[:P2P_TRANSFER {amount, timestamp}]->
    -[:USES_DEVICE]->
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

import numpy as np

logger = logging.getLogger("tourismpay.graph")

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "tourismpay123")

_driver = None
_use_networkx_fallback = False


def get_driver():
    """Get Neo4j driver, falling back to NetworkX if unavailable."""
    global _driver, _use_networkx_fallback

    if _use_networkx_fallback:
        return None

    if _driver is not None:
        return _driver

    try:
        from neo4j import GraphDatabase
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        _driver.verify_connectivity()
        logger.info("Neo4j connected: %s", NEO4J_URI)
        return _driver
    except Exception as e:
        logger.warning("Neo4j unavailable (%s), using NetworkX fallback", e)
        _use_networkx_fallback = True
        return None


def _get_networkx_graph():
    """Create in-memory NetworkX graph as fallback."""
    try:
        import networkx as nx
        return nx.DiGraph()
    except ImportError:
        return None


class GraphAnalyzer:
    """
    Unified graph analysis interface.
    Uses Neo4j when available, falls back to NetworkX.
    """

    def __init__(self):
        self.driver = get_driver()
        self._nx_graph = None
        if self.driver is None:
            import networkx as nx
            self._nx_graph = nx.DiGraph()

    def _use_neo4j(self) -> bool:
        return self.driver is not None

    def create_indexes(self) -> None:
        """Create Neo4j indexes for fast lookups."""
        if not self._use_neo4j():
            return

        with self.driver.session() as session:
            session.run("CREATE INDEX IF NOT EXISTS FOR (u:User) ON (u.user_id)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (m:Merchant) ON (m.merchant_id)")
            session.run("CREATE INDEX IF NOT EXISTS FOR (d:Device) ON (d.fingerprint)")

    def ingest_users(self, users: list[dict]) -> int:
        """Add user nodes to the graph."""
        if self._use_neo4j():
            with self.driver.session() as session:
                session.run("""
                    UNWIND $users AS u
                    MERGE (user:User {user_id: u.user_id})
                    SET user.country = u.country,
                        user.risk_score = u.risk_score,
                        user.account_age_days = u.account_age_days,
                        user.is_pep = u.is_pep
                """, users=users)
        else:
            for u in users:
                self._nx_graph.add_node(u["user_id"], **u, node_type="user")
        return len(users)

    def ingest_merchants(self, merchants: list[dict]) -> int:
        """Add merchant nodes."""
        if self._use_neo4j():
            with self.driver.session() as session:
                session.run("""
                    UNWIND $merchants AS m
                    MERGE (merch:Merchant {merchant_id: m.merchant_id})
                    SET merch.category = m.category,
                        merch.city = m.city,
                        merch.risk_score = m.risk_score,
                        merch.chargeback_rate = m.chargeback_rate
                """, merchants=merchants)
        else:
            for m in merchants:
                self._nx_graph.add_node(m["merchant_id"], **m, node_type="merchant")
        return len(merchants)

    def ingest_transactions(self, transactions: list[dict]) -> int:
        """Add transaction edges."""
        if self._use_neo4j():
            with self.driver.session() as session:
                session.run("""
                    UNWIND $txns AS t
                    MATCH (u:User {user_id: t.user_id})
                    MATCH (m:Merchant {merchant_id: t.merchant_id})
                    CREATE (u)-[:TRANSACTS {
                        transaction_id: t.transaction_id,
                        amount: t.amount,
                        currency: t.currency,
                        timestamp: t.timestamp,
                        is_fraud: t.is_fraud
                    }]->(m)
                """, txns=transactions)
        else:
            for t in transactions:
                self._nx_graph.add_edge(
                    t["user_id"], t["merchant_id"],
                    **t, edge_type="transacts",
                )
        return len(transactions)

    def ingest_p2p_transfers(self, transfers: list[dict]) -> int:
        """Add P2P transfer edges."""
        if self._use_neo4j():
            with self.driver.session() as session:
                session.run("""
                    UNWIND $transfers AS t
                    MATCH (src:User {user_id: t.source})
                    MATCH (dst:User {user_id: t.target})
                    CREATE (src)-[:P2P_TRANSFER {
                        amount: t.amount,
                        timestamp: t.timestamp,
                        is_fraud: t.is_fraud
                    }]->(dst)
                """, transfers=transfers)
        else:
            for t in transfers:
                self._nx_graph.add_edge(
                    t["source"], t["target"],
                    **t, edge_type="p2p",
                )
        return len(transfers)

    def detect_communities(self, min_size: int = 3) -> list[dict]:
        """
        Detect communities using Louvain algorithm.
        Returns list of communities with member IDs and sizes.
        """
        if self._use_neo4j():
            with self.driver.session() as session:
                result = session.run("""
                    CALL gds.louvain.stream('transaction-graph', {})
                    YIELD nodeId, communityId
                    WITH communityId, collect(gds.util.asNode(nodeId).user_id) AS members
                    WHERE size(members) >= $min_size
                    RETURN communityId, members, size(members) AS size
                    ORDER BY size DESC
                """, min_size=min_size)
                return [dict(r) for r in result]
        else:
            import networkx as nx
            from networkx.algorithms.community import greedy_modularity_communities
            undirected = self._nx_graph.to_undirected()
            if len(undirected) == 0:
                return []
            communities = list(greedy_modularity_communities(undirected))
            return [
                {"communityId": i, "members": list(c), "size": len(c)}
                for i, c in enumerate(communities)
                if len(c) >= min_size
            ]

    def compute_pagerank(self, top_n: int = 20) -> list[dict]:
        """Compute PageRank to identify influential entities."""
        if self._use_neo4j():
            with self.driver.session() as session:
                result = session.run("""
                    CALL gds.pageRank.stream('transaction-graph', {maxIterations: 20, dampingFactor: 0.85})
                    YIELD nodeId, score
                    WITH gds.util.asNode(nodeId) AS node, score
                    RETURN node.user_id AS entity_id, score
                    ORDER BY score DESC
                    LIMIT $top_n
                """, top_n=top_n)
                return [dict(r) for r in result]
        else:
            import networkx as nx
            if len(self._nx_graph) == 0:
                return []
            scores = nx.pagerank(self._nx_graph, alpha=0.85, max_iter=20)
            sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_n]
            return [{"entity_id": nid, "score": score} for nid, score in sorted_scores]

    def find_fraud_rings(
        self,
        min_ring_size: int = 3,
        min_internal_edges: int = 5,
    ) -> list[dict]:
        """
        Detect potential fraud rings: dense subgraphs with
        high internal connectivity and suspicious patterns.
        """
        communities = self.detect_communities(min_size=min_ring_size)
        fraud_rings = []

        for community in communities:
            members = set(community["members"])
            if self._use_neo4j():
                with self.driver.session() as session:
                    result = session.run("""
                        MATCH (a)-[r:P2P_TRANSFER]->(b)
                        WHERE a.user_id IN $members AND b.user_id IN $members
                        RETURN count(r) AS internal_edges,
                               sum(r.amount) AS total_volume,
                               avg(r.amount) AS avg_amount,
                               sum(CASE WHEN r.is_fraud THEN 1 ELSE 0 END) AS fraud_edges
                    """, members=list(members))
                    stats = result.single()
            else:
                internal_edges = 0
                total_volume = 0.0
                fraud_edges = 0
                for src, dst, data in self._nx_graph.edges(data=True):
                    if src in members and dst in members:
                        internal_edges += 1
                        total_volume += data.get("amount", 0)
                        if data.get("is_fraud"):
                            fraud_edges += 1
                stats = {
                    "internal_edges": internal_edges,
                    "total_volume": total_volume,
                    "avg_amount": total_volume / max(internal_edges, 1),
                    "fraud_edges": fraud_edges,
                }

            if isinstance(stats, dict):
                ie = stats.get("internal_edges", 0)
            else:
                ie = stats["internal_edges"] if stats else 0

            if ie >= min_internal_edges:
                fraud_rings.append({
                    "ring_id": len(fraud_rings),
                    "members": list(members),
                    "size": len(members),
                    "internal_edges": ie,
                    "total_volume": stats.get("total_volume", 0) if isinstance(stats, dict) else (stats["total_volume"] if stats else 0),
                    "avg_amount": stats.get("avg_amount", 0) if isinstance(stats, dict) else (stats["avg_amount"] if stats else 0),
                    "fraud_edges": stats.get("fraud_edges", 0) if isinstance(stats, dict) else (stats["fraud_edges"] if stats else 0),
                })

        return fraud_rings

    def extract_node_features(self, node_id: str) -> dict[str, float]:
        """
        Extract graph-based features for a single node.
        Used as additional features for ML models.
        """
        if self._use_neo4j():
            with self.driver.session() as session:
                result = session.run("""
                    MATCH (n {user_id: $node_id})
                    OPTIONAL MATCH (n)-[r]->()
                    WITH n, count(r) AS out_degree
                    OPTIONAL MATCH ()-[r]->(n)
                    WITH n, out_degree, count(r) AS in_degree
                    OPTIONAL MATCH (n)-[:TRANSACTS]->(m:Merchant)
                    WITH n, out_degree, in_degree, count(DISTINCT m) AS unique_merchants
                    RETURN out_degree, in_degree, unique_merchants
                """, node_id=node_id)
                record = result.single()
                if record:
                    return {
                        "out_degree": record["out_degree"],
                        "in_degree": record["in_degree"],
                        "unique_merchants": record["unique_merchants"],
                        "degree_ratio": record["out_degree"] / max(record["in_degree"], 1),
                    }
        else:
            if node_id in self._nx_graph:
                out_degree = self._nx_graph.out_degree(node_id)
                in_degree = self._nx_graph.in_degree(node_id)
                neighbors = set(self._nx_graph.successors(node_id))
                merchants = sum(
                    1 for n in neighbors
                    if self._nx_graph.nodes[n].get("node_type") == "merchant"
                )
                return {
                    "out_degree": out_degree,
                    "in_degree": in_degree,
                    "unique_merchants": merchants,
                    "degree_ratio": out_degree / max(in_degree, 1),
                }

        return {"out_degree": 0, "in_degree": 0, "unique_merchants": 0, "degree_ratio": 0}

    def get_graph_stats(self) -> dict[str, Any]:
        """Return overall graph statistics."""
        if self._use_neo4j():
            with self.driver.session() as session:
                result = session.run("""
                    MATCH (n)
                    WITH count(n) AS nodes
                    MATCH ()-[r]->()
                    WITH nodes, count(r) AS edges
                    RETURN nodes, edges
                """)
                record = result.single()
                return {
                    "nodes": record["nodes"] if record else 0,
                    "edges": record["edges"] if record else 0,
                    "backend": "neo4j",
                }
        else:
            return {
                "nodes": self._nx_graph.number_of_nodes(),
                "edges": self._nx_graph.number_of_edges(),
                "backend": "networkx_fallback",
            }

    def close(self) -> None:
        """Close Neo4j connection."""
        global _driver
        if self.driver:
            self.driver.close()
            _driver = None

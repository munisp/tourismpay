"""
Neo4j graph database integration for TourismPay entity relationship mapping.

Stores and queries:
  - User-to-user transaction relationships
  - Merchant-entity ownership graphs
  - Fraud ring detection via Cypher traversals
  - Entity community detection
  - GNN feature extraction from graph structure

Falls back to in-memory NetworkX graph when Neo4j is unavailable.
"""
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class EntityNode:
    entity_id: str
    entity_type: str  # "user", "merchant", "institution"
    name: str
    country: str
    risk_score: float = 0.0
    properties: Dict[str, Any] = None

    def __post_init__(self):
        if self.properties is None:
            self.properties = {}


@dataclass
class TransactionEdge:
    source_id: str
    target_id: str
    amount: float
    currency: str
    timestamp: str
    transaction_id: str
    edge_type: str = "SENT_TO"
    properties: Dict[str, Any] = None

    def __post_init__(self):
        if self.properties is None:
            self.properties = {}


class Neo4jGraphStore:
    """
    Neo4j-backed graph store for entity relationships.
    Uses the official Neo4j Python driver.
    Falls back to NetworkX when Neo4j is unavailable.
    """

    def __init__(
        self,
        uri: str = "bolt://localhost:7687",
        user: str = "neo4j",
        password: str = "tourismpay-neo4j-2026",
        database: str = "tourismpay",
    ):
        self.uri = uri
        self.user = user
        self.password = password
        self.database = database
        self._driver = None
        self._fallback_graph = None
        self._use_fallback = False

        self._connect()

    def _connect(self) -> None:
        try:
            from neo4j import GraphDatabase
            self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
            self._driver.verify_connectivity()
            logger.info(f"Connected to Neo4j at {self.uri}")
        except Exception as e:
            logger.warning(f"Neo4j unavailable ({e}), using NetworkX fallback")
            self._use_fallback = True
            import networkx as nx
            self._fallback_graph = nx.DiGraph()

    def close(self) -> None:
        if self._driver:
            self._driver.close()

    # ─── Node Operations ────────────────────────────────────────────────────

    def upsert_entity(self, node: EntityNode) -> None:
        if self._use_fallback:
            self._fallback_graph.add_node(
                node.entity_id,
                entity_type=node.entity_type,
                name=node.name,
                country=node.country,
                risk_score=node.risk_score,
                **node.properties,
            )
            return

        query = """
        MERGE (e:Entity {entity_id: $entity_id})
        SET e.entity_type = $entity_type,
            e.name = $name,
            e.country = $country,
            e.risk_score = $risk_score,
            e.updated_at = datetime()
        """
        with self._driver.session(database=self.database) as session:
            session.run(query, entity_id=node.entity_id, entity_type=node.entity_type,
                        name=node.name, country=node.country, risk_score=node.risk_score)

    def upsert_entities_batch(self, nodes: List[EntityNode]) -> int:
        if self._use_fallback:
            for n in nodes:
                self.upsert_entity(n)
            return len(nodes)

        query = """
        UNWIND $batch AS row
        MERGE (e:Entity {entity_id: row.entity_id})
        SET e.entity_type = row.entity_type,
            e.name = row.name,
            e.country = row.country,
            e.risk_score = row.risk_score,
            e.updated_at = datetime()
        """
        batch = [{"entity_id": n.entity_id, "entity_type": n.entity_type,
                   "name": n.name, "country": n.country, "risk_score": n.risk_score}
                 for n in nodes]
        with self._driver.session(database=self.database) as session:
            session.run(query, batch=batch)
        return len(batch)

    # ─── Edge Operations ────────────────────────────────────────────────────

    def add_transaction(self, edge: TransactionEdge) -> None:
        if self._use_fallback:
            self._fallback_graph.add_edge(
                edge.source_id, edge.target_id,
                key=edge.transaction_id,
                amount=edge.amount,
                currency=edge.currency,
                timestamp=edge.timestamp,
                **edge.properties,
            )
            return

        query = """
        MATCH (src:Entity {entity_id: $source_id})
        MATCH (dst:Entity {entity_id: $target_id})
        CREATE (src)-[r:SENT_TO {
            transaction_id: $transaction_id,
            amount: $amount,
            currency: $currency,
            timestamp: $timestamp
        }]->(dst)
        """
        with self._driver.session(database=self.database) as session:
            session.run(query, source_id=edge.source_id, target_id=edge.target_id,
                        transaction_id=edge.transaction_id, amount=edge.amount,
                        currency=edge.currency, timestamp=edge.timestamp)

    def add_transactions_batch(self, edges: List[TransactionEdge]) -> int:
        if self._use_fallback:
            for e in edges:
                self.add_transaction(e)
            return len(edges)

        query = """
        UNWIND $batch AS row
        MATCH (src:Entity {entity_id: row.source_id})
        MATCH (dst:Entity {entity_id: row.target_id})
        CREATE (src)-[r:SENT_TO {
            transaction_id: row.transaction_id,
            amount: row.amount,
            currency: row.currency,
            timestamp: row.timestamp
        }]->(dst)
        """
        batch = [{"source_id": e.source_id, "target_id": e.target_id,
                   "transaction_id": e.transaction_id, "amount": e.amount,
                   "currency": e.currency, "timestamp": e.timestamp}
                 for e in edges]
        with self._driver.session(database=self.database) as session:
            session.run(query, batch=batch)
        return len(batch)

    # ─── Graph Queries ──────────────────────────────────────────────────────

    def detect_circular_flows(self, min_ring_size: int = 3, max_ring_size: int = 8) -> List[List[str]]:
        """Detect circular money flow patterns (potential money laundering)."""
        if self._use_fallback:
            import networkx as nx
            cycles = []
            try:
                for cycle in nx.simple_cycles(self._fallback_graph):
                    if min_ring_size <= len(cycle) <= max_ring_size:
                        cycles.append(cycle)
            except Exception:
                pass
            return cycles

        query = """
        MATCH path = (start:Entity)-[:SENT_TO*$min..$max]->(start)
        WHERE ALL(n IN nodes(path) WHERE single(x IN nodes(path) WHERE x = n))
        RETURN [n IN nodes(path) | n.entity_id] AS ring
        LIMIT 100
        """
        with self._driver.session(database=self.database) as session:
            result = session.run(query.replace("$min", str(min_ring_size)).replace("$max", str(max_ring_size)))
            return [record["ring"] for record in result]

    def get_entity_neighborhood(
        self, entity_id: str, depth: int = 2
    ) -> Dict[str, Any]:
        """Get N-hop neighborhood of an entity."""
        if self._use_fallback:
            import networkx as nx
            g = self._fallback_graph
            if entity_id not in g:
                return {"entity_id": entity_id, "neighbors": [], "edges": []}

            neighbors = set()
            edges = []
            current = {entity_id}
            for d in range(depth):
                next_level = set()
                for node in current:
                    for succ in g.successors(node):
                        if succ not in neighbors and succ != entity_id:
                            neighbors.add(succ)
                            next_level.add(succ)
                            edge_data = g.get_edge_data(node, succ, default={})
                            edges.append({"from": node, "to": succ, **edge_data})
                    for pred in g.predecessors(node):
                        if pred not in neighbors and pred != entity_id:
                            neighbors.add(pred)
                            next_level.add(pred)
                            edge_data = g.get_edge_data(pred, node, default={})
                            edges.append({"from": pred, "to": node, **edge_data})
                current = next_level

            return {"entity_id": entity_id, "neighbors": list(neighbors), "edges": edges}

        query = """
        MATCH path = (start:Entity {entity_id: $entity_id})-[:SENT_TO*1..$depth]-(neighbor)
        RETURN DISTINCT neighbor.entity_id AS neighbor_id,
               neighbor.entity_type AS type,
               neighbor.risk_score AS risk
        """
        with self._driver.session(database=self.database) as session:
            result = session.run(query.replace("$depth", str(depth)), entity_id=entity_id)
            neighbors = [{"id": r["neighbor_id"], "type": r["type"], "risk": r["risk"]}
                         for r in result]
            return {"entity_id": entity_id, "neighbors": neighbors}

    def compute_pagerank(self, top_n: int = 20) -> List[Dict[str, Any]]:
        """Compute PageRank to find influential entities."""
        if self._use_fallback:
            import networkx as nx
            if len(self._fallback_graph) == 0:
                return []
            pr = nx.pagerank(self._fallback_graph)
            sorted_pr = sorted(pr.items(), key=lambda x: x[1], reverse=True)[:top_n]
            return [{"entity_id": k, "pagerank": v} for k, v in sorted_pr]

        query = """
        CALL gds.pageRank.stream('entity-graph')
        YIELD nodeId, score
        RETURN gds.util.asNode(nodeId).entity_id AS entity_id, score
        ORDER BY score DESC
        LIMIT $top_n
        """
        with self._driver.session(database=self.database) as session:
            result = session.run(query, top_n=top_n)
            return [{"entity_id": r["entity_id"], "pagerank": r["score"]} for r in result]

    def community_detection(self) -> List[Dict[str, Any]]:
        """Detect communities using Louvain algorithm (potential fraud rings)."""
        if self._use_fallback:
            import networkx as nx
            try:
                from networkx.algorithms.community import louvain_communities
                communities = louvain_communities(self._fallback_graph.to_undirected())
                return [{"community_id": i, "members": list(c), "size": len(c)}
                        for i, c in enumerate(communities)]
            except Exception:
                return []

        query = """
        CALL gds.louvain.stream('entity-graph')
        YIELD nodeId, communityId
        RETURN communityId, collect(gds.util.asNode(nodeId).entity_id) AS members
        ORDER BY size(members) DESC
        """
        with self._driver.session(database=self.database) as session:
            result = session.run(query)
            return [{"community_id": r["communityId"], "members": r["members"],
                      "size": len(r["members"])} for r in result]

    def extract_gnn_features(self) -> Dict[str, np.ndarray]:
        """
        Extract node features and edge indices for GNN input
        from the graph database.
        """
        if self._use_fallback:
            g = self._fallback_graph
            nodes = list(g.nodes)
            node_to_idx = {n: i for i, n in enumerate(nodes)}

            features = []
            for n in nodes:
                data = g.nodes[n]
                features.append([
                    data.get("risk_score", 0.0),
                    g.in_degree(n),
                    g.out_degree(n),
                    sum(d.get("amount", 0) for _, _, d in g.in_edges(n, data=True)),
                    sum(d.get("amount", 0) for _, _, d in g.out_edges(n, data=True)),
                ])

            edge_src, edge_dst = [], []
            for u, v in g.edges:
                edge_src.append(node_to_idx[u])
                edge_dst.append(node_to_idx[v])

            return {
                "node_ids": nodes,
                "node_features": np.array(features, dtype=np.float32),
                "edge_index": np.array([edge_src, edge_dst], dtype=np.int64),
            }

        query_nodes = """
        MATCH (e:Entity)
        OPTIONAL MATCH (e)<-[in_r:SENT_TO]-()
        OPTIONAL MATCH (e)-[out_r:SENT_TO]->()
        RETURN e.entity_id AS id, e.risk_score AS risk,
               count(DISTINCT in_r) AS in_degree,
               count(DISTINCT out_r) AS out_degree,
               sum(coalesce(in_r.amount, 0)) AS in_volume,
               sum(coalesce(out_r.amount, 0)) AS out_volume
        """
        query_edges = """
        MATCH (src:Entity)-[r:SENT_TO]->(dst:Entity)
        RETURN src.entity_id AS source, dst.entity_id AS target
        """
        with self._driver.session(database=self.database) as session:
            nodes_result = list(session.run(query_nodes))
            edges_result = list(session.run(query_edges))

        node_ids = [r["id"] for r in nodes_result]
        node_to_idx = {n: i for i, n in enumerate(node_ids)}
        features = np.array([
            [r["risk"], r["in_degree"], r["out_degree"], r["in_volume"], r["out_volume"]]
            for r in nodes_result
        ], dtype=np.float32)

        edge_src = [node_to_idx[r["source"]] for r in edges_result if r["source"] in node_to_idx]
        edge_dst = [node_to_idx[r["target"]] for r in edges_result if r["target"] in node_to_idx]

        return {
            "node_ids": node_ids,
            "node_features": features,
            "edge_index": np.array([edge_src, edge_dst], dtype=np.int64),
        }

    def get_stats(self) -> Dict[str, Any]:
        if self._use_fallback:
            g = self._fallback_graph
            return {
                "backend": "networkx_fallback",
                "node_count": g.number_of_nodes(),
                "edge_count": g.number_of_edges(),
            }

        with self._driver.session(database=self.database) as session:
            node_count = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
            edge_count = session.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
        return {"backend": "neo4j", "node_count": node_count, "edge_count": edge_count}

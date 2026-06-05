"""
CocoIndex Knowledge Graph Indexing for Insurance Platform

CocoIndex is used to build and maintain knowledge graph indexes from
insurance data for efficient retrieval and question answering.
"""

import os
import json
import hashlib
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import asyncio


class EntityType(Enum):
    """Types of entities in the insurance knowledge graph"""
    CUSTOMER = "customer"
    POLICY = "policy"
    CLAIM = "claim"
    AGENT = "agent"
    PRODUCT = "product"
    REGULATION = "regulation"
    LOCATION = "location"
    PAYMENT = "payment"
    DOCUMENT = "document"
    RISK_FACTOR = "risk_factor"


class RelationType(Enum):
    """Types of relationships in the insurance knowledge graph"""
    HAS_POLICY = "has_policy"
    FILED_CLAIM = "filed_claim"
    MANAGED_BY = "managed_by"
    COVERS = "covers"
    LOCATED_IN = "located_in"
    PAID_FOR = "paid_for"
    RELATED_TO = "related_to"
    BENEFICIARY_OF = "beneficiary_of"
    DEPENDS_ON = "depends_on"
    VIOLATES = "violates"
    COMPLIES_WITH = "complies_with"
    SIMILAR_TO = "similar_to"
    CONNECTED_TO = "connected_to"


@dataclass
class Entity:
    """Represents an entity in the knowledge graph"""
    id: str
    type: EntityType
    name: str
    properties: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[List[float]] = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class Relationship:
    """Represents a relationship between entities"""
    id: str
    source_id: str
    target_id: str
    type: RelationType
    properties: Dict[str, Any] = field(default_factory=dict)
    weight: float = 1.0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class IndexedDocument:
    """Represents an indexed document in CocoIndex"""
    id: str
    content: str
    entities: List[str]
    embedding: List[float]
    metadata: Dict[str, Any] = field(default_factory=dict)
    chunk_index: int = 0
    total_chunks: int = 1


class CocoIndexKnowledgeGraph:
    """
    CocoIndex-based knowledge graph for insurance data indexing.
    Provides efficient indexing and retrieval for RAG and KGQA.
    """

    def __init__(
        self,
        index_path: str = "/data/cocoindex",
        embedding_model: str = "qwen2.5:latest",
        ollama_url: str = "http://localhost:11434",
        chunk_size: int = 512,
        chunk_overlap: int = 50,
    ):
        self.index_path = index_path
        self.embedding_model = embedding_model
        self.ollama_url = ollama_url
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        
        # In-memory indexes (would be persisted in production)
        self.entities: Dict[str, Entity] = {}
        self.relationships: Dict[str, Relationship] = {}
        self.documents: Dict[str, IndexedDocument] = {}
        self.entity_index: Dict[EntityType, List[str]] = {t: [] for t in EntityType}
        self.embedding_index: Dict[str, List[float]] = {}

    def _generate_id(self, *args) -> str:
        """Generate unique ID from arguments"""
        content = ":".join(str(a) for a in args)
        return hashlib.md5(content.encode()).hexdigest()[:16]

    async def _get_embedding(self, text: str) -> List[float]:
        """Get embedding from Ollama"""
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.ollama_url}/api/embed",
                    json={"model": self.embedding_model, "input": [text]},
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
                return result.get("embeddings", [[]])[0]
        except Exception:
            # Return zero embedding on error
            return [0.0] * 768

    def _chunk_text(self, text: str) -> List[str]:
        """Split text into overlapping chunks"""
        if len(text) <= self.chunk_size:
            return [text]
        
        chunks = []
        start = 0
        while start < len(text):
            end = start + self.chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - self.chunk_overlap
        
        return chunks

    async def add_entity(self, entity: Entity) -> str:
        """Add an entity to the knowledge graph"""
        if entity.embedding is None:
            entity.embedding = await self._get_embedding(
                f"{entity.type.value}: {entity.name} - {json.dumps(entity.properties)}"
            )
        
        self.entities[entity.id] = entity
        self.entity_index[entity.type].append(entity.id)
        self.embedding_index[entity.id] = entity.embedding
        
        return entity.id

    async def add_relationship(self, relationship: Relationship) -> str:
        """Add a relationship between entities"""
        if relationship.source_id not in self.entities:
            raise ValueError(f"Source entity {relationship.source_id} not found")
        if relationship.target_id not in self.entities:
            raise ValueError(f"Target entity {relationship.target_id} not found")
        
        self.relationships[relationship.id] = relationship
        return relationship.id

    async def index_customer(self, customer_data: Dict[str, Any]) -> str:
        """Index a customer entity"""
        entity = Entity(
            id=self._generate_id("customer", customer_data.get("customer_id")),
            type=EntityType.CUSTOMER,
            name=customer_data.get("name", "Unknown"),
            properties={
                "customer_id": customer_data.get("customer_id"),
                "email": customer_data.get("email"),
                "phone": customer_data.get("phone"),
                "segment": customer_data.get("segment"),
                "risk_score": customer_data.get("risk_score"),
                "lifetime_value": customer_data.get("lifetime_value"),
                "location": customer_data.get("location"),
            }
        )
        return await self.add_entity(entity)

    async def index_policy(self, policy_data: Dict[str, Any]) -> str:
        """Index a policy entity and create relationships"""
        entity = Entity(
            id=self._generate_id("policy", policy_data.get("policy_id")),
            type=EntityType.POLICY,
            name=f"Policy {policy_data.get('policy_id')}",
            properties={
                "policy_id": policy_data.get("policy_id"),
                "policy_type": policy_data.get("policy_type"),
                "status": policy_data.get("status"),
                "premium_amount": policy_data.get("premium_amount"),
                "coverage_amount": policy_data.get("coverage_amount"),
                "start_date": policy_data.get("start_date"),
                "end_date": policy_data.get("end_date"),
                "risk_score": policy_data.get("risk_score"),
            }
        )
        entity_id = await self.add_entity(entity)

        # Create relationship to customer
        customer_id = policy_data.get("customer_id")
        if customer_id:
            customer_entity_id = self._generate_id("customer", customer_id)
            if customer_entity_id in self.entities:
                rel = Relationship(
                    id=self._generate_id("rel", customer_entity_id, entity_id, "has_policy"),
                    source_id=customer_entity_id,
                    target_id=entity_id,
                    type=RelationType.HAS_POLICY,
                    properties={"start_date": policy_data.get("start_date")}
                )
                await self.add_relationship(rel)

        return entity_id

    async def index_claim(self, claim_data: Dict[str, Any]) -> str:
        """Index a claim entity and create relationships"""
        entity = Entity(
            id=self._generate_id("claim", claim_data.get("claim_id")),
            type=EntityType.CLAIM,
            name=f"Claim {claim_data.get('claim_id')}",
            properties={
                "claim_id": claim_data.get("claim_id"),
                "claim_type": claim_data.get("claim_type"),
                "status": claim_data.get("status"),
                "claim_amount": claim_data.get("claim_amount"),
                "approved_amount": claim_data.get("approved_amount"),
                "filed_date": claim_data.get("filed_date"),
                "fraud_score": claim_data.get("fraud_score"),
            }
        )
        entity_id = await self.add_entity(entity)

        # Create relationship to policy
        policy_id = claim_data.get("policy_id")
        if policy_id:
            policy_entity_id = self._generate_id("policy", policy_id)
            if policy_entity_id in self.entities:
                rel = Relationship(
                    id=self._generate_id("rel", policy_entity_id, entity_id, "filed_claim"),
                    source_id=policy_entity_id,
                    target_id=entity_id,
                    type=RelationType.FILED_CLAIM,
                    properties={"filed_date": claim_data.get("filed_date")}
                )
                await self.add_relationship(rel)

        # Create relationship to customer
        customer_id = claim_data.get("customer_id")
        if customer_id:
            customer_entity_id = self._generate_id("customer", customer_id)
            if customer_entity_id in self.entities:
                rel = Relationship(
                    id=self._generate_id("rel", customer_entity_id, entity_id, "filed_claim"),
                    source_id=customer_entity_id,
                    target_id=entity_id,
                    type=RelationType.FILED_CLAIM,
                    properties={"filed_date": claim_data.get("filed_date")}
                )
                await self.add_relationship(rel)

        return entity_id

    async def index_regulation(self, regulation_data: Dict[str, Any]) -> str:
        """Index a regulation entity"""
        entity = Entity(
            id=self._generate_id("regulation", regulation_data.get("regulation_id")),
            type=EntityType.REGULATION,
            name=regulation_data.get("name", "Unknown Regulation"),
            properties={
                "regulation_id": regulation_data.get("regulation_id"),
                "title": regulation_data.get("title"),
                "section": regulation_data.get("section"),
                "content": regulation_data.get("content"),
                "effective_date": regulation_data.get("effective_date"),
                "regulator": regulation_data.get("regulator", "NAICOM"),
                "category": regulation_data.get("category"),
            }
        )
        return await self.add_entity(entity)

    async def index_document(self, doc_id: str, content: str, metadata: Dict[str, Any] = None) -> List[str]:
        """Index a document with chunking and embedding"""
        chunks = self._chunk_text(content)
        doc_ids = []

        for i, chunk in enumerate(chunks):
            embedding = await self._get_embedding(chunk)
            
            # Extract entities from chunk (simplified - would use NER in production)
            entities = self._extract_entities_from_text(chunk)
            
            indexed_doc = IndexedDocument(
                id=f"{doc_id}_chunk_{i}",
                content=chunk,
                entities=entities,
                embedding=embedding,
                metadata=metadata or {},
                chunk_index=i,
                total_chunks=len(chunks)
            )
            
            self.documents[indexed_doc.id] = indexed_doc
            doc_ids.append(indexed_doc.id)

        return doc_ids

    def _extract_entities_from_text(self, text: str) -> List[str]:
        """Extract entity references from text (simplified)"""
        entities = []
        text_lower = text.lower()
        
        # Check for entity type mentions
        for entity_type in EntityType:
            if entity_type.value in text_lower:
                entities.append(entity_type.value)
        
        return entities

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        if not vec1 or not vec2 or len(vec1) != len(vec2):
            return 0.0
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(b * b for b in vec2) ** 0.5
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)

    async def search_entities(
        self,
        query: str,
        entity_types: List[EntityType] = None,
        top_k: int = 10,
    ) -> List[Tuple[Entity, float]]:
        """Search for entities by semantic similarity"""
        query_embedding = await self._get_embedding(query)
        
        results = []
        for entity_id, entity in self.entities.items():
            if entity_types and entity.type not in entity_types:
                continue
            
            if entity.embedding:
                similarity = self._cosine_similarity(query_embedding, entity.embedding)
                results.append((entity, similarity))
        
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    async def search_documents(
        self,
        query: str,
        top_k: int = 10,
    ) -> List[Tuple[IndexedDocument, float]]:
        """Search for documents by semantic similarity"""
        query_embedding = await self._get_embedding(query)
        
        results = []
        for doc_id, doc in self.documents.items():
            similarity = self._cosine_similarity(query_embedding, doc.embedding)
            results.append((doc, similarity))
        
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:top_k]

    def get_entity_neighbors(
        self,
        entity_id: str,
        relationship_types: List[RelationType] = None,
        max_depth: int = 1,
    ) -> Dict[str, Any]:
        """Get neighboring entities through relationships"""
        if entity_id not in self.entities:
            return {"entity": None, "neighbors": []}
        
        entity = self.entities[entity_id]
        neighbors = []
        
        for rel_id, rel in self.relationships.items():
            if relationship_types and rel.type not in relationship_types:
                continue
            
            if rel.source_id == entity_id:
                target = self.entities.get(rel.target_id)
                if target:
                    neighbors.append({
                        "entity": target,
                        "relationship": rel,
                        "direction": "outgoing"
                    })
            elif rel.target_id == entity_id:
                source = self.entities.get(rel.source_id)
                if source:
                    neighbors.append({
                        "entity": source,
                        "relationship": rel,
                        "direction": "incoming"
                    })
        
        return {
            "entity": entity,
            "neighbors": neighbors
        }

    def get_subgraph(
        self,
        entity_ids: List[str],
        include_relationships: bool = True,
    ) -> Dict[str, Any]:
        """Get a subgraph containing specified entities"""
        entities = [self.entities[eid] for eid in entity_ids if eid in self.entities]
        
        relationships = []
        if include_relationships:
            entity_set = set(entity_ids)
            for rel_id, rel in self.relationships.items():
                if rel.source_id in entity_set and rel.target_id in entity_set:
                    relationships.append(rel)
        
        return {
            "entities": entities,
            "relationships": relationships
        }

    async def build_fraud_network(self, customer_ids: List[str]) -> Dict[str, Any]:
        """Build a fraud detection network from customer connections"""
        network = {
            "nodes": [],
            "edges": [],
            "fraud_indicators": []
        }
        
        for customer_id in customer_ids:
            entity_id = self._generate_id("customer", customer_id)
            if entity_id in self.entities:
                entity = self.entities[entity_id]
                network["nodes"].append({
                    "id": entity_id,
                    "type": "customer",
                    "properties": entity.properties
                })
                
                # Get all relationships
                neighbors = self.get_entity_neighbors(entity_id)
                for neighbor in neighbors["neighbors"]:
                    network["edges"].append({
                        "source": entity_id,
                        "target": neighbor["entity"].id,
                        "type": neighbor["relationship"].type.value,
                        "weight": neighbor["relationship"].weight
                    })
                    
                    # Check for fraud indicators
                    if neighbor["entity"].type == EntityType.CLAIM:
                        fraud_score = neighbor["entity"].properties.get("fraud_score", 0)
                        if fraud_score > 0.7:
                            network["fraud_indicators"].append({
                                "entity_id": neighbor["entity"].id,
                                "fraud_score": fraud_score,
                                "connected_customer": customer_id
                            })
        
        return network

    def export_to_cypher(self) -> str:
        """Export knowledge graph to Cypher statements for Neo4j/FalkorDB"""
        statements = []
        
        # Create entities
        for entity_id, entity in self.entities.items():
            props = json.dumps(entity.properties).replace('"', '\\"')
            statements.append(
                f"CREATE (n:{entity.type.value} {{id: '{entity_id}', name: '{entity.name}', properties: \"{props}\"}})"
            )
        
        # Create relationships
        for rel_id, rel in self.relationships.items():
            props = json.dumps(rel.properties).replace('"', '\\"')
            statements.append(
                f"MATCH (a {{id: '{rel.source_id}'}}), (b {{id: '{rel.target_id}'}}) "
                f"CREATE (a)-[r:{rel.type.value} {{id: '{rel_id}', weight: {rel.weight}, properties: \"{props}\"}}]->(b)"
            )
        
        return ";\n".join(statements)

    def get_statistics(self) -> Dict[str, Any]:
        """Get knowledge graph statistics"""
        entity_counts = {t.value: len(ids) for t, ids in self.entity_index.items()}
        relationship_counts = {}
        for rel in self.relationships.values():
            rel_type = rel.type.value
            relationship_counts[rel_type] = relationship_counts.get(rel_type, 0) + 1
        
        return {
            "total_entities": len(self.entities),
            "total_relationships": len(self.relationships),
            "total_documents": len(self.documents),
            "entity_counts": entity_counts,
            "relationship_counts": relationship_counts,
        }


# Factory function for creating CocoIndex instance
def create_cocoindex_kg(
    index_path: str = "/data/cocoindex",
    embedding_model: str = "qwen2.5:latest",
) -> CocoIndexKnowledgeGraph:
    """Create a CocoIndex knowledge graph instance"""
    return CocoIndexKnowledgeGraph(
        index_path=index_path,
        embedding_model=embedding_model,
    )

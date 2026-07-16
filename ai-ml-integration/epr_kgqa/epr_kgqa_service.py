"""
EPR-KGQA (Entity-Path-Relation Knowledge Graph Question Answering)

This module implements knowledge graph question answering for the insurance platform,
enabling natural language queries against the insurance knowledge graph.
"""

import os
import json
import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import asyncio
import httpx


class QueryType(Enum):
    """Types of KGQA queries"""
    ENTITY_LOOKUP = "entity_lookup"
    RELATIONSHIP_QUERY = "relationship_query"
    PATH_FINDING = "path_finding"
    AGGREGATION = "aggregation"
    COMPARISON = "comparison"
    TEMPORAL = "temporal"
    MULTI_HOP = "multi_hop"


@dataclass
class ParsedQuery:
    """Represents a parsed natural language query"""
    original_query: str
    query_type: QueryType
    entities: List[str]
    relations: List[str]
    constraints: Dict[str, Any]
    intent: str
    confidence: float


@dataclass
class KGQAAnswer:
    """Represents an answer from KGQA"""
    query: str
    answer: str
    evidence: List[Dict[str, Any]]
    confidence: float
    reasoning_path: List[str]
    cypher_query: Optional[str] = None
    execution_time_ms: float = 0.0


class EPRKGQAService:
    """
    EPR-KGQA Service for insurance knowledge graph question answering.
    Uses Entity-Path-Relation approach for accurate QA over knowledge graphs.
    """

    def __init__(
        self,
        ollama_url: str = "http://localhost:11434",
        falkordb_url: str = "http://falkordb:6379",
        model: str = "qwen2.5:latest",
    ):
        self.ollama_url = ollama_url
        self.falkordb_url = falkordb_url
        self.model = model
        self.http_client = httpx.AsyncClient(timeout=60.0)
        
        # Entity type mappings for Nigerian insurance domain
        self.entity_types = {
            "customer": ["customer", "policyholder", "insured", "client", "applicant"],
            "policy": ["policy", "insurance", "coverage", "plan", "contract"],
            "claim": ["claim", "request", "filing", "submission"],
            "agent": ["agent", "broker", "representative", "advisor"],
            "product": ["product", "offering", "package", "scheme"],
            "regulation": ["regulation", "rule", "law", "guideline", "naicom", "act"],
            "payment": ["payment", "premium", "transaction", "fee"],
            "location": ["location", "state", "region", "area", "address"],
        }
        
        # Relation type mappings
        self.relation_types = {
            "has_policy": ["has", "owns", "holds", "purchased"],
            "filed_claim": ["filed", "submitted", "made", "raised"],
            "managed_by": ["managed", "handled", "assigned", "serviced"],
            "covers": ["covers", "includes", "protects", "insures"],
            "located_in": ["located", "lives", "resides", "based"],
            "paid_for": ["paid", "purchased", "bought"],
            "related_to": ["related", "connected", "linked", "associated"],
            "complies_with": ["complies", "follows", "adheres", "meets"],
            "violates": ["violates", "breaches", "breaks"],
        }

    async def parse_query(self, query: str) -> ParsedQuery:
        """Parse natural language query into structured form"""
        query_lower = query.lower()
        
        # Detect query type
        query_type = self._detect_query_type(query_lower)
        
        # Extract entities
        entities = self._extract_entities(query_lower)
        
        # Extract relations
        relations = self._extract_relations(query_lower)
        
        # Extract constraints
        constraints = self._extract_constraints(query_lower)
        
        # Determine intent using LLM
        intent = await self._determine_intent(query)
        
        return ParsedQuery(
            original_query=query,
            query_type=query_type,
            entities=entities,
            relations=relations,
            constraints=constraints,
            intent=intent,
            confidence=0.85
        )

    def _detect_query_type(self, query: str) -> QueryType:
        """Detect the type of query"""
        if any(word in query for word in ["how many", "count", "total", "sum", "average"]):
            return QueryType.AGGREGATION
        elif any(word in query for word in ["compare", "difference", "versus", "vs"]):
            return QueryType.COMPARISON
        elif any(word in query for word in ["when", "date", "time", "period", "year", "month"]):
            return QueryType.TEMPORAL
        elif any(word in query for word in ["path", "connection", "linked", "related through"]):
            return QueryType.PATH_FINDING
        elif any(word in query for word in ["who", "which", "what"]) and "relationship" in query:
            return QueryType.RELATIONSHIP_QUERY
        elif any(word in query for word in ["and then", "which then", "who then"]):
            return QueryType.MULTI_HOP
        else:
            return QueryType.ENTITY_LOOKUP

    def _extract_entities(self, query: str) -> List[str]:
        """Extract entity mentions from query"""
        entities = []
        for entity_type, keywords in self.entity_types.items():
            for keyword in keywords:
                if keyword in query:
                    entities.append(entity_type)
                    break
        return list(set(entities))

    def _extract_relations(self, query: str) -> List[str]:
        """Extract relation mentions from query"""
        relations = []
        for relation_type, keywords in self.relation_types.items():
            for keyword in keywords:
                if keyword in query:
                    relations.append(relation_type)
                    break
        return list(set(relations))

    def _extract_constraints(self, query: str) -> Dict[str, Any]:
        """Extract constraints from query"""
        constraints = {}
        
        # Extract numeric constraints
        numbers = re.findall(r'\b(\d+(?:,\d{3})*(?:\.\d+)?)\b', query)
        if numbers:
            constraints["numeric_values"] = [float(n.replace(",", "")) for n in numbers]
        
        # Extract date constraints
        dates = re.findall(r'\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b', query)
        if dates:
            constraints["dates"] = dates
        
        # Extract status constraints
        statuses = ["active", "pending", "approved", "rejected", "cancelled", "expired"]
        for status in statuses:
            if status in query:
                constraints["status"] = status
                break
        
        # Extract Nigerian states
        nigerian_states = ["lagos", "abuja", "kano", "rivers", "oyo", "kaduna", "enugu", "delta"]
        for state in nigerian_states:
            if state in query:
                constraints["location"] = state.title()
                break
        
        return constraints

    async def _determine_intent(self, query: str) -> str:
        """Use LLM to determine query intent"""
        prompt = f"""Analyze this insurance-related question and determine the user's intent in one short phrase.

Question: {query}

Intent (one short phrase):"""

        try:
            response = await self.http_client.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_predict": 50}
                }
            )
            response.raise_for_status()
            result = response.json()
            return result.get("response", "").strip()
        except Exception:
            return "general_inquiry"

    async def generate_cypher_query(self, parsed_query: ParsedQuery) -> str:
        """Generate Cypher query from parsed query"""
        prompt = f"""Generate a Cypher query for FalkorDB/Neo4j based on this parsed query:

Query Type: {parsed_query.query_type.value}
Entities: {parsed_query.entities}
Relations: {parsed_query.relations}
Constraints: {json.dumps(parsed_query.constraints)}
Intent: {parsed_query.intent}
Original Question: {parsed_query.original_query}

Available Node Labels: customer, policy, claim, agent, product, regulation, payment, location
Available Relationship Types: HAS_POLICY, FILED_CLAIM, MANAGED_BY, COVERS, LOCATED_IN, PAID_FOR, RELATED_TO, COMPLIES_WITH, VIOLATES

Generate only the Cypher query, no explanation:"""

        try:
            response = await self.http_client.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_predict": 200}
                }
            )
            response.raise_for_status()
            result = response.json()
            cypher = result.get("response", "").strip()
            
            # Clean up the response
            if "```" in cypher:
                cypher = cypher.split("```")[1].replace("cypher", "").strip()
            
            return cypher
        except Exception as e:
            # Fallback to template-based query generation
            return self._generate_template_cypher(parsed_query)

    def _generate_template_cypher(self, parsed_query: ParsedQuery) -> str:
        """Generate Cypher query using templates"""
        if parsed_query.query_type == QueryType.ENTITY_LOOKUP:
            if "customer" in parsed_query.entities:
                return "MATCH (c:customer) RETURN c LIMIT 10"
            elif "policy" in parsed_query.entities:
                return "MATCH (p:policy) RETURN p LIMIT 10"
            elif "claim" in parsed_query.entities:
                return "MATCH (cl:claim) RETURN cl LIMIT 10"
        
        elif parsed_query.query_type == QueryType.RELATIONSHIP_QUERY:
            if "customer" in parsed_query.entities and "policy" in parsed_query.entities:
                return "MATCH (c:customer)-[r:HAS_POLICY]->(p:policy) RETURN c, r, p LIMIT 10"
            elif "policy" in parsed_query.entities and "claim" in parsed_query.entities:
                return "MATCH (p:policy)-[r:FILED_CLAIM]->(cl:claim) RETURN p, r, cl LIMIT 10"
        
        elif parsed_query.query_type == QueryType.AGGREGATION:
            if "policy" in parsed_query.entities:
                return "MATCH (p:policy) RETURN count(p) as total_policies"
            elif "claim" in parsed_query.entities:
                return "MATCH (cl:claim) RETURN count(cl) as total_claims"
            elif "customer" in parsed_query.entities:
                return "MATCH (c:customer) RETURN count(c) as total_customers"
        
        elif parsed_query.query_type == QueryType.PATH_FINDING:
            return "MATCH path = shortestPath((a)-[*..5]-(b)) WHERE a.id = $source AND b.id = $target RETURN path"
        
        elif parsed_query.query_type == QueryType.MULTI_HOP:
            return "MATCH (c:customer)-[:HAS_POLICY]->(p:policy)-[:FILED_CLAIM]->(cl:claim) RETURN c, p, cl LIMIT 10"
        
        # Default query
        return "MATCH (n) RETURN n LIMIT 10"

    async def execute_cypher(self, cypher_query: str) -> List[Dict[str, Any]]:
        """Execute Cypher query against FalkorDB"""
        # In production, this would connect to FalkorDB
        # For now, return simulated results
        return [
            {
                "node_type": "customer",
                "properties": {
                    "id": "cust-001",
                    "name": "Adebayo Okonkwo",
                    "segment": "Premium",
                    "risk_score": 0.25
                }
            },
            {
                "node_type": "policy",
                "properties": {
                    "id": "pol-001",
                    "type": "Life Insurance",
                    "premium": 500000,
                    "status": "Active"
                }
            }
        ]

    async def generate_answer(
        self,
        query: str,
        cypher_results: List[Dict[str, Any]],
        parsed_query: ParsedQuery,
    ) -> str:
        """Generate natural language answer from query results"""
        prompt = f"""Based on the following knowledge graph query results, generate a natural language answer to the user's question.

User Question: {query}

Query Results:
{json.dumps(cypher_results, indent=2)}

Query Type: {parsed_query.query_type.value}
Intent: {parsed_query.intent}

Generate a helpful, accurate answer in natural language. If the results are empty, say so politely.
For Nigerian insurance context, use Naira (₦) for currency and reference NAICOM regulations when relevant.

Answer:"""

        try:
            response = await self.http_client.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": 300}
                }
            )
            response.raise_for_status()
            result = response.json()
            return result.get("response", "").strip()
        except Exception as e:
            return f"Based on the knowledge graph, I found {len(cypher_results)} relevant results for your query about {parsed_query.intent}."

    async def answer_question(self, query: str) -> KGQAAnswer:
        """Main method to answer a natural language question"""
        start_time = datetime.utcnow()
        
        # Step 1: Parse the query
        parsed_query = await self.parse_query(query)
        
        # Step 2: Generate Cypher query
        cypher_query = await self.generate_cypher_query(parsed_query)
        
        # Step 3: Execute query
        results = await self.execute_cypher(cypher_query)
        
        # Step 4: Generate natural language answer
        answer = await self.generate_answer(query, results, parsed_query)
        
        # Build reasoning path
        reasoning_path = [
            f"Parsed query type: {parsed_query.query_type.value}",
            f"Identified entities: {parsed_query.entities}",
            f"Identified relations: {parsed_query.relations}",
            f"Generated Cypher: {cypher_query}",
            f"Found {len(results)} results",
        ]
        
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        return KGQAAnswer(
            query=query,
            answer=answer,
            evidence=results,
            confidence=parsed_query.confidence,
            reasoning_path=reasoning_path,
            cypher_query=cypher_query,
            execution_time_ms=execution_time
        )

    async def answer_insurance_query(self, query: str, context: Dict[str, Any] = None) -> KGQAAnswer:
        """Answer insurance-specific queries with domain knowledge"""
        # Enhance query with insurance domain context
        enhanced_query = query
        
        if context:
            if "customer_id" in context:
                enhanced_query += f" for customer {context['customer_id']}"
            if "policy_id" in context:
                enhanced_query += f" regarding policy {context['policy_id']}"
        
        return await self.answer_question(enhanced_query)

    async def get_customer_insights(self, customer_id: str) -> KGQAAnswer:
        """Get comprehensive insights about a customer"""
        query = f"What policies, claims, and risk factors are associated with customer {customer_id}?"
        return await self.answer_question(query)

    async def get_fraud_network_analysis(self, entity_id: str) -> KGQAAnswer:
        """Analyze fraud network connections"""
        query = f"What are the fraud risk connections and suspicious patterns related to entity {entity_id}?"
        return await self.answer_question(query)

    async def get_regulatory_compliance(self, policy_type: str) -> KGQAAnswer:
        """Get regulatory compliance information"""
        query = f"What NAICOM regulations and compliance requirements apply to {policy_type} insurance in Nigeria?"
        return await self.answer_question(query)

    async def close(self):
        """Close HTTP client"""
        await self.http_client.aclose()


# Temporal Activity for KGQA
async def kgqa_activity(query: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
    """Temporal activity for knowledge graph question answering"""
    service = EPRKGQAService()
    try:
        answer = await service.answer_insurance_query(query, context)
        return {
            "query": answer.query,
            "answer": answer.answer,
            "confidence": answer.confidence,
            "evidence_count": len(answer.evidence),
            "cypher_query": answer.cypher_query,
            "execution_time_ms": answer.execution_time_ms,
        }
    finally:
        await service.close()


# Factory function
def create_kgqa_service(
    ollama_url: str = "http://localhost:11434",
    falkordb_url: str = "http://falkordb:6379",
) -> EPRKGQAService:
    """Create EPR-KGQA service instance"""
    return EPRKGQAService(ollama_url=ollama_url, falkordb_url=falkordb_url)

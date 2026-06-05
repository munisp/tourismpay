# AI/ML/DL Integration for Nigerian Insurance Platform

This directory contains comprehensive AI/ML/DL integrations for the unified Nigerian insurance platform.

## Components

### 1. Ollama Integration (`ollama/`)

**ollama_client.go** - Production-ready Ollama API client with:
- Connection pooling and retry logic (3 retries with exponential backoff)
- Health checks with automatic fallback
- Metrics tracking (requests, latency, tokens)
- Support for generate, chat, and embedding endpoints

**rag_lakehouse_integration.py** - RAG (Retrieval Augmented Generation) with:
- Context retrieval from lakehouse Delta Lake tables
- Policy, claims, customer, and fraud context
- Nigerian regulatory context (NAICOM)
- Multi-lingual support (English, Yoruba, Hausa, Igbo, Pidgin)
- Caching with configurable TTL

### 2. CocoIndex Knowledge Graph (`cocoindex/`)

**cocoindex_knowledge_graph.py** - Knowledge graph indexing:
- Entity types: Customer, Policy, Claim, Agent, Product, Regulation, Location, Payment
- Relationship types: HAS_POLICY, FILED_CLAIM, MANAGED_BY, COVERS, etc.
- Semantic search with embeddings
- Document chunking and indexing
- Fraud network building
- Export to Cypher for Neo4j/FalkorDB

### 3. EPR-KGQA (`epr_kgqa/`)

**epr_kgqa_service.py** - Knowledge Graph Question Answering:
- Natural language query parsing
- Query type detection (entity lookup, relationship, aggregation, path finding)
- Cypher query generation
- Nigerian insurance domain knowledge
- Multi-hop reasoning support

### 4. FalkorDB Integration (`falkordb/`)

**falkordb_graph_service.go** - Graph database operations:
- Node and edge creation for insurance entities
- Fraud network detection with pattern matching
- Customer relationship mapping
- Shortest path finding
- Graph statistics and metrics

### 5. ART - Adversarial Robustness (`art/`)

**adversarial_robustness.py** - ML model security:
- FGSM (Fast Gradient Sign Method) attack evaluation
- PGD (Projected Gradient Descent) attack evaluation
- Feature squeezing defense
- Input validation defense
- Comprehensive robustness reports
- Insurance-specific attack configurations

### 6. MCMC - Bayesian Risk Modeling (`mcmc/`)

**bayesian_risk_modeling.py** - Uncertainty quantification:
- Claim frequency model (Poisson regression)
- Claim severity model (Log-Normal)
- Loss ratio model (Beta distribution)
- Premium pricing model
- Reserve estimation (chain-ladder)
- Fraud probability model (logistic regression)
- HDI (Highest Density Interval) computation
- Convergence diagnostics (R-hat, ESS)

### 7. GNN - Graph Neural Networks (`gnn/`)

**graph_neural_network_fraud.py** - Deep learning on graphs:
- GCN (Graph Convolutional Network)
- GAT (Graph Attention Network)
- GraphSAGE
- Fraud ring detection
- Link prediction
- Explainable predictions

## Integration with Platform

All components integrate with:
- **Temporal Workflows**: Activities for async processing
- **Kafka**: Event streaming for real-time updates
- **Lakehouse**: Delta Lake for data storage
- **Prometheus**: Metrics export
- **Keycloak**: RBAC integration

## Usage

### Ollama RAG Query
```python
from ai_ml_integration.ollama.rag_lakehouse_integration import LakehouseRAGIntegration

rag = LakehouseRAGIntegration()
response = await rag.generate_with_context(
    query="What is the claim status for customer CUST-001?",
    context_types=["claims", "customer"],
    customer_id="CUST-001"
)
```

### GNN Fraud Detection
```python
from ai_ml_integration.gnn.graph_neural_network_fraud import GNNFraudDetectionService

service = GNNFraudDetectionService()
graph_data = service.prepare_graph_data(nodes, edges, labels)
result = service.train_model(GNNModelType.GAT, graph_data)
predictions = service.predict_fraud(GNNModelType.GAT, graph_data)
```

### Bayesian Risk Modeling
```python
from ai_ml_integration.mcmc.bayesian_risk_modeling import BayesianRiskModeling

service = BayesianRiskModeling()
result = service.build_claim_frequency_model(exposure, claims)
print(f"Expected claim rate: {result.predictions['expected_claim_rate']}")
print(f"95% HDI: {result.uncertainty_intervals['claim_rate']}")
```

## Nigerian Insurance Context

All models are configured for the Nigerian insurance market:
- NAICOM regulatory compliance
- Nigerian currency (Naira) support
- Local language support (Yoruba, Hausa, Igbo, Pidgin)
- Nigerian states and regions
- Local insurance products (Motor, Life, Health, Agricultural)

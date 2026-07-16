# Telco Data Integration Service

Alternative credit scoring system using Nigerian telco data (MTN, Airtel, Glo, 9mobile).

## Features

- **Telco Data Integration**: Fetch customer data from Nigerian telco providers
- **Alternative Credit Scoring**: Calculate FICO-like credit scores (300-850) from telco data
- **Risk Assessment**: Comprehensive risk analysis with factors and recommendations
- **Loan Recommendations**: Calculate max loan amount, interest rate, and approval probability
- **Bulk Processing**: Process multiple customers in a single request

## API Endpoints

### Telco Data
- `POST /api/v1/telco/fetch` - Fetch telco data from provider
- `GET /api/v1/telco/customer/{customer_id}` - Get customer telco data
- `GET /api/v1/telco/phone/{phone_number}` - Get telco data by phone

### Credit Score
- `POST /api/v1/credit-score/calculate` - Calculate credit score
- `GET /api/v1/credit-score/customer/{customer_id}` - Get customer credit score
- `GET /api/v1/credit-score/customer/{customer_id}/breakdown` - Get detailed breakdown
- `POST /api/v1/credit-score/bulk` - Bulk credit score calculation

## Credit Score Components

1. **Payment History (35%)**: Late payments, failed payments, consistency
2. **Account Age (15%)**: How long customer has been with provider
3. **Spending Consistency (30%)**: Monthly airtime/data spend patterns
4. **Usage Pattern (10%)**: Data vs airtime ratio, transaction frequency
5. **Account Health (10%)**: Account status, failed payments

## Score Categories

- **EXCELLENT** (750-850): Low risk, high approval probability
- **GOOD** (700-749): Low-medium risk, good approval probability
- **FAIR** (650-699): Medium risk, moderate approval probability
- **POOR** (600-649): Medium-high risk, low approval probability
- **VERY_POOR** (300-599): High risk, very low approval probability

## Usage Example

```python
import httpx

# Fetch telco data
response = httpx.post("http://localhost:8010/api/v1/telco/fetch", json={
    "customer_id": "cust_123",
    "phone_number": "08012345678",
    "consent": True
})

# Calculate credit score
response = httpx.post("http://localhost:8010/api/v1/credit-score/calculate", json={
    "customer_id": "cust_123",
    "phone_number": "08012345678",
    "fetch_fresh_data": False
})

credit_score = response.json()
print(f"Credit Score: {credit_score['credit_score']} ({credit_score['score_category']})")
print(f"Max Loan: ₦{credit_score['max_loan_amount']:,.2f}")
print(f"Interest Rate: {credit_score['recommended_interest_rate']}%")
print(f"Approval Probability: {credit_score['approval_probability']*100:.1f}%")
```

## Running the Service

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
python -m app.main

# Or with Docker
docker build -t telco-data-integration-service .
docker run -p 8010:8010 telco-data-integration-service
```

## Integration with Insurance Platform

This service integrates with the agentic-underwriting service for alternative credit scoring of unbanked customers.

```python
# In agentic-underwriting service
import httpx

async def get_customer_credit_score(customer_id: str, phone_number: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://telco-data-integration-service:8010/api/v1/credit-score/calculate",
            json={
                "customer_id": customer_id,
                "phone_number": phone_number,
                "fetch_fresh_data": True
            }
        )
        return response.json()
```

## Production Deployment

1. Configure real telco API credentials in environment variables
2. Use PostgreSQL instead of SQLite
3. Enable authentication and authorization
4. Set up monitoring and alerting
5. Configure rate limiting for telco API calls
6. Implement caching for frequently accessed scores

## Business Requirement

**BR-INT-002: Telco Data Integration**
- Airtime purchase history for credit scoring
- Underwrite unbanked customers
- Alternative credit assessment

# Africa GDS SDK — Python

Python SDK for the Africa-first Global Distribution System by TourismPay.

## Installation

```bash
pip install africa-gds-sdk
```

## Quick Start

```python
from gds_client import GDSClient

with GDSClient(
    base_url="https://sandbox.gds.tourismpay.com",
    api_key="gds_sandbox_xxx"
) as gds:
    # Search properties
    results = gds.search(
        destination="Masai Mara",
        check_in="2025-08-01",
        check_out="2025-08-05"
    )

    # Create a reservation
    booking = gds.create_reservation(
        property_id="prop_sandbox_001",
        room_type_code="DLX",
        check_in="2025-08-01",
        check_out="2025-08-05",
        guests=[{"first_name": "John", "last_name": "Doe"}]
    )

    # Check commission
    commission = gds.get_commission()
```

## Authentication

All requests require an API key passed via the `X-GDS-API-Key` header.
Get your sandbox key at the [Developer Portal](https://gds.tourismpay.com/developer).

## Token Metering

Each API call consumes tokens from your plan quota:
- Search: 1 token
- Book: 5 tokens
- Analytics: 3 tokens
- Settlement: 10 tokens

Check `X-GDS-Tokens-Remaining` response header for your balance.

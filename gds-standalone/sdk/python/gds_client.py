"""
Africa GDS — Python SDK Client

Usage:
    from gds_client import GDSClient

    client = GDSClient(
        base_url="https://gds.yourdomain.com",
        api_key="gds_sandbox_abc123",
        tenant_id="your-tenant"
    )

    # Search properties
    results = client.search(destination="Masai Mara", check_in="2025-06-01", check_out="2025-06-05")

    # Book a property
    booking = client.create_reservation(
        property_id="prop_abc",
        room_type_code="DLX",
        check_in="2025-06-01",
        check_out="2025-06-05",
        guests=2,
        guest_name="Jane Doe",
        guest_email="jane@example.com"
    )
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional
from urllib.parse import urlencode, urljoin

try:
    import httpx
    _CLIENT_CLASS = httpx.Client
except ImportError:
    import urllib.request
    import urllib.error
    import json as _json
    _CLIENT_CLASS = None  # type: ignore


class GDSError(Exception):
    """Raised when the GDS API returns an error."""

    def __init__(self, status_code: int, message: str, details: Optional[dict] = None):
        self.status_code = status_code
        self.message = message
        self.details = details or {}
        super().__init__(f"GDS API Error {status_code}: {message}")


class PropertyType(str, Enum):
    HOTEL = "hotel"
    LODGE = "lodge"
    SAFARI_CAMP = "safari_camp"
    RESORT = "resort"
    BOUTIQUE = "boutique"
    GUESTHOUSE = "guesthouse"
    VILLA = "villa"
    APARTMENT = "apartment"
    ACTIVITY = "activity"


class AgentTier(str, Enum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"
    PLATINUM = "platinum"


class PayoutMethod(str, Enum):
    BANK_TRANSFER = "bank_transfer"
    MOBILE_MONEY = "mobile_money"
    MOJALOOP_INSTANT = "mojaloop_instant"


@dataclass
class GDSClientConfig:
    base_url: str
    api_key: Optional[str] = None
    bearer_token: Optional[str] = None
    tenant_id: Optional[str] = None
    timeout: float = 30.0
    sandbox: bool = False
    max_retries: int = 3


class GDSClient:
    """Typed Python client for the Africa-first GDS API."""

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        bearer_token: Optional[str] = None,
        tenant_id: Optional[str] = None,
        timeout: float = 30.0,
        sandbox: bool = False,
        max_retries: int = 3,
    ):
        self.config = GDSClientConfig(
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            bearer_token=bearer_token,
            tenant_id=tenant_id,
            timeout=timeout,
            sandbox=sandbox,
            max_retries=max_retries,
        )
        self._usage: dict[str, int] = {}

        if _CLIENT_CLASS:
            self._http = httpx.Client(timeout=timeout)
        else:
            self._http = None

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.config.api_key:
            headers["X-GDS-API-Key"] = self.config.api_key
        if self.config.bearer_token:
            headers["Authorization"] = f"Bearer {self.config.bearer_token}"
        if self.config.tenant_id:
            headers["X-GDS-Tenant-ID"] = self.config.tenant_id
        if self.config.sandbox:
            headers["X-GDS-Sandbox"] = "true"
        return headers

    def _request(self, method: str, path: str, params: Optional[dict] = None, body: Optional[dict] = None) -> Any:
        import json

        url = f"{self.config.base_url}{path}"
        if params:
            filtered = {k: v for k, v in params.items() if v is not None}
            if filtered:
                url += "?" + urlencode(filtered)

        headers = self._headers()
        endpoint = path.split("?")[0]
        self._usage[endpoint] = self._usage.get(endpoint, 0) + 1

        for attempt in range(self.config.max_retries):
            try:
                if self._http:
                    resp = self._http.request(method, url, headers=headers, json=body)
                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "5"))
                        time.sleep(retry_after)
                        continue
                    if resp.status_code >= 400:
                        try:
                            err_body = resp.json()
                        except Exception:
                            err_body = {}
                        raise GDSError(resp.status_code, err_body.get("error", resp.text), err_body)
                    return resp.json() if resp.text else {}
                else:
                    data = json.dumps(body).encode() if body else None
                    req = urllib.request.Request(url, data=data, headers=headers, method=method)
                    try:
                        with urllib.request.urlopen(req, timeout=self.config.timeout) as resp:
                            return _json.loads(resp.read().decode())
                    except urllib.error.HTTPError as e:
                        if e.code == 429:
                            time.sleep(5)
                            continue
                        err_body = {}
                        try:
                            err_body = _json.loads(e.read().decode())
                        except Exception:
                            pass
                        raise GDSError(e.code, err_body.get("error", str(e)), err_body)
            except GDSError:
                raise
            except Exception as e:
                if attempt == self.config.max_retries - 1:
                    raise GDSError(0, f"Connection failed: {e}")
                time.sleep(2 ** attempt)

        raise GDSError(0, "Max retries exceeded")

    # ─── Health ────────────────────────────────────────────────────────

    def health(self) -> dict:
        """Check API health status."""
        return self._request("GET", "/health")

    # ─── Search ────────────────────────────────────────────────────────

    def search(
        self,
        destination: Optional[str] = None,
        country: Optional[str] = None,
        check_in: Optional[str] = None,
        check_out: Optional[str] = None,
        guests: Optional[int] = None,
        property_type: Optional[PropertyType] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        """Full-text property search."""
        return self._request("GET", "/api/v1/gds/search", params={
            "destination": destination, "country": country, "checkIn": check_in,
            "checkOut": check_out, "guests": guests, "type": property_type,
            "minPrice": min_price, "maxPrice": max_price, "page": page, "limit": limit,
        })

    def suggest(self, query: str, limit: int = 10) -> dict:
        """Autocomplete destination suggestions."""
        return self._request("GET", "/api/v1/gds/search/suggest", params={"q": query, "limit": limit})

    def trending(self) -> dict:
        """Get trending destinations."""
        return self._request("GET", "/api/v1/gds/search/trending")

    def recommendations(self, limit: int = 10) -> dict:
        """Get personalized recommendations."""
        return self._request("GET", "/api/v1/gds/search/recommendations", params={"limit": limit})

    # ─── Properties ────────────────────────────────────────────────────

    def list_properties(
        self,
        country: Optional[str] = None,
        property_type: Optional[PropertyType] = None,
        star_rating: Optional[int] = None,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        """List properties with filters."""
        return self._request("GET", "/api/v1/gds/properties", params={
            "country": country, "type": property_type, "starRating": star_rating,
            "page": page, "limit": limit,
        })

    def get_property(self, property_id: str) -> dict:
        """Get a single property by ID."""
        return self._request("GET", f"/api/v1/gds/properties/{property_id}")

    def register_property(self, property_data: dict) -> dict:
        """Register a new property in the GDS network."""
        return self._request("POST", "/api/v1/gds/properties", body=property_data)

    def update_property(self, property_id: str, updates: dict) -> dict:
        """Update property details."""
        return self._request("PUT", f"/api/v1/gds/properties/{property_id}", body=updates)

    # ─── Availability ──────────────────────────────────────────────────

    def check_availability(
        self,
        property_id: str,
        room_type: str,
        check_in: str,
        check_out: str,
        rooms: int = 1,
    ) -> dict:
        """Check room availability for dates."""
        return self._request("GET", "/api/v1/gds/availability/check", params={
            "propertyId": property_id, "roomType": room_type,
            "checkIn": check_in, "checkOut": check_out, "rooms": rooms,
        })

    def bulk_check_availability(self, properties: list[dict]) -> dict:
        """Bulk availability check (up to 50 properties)."""
        return self._request("POST", "/api/v1/gds/availability/bulk-check", body={"properties": properties})

    def update_availability(self, property_id: str, room_type: str, date: str, total_rooms: int) -> dict:
        """Update availability for a specific date."""
        return self._request("PUT", "/api/v1/gds/availability", body={
            "propertyId": property_id, "roomType": room_type, "date": date, "totalRooms": total_rooms,
        })

    # ─── Reservations ──────────────────────────────────────────────────

    def create_reservation(
        self,
        property_id: str,
        room_type_code: str,
        check_in: str,
        check_out: str,
        guests: int,
        guest_name: str,
        guest_email: str,
        guest_country: str = "US",
        special_requests: Optional[str] = None,
    ) -> dict:
        """Create a new reservation."""
        return self._request("POST", "/api/v1/gds/reservations", body={
            "propertyId": property_id, "roomTypeCode": room_type_code,
            "checkIn": check_in, "checkOut": check_out, "guests": guests,
            "guestName": guest_name, "guestEmail": guest_email,
            "guestCountry": guest_country, "specialRequests": special_requests,
        })

    def get_reservation(self, reservation_id: str) -> dict:
        """Get reservation details."""
        return self._request("GET", f"/api/v1/gds/reservations/{reservation_id}")

    def list_reservations(self, status: Optional[str] = None, page: int = 1) -> dict:
        """List agent's reservations."""
        return self._request("GET", "/api/v1/gds/reservations", params={"status": status, "page": page})

    def modify_reservation(self, reservation_id: str, changes: dict) -> dict:
        """Modify an existing reservation."""
        return self._request("PATCH", f"/api/v1/gds/reservations/{reservation_id}", body=changes)

    def cancel_reservation(self, reservation_id: str, reason: str) -> dict:
        """Cancel a reservation."""
        return self._request("POST", f"/api/v1/gds/reservations/{reservation_id}/cancel", body={"reason": reason})

    # ─── Rates ─────────────────────────────────────────────────────────

    def get_rates(self, property_id: str, date_from: Optional[str] = None, date_to: Optional[str] = None) -> dict:
        """Get rate plans for a property."""
        return self._request("GET", "/api/v1/gds/rates", params={
            "propertyId": property_id, "dateFrom": date_from, "dateTo": date_to,
        })

    def get_dynamic_price(self, property_id: str, room_type: str, check_in: str, check_out: str) -> dict:
        """Get ML-adjusted dynamic price."""
        return self._request("GET", "/api/v1/gds/rates/dynamic", params={
            "propertyId": property_id, "roomType": room_type, "checkIn": check_in, "checkOut": check_out,
        })

    # ─── Agents ────────────────────────────────────────────────────────

    def register_agent(self, agency_name: str, agent_name: str, email: str, country: str) -> dict:
        """Register as a GDS travel agent. Returns API key."""
        return self._request("POST", "/api/v1/gds/agents/register", body={
            "agencyName": agency_name, "agentName": agent_name, "email": email, "country": country,
        })

    def get_profile(self) -> dict:
        """Get current agent profile."""
        return self._request("GET", "/api/v1/gds/agents/me")

    def get_commission(self) -> dict:
        """Get commission summary with tier info."""
        return self._request("GET", "/api/v1/gds/agents/commission")

    def get_commission_history(self, page: int = 1) -> dict:
        """Get commission payment history."""
        return self._request("GET", "/api/v1/gds/agents/commission/history", params={"page": page})

    def request_payout(self, amount: float, currency: str, method: PayoutMethod) -> dict:
        """Request commission payout."""
        return self._request("POST", "/api/v1/gds/agents/payout", body={
            "amount": amount, "currency": currency, "method": method.value,
        })

    # ─── Settlement ────────────────────────────────────────────────────

    def list_batches(self, status: Optional[str] = None, page: int = 1) -> dict:
        """List settlement batches."""
        return self._request("GET", "/api/v1/gds/settlement/batches", params={"status": status, "page": page})

    def get_settlement_summary(self) -> dict:
        """Get settlement summary."""
        return self._request("GET", "/api/v1/gds/settlement/summary")

    # ─── Distribution ──────────────────────────────────────────────────

    def register_webhook(self, url: str, events: list[str]) -> dict:
        """Register a webhook for GDS events."""
        return self._request("POST", "/api/v1/gds/distribution/webhooks", body={"url": url, "events": events})

    def list_webhooks(self) -> dict:
        """List registered webhooks."""
        return self._request("GET", "/api/v1/gds/distribution/webhooks")

    def get_distribution_stats(self) -> dict:
        """Get distribution channel stats."""
        return self._request("GET", "/api/v1/gds/distribution/stats")

    # ─── Analytics ─────────────────────────────────────────────────────

    def get_booking_metrics(self, period: str = "daily", date_from: Optional[str] = None, date_to: Optional[str] = None) -> dict:
        """Get booking metrics."""
        return self._request("GET", "/api/v1/gds/analytics/bookings", params={
            "period": period, "dateFrom": date_from, "dateTo": date_to,
        })

    def get_market_intelligence(self, country: Optional[str] = None) -> dict:
        """Get market intelligence (ADR, RevPAR, occupancy)."""
        return self._request("GET", "/api/v1/gds/analytics/market", params={"country": country})

    def get_demand_forecast(self, destination: str, date_from: str, date_to: str) -> dict:
        """Get demand forecast for a destination."""
        return self._request("GET", "/api/v1/gds/analytics/forecast/demand", params={
            "destination": destination, "dateFrom": date_from, "dateTo": date_to,
        })

    # ─── Metered Usage ─────────────────────────────────────────────────

    def get_usage(self) -> dict[str, int]:
        """Get local API usage counts for this session."""
        return dict(self._usage)

    def get_metered_usage(self) -> dict:
        """Get server-side metered token usage."""
        return self._request("GET", "/api/v1/gds/metering/usage")

    def get_quota(self) -> dict:
        """Get current quota and remaining tokens."""
        return self._request("GET", "/api/v1/gds/metering/quota")

    # ─── Context Manager ───────────────────────────────────────────────

    def __enter__(self):
        return self

    def __exit__(self, *args):
        if self._http and hasattr(self._http, "close"):
            self._http.close()

    def close(self):
        """Close the HTTP connection."""
        if self._http and hasattr(self._http, "close"):
            self._http.close()

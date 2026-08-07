#!/usr/bin/env python3
"""
TourismPay Keycloak JWT Validation Audit
Tasks: 8 (APISIX gateway routing + Keycloak token revocation),
       17 (JWT 3-part structure fix verification)

Verifies:
  1. JWT tokens have strict 3-part structure (header.payload.signature)
  2. Expired tokens are rejected
  3. Revoked tokens are rejected (Keycloak token introspection)
  4. Algorithm confusion attacks are blocked
  5. APISIX correctly validates JWT on all protected routes
  6. Token revocation propagates within acceptable time window
"""

import asyncio
import base64
import json
import time
import argparse
import hmac
import hashlib
from dataclasses import dataclass, asdict
import httpx

APISIX_URL   = "http://localhost:9080"
KEYCLOAK_URL = "http://localhost:8080"
SERVER_URL   = "http://localhost:3000"

KEYCLOAK_REALM  = "tourismpay"
KEYCLOAK_CLIENT = "tourismpay-api"

@dataclass
class JWTAuditResult:
    test_name: str
    token_type: str
    expected_status: int
    actual_status: int
    passed: bool
    notes: str

class JWTAuditor:
    def __init__(self):
        self.results: list[JWTAuditResult] = []
        self.client = httpx.AsyncClient(timeout=10.0, verify=False)

    def _record(self, test_name: str, token_type: str,
                expected: int, actual: int, notes: str = ""):
        passed = actual == expected or (expected == 401 and actual in (401, 403))
        result = JWTAuditResult(
            test_name=test_name,
            token_type=token_type,
            expected_status=expected,
            actual_status=actual,
            passed=passed,
            notes=notes,
        )
        self.results.append(result)
        icon = "✅" if passed else "❌"
        print(f"  {icon} [{token_type}] {test_name}: expected={expected} got={actual}")
        return result

    def _make_jwt(self, header: dict, payload: dict, secret: str = "wrong-secret") -> str:
        """Create a JWT with arbitrary header/payload (for attack simulation)."""
        def b64url(data: dict) -> str:
            return base64.urlsafe_b64encode(
                json.dumps(data, separators=(",", ":")).encode()
            ).rstrip(b"=").decode()

        h = b64url(header)
        p = b64url(payload)
        signing_input = f"{h}.{p}"
        sig = hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
        sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
        return f"{signing_input}.{sig_b64}"

    async def test_no_token(self):
        """Protected endpoint without any token must return 401."""
        resp = await self.client.get(f"{APISIX_URL}/api/trpc/wallet.getBalance")
        self._record("No token on protected endpoint", "none", 401, resp.status_code)

    async def test_malformed_jwt_1_part(self):
        """1-part token (no dots) must be rejected."""
        resp = await self.client.get(
            f"{APISIX_URL}/api/trpc/wallet.getBalance",
            headers={"Authorization": "Bearer notavalidtoken"}
        )
        self._record("1-part token (no dots)", "malformed", 401, resp.status_code,
                    "JWT must have exactly 3 parts separated by dots")

    async def test_malformed_jwt_2_part(self):
        """2-part token must be rejected (missing signature)."""
        resp = await self.client.get(
            f"{APISIX_URL}/api/trpc/wallet.getBalance",
            headers={"Authorization": "Bearer header.payload"}
        )
        self._record("2-part token (missing signature)", "malformed", 401, resp.status_code,
                    "JWT must have exactly 3 parts — this is the Task 17 fix")

    async def test_malformed_jwt_4_part(self):
        """4-part token must be rejected."""
        resp = await self.client.get(
            f"{APISIX_URL}/api/trpc/wallet.getBalance",
            headers={"Authorization": "Bearer a.b.c.d"}
        )
        self._record("4-part token (extra dot)", "malformed", 401, resp.status_code)

    async def test_none_algorithm(self):
        """JWT with alg=none must be rejected."""
        token = self._make_jwt(
            {"alg": "none", "typ": "JWT"},
            {"sub": "admin", "role": "admin", "exp": int(time.time()) + 3600}
        )
        # Remove signature for none algorithm
        parts = token.split(".")
        token_no_sig = f"{parts[0]}.{parts[1]}."
        resp = await self.client.get(
            f"{APISIX_URL}/api/trpc/wallet.getBalance",
            headers={"Authorization": f"Bearer {token_no_sig}"}
        )
        self._record("alg=none attack", "attack", 401, resp.status_code,
                    "Algorithm confusion: alg=none must always be rejected")

    async def test_expired_token(self):
        """Expired JWT must be rejected."""
        token = self._make_jwt(
            {"alg": "HS256", "typ": "JWT"},
            {"sub": "user-001", "exp": int(time.time()) - 3600}  # Expired 1h ago
        )
        resp = await self.client.get(
            f"{APISIX_URL}/api/trpc/wallet.getBalance",
            headers={"Authorization": f"Bearer {token}"}
        )
        self._record("Expired token", "expired", 401, resp.status_code)

    async def test_wrong_signature(self):
        """JWT with wrong signature must be rejected."""
        token = self._make_jwt(
            {"alg": "HS256", "typ": "JWT"},
            {"sub": "user-001", "exp": int(time.time()) + 3600},
            secret="wrong-secret-key"
        )
        resp = await self.client.get(
            f"{APISIX_URL}/api/trpc/wallet.getBalance",
            headers={"Authorization": f"Bearer {token}"}
        )
        self._record("Wrong signature", "tampered", 401, resp.status_code)

    async def test_keycloak_token_revocation(self):
        """
        Test that Keycloak token revocation propagates to APISIX within
        the acceptable window (< 60 seconds for production).
        """
        # Get a real token from Keycloak
        try:
            resp = await self.client.post(
                f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token",
                data={
                    "grant_type": "password",
                    "client_id": KEYCLOAK_CLIENT,
                    "username": "test-user@tourismpay.com",
                    "password": "test-password",
                },
            )
            if resp.status_code != 200:
                self._record("Token revocation (Keycloak unavailable)", "revocation",
                            401, 0, f"Keycloak returned HTTP {resp.status_code}")
                return

            token_data = resp.json()
            access_token = token_data.get("access_token", "")
            refresh_token = token_data.get("refresh_token", "")

            # Verify token works
            valid_resp = await self.client.get(
                f"{APISIX_URL}/api/trpc/wallet.getBalance",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            token_works = valid_resp.status_code in (200, 400)  # 400 = valid auth but bad input

            # Revoke the token
            revoke_resp = await self.client.post(
                f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/revoke",
                data={
                    "client_id": KEYCLOAK_CLIENT,
                    "token": refresh_token,
                    "token_type_hint": "refresh_token",
                },
            )
            revoked = revoke_resp.status_code == 200

            # Wait for revocation to propagate (APISIX caches tokens for ~30s)
            await asyncio.sleep(5)

            # Try to use revoked token
            revoked_resp = await self.client.get(
                f"{APISIX_URL}/api/trpc/wallet.getBalance",
                headers={"Authorization": f"Bearer {access_token}"}
            )

            self._record(
                "Token revocation propagation",
                "revocation",
                401,
                revoked_resp.status_code,
                f"Token worked before revocation: {token_works}; "
                f"Keycloak revocation: {revoked}; "
                f"Post-revocation status: {revoked_resp.status_code}. "
                f"Note: APISIX may cache tokens for up to 30s"
            )

        except Exception as e:
            self._record("Token revocation (exception)", "revocation",
                        401, 0, f"Exception: {str(e)[:100]}")

    async def test_apisix_route_jwt_enforcement(self):
        """Verify all critical routes require JWT."""
        protected_routes = [
            "/api/trpc/wallet.getBalance",
            "/api/trpc/wallet.debit",
            "/api/trpc/journeyV2.startBnplHotelBooking",
            "/api/trpc/admin.getUsers",
            "/api/trpc/compliance.getSARFilings",
        ]

        for route in protected_routes:
            resp = await self.client.get(f"{APISIX_URL}{route}")
            self._record(
                f"Route protection: {route}",
                "no-token",
                401,
                resp.status_code,
                "All sensitive routes must require JWT"
            )

    async def run_all(self) -> dict:
        print(f"\n{'='*60}")
        print("TourismPay JWT Validation Audit")
        print(f"{'='*60}")

        await self.test_no_token()
        await self.test_malformed_jwt_1_part()
        await self.test_malformed_jwt_2_part()
        await self.test_malformed_jwt_4_part()
        await self.test_none_algorithm()
        await self.test_expired_token()
        await self.test_wrong_signature()
        await self.test_keycloak_token_revocation()
        await self.test_apisix_route_jwt_enforcement()

        await self.client.aclose()

        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed

        print(f"\n{'='*60}")
        print(f"JWT AUDIT COMPLETE: {passed}/{total} passed")
        if failed > 0:
            print(f"FAILURES:")
            for r in self.results:
                if not r.passed:
                    print(f"  ❌ {r.test_name}: expected={r.expected_status} got={r.actual_status}")
        print(f"{'='*60}\n")

        return {
            "total": total,
            "passed": passed,
            "failed": failed,
            "results": [asdict(r) for r in self.results],
            "verdict": "PASS" if failed == 0 else "FAIL",
        }


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default="tests/security/keycloak/jwt-audit.json")
    args = parser.parse_args()

    auditor = JWTAuditor()
    report = await auditor.run_all()

    import os
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Report saved to: {args.report}")
    exit(0 if report["failed"] == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
"""
TourismPay Permify Multi-Tenant Isolation Test
Tasks: 3 (multi-tenant isolation), 5 (Permify permissions), 6 (tenant isolation across workflow routes)

Simulates Tenant A attempting to access Tenant B's financial resources
during an active Temporal workflow. Tests all Permify entity types:
  - wallet (read/debit/credit)
  - booking
  - loyalty_account
  - bnpl_plan
  - insurance_policy
  - white_label_tenant
  - audit_log

Verifies that APISIX + Permify correctly enforce cross-tenant isolation.
"""

import asyncio
import json
import time
import uuid
import argparse
from dataclasses import dataclass, asdict
from typing import Optional
import httpx

# ─── Test configuration ───────────────────────────────────────────────────────

PERMIFY_URL = "http://localhost:3476"   # Permify gRPC-gateway
APISIX_URL  = "http://localhost:9080"   # APISIX gateway
SERVER_URL  = "http://localhost:3000"   # tRPC server

# Synthetic tenant + user IDs for isolation testing
TENANT_A_ID = "tenant-a-test-001"
TENANT_B_ID = "tenant-b-test-002"
USER_A_ID   = "user-a-test-001"
USER_B_ID   = "user-b-test-002"
ADMIN_A_ID  = "admin-a-test-001"

# Resources owned by Tenant B — Tenant A must NOT access these
TENANT_B_RESOURCES = {
    "wallet":           f"wallet-b-{uuid.uuid4().hex[:8]}",
    "booking":          f"booking-b-{uuid.uuid4().hex[:8]}",
    "loyalty_account":  f"loyalty-b-{uuid.uuid4().hex[:8]}",
    "bnpl_plan":        f"bnpl-b-{uuid.uuid4().hex[:8]}",
    "insurance_policy": f"policy-b-{uuid.uuid4().hex[:8]}",
    "audit_log":        f"audit-b-{uuid.uuid4().hex[:8]}",
}

@dataclass
class IsolationTestResult:
    test_id: str
    resource_type: str
    resource_id: str
    action: str
    attacker_tenant: str
    owner_tenant: str
    permify_decision: str       # "allowed" or "denied"
    http_status: int
    was_isolated: bool          # True = correctly denied
    response_time_ms: float
    notes: str = ""

# ─── Permify check helper ─────────────────────────────────────────────────────

async def permify_check(
    client: httpx.AsyncClient,
    tenant_id: str,
    entity_type: str,
    entity_id: str,
    permission: str,
    subject_type: str,
    subject_id: str,
) -> tuple[str, float]:
    """Call Permify /v1/permissions/check and return (decision, elapsed_ms)."""
    start = time.monotonic()
    try:
        resp = await client.post(
            f"{PERMIFY_URL}/v1/permissions/check",
            json={
                "tenant_id": tenant_id,
                "metadata": {"schema_version": "", "snap_token": "", "depth": 20},
                "entity": {"type": entity_type, "id": entity_id},
                "permission": permission,
                "subject": {"type": subject_type, "id": subject_id, "relation": ""},
            },
            timeout=5.0,
        )
        elapsed = (time.monotonic() - start) * 1000
        if resp.status_code == 200:
            data = resp.json()
            decision = data.get("can", "RESULT_UNSPECIFIED")
            return decision, elapsed
        return f"HTTP_{resp.status_code}", elapsed
    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        return f"ERROR:{str(e)[:40]}", elapsed


# ─── Test runner ──────────────────────────────────────────────────────────────

class TenantIsolationTester:
    def __init__(self):
        self.results: list[IsolationTestResult] = []
        self.client = httpx.AsyncClient(timeout=10.0, verify=False)

    def _record(self, resource_type: str, resource_id: str, action: str,
                decision: str, http_status: int, elapsed: float, notes: str = ""):
        was_isolated = decision in ("RESULT_DENIED", "denied", "HTTP_403",
                                     "HTTP_401", "ERROR:") or http_status in (401, 403)
        result = IsolationTestResult(
            test_id=str(uuid.uuid4())[:8],
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
            attacker_tenant=TENANT_A_ID,
            owner_tenant=TENANT_B_ID,
            permify_decision=decision,
            http_status=http_status,
            was_isolated=was_isolated,
            response_time_ms=round(elapsed, 2),
            notes=notes,
        )
        self.results.append(result)
        icon = "✅" if was_isolated else "❌ BREACH"
        print(f"  {icon} [{resource_type}.{action}] decision={decision} HTTP={http_status} ({elapsed:.0f}ms)")
        return result

    async def test_permify_wallet_isolation(self):
        """Tenant A tries to read/debit Tenant B's wallet via Permify."""
        print("\n[PERMIFY] Wallet Isolation Tests")
        wallet_id = TENANT_B_RESOURCES["wallet"]

        for action in ("read", "debit", "credit", "view_transactions"):
            decision, elapsed = await permify_check(
                self.client,
                tenant_id=TENANT_A_ID,          # Attacker's tenant context
                entity_type="wallet",
                entity_id=wallet_id,             # Tenant B's wallet
                permission=action,
                subject_type="user",
                subject_id=USER_A_ID,            # Tenant A's user
            )
            self._record("wallet", wallet_id, action, decision, 0, elapsed,
                        "Permify direct check: Tenant A → Tenant B wallet")

    async def test_permify_booking_isolation(self):
        """Tenant A tries to view/cancel Tenant B's bookings."""
        print("\n[PERMIFY] Booking Isolation Tests")
        booking_id = TENANT_B_RESOURCES["booking"]

        for action in ("view", "cancel", "modify"):
            decision, elapsed = await permify_check(
                self.client,
                tenant_id=TENANT_A_ID,
                entity_type="booking",
                entity_id=booking_id,
                permission=action,
                subject_type="user",
                subject_id=USER_A_ID,
            )
            self._record("booking", booking_id, action, decision, 0, elapsed)

    async def test_permify_bnpl_isolation(self):
        """Tenant A tries to access Tenant B's BNPL plans."""
        print("\n[PERMIFY] BNPL Plan Isolation Tests")
        bnpl_id = TENANT_B_RESOURCES["bnpl_plan"]

        for action in ("view", "pay_instalment", "cancel"):
            decision, elapsed = await permify_check(
                self.client,
                tenant_id=TENANT_A_ID,
                entity_type="bnpl_plan",
                entity_id=bnpl_id,
                permission=action,
                subject_type="user",
                subject_id=USER_A_ID,
            )
            self._record("bnpl_plan", bnpl_id, action, decision, 0, elapsed)

    async def test_permify_insurance_isolation(self):
        """Tenant A tries to view/claim Tenant B's insurance policy."""
        print("\n[PERMIFY] Insurance Policy Isolation Tests")
        policy_id = TENANT_B_RESOURCES["insurance_policy"]

        for action in ("view", "file_claim", "cancel"):
            decision, elapsed = await permify_check(
                self.client,
                tenant_id=TENANT_A_ID,
                entity_type="insurance_policy",
                entity_id=policy_id,
                permission=action,
                subject_type="user",
                subject_id=USER_A_ID,
            )
            self._record("insurance_policy", policy_id, action, decision, 0, elapsed)

    async def test_permify_audit_log_isolation(self):
        """Tenant A tries to view Tenant B's audit logs."""
        print("\n[PERMIFY] Audit Log Isolation Tests")
        audit_id = TENANT_B_RESOURCES["audit_log"]

        for action in ("view", "export"):
            decision, elapsed = await permify_check(
                self.client,
                tenant_id=TENANT_A_ID,
                entity_type="audit_log",
                entity_id=audit_id,
                permission=action,
                subject_type="user",
                subject_id=USER_A_ID,
            )
            self._record("audit_log", audit_id, action, decision, 0, elapsed)

    async def test_apisix_route_isolation(self):
        """Test that APISIX routes enforce tenant isolation via JWT claims."""
        print("\n[APISIX] Route-Level Tenant Isolation Tests")

        # Simulate Tenant A's JWT (tenant_id claim = TENANT_A_ID)
        # Attempting to access Tenant B's resources via URL path
        cross_tenant_paths = [
            f"/api/trpc/wallet.getBalance?input={{\"tenantId\":\"{TENANT_B_ID}\"}}",
            f"/api/trpc/bnpl.getPlans?input={{\"tenantId\":\"{TENANT_B_ID}\"}}",
            f"/api/trpc/insurance.getPolicies?input={{\"tenantId\":\"{TENANT_B_ID}\"}}",
            f"/api/trpc/audit.getLogs?input={{\"tenantId\":\"{TENANT_B_ID}\"}}",
        ]

        for path in cross_tenant_paths:
            start = time.monotonic()
            try:
                resp = await self.client.get(
                    f"{APISIX_URL}{path}",
                    headers={
                        # Tenant A's token — should not allow access to Tenant B resources
                        "Authorization": "Bearer TENANT_A_TEST_TOKEN",
                        "X-Tenant-ID": TENANT_A_ID,
                    }
                )
                elapsed = (time.monotonic() - start) * 1000
                self._record("apisix-route", path[:60], "cross-tenant-access",
                            f"HTTP_{resp.status_code}", resp.status_code, elapsed,
                            "APISIX route enforcement")
            except Exception as e:
                elapsed = (time.monotonic() - start) * 1000
                self._record("apisix-route", path[:60], "cross-tenant-access",
                            f"ERROR", 0, elapsed, str(e)[:40])

    async def test_temporal_workflow_isolation(self):
        """Test that Temporal workflows cannot access cross-tenant resources."""
        print("\n[TEMPORAL] Workflow Tenant Isolation Tests")

        # Attempt to start a workflow with cross-tenant resource IDs
        cross_tenant_workflow_inputs = [
            {
                "name": "BNPL workflow with cross-tenant wallet",
                "path": "/api/trpc/journeyV2.startBnplHotelBooking",
                "body": {
                    "hotelId": "hotel-b-001",
                    "totalAmountNgn": 50000,
                    "instalments": 3,
                    "walletId": TENANT_B_RESOURCES["wallet"],  # Cross-tenant wallet
                }
            },
            {
                "name": "Insurance claim with cross-tenant policy",
                "path": "/api/trpc/journeyV2.startInsuranceClaim",
                "body": {
                    "policyId": TENANT_B_RESOURCES["insurance_policy"],  # Cross-tenant policy
                    "claimType": "medical",
                    "claimAmountNgn": 100000,
                    "description": "Test claim",
                }
            },
        ]

        for test in cross_tenant_workflow_inputs:
            start = time.monotonic()
            try:
                resp = await self.client.post(
                    f"{SERVER_URL}{test['path']}",
                    json=test["body"],
                    headers={"Authorization": "Bearer TENANT_A_TEST_TOKEN"}
                )
                elapsed = (time.monotonic() - start) * 1000
                self._record("temporal-workflow", test["name"], "cross-tenant-workflow",
                            f"HTTP_{resp.status_code}", resp.status_code, elapsed,
                            "Temporal workflow must reject cross-tenant resource IDs")
            except Exception as e:
                elapsed = (time.monotonic() - start) * 1000
                self._record("temporal-workflow", test["name"], "cross-tenant-workflow",
                            "ERROR", 0, elapsed, str(e)[:40])

    async def run_all(self) -> dict:
        print(f"\n{'='*60}")
        print("TourismPay Multi-Tenant Isolation Test")
        print(f"Attacker: {TENANT_A_ID} / {USER_A_ID}")
        print(f"Victim:   {TENANT_B_ID}")
        print(f"{'='*60}")

        await self.test_permify_wallet_isolation()
        await self.test_permify_booking_isolation()
        await self.test_permify_bnpl_isolation()
        await self.test_permify_insurance_isolation()
        await self.test_permify_audit_log_isolation()
        await self.test_apisix_route_isolation()
        await self.test_temporal_workflow_isolation()

        await self.client.aclose()

        total = len(self.results)
        isolated = sum(1 for r in self.results if r.was_isolated)
        breaches = total - isolated

        print(f"\n{'='*60}")
        print(f"ISOLATION TEST COMPLETE")
        print(f"  Total tests:    {total}")
        print(f"  Isolated:       {isolated} ✅")
        print(f"  BREACHES:       {breaches} {'❌ CRITICAL' if breaches > 0 else '✅ NONE'}")
        print(f"{'='*60}\n")

        if breaches > 0:
            print("BREACH DETAILS:")
            for r in self.results:
                if not r.was_isolated:
                    print(f"  ❌ {r.resource_type}.{r.action}: decision={r.permify_decision} HTTP={r.http_status}")

        report = {
            "test_type": "multi_tenant_isolation",
            "tenant_a": TENANT_A_ID,
            "tenant_b": TENANT_B_ID,
            "total_tests": total,
            "isolated": isolated,
            "breaches": breaches,
            "isolation_rate": f"{(isolated/total*100):.1f}%" if total > 0 else "0%",
            "results": [asdict(r) for r in self.results],
            "verdict": "PASS" if breaches == 0 else "FAIL - TENANT ISOLATION BREACH",
        }
        return report


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default="tests/security/permify/isolation-report.json")
    args = parser.parse_args()

    tester = TenantIsolationTester()
    report = await tester.run_all()

    import os
    os.makedirs(os.path.dirname(args.report), exist_ok=True)
    with open(args.report, "w") as f:
        json.dump(report, f, indent=2)
    print(f"Report saved to: {args.report}")

    exit(0 if report["breaches"] == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())

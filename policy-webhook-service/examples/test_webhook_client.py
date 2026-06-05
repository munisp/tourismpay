"""
Example client for testing the Policy Webhook Service.

This script demonstrates how to:
1. Start a policy issuance workflow
2. Query workflow status
3. Wait for workflow completion
"""
import asyncio
import httpx
from datetime import datetime
from typing import Dict, Any


class PolicyWebhookClient:
    """Client for interacting with Policy Webhook Service."""

    def __init__(self, base_url: str = "http://localhost:8000"):
        """
        Initialize client.

        Args:
            base_url: Base URL of the webhook service
        """
        self.base_url = base_url
        self.client = httpx.AsyncClient(base_url=base_url, timeout=30.0)

    async def start_policy_issuance(
        self,
        customer_id: str,
        policy_type: str,
        sum_assured: float,
        premium_frequency: str,
        duration_months: int,
        payment_method: str,
        idempotency_key: str = None,
    ) -> Dict[str, Any]:
        """
        Start a policy issuance workflow.

        Args:
            customer_id: Customer ID (NIN)
            policy_type: Policy type (LIFE, MOTOR, HEALTH, etc.)
            sum_assured: Sum assured amount in NGN
            premium_frequency: Premium frequency (MONTHLY, QUARTERLY, etc.)
            duration_months: Policy duration in months
            payment_method: Payment method (CARD, BANK_TRANSFER, etc.)
            idempotency_key: Optional idempotency key

        Returns:
            Response dictionary with workflow_id and run_id
        """
        payload = {
            "customer_id": customer_id,
            "policy_type": policy_type,
            "sum_assured": sum_assured,
            "premium_frequency": premium_frequency,
            "duration_months": duration_months,
            "payment_method": payment_method,
            "start_date": datetime.utcnow().isoformat() + "Z",
            "source": "test_client",
        }

        if idempotency_key:
            payload["idempotency_key"] = idempotency_key

        response = await self.client.post(
            "/api/v1/webhooks/policy-issuance",
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    async def get_workflow_status(self, workflow_id: str) -> Dict[str, Any]:
        """
        Get workflow status.

        Args:
            workflow_id: Temporal workflow ID

        Returns:
            Status information
        """
        response = await self.client.post(
            "/api/v1/webhooks/policy-issuance/status",
            json={"workflow_id": workflow_id},
        )
        response.raise_for_status()
        return response.json()

    async def wait_for_completion(
        self,
        workflow_id: str,
        poll_interval: int = 5,
        max_wait: int = 300,
    ) -> Dict[str, Any]:
        """
        Wait for workflow to complete.

        Args:
            workflow_id: Temporal workflow ID
            poll_interval: Polling interval in seconds
            max_wait: Maximum wait time in seconds

        Returns:
            Final workflow result
        """
        elapsed = 0
        while elapsed < max_wait:
            status = await self.get_workflow_status(workflow_id)

            if status["status"] in ["COMPLETED", "FAILED", "TERMINATED", "CANCELED"]:
                return status

            print(f"Workflow {workflow_id} status: {status['status']}")
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        raise TimeoutError(f"Workflow did not complete within {max_wait} seconds")

    async def health_check(self) -> Dict[str, Any]:
        """
        Check service health.

        Returns:
            Health status
        """
        response = await self.client.get("/health")
        response.raise_for_status()
        return response.json()

    async def close(self):
        """Close client."""
        await self.client.aclose()


async def example_life_policy():
    """Example: Issue a life insurance policy."""
    print("=" * 60)
    print("Example: Issue Life Insurance Policy")
    print("=" * 60)

    client = PolicyWebhookClient()

    try:
        # Check service health
        print("\n1. Checking service health...")
        health = await client.health_check()
        print(f"   Service status: {health['status']}")
        print(f"   Temporal connected: {health['temporal_connected']}")
        print(f"   Dapr connected: {health['dapr_connected']}")

        # Start workflow
        print("\n2. Starting policy issuance workflow...")
        result = await client.start_policy_issuance(
            customer_id="12345678901",
            policy_type="LIFE",
            sum_assured=1000000.0,
            premium_frequency="MONTHLY",
            duration_months=12,
            payment_method="CARD",
            idempotency_key="life-policy-example-001",
        )
        print(f"   ✓ Workflow started: {result['workflow_id']}")
        print(f"   Run ID: {result['run_id']}")

        workflow_id = result["workflow_id"]

        # Poll for completion
        print("\n3. Waiting for workflow completion...")
        final_status = await client.wait_for_completion(workflow_id, poll_interval=3, max_wait=120)

        print(f"\n4. Workflow completed!")
        print(f"   Status: {final_status['status']}")

        if final_status.get("result"):
            result_data = final_status["result"]
            if result_data.get("success"):
                print(f"   ✓ Policy issued successfully!")
                print(f"   Policy ID: {result_data.get('policy_id')}")
                print(f"   Policy Number: {result_data.get('policy_number')}")
                print(f"   Transaction ID: {result_data.get('transaction_id')}")
                print(f"   Premium: {result_data.get('premium')} NGN")
            else:
                print(f"   ✗ Policy issuance failed")
                print(f"   Reason: {result_data.get('failure_reason')}")
                print(f"   Failed at: {result_data.get('failure_step')}")

    except Exception as e:
        print(f"\n✗ Error: {e}")

    finally:
        await client.close()


async def example_motor_policy():
    """Example: Issue a motor insurance policy."""
    print("=" * 60)
    print("Example: Issue Motor Insurance Policy")
    print("=" * 60)

    client = PolicyWebhookClient()

    try:
        print("\nStarting motor policy issuance workflow...")
        result = await client.start_policy_issuance(
            customer_id="98765432109",
            policy_type="MOTOR",
            sum_assured=500000.0,
            premium_frequency="ANNUALLY",
            duration_months=12,
            payment_method="BANK_TRANSFER",
        )
        print(f"✓ Workflow started: {result['workflow_id']}")

        # Just check status once (don't wait for completion)
        workflow_id = result["workflow_id"]
        await asyncio.sleep(2)

        status = await client.get_workflow_status(workflow_id)
        print(f"Current status: {status['status']}")

    except Exception as e:
        print(f"✗ Error: {e}")

    finally:
        await client.close()


async def example_query_existing_workflow():
    """Example: Query status of an existing workflow."""
    print("=" * 60)
    print("Example: Query Existing Workflow")
    print("=" * 60)

    client = PolicyWebhookClient()

    try:
        # Replace with actual workflow ID
        workflow_id = "policy-issuance-12345678901-1706437200"

        print(f"\nQuerying workflow: {workflow_id}")
        status = await client.get_workflow_status(workflow_id)

        print(f"Status: {status['status']}")
        if status.get("result"):
            print(f"Result: {status['result']}")

    except Exception as e:
        print(f"✗ Error: {e}")

    finally:
        await client.close()


async def example_multiple_policies():
    """Example: Start multiple policy workflows concurrently."""
    print("=" * 60)
    print("Example: Start Multiple Policies Concurrently")
    print("=" * 60)

    client = PolicyWebhookClient()

    try:
        # Define multiple policies
        policies = [
            {
                "customer_id": "11111111111",
                "policy_type": "LIFE",
                "sum_assured": 1000000.0,
                "premium_frequency": "MONTHLY",
                "duration_months": 12,
                "payment_method": "CARD",
            },
            {
                "customer_id": "22222222222",
                "policy_type": "HEALTH",
                "sum_assured": 500000.0,
                "premium_frequency": "QUARTERLY",
                "duration_months": 12,
                "payment_method": "MOBILE_MONEY",
            },
            {
                "customer_id": "33333333333",
                "policy_type": "TRAVEL",
                "sum_assured": 100000.0,
                "premium_frequency": "ANNUALLY",
                "duration_months": 12,
                "payment_method": "WALLET",
            },
        ]

        # Start all workflows concurrently
        print(f"\nStarting {len(policies)} workflows concurrently...")
        tasks = [
            client.start_policy_issuance(**policy)
            for policy in policies
        ]
        results = await asyncio.gather(*tasks)

        print(f"✓ All workflows started:")
        for i, result in enumerate(results, 1):
            print(f"   {i}. {result['workflow_id']}")

    except Exception as e:
        print(f"✗ Error: {e}")

    finally:
        await client.close()


async def main():
    """Run all examples."""
    print("\n" + "=" * 60)
    print("Policy Webhook Service - Example Client")
    print("=" * 60)

    # Run examples
    await example_life_policy()
    print("\n")

    await example_motor_policy()
    print("\n")

    # Uncomment to run other examples
    # await example_query_existing_workflow()
    # await example_multiple_policies()


if __name__ == "__main__":
    asyncio.run(main())

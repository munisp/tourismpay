"""
Python implementation of Temporal-TigerBeetle integration for performance comparison.
This implementation mirrors the Go version to enable fair benchmarking.
"""

import asyncio
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker


class TransferStatus(Enum):
    PENDING = "pending"
    COMMITTED = "committed"
    VOIDED = "voided"
    FAILED = "failed"


@dataclass
class TransferRequest:
    transfer_id: str
    debit_account_id: str
    credit_account_id: str
    amount: int
    ledger: int
    code: int
    timeout: int = 3600
    is_pending: bool = False


@dataclass
class TransferResult:
    transfer_id: str
    status: str
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


@dataclass
class AccountBalance:
    account_id: str
    debits_posted: int
    credits_posted: int
    debits_pending: int
    credits_pending: int
    net_balance: int


class TigerBeetleClient:
    """
    Python TigerBeetle client wrapper.
    Note: This is a simulated client for benchmarking purposes.
    In production, use the official tigerbeetle-python client.
    """

    def __init__(self, cluster_id: int, addresses: List[str]):
        self.cluster_id = cluster_id
        self.addresses = addresses
        self._accounts: Dict[str, Dict[str, int]] = {}
        self._transfers: Dict[str, TransferResult] = {}
        self._lock = asyncio.Lock()

    async def create_account(
        self, account_id: str, ledger: int, code: int
    ) -> None:
        async with self._lock:
            if account_id in self._accounts:
                raise ValueError(f"Account {account_id} already exists")
            
            self._accounts[account_id] = {
                "ledger": ledger,
                "code": code,
                "debits_posted": 0,
                "credits_posted": 0,
                "debits_pending": 0,
                "credits_pending": 0,
            }
            
            # Simulate network latency
            await asyncio.sleep(0.001)

    async def create_transfer(self, req: TransferRequest) -> TransferResult:
        async with self._lock:
            if req.debit_account_id not in self._accounts:
                return TransferResult(
                    transfer_id=req.transfer_id,
                    status="failed",
                    error_code="DEBIT_ACCOUNT_NOT_FOUND",
                    error_message=f"Debit account {req.debit_account_id} not found",
                )

            if req.credit_account_id not in self._accounts:
                return TransferResult(
                    transfer_id=req.transfer_id,
                    status="failed",
                    error_code="CREDIT_ACCOUNT_NOT_FOUND",
                    error_message=f"Credit account {req.credit_account_id} not found",
                )

            debit_account = self._accounts[req.debit_account_id]
            credit_account = self._accounts[req.credit_account_id]

            if req.is_pending:
                debit_account["debits_pending"] += req.amount
                credit_account["credits_pending"] += req.amount
                status = "pending"
            else:
                available_balance = (
                    debit_account["credits_posted"] - debit_account["debits_posted"]
                )
                if available_balance < req.amount:
                    return TransferResult(
                        transfer_id=req.transfer_id,
                        status="failed",
                        error_code="INSUFFICIENT_BALANCE",
                        error_message="Insufficient balance",
                    )

                debit_account["debits_posted"] += req.amount
                credit_account["credits_posted"] += req.amount
                status = "committed"

            self._transfers[req.transfer_id] = TransferResult(
                transfer_id=req.transfer_id,
                status=status,
            )

            # Simulate network latency
            await asyncio.sleep(0.002)

            return self._transfers[req.transfer_id]

    async def post_pending_transfer(
        self, transfer_id: str, pending_transfer_id: str, ledger: int, code: int
    ) -> TransferResult:
        async with self._lock:
            if pending_transfer_id not in self._transfers:
                return TransferResult(
                    transfer_id=transfer_id,
                    status="failed",
                    error_code="PENDING_TRANSFER_NOT_FOUND",
                    error_message=f"Pending transfer {pending_transfer_id} not found",
                )

            pending_transfer = self._transfers[pending_transfer_id]
            if pending_transfer.status != "pending":
                return TransferResult(
                    transfer_id=transfer_id,
                    status="failed",
                    error_code="TRANSFER_NOT_PENDING",
                    error_message="Transfer is not in pending state",
                )

            # Find the original transfer details (simplified)
            # In real implementation, we'd store transfer details
            pending_transfer.status = "committed"

            result = TransferResult(
                transfer_id=transfer_id,
                status="committed",
            )

            self._transfers[transfer_id] = result

            # Simulate network latency
            await asyncio.sleep(0.002)

            return result

    async def void_pending_transfer(
        self, transfer_id: str, pending_transfer_id: str, ledger: int, code: int
    ) -> TransferResult:
        async with self._lock:
            if pending_transfer_id not in self._transfers:
                return TransferResult(
                    transfer_id=transfer_id,
                    status="failed",
                    error_code="PENDING_TRANSFER_NOT_FOUND",
                    error_message=f"Pending transfer {pending_transfer_id} not found",
                )

            pending_transfer = self._transfers[pending_transfer_id]
            if pending_transfer.status != "pending":
                return TransferResult(
                    transfer_id=transfer_id,
                    status="failed",
                    error_code="TRANSFER_NOT_PENDING",
                    error_message="Transfer is not in pending state",
                )

            pending_transfer.status = "voided"

            result = TransferResult(
                transfer_id=transfer_id,
                status="voided",
            )

            self._transfers[transfer_id] = result

            # Simulate network latency
            await asyncio.sleep(0.002)

            return result

    async def get_account_balance(self, account_id: str) -> AccountBalance:
        async with self._lock:
            if account_id not in self._accounts:
                raise ValueError(f"Account {account_id} not found")

            account = self._accounts[account_id]
            net_balance = account["credits_posted"] - account["debits_posted"]

            # Simulate network latency
            await asyncio.sleep(0.001)

            return AccountBalance(
                account_id=account_id,
                debits_posted=account["debits_posted"],
                credits_posted=account["credits_posted"],
                debits_pending=account["debits_pending"],
                credits_pending=account["credits_pending"],
                net_balance=net_balance,
            )

    def close(self):
        pass


class TigerBeetleActivities:
    def __init__(self, client: TigerBeetleClient):
        self.client = client

    @activity.defn(name="CreateAccountActivity")
    async def create_account_activity(
        self, account_id: str, ledger: int, code: int
    ) -> None:
        activity.logger.info(f"Creating TigerBeetle account: {account_id}")
        await self.client.create_account(account_id, ledger, code)
        activity.logger.info(f"Account created successfully: {account_id}")

    @activity.defn(name="CreateTransferActivity")
    async def create_transfer_activity(self, req: TransferRequest) -> TransferResult:
        activity.logger.info(f"Creating TigerBeetle transfer: {req.transfer_id}")
        result = await self.client.create_transfer(req)
        activity.logger.info(
            f"Transfer created: {req.transfer_id}, status: {result.status}"
        )
        return result

    @activity.defn(name="PostPendingTransferActivity")
    async def post_pending_transfer_activity(
        self, transfer_id: str, pending_transfer_id: str, ledger: int, code: int
    ) -> TransferResult:
        activity.logger.info(
            f"Posting pending transfer: {transfer_id}, pending: {pending_transfer_id}"
        )
        result = await self.client.post_pending_transfer(
            transfer_id, pending_transfer_id, ledger, code
        )
        activity.logger.info(f"Pending transfer posted: {transfer_id}")
        return result

    @activity.defn(name="VoidPendingTransferActivity")
    async def void_pending_transfer_activity(
        self, transfer_id: str, pending_transfer_id: str, ledger: int, code: int
    ) -> TransferResult:
        activity.logger.info(
            f"Voiding pending transfer: {transfer_id}, pending: {pending_transfer_id}"
        )
        result = await self.client.void_pending_transfer(
            transfer_id, pending_transfer_id, ledger, code
        )
        activity.logger.info(f"Pending transfer voided: {transfer_id}")
        return result

    @activity.defn(name="GetAccountBalanceActivity")
    async def get_account_balance_activity(self, account_id: str) -> AccountBalance:
        activity.logger.info(f"Getting account balance: {account_id}")
        balance = await self.client.get_account_balance(account_id)
        activity.logger.info(
            f"Account balance retrieved: {account_id}, net: {balance.net_balance}"
        )
        return balance

    @activity.defn(name="ValidatePaymentActivity")
    async def validate_payment_activity(self, payment_id: str) -> bool:
        # Simulate payment validation
        await asyncio.sleep(0.01)
        return True


@dataclass
class PaymentWorkflowInput:
    payment_id: str
    debit_account_id: str
    credit_account_id: str
    amount: int
    currency: str
    ledger: int
    code: int


@dataclass
class PaymentWorkflowResult:
    payment_id: str
    transfer_id: str
    status: str
    error_message: Optional[str] = None
    completed_at: datetime = None

    def __post_init__(self):
        if self.completed_at is None:
            self.completed_at = datetime.utcnow()


@workflow.defn(name="PaymentWorkflow")
class PaymentWorkflow:
    @workflow.run
    async def run(self, input: PaymentWorkflowInput) -> PaymentWorkflowResult:
        workflow.logger.info(f"Starting payment workflow: {input.payment_id}")

        transfer_id = f"TXN-{input.payment_id}-{int(time.time())}"

        # Create pending transfer
        pending_req = TransferRequest(
            transfer_id=transfer_id,
            debit_account_id=input.debit_account_id,
            credit_account_id=input.credit_account_id,
            amount=input.amount,
            ledger=input.ledger,
            code=input.code,
            timeout=3600,
            is_pending=True,
        )

        pending_result = await workflow.execute_activity(
            "CreateTransferActivity",
            pending_req,
            start_to_close_timeout=timedelta(seconds=30),
        )

        if pending_result.status == "failed":
            workflow.logger.error(
                f"Failed to create pending transfer: {pending_result.error_message}"
            )
            return PaymentWorkflowResult(
                payment_id=input.payment_id,
                transfer_id=transfer_id,
                status="failed",
                error_message=pending_result.error_message,
            )

        # Validate payment
        try:
            payment_approved = await workflow.execute_activity(
                "ValidatePaymentActivity",
                input.payment_id,
                start_to_close_timeout=timedelta(seconds=30),
            )
        except Exception as e:
            workflow.logger.error(f"Payment validation failed: {e}")
            
            # Void the pending transfer
            void_id = f"VOID-{transfer_id}"
            await workflow.execute_activity(
                "VoidPendingTransferActivity",
                void_id,
                transfer_id,
                input.ledger,
                input.code,
                start_to_close_timeout=timedelta(seconds=30),
            )
            
            return PaymentWorkflowResult(
                payment_id=input.payment_id,
                transfer_id=transfer_id,
                status="failed",
                error_message="Payment validation failed",
            )

        if not payment_approved:
            workflow.logger.info("Payment not approved, voiding transfer")
            
            void_id = f"VOID-{transfer_id}"
            await workflow.execute_activity(
                "VoidPendingTransferActivity",
                void_id,
                transfer_id,
                input.ledger,
                input.code,
                start_to_close_timeout=timedelta(seconds=30),
            )
            
            return PaymentWorkflowResult(
                payment_id=input.payment_id,
                transfer_id=transfer_id,
                status="rejected",
                error_message="Payment not approved",
            )

        # Post pending transfer
        post_id = f"POST-{transfer_id}"
        post_result = await workflow.execute_activity(
            "PostPendingTransferActivity",
            post_id,
            transfer_id,
            input.ledger,
            input.code,
            start_to_close_timeout=timedelta(seconds=30),
        )

        if post_result.status == "failed":
            workflow.logger.error(
                f"Failed to post pending transfer: {post_result.error_message}"
            )
            return PaymentWorkflowResult(
                payment_id=input.payment_id,
                transfer_id=transfer_id,
                status="failed",
                error_message=post_result.error_message,
            )

        workflow.logger.info(f"Payment workflow completed: {input.payment_id}")
        return PaymentWorkflowResult(
            payment_id=input.payment_id,
            transfer_id=transfer_id,
            status="completed",
        )


async def create_worker(
    temporal_host: str,
    temporal_namespace: str,
    task_queue: str,
    tigerbeetle_addresses: List[str],
) -> Worker:
    """Create and configure a Temporal worker with TigerBeetle activities."""
    
    client = await Client.connect(temporal_host, namespace=temporal_namespace)
    
    tigerbeetle_client = TigerBeetleClient(
        cluster_id=0,
        addresses=tigerbeetle_addresses,
    )
    
    activities_instance = TigerBeetleActivities(tigerbeetle_client)
    
    worker = Worker(
        client,
        task_queue=task_queue,
        workflows=[PaymentWorkflow],
        activities=[
            activities_instance.create_account_activity,
            activities_instance.create_transfer_activity,
            activities_instance.post_pending_transfer_activity,
            activities_instance.void_pending_transfer_activity,
            activities_instance.get_account_balance_activity,
            activities_instance.validate_payment_activity,
        ],
        max_concurrent_workflow_tasks=100,
        max_concurrent_activities=200,
    )
    
    return worker, tigerbeetle_client

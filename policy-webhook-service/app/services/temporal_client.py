"""
Temporal client service for initiating PolicyIssuanceWorkflow.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from temporalio.client import Client, WorkflowHandle
from temporalio.common import RetryPolicy
from temporalio.exceptions import WorkflowAlreadyStartedError

from app.models.policy import (
    PolicyIssuanceWebhookRequest,
    PolicyIssuanceResult,
)

logger = logging.getLogger(__name__)


class TemporalClientService:
    """
    Service for interacting with Temporal workflows.
    Handles workflow initiation, status queries, and result retrieval.
    """

    def __init__(self, temporal_address: str, namespace: str = "default"):
        """
        Initialize Temporal client service.

        Args:
            temporal_address: Temporal server address (e.g., "localhost:7233")
            namespace: Temporal namespace (default: "default")
        """
        self.temporal_address = temporal_address
        self.namespace = namespace
        self._client: Optional[Client] = None
        logger.info(f"Temporal client service initialized: {temporal_address}, namespace: {namespace}")

    async def connect(self):
        """Connect to Temporal server."""
        if self._client is None:
            try:
                self._client = await Client.connect(
                    self.temporal_address,
                    namespace=self.namespace,
                )
                logger.info("Connected to Temporal server successfully")
            except Exception as e:
                logger.error(f"Failed to connect to Temporal: {e}")
                raise

    async def disconnect(self):
        """Disconnect from Temporal server."""
        if self._client:
            await self._client.close()
            self._client = None
            logger.info("Disconnected from Temporal server")

    @property
    def client(self) -> Client:
        """Get Temporal client instance."""
        if self._client is None:
            raise RuntimeError("Temporal client not connected. Call connect() first.")
        return self._client

    async def start_policy_issuance_workflow(
        self,
        request: PolicyIssuanceWebhookRequest,
    ) -> Dict[str, Any]:
        """
        Start a PolicyIssuanceWorkflow.

        Args:
            request: Policy issuance webhook request

        Returns:
            Dictionary with workflow_id, run_id, and other metadata

        Raises:
            WorkflowAlreadyStartedError: If workflow with same ID already exists
            Exception: For other errors
        """
        # Generate workflow ID (idempotent based on customer_id and timestamp)
        workflow_id = self._generate_workflow_id(request)

        # Prepare workflow input (convert to format expected by Go workflow)
        workflow_input = {
            "customer_id": request.customer_id,
            "policy_type": request.policy_type.value,
            "sum_assured": request.sum_assured,
            "premium_frequency": request.premium_frequency.value,
            "duration_months": request.duration_months,
            "start_date": request.start_date.isoformat(),
            "payment_method": request.payment_method.value,
        }

        logger.info(f"Starting PolicyIssuanceWorkflow: {workflow_id}")
        logger.debug(f"Workflow input: {workflow_input}")

        try:
            # Start workflow execution
            handle = await self.client.start_workflow(
                "PolicyIssuanceWorkflow",  # Workflow name (matches Go implementation)
                workflow_input,
                id=workflow_id,
                task_queue="policy-task-queue",  # Must match worker task queue
                execution_timeout=timedelta(minutes=30),  # Max workflow duration
                retry_policy=RetryPolicy(
                    maximum_attempts=1,  # Don't retry workflow itself (activities will retry)
                ),
            )

            logger.info(f"Workflow started successfully: {workflow_id}, run_id: {handle.result_run_id}")

            return {
                "workflow_id": workflow_id,
                "run_id": handle.result_run_id,
                "started_at": datetime.utcnow(),
                "estimated_completion_time": datetime.utcnow() + timedelta(minutes=2),
            }

        except WorkflowAlreadyStartedError:
            logger.warning(f"Workflow already started: {workflow_id}")
            # Get existing workflow handle
            handle = self.client.get_workflow_handle(workflow_id)
            return {
                "workflow_id": workflow_id,
                "run_id": handle.result_run_id,
                "already_started": True,
            }

        except Exception as e:
            logger.error(f"Failed to start workflow {workflow_id}: {e}", exc_info=True)
            raise

    async def get_workflow_status(self, workflow_id: str) -> Dict[str, Any]:
        """
        Get the status of a workflow.

        Args:
            workflow_id: Temporal workflow ID

        Returns:
            Dictionary with workflow status and result (if completed)
        """
        logger.info(f"Querying workflow status: {workflow_id}")

        try:
            handle = self.client.get_workflow_handle(workflow_id)

            # Check if workflow is running
            describe = await handle.describe()

            status_info = {
                "workflow_id": workflow_id,
                "status": describe.status.name,
                "started_at": describe.start_time,
            }

            # If workflow is completed, get result
            if describe.status.name in ["COMPLETED", "FAILED", "TERMINATED", "CANCELED"]:
                try:
                    result = await handle.result()
                    status_info["result"] = self._parse_workflow_result(result)
                    status_info["completed_at"] = describe.close_time
                except Exception as e:
                    status_info["error"] = str(e)
                    logger.error(f"Failed to get workflow result: {e}")

            logger.info(f"Workflow status: {workflow_id} -> {status_info['status']}")
            return status_info

        except Exception as e:
            logger.error(f"Failed to query workflow status {workflow_id}: {e}", exc_info=True)
            raise

    async def wait_for_workflow_result(
        self,
        workflow_id: str,
        timeout_seconds: Optional[int] = None,
    ) -> PolicyIssuanceResult:
        """
        Wait for a workflow to complete and return the result.

        Args:
            workflow_id: Temporal workflow ID
            timeout_seconds: Maximum time to wait (None = wait indefinitely)

        Returns:
            PolicyIssuanceResult

        Raises:
            TimeoutError: If workflow doesn't complete within timeout
            Exception: For other errors
        """
        logger.info(f"Waiting for workflow result: {workflow_id}")

        try:
            handle = self.client.get_workflow_handle(workflow_id)

            # Wait for result with optional timeout
            if timeout_seconds:
                result = await asyncio.wait_for(
                    handle.result(),
                    timeout=timeout_seconds,
                )
            else:
                result = await handle.result()

            parsed_result = self._parse_workflow_result(result)
            logger.info(f"Workflow completed: {workflow_id}, success: {parsed_result.get('success')}")

            return PolicyIssuanceResult(**parsed_result)

        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for workflow result: {workflow_id}")
            raise TimeoutError(f"Workflow {workflow_id} did not complete within {timeout_seconds} seconds")

        except Exception as e:
            logger.error(f"Failed to get workflow result {workflow_id}: {e}", exc_info=True)
            raise

    async def cancel_workflow(self, workflow_id: str, reason: str = "Cancelled by user"):
        """
        Cancel a running workflow.

        Args:
            workflow_id: Temporal workflow ID
            reason: Cancellation reason
        """
        logger.info(f"Cancelling workflow: {workflow_id}, reason: {reason}")

        try:
            handle = self.client.get_workflow_handle(workflow_id)
            await handle.cancel()
            logger.info(f"Workflow cancelled successfully: {workflow_id}")

        except Exception as e:
            logger.error(f"Failed to cancel workflow {workflow_id}: {e}", exc_info=True)
            raise

    def _generate_workflow_id(self, request: PolicyIssuanceWebhookRequest) -> str:
        """
        Generate a unique workflow ID.

        Uses idempotency_key if provided, otherwise generates based on customer_id and timestamp.

        Args:
            request: Policy issuance request

        Returns:
            Workflow ID string
        """
        if request.idempotency_key:
            return f"policy-issuance-{request.idempotency_key}"

        # Generate ID based on customer_id and timestamp
        timestamp = int(request.start_date.timestamp())
        return f"policy-issuance-{request.customer_id}-{timestamp}"

    def _parse_workflow_result(self, result: Any) -> Dict[str, Any]:
        """
        Parse workflow result from Go workflow.

        The Go workflow returns a struct that needs to be converted to dict.

        Args:
            result: Raw workflow result

        Returns:
            Parsed result dictionary
        """
        if isinstance(result, dict):
            return result

        # If result is a dataclass or object, convert to dict
        if hasattr(result, "__dict__"):
            return result.__dict__

        # If result is a string (JSON), parse it
        if isinstance(result, str):
            import json
            try:
                return json.loads(result)
            except json.JSONDecodeError:
                logger.warning(f"Failed to parse workflow result as JSON: {result}")
                return {"raw_result": result}

        logger.warning(f"Unexpected workflow result type: {type(result)}")
        return {"raw_result": str(result)}

    async def health_check(self) -> bool:
        """
        Check if Temporal connection is healthy.

        Returns:
            True if connected and healthy, False otherwise
        """
        try:
            if self._client is None:
                return False

            # Try to list workflows as a health check
            await self.client.list_workflows("WorkflowType='PolicyIssuanceWorkflow'")
            return True

        except Exception as e:
            logger.error(f"Temporal health check failed: {e}")
            return False

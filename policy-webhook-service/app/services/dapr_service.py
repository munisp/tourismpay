"""
Dapr service for pub/sub, state management, and service invocation.
"""
import logging
import json
from typing import Dict, Any, Optional
from dapr.clients import DaprClient
from dapr.clients.grpc._response import DaprResponse

logger = logging.getLogger(__name__)


class DaprService:
    """
    Service for interacting with Dapr sidecar.
    Provides pub/sub, state management, and service invocation capabilities.
    """

    def __init__(self, dapr_grpc_port: int = 50001):
        """
        Initialize Dapr service.

        Args:
            dapr_grpc_port: Dapr gRPC port (default: 50001)
        """
        self.dapr_grpc_port = dapr_grpc_port
        self._client: Optional[DaprClient] = None
        logger.info(f"Dapr service initialized on port {dapr_grpc_port}")

    def __enter__(self):
        """Context manager entry."""
        self._client = DaprClient(f"localhost:{self.dapr_grpc_port}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        if self._client:
            self._client.close()
            self._client = None

    @property
    def client(self) -> DaprClient:
        """Get Dapr client instance."""
        if self._client is None:
            self._client = DaprClient(f"localhost:{self.dapr_grpc_port}")
        return self._client

    async def publish_event(
        self,
        pubsub_name: str,
        topic: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, str]] = None,
    ):
        """
        Publish an event to a Dapr pub/sub topic.

        Args:
            pubsub_name: Name of the pub/sub component
            topic: Topic name
            data: Event data
            metadata: Optional metadata
        """
        try:
            logger.info(f"Publishing event to {pubsub_name}/{topic}")
            logger.debug(f"Event data: {data}")

            with self.client as dapr:
                dapr.publish_event(
                    pubsub_name=pubsub_name,
                    topic_name=topic,
                    data=json.dumps(data),
                    data_content_type="application/json",
                    publish_metadata=metadata or {},
                )

            logger.info(f"Event published successfully to {topic}")

        except Exception as e:
            logger.error(f"Failed to publish event to {topic}: {e}", exc_info=True)
            raise

    async def save_state(
        self,
        store_name: str,
        key: str,
        value: Any,
        metadata: Optional[Dict[str, str]] = None,
    ):
        """
        Save state to Dapr state store.

        Args:
            store_name: Name of the state store component
            key: State key
            value: State value
            metadata: Optional metadata
        """
        try:
            logger.info(f"Saving state to {store_name}: {key}")

            with self.client as dapr:
                dapr.save_state(
                    store_name=store_name,
                    key=key,
                    value=json.dumps(value) if not isinstance(value, str) else value,
                    state_metadata=metadata or {},
                )

            logger.info(f"State saved successfully: {key}")

        except Exception as e:
            logger.error(f"Failed to save state {key}: {e}", exc_info=True)
            raise

    async def get_state(
        self,
        store_name: str,
        key: str,
    ) -> Optional[Any]:
        """
        Get state from Dapr state store.

        Args:
            store_name: Name of the state store component
            key: State key

        Returns:
            State value or None if not found
        """
        try:
            logger.info(f"Getting state from {store_name}: {key}")

            with self.client as dapr:
                response = dapr.get_state(
                    store_name=store_name,
                    key=key,
                )

            if response.data:
                try:
                    return json.loads(response.data)
                except json.JSONDecodeError:
                    return response.data.decode('utf-8')

            logger.info(f"State not found: {key}")
            return None

        except Exception as e:
            logger.error(f"Failed to get state {key}: {e}", exc_info=True)
            raise

    async def delete_state(
        self,
        store_name: str,
        key: str,
    ):
        """
        Delete state from Dapr state store.

        Args:
            store_name: Name of the state store component
            key: State key
        """
        try:
            logger.info(f"Deleting state from {store_name}: {key}")

            with self.client as dapr:
                dapr.delete_state(
                    store_name=store_name,
                    key=key,
                )

            logger.info(f"State deleted successfully: {key}")

        except Exception as e:
            logger.error(f"Failed to delete state {key}: {e}", exc_info=True)
            raise

    async def invoke_service(
        self,
        app_id: str,
        method_name: str,
        data: Optional[Dict[str, Any]] = None,
        http_verb: str = "POST",
    ) -> DaprResponse:
        """
        Invoke another service via Dapr service invocation.

        Args:
            app_id: Target service app ID
            method_name: Method/endpoint name
            data: Request data
            http_verb: HTTP verb (GET, POST, etc.)

        Returns:
            DaprResponse
        """
        try:
            logger.info(f"Invoking service {app_id}/{method_name}")

            with self.client as dapr:
                response = dapr.invoke_method(
                    app_id=app_id,
                    method_name=method_name,
                    data=json.dumps(data) if data else None,
                    http_verb=http_verb,
                )

            logger.info(f"Service invocation successful: {app_id}/{method_name}")
            return response

        except Exception as e:
            logger.error(f"Failed to invoke service {app_id}/{method_name}: {e}", exc_info=True)
            raise

    async def get_secret(
        self,
        store_name: str,
        key: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Optional[Dict[str, str]]:
        """
        Get secret from Dapr secret store.

        Args:
            store_name: Name of the secret store component
            key: Secret key
            metadata: Optional metadata

        Returns:
            Secret value dictionary
        """
        try:
            logger.info(f"Getting secret from {store_name}: {key}")

            with self.client as dapr:
                response = dapr.get_secret(
                    store_name=store_name,
                    key=key,
                    metadata=metadata or {},
                )

            logger.info(f"Secret retrieved successfully: {key}")
            return response.secret

        except Exception as e:
            logger.error(f"Failed to get secret {key}: {e}", exc_info=True)
            raise

    async def health_check(self) -> bool:
        """
        Check if Dapr sidecar is healthy.

        Returns:
            True if healthy, False otherwise
        """
        try:
            with self.client as dapr:
                # Try a simple operation to check connectivity
                dapr.get_state(store_name="statestore", key="health-check")
            return True

        except Exception as e:
            logger.error(f"Dapr health check failed: {e}")
            return False


class WorkflowStateManager:
    """
    Manager for storing and retrieving workflow state using Dapr state store.
    """

    def __init__(self, dapr_service: DaprService, store_name: str = "statestore"):
        """
        Initialize workflow state manager.

        Args:
            dapr_service: DaprService instance
            store_name: Name of the state store component
        """
        self.dapr_service = dapr_service
        self.store_name = store_name

    async def save_workflow_state(
        self,
        workflow_id: str,
        state: Dict[str, Any],
    ):
        """
        Save workflow state.

        Args:
            workflow_id: Temporal workflow ID
            state: Workflow state data
        """
        key = f"workflow:{workflow_id}"
        await self.dapr_service.save_state(
            store_name=self.store_name,
            key=key,
            value=state,
        )

    async def get_workflow_state(
        self,
        workflow_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get workflow state.

        Args:
            workflow_id: Temporal workflow ID

        Returns:
            Workflow state or None if not found
        """
        key = f"workflow:{workflow_id}"
        return await self.dapr_service.get_state(
            store_name=self.store_name,
            key=key,
        )

    async def delete_workflow_state(
        self,
        workflow_id: str,
    ):
        """
        Delete workflow state.

        Args:
            workflow_id: Temporal workflow ID
        """
        key = f"workflow:{workflow_id}"
        await self.dapr_service.delete_state(
            store_name=self.store_name,
            key=key,
        )


class EventPublisher:
    """
    Publisher for workflow-related events using Dapr pub/sub.
    """

    def __init__(self, dapr_service: DaprService, pubsub_name: str = "pubsub"):
        """
        Initialize event publisher.

        Args:
            dapr_service: DaprService instance
            pubsub_name: Name of the pub/sub component
        """
        self.dapr_service = dapr_service
        self.pubsub_name = pubsub_name

    async def publish_workflow_started(
        self,
        workflow_id: str,
        customer_id: str,
        policy_type: str,
    ):
        """Publish workflow started event."""
        await self.dapr_service.publish_event(
            pubsub_name=self.pubsub_name,
            topic="policy-workflow-started",
            data={
                "event_type": "WORKFLOW_STARTED",
                "workflow_id": workflow_id,
                "customer_id": customer_id,
                "policy_type": policy_type,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

    async def publish_workflow_completed(
        self,
        workflow_id: str,
        result: Dict[str, Any],
    ):
        """Publish workflow completed event."""
        await self.dapr_service.publish_event(
            pubsub_name=self.pubsub_name,
            topic="policy-workflow-completed",
            data={
                "event_type": "WORKFLOW_COMPLETED",
                "workflow_id": workflow_id,
                "result": result,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

    async def publish_workflow_failed(
        self,
        workflow_id: str,
        error: str,
    ):
        """Publish workflow failed event."""
        await self.dapr_service.publish_event(
            pubsub_name=self.pubsub_name,
            topic="policy-workflow-failed",
            data={
                "event_type": "WORKFLOW_FAILED",
                "workflow_id": workflow_id,
                "error": error,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

"""
FastAPI router for policy issuance webhook endpoints.
"""
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from app.models.policy import (
    PolicyIssuanceWebhookRequest,
    PolicyIssuanceWebhookResponse,
    WorkflowStatusRequest,
    WorkflowStatusResponse,
    ErrorResponse,
)
from app.services.temporal_client import TemporalClientService
from app.services.dapr_service import DaprService, EventPublisher, WorkflowStateManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


# Dependency injection
def get_temporal_client() -> TemporalClientService:
    """Get Temporal client service instance."""
    from app.main import temporal_client
    return temporal_client


def get_dapr_service() -> DaprService:
    """Get Dapr service instance."""
    from app.main import dapr_service
    return dapr_service


@router.post(
    "/policy-issuance",
    response_model=PolicyIssuanceWebhookResponse,
    status_code=202,
    summary="Initiate Policy Issuance Workflow",
    description="Webhook endpoint to initiate a policy issuance workflow via Temporal",
)
async def policy_issuance_webhook(
    request: PolicyIssuanceWebhookRequest,
    background_tasks: BackgroundTasks,
    temporal_client: TemporalClientService = Depends(get_temporal_client),
    dapr_service: DaprService = Depends(get_dapr_service),
):
    """
    Webhook endpoint for policy issuance.

    This endpoint:
    1. Validates the incoming request
    2. Starts a Temporal PolicyIssuanceWorkflow
    3. Publishes a workflow-started event via Dapr
    4. Saves workflow state to Dapr state store
    5. Returns workflow ID and run ID for tracking

    The workflow runs asynchronously - use the workflow ID to query status.
    """
    logger.info(f"Received policy issuance webhook request for customer: {request.customer_id}")

    try:
        # Start Temporal workflow
        workflow_info = await temporal_client.start_policy_issuance_workflow(request)

        workflow_id = workflow_info["workflow_id"]
        run_id = workflow_info["run_id"]
        already_started = workflow_info.get("already_started", False)

        # Publish workflow started event (background task)
        event_publisher = EventPublisher(dapr_service)
        background_tasks.add_task(
            event_publisher.publish_workflow_started,
            workflow_id=workflow_id,
            customer_id=request.customer_id,
            policy_type=request.policy_type.value,
        )

        # Save workflow state (background task)
        state_manager = WorkflowStateManager(dapr_service)
        background_tasks.add_task(
            state_manager.save_workflow_state,
            workflow_id=workflow_id,
            state={
                "customer_id": request.customer_id,
                "policy_type": request.policy_type.value,
                "sum_assured": request.sum_assured,
                "started_at": datetime.utcnow().isoformat(),
                "source": request.source,
                "agent_id": request.agent_id,
                "callback_url": request.callback_url,
            },
        )

        # Prepare response
        response = PolicyIssuanceWebhookResponse(
            success=True,
            workflow_id=workflow_id,
            run_id=run_id,
            message=(
                "Policy issuance workflow already running"
                if already_started
                else "Policy issuance workflow started successfully"
            ),
            estimated_completion_time=workflow_info.get("estimated_completion_time"),
        )

        logger.info(f"Workflow started: {workflow_id}")
        return response

    except Exception as e:
        logger.error(f"Failed to start policy issuance workflow: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="WORKFLOW_START_FAILED",
                message="Failed to start policy issuance workflow",
                details={"reason": str(e)},
            ).dict(),
        )


@router.post(
    "/policy-issuance/status",
    response_model=WorkflowStatusResponse,
    summary="Query Workflow Status",
    description="Query the status of a policy issuance workflow",
)
async def query_workflow_status(
    request: WorkflowStatusRequest,
    temporal_client: TemporalClientService = Depends(get_temporal_client),
):
    """
    Query the status of a policy issuance workflow.

    Returns:
    - Workflow status (RUNNING, COMPLETED, FAILED, etc.)
    - Result if completed
    - Error if failed
    """
    logger.info(f"Querying workflow status: {request.workflow_id}")

    try:
        status_info = await temporal_client.get_workflow_status(request.workflow_id)

        response = WorkflowStatusResponse(
            workflow_id=request.workflow_id,
            status=status_info["status"],
            result=status_info.get("result"),
            error=status_info.get("error"),
            started_at=status_info.get("started_at"),
            completed_at=status_info.get("completed_at"),
        )

        logger.info(f"Workflow status: {request.workflow_id} -> {response.status}")
        return response

    except Exception as e:
        logger.error(f"Failed to query workflow status: {e}", exc_info=True)
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                error="WORKFLOW_NOT_FOUND",
                message=f"Workflow not found: {request.workflow_id}",
                details={"reason": str(e)},
            ).dict(),
        )


@router.post(
    "/policy-issuance/cancel",
    summary="Cancel Workflow",
    description="Cancel a running policy issuance workflow",
)
async def cancel_workflow(
    request: WorkflowStatusRequest,
    temporal_client: TemporalClientService = Depends(get_temporal_client),
):
    """
    Cancel a running policy issuance workflow.

    This will trigger compensating actions in the workflow.
    """
    logger.info(f"Cancelling workflow: {request.workflow_id}")

    try:
        await temporal_client.cancel_workflow(request.workflow_id)

        return {
            "success": True,
            "workflow_id": request.workflow_id,
            "message": "Workflow cancelled successfully",
        }

    except Exception as e:
        logger.error(f"Failed to cancel workflow: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="WORKFLOW_CANCEL_FAILED",
                message=f"Failed to cancel workflow: {request.workflow_id}",
                details={"reason": str(e)},
            ).dict(),
        )


@router.post(
    "/dapr/policy-workflow-completed",
    summary="Dapr Pub/Sub Subscriber - Workflow Completed",
    description="Dapr pub/sub endpoint for workflow completed events",
    include_in_schema=False,  # Internal Dapr endpoint
)
async def handle_workflow_completed_event(
    request: Request,
    dapr_service: DaprService = Depends(get_dapr_service),
):
    """
    Dapr pub/sub subscriber for workflow completed events.

    This endpoint is called by Dapr when a workflow completion event is published.
    It can trigger callbacks, notifications, or other post-processing.
    """
    try:
        event_data = await request.json()
        logger.info(f"Received workflow completed event: {event_data}")

        # Extract event data
        data = event_data.get("data", {})
        workflow_id = data.get("workflow_id")
        result = data.get("result", {})

        # Get workflow state to retrieve callback URL
        state_manager = WorkflowStateManager(dapr_service)
        workflow_state = await state_manager.get_workflow_state(workflow_id)

        if workflow_state and workflow_state.get("callback_url"):
            # Call callback URL (background task would be better)
            callback_url = workflow_state["callback_url"]
            logger.info(f"Calling callback URL: {callback_url}")
            # Implement callback logic here

        logger.info(f"Workflow completed event processed: {workflow_id}")
        return {"success": True}

    except Exception as e:
        logger.error(f"Failed to process workflow completed event: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": str(e)},
        )


@router.post(
    "/dapr/policy-workflow-failed",
    summary="Dapr Pub/Sub Subscriber - Workflow Failed",
    description="Dapr pub/sub endpoint for workflow failed events",
    include_in_schema=False,  # Internal Dapr endpoint
)
async def handle_workflow_failed_event(
    request: Request,
    dapr_service: DaprService = Depends(get_dapr_service),
):
    """
    Dapr pub/sub subscriber for workflow failed events.

    This endpoint is called by Dapr when a workflow failure event is published.
    """
    try:
        event_data = await request.json()
        logger.info(f"Received workflow failed event: {event_data}")

        # Extract event data
        data = event_data.get("data", {})
        workflow_id = data.get("workflow_id")
        error = data.get("error")

        # Get workflow state to retrieve callback URL
        state_manager = WorkflowStateManager(dapr_service)
        workflow_state = await state_manager.get_workflow_state(workflow_id)

        if workflow_state and workflow_state.get("callback_url"):
            # Call callback URL with failure information
            callback_url = workflow_state["callback_url"]
            logger.info(f"Calling callback URL with failure: {callback_url}")
            # Implement callback logic here

        logger.info(f"Workflow failed event processed: {workflow_id}")
        return {"success": True}

    except Exception as e:
        logger.error(f"Failed to process workflow failed event: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": str(e)},
        )

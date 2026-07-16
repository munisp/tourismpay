"""
KEDA External Scaler gRPC Service
Implements KEDA external scaler protocol for Ray Serve
"""
import asyncio
import logging
import os
from typing import Dict, List
from concurrent import futures

import grpc
from grpc import aio

# Import generated protobuf code
import externalscaler_pb2
import externalscaler_pb2_grpc

from ray_serve_metrics import RayServeMetricsCollector

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RayServeExternalScaler(externalscaler_pb2_grpc.ExternalScalerServicer):
    """KEDA External Scaler for Ray Serve"""
    
    def __init__(self, metrics_collector: RayServeMetricsCollector):
        """
        Initialize external scaler
        
        Args:
            metrics_collector: Ray Serve metrics collector instance
        """
        self.metrics_collector = metrics_collector
        self._active_streams: Dict[str, bool] = {}
        
    def _parse_scaler_metadata(self, metadata: Dict[str, str]) -> Dict:
        """Parse scaler metadata from ScaledObject"""
        return {
            'model_names': metadata.get('modelNames', 'fraud-detection,risk-scoring,claims-prediction').split(','),
            'queue_length_threshold': int(metadata.get('queueLengthThreshold', '20')),
            'latency_p95_threshold': float(metadata.get('latencyP95Threshold', '500')),
            'metric_type': metadata.get('metricType', 'queue'),  # 'queue' or 'latency'
        }
        
    async def IsActive(
        self,
        request: externalscaler_pb2.ScaledObjectRef,
        context: grpc.aio.ServicerContext
    ) -> externalscaler_pb2.IsActiveResponse:
        """
        Check if scaler should be active
        Called by KEDA to determine if scaling should occur
        """
        try:
            config = self._parse_scaler_metadata(dict(request.scalerMetadata))
            model_names = config['model_names']
            metric_type = config['metric_type']
            
            logger.info(f"IsActive check for {request.name} (metric_type={metric_type})")
            
            # Check based on metric type
            if metric_type == 'queue':
                queue_length = await self.metrics_collector.get_combined_queue_length(model_names)
                is_active = queue_length > 0
                logger.info(f"Queue length: {queue_length}, active: {is_active}")
                
            elif metric_type == 'latency':
                max_latency = await self.metrics_collector.get_max_latency_p95(model_names)
                threshold = config['latency_p95_threshold']
                is_active = max_latency > threshold
                logger.info(f"Max p95 latency: {max_latency}ms, threshold: {threshold}ms, active: {is_active}")
                
            else:
                # Default: active if any queue or high latency
                queue_length = await self.metrics_collector.get_combined_queue_length(model_names)
                max_latency = await self.metrics_collector.get_max_latency_p95(model_names)
                is_active = queue_length > 0 or max_latency > config['latency_p95_threshold']
                logger.info(f"Combined check - queue: {queue_length}, latency: {max_latency}ms, active: {is_active}")
                
            return externalscaler_pb2.IsActiveResponse(result=is_active)
            
        except Exception as e:
            logger.error(f"Error in IsActive: {e}", exc_info=True)
            # Default to active on error to avoid scaling to zero unexpectedly
            return externalscaler_pb2.IsActiveResponse(result=True)
            
    async def StreamIsActive(
        self,
        request: externalscaler_pb2.ScaledObjectRef,
        context: grpc.aio.ServicerContext
    ):
        """
        Stream active status to KEDA
        More efficient than polling IsActive
        """
        stream_id = f"{request.namespace}/{request.name}"
        self._active_streams[stream_id] = True
        
        logger.info(f"Started StreamIsActive for {stream_id}")
        
        try:
            config = self._parse_scaler_metadata(dict(request.scalerMetadata))
            
            while self._active_streams.get(stream_id, False):
                # Check active status
                is_active_response = await self.IsActive(request, context)
                
                # Yield response
                yield is_active_response
                
                # Wait before next check (KEDA recommends 5-10 seconds)
                await asyncio.sleep(5)
                
        except asyncio.CancelledError:
            logger.info(f"StreamIsActive cancelled for {stream_id}")
        except Exception as e:
            logger.error(f"Error in StreamIsActive: {e}", exc_info=True)
        finally:
            self._active_streams.pop(stream_id, None)
            logger.info(f"Stopped StreamIsActive for {stream_id}")
            
    async def GetMetricSpec(
        self,
        request: externalscaler_pb2.ScaledObjectRef,
        context: grpc.aio.ServicerContext
    ) -> externalscaler_pb2.GetMetricSpecResponse:
        """
        Return metric specifications for KEDA
        Defines what metrics are available and their target values
        """
        try:
            config = self._parse_scaler_metadata(dict(request.scalerMetadata))
            metric_type = config['metric_type']
            
            metric_specs = []
            
            if metric_type == 'queue' or metric_type == 'combined':
                # Queue length metric
                metric_specs.append(
                    externalscaler_pb2.MetricSpec(
                        metricName=f"ray-serve-queue-length",
                        targetSize=config['queue_length_threshold']
                    )
                )
                
            if metric_type == 'latency' or metric_type == 'combined':
                # Latency metric (in milliseconds)
                metric_specs.append(
                    externalscaler_pb2.MetricSpec(
                        metricName=f"ray-serve-latency-p95",
                        targetSize=int(config['latency_p95_threshold'])
                    )
                )
                
            logger.info(f"GetMetricSpec for {request.name}: {len(metric_specs)} metrics")
            
            return externalscaler_pb2.GetMetricSpecResponse(metricSpecs=metric_specs)
            
        except Exception as e:
            logger.error(f"Error in GetMetricSpec: {e}", exc_info=True)
            # Return empty spec on error
            return externalscaler_pb2.GetMetricSpecResponse(metricSpecs=[])
            
    async def GetMetrics(
        self,
        request: externalscaler_pb2.GetMetricsRequest,
        context: grpc.aio.ServicerContext
    ) -> externalscaler_pb2.GetMetricsResponse:
        """
        Return current metric values for KEDA
        Called by KEDA to get actual metric values for scaling decisions
        """
        try:
            config = self._parse_scaler_metadata(dict(request.scaledObjectRef.scalerMetadata))
            model_names = config['model_names']
            metric_name = request.metricName
            
            logger.info(f"GetMetrics for {metric_name}")
            
            metric_values = []
            
            if 'queue-length' in metric_name:
                # Get queue length metric
                queue_length = await self.metrics_collector.get_combined_queue_length(model_names)
                
                metric_values.append(
                    externalscaler_pb2.MetricValue(
                        metricName=metric_name,
                        metricValue=queue_length
                    )
                )
                
                logger.info(f"Queue length metric: {queue_length}")
                
            elif 'latency-p95' in metric_name:
                # Get latency metric
                max_latency = await self.metrics_collector.get_max_latency_p95(model_names)
                
                metric_values.append(
                    externalscaler_pb2.MetricValue(
                        metricName=metric_name,
                        metricValue=int(max_latency)
                    )
                )
                
                logger.info(f"Latency p95 metric: {max_latency}ms")
                
            return externalscaler_pb2.GetMetricsResponse(metricValues=metric_values)
            
        except Exception as e:
            logger.error(f"Error in GetMetrics: {e}", exc_info=True)
            # Return zero value on error to avoid unexpected scaling
            return externalscaler_pb2.GetMetricsResponse(
                metricValues=[
                    externalscaler_pb2.MetricValue(
                        metricName=request.metricName,
                        metricValue=0
                    )
                ]
            )


async def serve():
    """Start gRPC server"""
    # Configuration from environment
    ray_serve_url = os.getenv('RAY_SERVE_URL', 'http://ray-serve-service:8000')
    prometheus_url = os.getenv('PROMETHEUS_URL', 'http://prometheus:9090')
    grpc_port = int(os.getenv('GRPC_PORT', '50051'))
    scrape_interval = int(os.getenv('SCRAPE_INTERVAL', '10'))
    
    # Initialize metrics collector
    metrics_collector = RayServeMetricsCollector(
        ray_serve_url=ray_serve_url,
        prometheus_url=prometheus_url,
        scrape_interval=scrape_interval
    )
    
    await metrics_collector.start()
    
    # Create gRPC server
    server = aio.server(
        futures.ThreadPoolExecutor(max_workers=10),
        options=[
            ('grpc.max_send_message_length', 50 * 1024 * 1024),
            ('grpc.max_receive_message_length', 50 * 1024 * 1024),
        ]
    )
    
    # Add scaler service
    externalscaler_pb2_grpc.add_ExternalScalerServicer_to_server(
        RayServeExternalScaler(metrics_collector),
        server
    )
    
    # Start server
    server.add_insecure_port(f'[::]:{grpc_port}')
    await server.start()
    
    logger.info(f"KEDA External Scaler started on port {grpc_port}")
    logger.info(f"Ray Serve URL: {ray_serve_url}")
    logger.info(f"Prometheus URL: {prometheus_url}")
    
    try:
        await server.wait_for_termination()
    finally:
        await metrics_collector.stop()
        await server.stop(grace=5)


if __name__ == '__main__':
    asyncio.run(serve())

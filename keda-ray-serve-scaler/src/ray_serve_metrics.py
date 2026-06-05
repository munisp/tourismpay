"""
Ray Serve Metrics Collector
Collects queue length and latency metrics from Ray Serve
"""
import asyncio
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta
import aiohttp
import numpy as np
from prometheus_client.parser import text_string_to_metric_families

logger = logging.getLogger(__name__)


@dataclass
class QueueMetrics:
    """Queue metrics for a specific model"""
    model_name: str
    queue_length: int
    pending_requests: int
    timestamp: datetime


@dataclass
class LatencyMetrics:
    """Latency metrics for a specific model"""
    model_name: str
    p50_ms: float
    p95_ms: float
    p99_ms: float
    avg_ms: float
    timestamp: datetime


class RayServeMetricsCollector:
    """Collects metrics from Ray Serve for KEDA scaling decisions"""
    
    def __init__(
        self,
        ray_serve_url: str,
        prometheus_url: Optional[str] = None,
        scrape_interval: int = 10,
        latency_window: int = 60
    ):
        """
        Initialize metrics collector
        
        Args:
            ray_serve_url: Ray Serve API endpoint (e.g., http://ray-serve:8000)
            prometheus_url: Prometheus endpoint for metrics (optional)
            scrape_interval: Metrics scrape interval in seconds
            latency_window: Window for latency calculations in seconds
        """
        self.ray_serve_url = ray_serve_url.rstrip('/')
        self.prometheus_url = prometheus_url.rstrip('/') if prometheus_url else None
        self.scrape_interval = scrape_interval
        self.latency_window = latency_window
        
        # Metrics cache
        self._queue_metrics: Dict[str, QueueMetrics] = {}
        self._latency_metrics: Dict[str, LatencyMetrics] = {}
        self._latency_history: Dict[str, List[float]] = {}
        
        # HTTP session
        self._session: Optional[aiohttp.ClientSession] = None
        
    async def start(self):
        """Start metrics collection"""
        self._session = aiohttp.ClientSession()
        logger.info(f"Started Ray Serve metrics collector (scrape_interval={self.scrape_interval}s)")
        
    async def stop(self):
        """Stop metrics collection"""
        if self._session:
            await self._session.close()
        logger.info("Stopped Ray Serve metrics collector")
        
    async def get_queue_metrics(self, model_name: str) -> Optional[QueueMetrics]:
        """
        Get queue metrics for a specific model
        
        Args:
            model_name: Name of the model deployment
            
        Returns:
            QueueMetrics or None if unavailable
        """
        try:
            # Try Ray Serve API first
            url = f"{self.ray_serve_url}/api/serve/deployments/{model_name}"
            async with self._session.get(url, timeout=5) as response:
                if response.status == 200:
                    data = await response.json()
                    queue_length = data.get('queue_length', 0)
                    pending_requests = data.get('num_pending_requests', 0)
                    
                    metrics = QueueMetrics(
                        model_name=model_name,
                        queue_length=queue_length,
                        pending_requests=pending_requests,
                        timestamp=datetime.utcnow()
                    )
                    
                    self._queue_metrics[model_name] = metrics
                    return metrics
                    
        except Exception as e:
            logger.warning(f"Failed to get queue metrics from Ray Serve API: {e}")
            
        # Fallback to Prometheus if available
        if self.prometheus_url:
            try:
                return await self._get_queue_metrics_from_prometheus(model_name)
            except Exception as e:
                logger.warning(f"Failed to get queue metrics from Prometheus: {e}")
                
        # Return cached metrics if available
        return self._queue_metrics.get(model_name)
        
    async def _get_queue_metrics_from_prometheus(self, model_name: str) -> Optional[QueueMetrics]:
        """Get queue metrics from Prometheus"""
        query = f'ray_serve_deployment_queued_queries{{deployment="{model_name}"}}'
        url = f"{self.prometheus_url}/api/v1/query"
        
        async with self._session.get(url, params={'query': query}, timeout=5) as response:
            if response.status == 200:
                data = await response.json()
                if data['status'] == 'success' and data['data']['result']:
                    queue_length = int(float(data['data']['result'][0]['value'][1]))
                    
                    return QueueMetrics(
                        model_name=model_name,
                        queue_length=queue_length,
                        pending_requests=queue_length,  # Approximate
                        timestamp=datetime.utcnow()
                    )
        return None
        
    async def get_latency_metrics(self, model_name: str) -> Optional[LatencyMetrics]:
        """
        Get latency metrics for a specific model
        
        Args:
            model_name: Name of the model deployment
            
        Returns:
            LatencyMetrics or None if unavailable
        """
        try:
            # Get metrics from Ray Serve metrics endpoint
            url = f"{self.ray_serve_url}/metrics"
            async with self._session.get(url, timeout=5) as response:
                if response.status == 200:
                    metrics_text = await response.text()
                    return self._parse_latency_metrics(metrics_text, model_name)
                    
        except Exception as e:
            logger.warning(f"Failed to get latency metrics from Ray Serve: {e}")
            
        # Fallback to Prometheus
        if self.prometheus_url:
            try:
                return await self._get_latency_metrics_from_prometheus(model_name)
            except Exception as e:
                logger.warning(f"Failed to get latency metrics from Prometheus: {e}")
                
        # Return cached metrics if available
        return self._latency_metrics.get(model_name)
        
    def _parse_latency_metrics(self, metrics_text: str, model_name: str) -> Optional[LatencyMetrics]:
        """Parse latency metrics from Prometheus text format"""
        latencies = []
        
        for family in text_string_to_metric_families(metrics_text):
            if family.name == 'ray_serve_deployment_processing_latency_ms':
                for sample in family.samples:
                    if sample.labels.get('deployment') == model_name:
                        latencies.append(sample.value)
                        
        if not latencies:
            return None
            
        # Calculate percentiles
        latencies_array = np.array(latencies)
        
        metrics = LatencyMetrics(
            model_name=model_name,
            p50_ms=float(np.percentile(latencies_array, 50)),
            p95_ms=float(np.percentile(latencies_array, 95)),
            p99_ms=float(np.percentile(latencies_array, 99)),
            avg_ms=float(np.mean(latencies_array)),
            timestamp=datetime.utcnow()
        )
        
        self._latency_metrics[model_name] = metrics
        return metrics
        
    async def _get_latency_metrics_from_prometheus(self, model_name: str) -> Optional[LatencyMetrics]:
        """Get latency metrics from Prometheus with histogram queries"""
        # Query for p50, p95, p99
        queries = {
            'p50': f'histogram_quantile(0.50, rate(ray_serve_deployment_processing_latency_ms_bucket{{deployment="{model_name}"}}[{self.latency_window}s]))',
            'p95': f'histogram_quantile(0.95, rate(ray_serve_deployment_processing_latency_ms_bucket{{deployment="{model_name}"}}[{self.latency_window}s]))',
            'p99': f'histogram_quantile(0.99, rate(ray_serve_deployment_processing_latency_ms_bucket{{deployment="{model_name}"}}[{self.latency_window}s]))',
            'avg': f'rate(ray_serve_deployment_processing_latency_ms_sum{{deployment="{model_name}"}}[{self.latency_window}s]) / rate(ray_serve_deployment_processing_latency_ms_count{{deployment="{model_name}"}}[{self.latency_window}s])'
        }
        
        results = {}
        for key, query in queries.items():
            url = f"{self.prometheus_url}/api/v1/query"
            async with self._session.get(url, params={'query': query}, timeout=5) as response:
                if response.status == 200:
                    data = await response.json()
                    if data['status'] == 'success' and data['data']['result']:
                        results[key] = float(data['data']['result'][0]['value'][1])
                        
        if len(results) >= 3:
            return LatencyMetrics(
                model_name=model_name,
                p50_ms=results.get('p50', 0),
                p95_ms=results.get('p95', 0),
                p99_ms=results.get('p99', 0),
                avg_ms=results.get('avg', 0),
                timestamp=datetime.utcnow()
            )
            
        return None
        
    async def get_combined_queue_length(self, model_names: List[str]) -> int:
        """
        Get combined queue length across multiple models
        
        Args:
            model_names: List of model deployment names
            
        Returns:
            Total queue length across all models
        """
        total_queue = 0
        
        for model_name in model_names:
            metrics = await self.get_queue_metrics(model_name)
            if metrics:
                total_queue += metrics.queue_length
                
        return total_queue
        
    async def get_max_latency_p95(self, model_names: List[str]) -> float:
        """
        Get maximum p95 latency across multiple models
        
        Args:
            model_names: List of model deployment names
            
        Returns:
            Maximum p95 latency in milliseconds
        """
        max_latency = 0.0
        
        for model_name in model_names:
            metrics = await self.get_latency_metrics(model_name)
            if metrics:
                max_latency = max(max_latency, metrics.p95_ms)
                
        return max_latency
        
    def is_metrics_stale(self, model_name: str, max_age_seconds: int = 60) -> bool:
        """Check if cached metrics are stale"""
        queue_metrics = self._queue_metrics.get(model_name)
        latency_metrics = self._latency_metrics.get(model_name)
        
        now = datetime.utcnow()
        
        if queue_metrics and (now - queue_metrics.timestamp).total_seconds() > max_age_seconds:
            return True
            
        if latency_metrics and (now - latency_metrics.timestamp).total_seconds() > max_age_seconds:
            return True
            
        return False

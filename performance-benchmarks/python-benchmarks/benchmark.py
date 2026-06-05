"""
Python benchmark suite for Temporal-TigerBeetle integration.
Mirrors the Go benchmark suite for fair comparison.
"""

import asyncio
import time
import statistics
import uuid
from dataclasses import dataclass
from typing import List, Tuple
import tracemalloc
import sys
sys.path.append('../python-implementation')

from temporal_tigerbeetle_integration import (
    TigerBeetleClient,
    TransferRequest,
    PaymentWorkflowInput,
)


@dataclass
class BenchmarkMetrics:
    total_operations: int
    successful_ops: int
    failed_ops: int
    total_duration: float
    min_latency: float
    max_latency: float
    avg_latency: float
    p50_latency: float
    p95_latency: float
    p99_latency: float
    throughput: float
    memory_allocated: int
    memory_used: int


async def benchmark_create_account(n: int) -> BenchmarkMetrics:
    """Benchmark account creation."""
    client = TigerBeetleClient(cluster_id=0, addresses=["localhost:3000"])
    
    latencies = []
    success_count = 0
    fail_count = 0
    
    tracemalloc.start()
    start_time = time.time()
    
    for i in range(n):
        account_id = str(uuid.uuid4())
        
        op_start = time.time()
        try:
            await client.create_account(account_id, ledger=1, code=1)
            success_count += 1
        except Exception as e:
            fail_count += 1
        op_end = time.time()
        
        latencies.append(op_end - op_start)
    
    end_time = time.time()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    total_duration = end_time - start_time
    
    return BenchmarkMetrics(
        total_operations=n,
        successful_ops=success_count,
        failed_ops=fail_count,
        total_duration=total_duration,
        min_latency=min(latencies) if latencies else 0,
        max_latency=max(latencies) if latencies else 0,
        avg_latency=statistics.mean(latencies) if latencies else 0,
        p50_latency=statistics.median(latencies) if latencies else 0,
        p95_latency=statistics.quantiles(latencies, n=20)[18] if len(latencies) > 20 else 0,
        p99_latency=statistics.quantiles(latencies, n=100)[98] if len(latencies) > 100 else 0,
        throughput=n / total_duration if total_duration > 0 else 0,
        memory_allocated=peak,
        memory_used=current,
    )


async def benchmark_create_transfer(n: int) -> BenchmarkMetrics:
    """Benchmark transfer creation."""
    client = TigerBeetleClient(cluster_id=0, addresses=["localhost:3000"])
    
    # Setup accounts
    debit_account = str(uuid.uuid4())
    credit_account = str(uuid.uuid4())
    
    await client.create_account(debit_account, ledger=1, code=1)
    await client.create_account(credit_account, ledger=1, code=2)
    
    latencies = []
    success_count = 0
    fail_count = 0
    
    tracemalloc.start()
    start_time = time.time()
    
    for i in range(n):
        transfer_id = f"{uuid.uuid4()}-{i}"
        req = TransferRequest(
            transfer_id=transfer_id,
            debit_account_id=debit_account,
            credit_account_id=credit_account,
            amount=1000,
            ledger=1,
            code=1,
            is_pending=False,
        )
        
        op_start = time.time()
        try:
            result = await client.create_transfer(req)
            if result.status != "failed":
                success_count += 1
            else:
                fail_count += 1
        except Exception as e:
            fail_count += 1
        op_end = time.time()
        
        latencies.append(op_end - op_start)
    
    end_time = time.time()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    total_duration = end_time - start_time
    
    return BenchmarkMetrics(
        total_operations=n,
        successful_ops=success_count,
        failed_ops=fail_count,
        total_duration=total_duration,
        min_latency=min(latencies) if latencies else 0,
        max_latency=max(latencies) if latencies else 0,
        avg_latency=statistics.mean(latencies) if latencies else 0,
        p50_latency=statistics.median(latencies) if latencies else 0,
        p95_latency=statistics.quantiles(latencies, n=20)[18] if len(latencies) > 20 else 0,
        p99_latency=statistics.quantiles(latencies, n=100)[98] if len(latencies) > 100 else 0,
        throughput=n / total_duration if total_duration > 0 else 0,
        memory_allocated=peak,
        memory_used=current,
    )


async def benchmark_pending_transfer_workflow(n: int) -> BenchmarkMetrics:
    """Benchmark pending transfer workflow (create pending + post)."""
    client = TigerBeetleClient(cluster_id=0, addresses=["localhost:3000"])
    
    # Setup accounts
    debit_account = str(uuid.uuid4())
    credit_account = str(uuid.uuid4())
    
    await client.create_account(debit_account, ledger=1, code=1)
    await client.create_account(credit_account, ledger=1, code=2)
    
    latencies = []
    success_count = 0
    fail_count = 0
    
    tracemalloc.start()
    start_time = time.time()
    
    for i in range(n):
        pending_id = f"PENDING-{uuid.uuid4()}-{i}"
        
        op_start = time.time()
        try:
            # Create pending transfer
            pending_req = TransferRequest(
                transfer_id=pending_id,
                debit_account_id=debit_account,
                credit_account_id=credit_account,
                amount=1000,
                ledger=1,
                code=1,
                is_pending=True,
                timeout=3600,
            )
            
            pending_result = await client.create_transfer(pending_req)
            
            if pending_result.status == "pending":
                # Post pending transfer
                post_id = f"POST-{pending_id}"
                post_result = await client.post_pending_transfer(
                    post_id, pending_id, ledger=1, code=1
                )
                
                if post_result.status == "committed":
                    success_count += 1
                else:
                    fail_count += 1
            else:
                fail_count += 1
                
        except Exception as e:
            fail_count += 1
        
        op_end = time.time()
        latencies.append(op_end - op_start)
    
    end_time = time.time()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    total_duration = end_time - start_time
    
    return BenchmarkMetrics(
        total_operations=n,
        successful_ops=success_count,
        failed_ops=fail_count,
        total_duration=total_duration,
        min_latency=min(latencies) if latencies else 0,
        max_latency=max(latencies) if latencies else 0,
        avg_latency=statistics.mean(latencies) if latencies else 0,
        p50_latency=statistics.median(latencies) if latencies else 0,
        p95_latency=statistics.quantiles(latencies, n=20)[18] if len(latencies) > 20 else 0,
        p99_latency=statistics.quantiles(latencies, n=100)[98] if len(latencies) > 100 else 0,
        throughput=n / total_duration if total_duration > 0 else 0,
        memory_allocated=peak,
        memory_used=current,
    )


async def benchmark_concurrent_workflows(n: int, concurrency: int) -> BenchmarkMetrics:
    """Benchmark concurrent workflow execution."""
    client = TigerBeetleClient(cluster_id=0, addresses=["localhost:3000"])
    
    # Setup accounts
    debit_account = str(uuid.uuid4())
    credit_account = str(uuid.uuid4())
    
    await client.create_account(debit_account, ledger=1, code=1)
    await client.create_account(credit_account, ledger=1, code=2)
    
    latencies = []
    success_count = 0
    fail_count = 0
    
    tracemalloc.start()
    start_time = time.time()
    
    async def execute_transfer(idx: int):
        nonlocal success_count, fail_count
        
        transfer_id = f"TXN-{concurrency}-{idx}"
        req = TransferRequest(
            transfer_id=transfer_id,
            debit_account_id=debit_account,
            credit_account_id=credit_account,
            amount=1000,
            ledger=1,
            code=1,
            is_pending=False,
        )
        
        op_start = time.time()
        try:
            result = await client.create_transfer(req)
            if result.status != "failed":
                success_count += 1
            else:
                fail_count += 1
        except Exception as e:
            fail_count += 1
        op_end = time.time()
        
        return op_end - op_start
    
    # Execute in batches
    for batch_start in range(0, n, concurrency):
        batch_end = min(batch_start + concurrency, n)
        tasks = [execute_transfer(i) for i in range(batch_start, batch_end)]
        batch_latencies = await asyncio.gather(*tasks)
        latencies.extend(batch_latencies)
    
    end_time = time.time()
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    
    total_duration = end_time - start_time
    
    return BenchmarkMetrics(
        total_operations=n,
        successful_ops=success_count,
        failed_ops=fail_count,
        total_duration=total_duration,
        min_latency=min(latencies) if latencies else 0,
        max_latency=max(latencies) if latencies else 0,
        avg_latency=statistics.mean(latencies) if latencies else 0,
        p50_latency=statistics.median(latencies) if latencies else 0,
        p95_latency=statistics.quantiles(latencies, n=20)[18] if len(latencies) > 20 else 0,
        p99_latency=statistics.quantiles(latencies, n=100)[98] if len(latencies) > 100 else 0,
        throughput=n / total_duration if total_duration > 0 else 0,
        memory_allocated=peak,
        memory_used=current,
    )


def print_metrics(name: str, metrics: BenchmarkMetrics):
    """Print benchmark metrics in a formatted way."""
    print(f"\n{'='*60}")
    print(f"Benchmark: {name}")
    print(f"{'='*60}")
    print(f"Total Operations:     {metrics.total_operations}")
    print(f"Successful Ops:       {metrics.successful_ops}")
    print(f"Failed Ops:           {metrics.failed_ops}")
    print(f"Success Rate:         {metrics.successful_ops/metrics.total_operations*100:.2f}%")
    print(f"Total Duration:       {metrics.total_duration:.4f}s")
    print(f"Throughput:           {metrics.throughput:.2f} ops/sec")
    print(f"\nLatency Statistics:")
    print(f"  Min:                {metrics.min_latency*1000:.2f}ms")
    print(f"  Avg:                {metrics.avg_latency*1000:.2f}ms")
    print(f"  Max:                {metrics.max_latency*1000:.2f}ms")
    print(f"  P50:                {metrics.p50_latency*1000:.2f}ms")
    print(f"  P95:                {metrics.p95_latency*1000:.2f}ms")
    print(f"  P99:                {metrics.p99_latency*1000:.2f}ms")
    print(f"\nMemory Usage:")
    print(f"  Allocated:          {metrics.memory_allocated/1024/1024:.2f}MB")
    print(f"  Used:               {metrics.memory_used/1024/1024:.2f}MB")
    print(f"{'='*60}\n")


async def run_all_benchmarks():
    """Run all benchmark suites."""
    print("Starting Python Benchmark Suite for Temporal-TigerBeetle Integration")
    print("="*60)
    
    # Benchmark 1: Create Account
    print("\n[1/5] Running Create Account Benchmark...")
    metrics1 = await benchmark_create_account(1000)
    print_metrics("Create Account (n=1000)", metrics1)
    
    # Benchmark 2: Create Transfer
    print("\n[2/5] Running Create Transfer Benchmark...")
    metrics2 = await benchmark_create_transfer(1000)
    print_metrics("Create Transfer (n=1000)", metrics2)
    
    # Benchmark 3: Pending Transfer Workflow
    print("\n[3/5] Running Pending Transfer Workflow Benchmark...")
    metrics3 = await benchmark_pending_transfer_workflow(500)
    print_metrics("Pending Transfer Workflow (n=500)", metrics3)
    
    # Benchmark 4: Concurrent Workflows (different concurrency levels)
    concurrency_levels = [10, 50, 100, 500]
    for concurrency in concurrency_levels:
        print(f"\n[4/5] Running Concurrent Workflows Benchmark (concurrency={concurrency})...")
        metrics4 = await benchmark_concurrent_workflows(1000, concurrency)
        print_metrics(f"Concurrent Workflows (n=1000, c={concurrency})", metrics4)
    
    # Benchmark 5: High Throughput Test
    print("\n[5/5] Running High Throughput Benchmark...")
    metrics5 = await benchmark_create_transfer(10000)
    print_metrics("High Throughput Test (n=10000)", metrics5)
    
    print("\nAll benchmarks completed!")


if __name__ == "__main__":
    asyncio.run(run_all_benchmarks())

"""
Unified Python Services Launcher — runs all Python services in one process
using separate ASGI/HTTP threads:
  - Port 8001: ML Services (fraud, BIS, compliance, FX, PDF)
  - Port 8120: OpenSearch Analytics
  - Port 8121: Lakehouse Analytics
  - Port 8200: ML Inference Server
"""
import os
import sys
import threading
import time
import importlib.util

def run_service(module_path: str, port: int, name: str):
    """Import and run a Python service module."""
    try:
        spec = importlib.util.spec_from_file_location(name, module_path)
        if spec and spec.loader:
            os.environ["PORT"] = str(port)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
    except Exception as e:
        print(f"[{name}] Failed to start on port {port}: {e}", file=sys.stderr)

def main():
    services = [
        ("python-services/main.py", 8001, "ml-services"),
        ("python-services/opensearch-analytics/main.py", 8120, "opensearch-analytics"),
        ("python-services/lakehouse-analytics/main.py", 8121, "lakehouse-analytics"),
    ]

    # Check if ML inference server exists
    if os.path.exists("ml/inference/serve.py"):
        services.append(("ml/inference/serve.py", 8200, "ml-inference"))

    threads = []
    for path, port, name in services:
        if os.path.exists(path):
            t = threading.Thread(target=run_service, args=(path, port, name), daemon=True, name=name)
            t.start()
            threads.append(t)
            print(f"[unified] Started {name} on port {port}")
        else:
            print(f"[unified] Skipping {name} — {path} not found")

    print(f"[unified] {len(threads)} Python services running")

    # Keep main thread alive
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("[unified] Shutting down...")

if __name__ == "__main__":
    main()

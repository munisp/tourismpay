#!/bin/bash
# Start all 5 Python ML services on their respective ports
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

stop_existing() {
  for PORT in 8001 8002 8003 8004 8005; do
    PID=$(lsof -ti:$PORT 2>/dev/null) || true
    if [ -n "$PID" ]; then
      echo "Stopping existing process on port $PORT (PID $PID)"
      kill -9 "$PID" 2>/dev/null || true
    fi
  done
  sleep 1
}

start_service() {
  local PORT=$1
  local NAME=$2
  echo "Starting $NAME on port $PORT..."
  PORT=$PORT SERVICE_NAME=$NAME python3.11 "$SCRIPT_DIR/main.py" \
    > "$LOG_DIR/${NAME}.log" 2>&1 &
  echo $! > "$LOG_DIR/${NAME}.pid"
  echo "  PID: $!"
}

echo "=== TourismPay Python ML Services ==="
stop_existing

start_service 8001 "bis-ai-engine"
start_service 8002 "fraud-ml-service"
start_service 8003 "compliance-risk-engine"
start_service 8004 "exchange-rate-ml"
start_service 8005 "pdf-report-generator"

echo ""
echo "Waiting for services to start..."
sleep 3

echo ""
echo "=== Health Checks ==="
for PORT in 8001 8002 8003 8004 8005; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health" 2>/dev/null)
  if [ "$STATUS" = "200" ]; then
    echo "  ✓ Port $PORT — OK"
  else
    echo "  ✗ Port $PORT — HTTP $STATUS"
  fi
done

echo ""
echo "All services started. Logs in: $LOG_DIR"

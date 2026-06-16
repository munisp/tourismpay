// Package lifecycle manages graceful shutdown, panic recovery, health probes,
// and Prometheus metrics for the Go settlement service.
//
// On SIGTERM/SIGINT (sent by K8s during pod termination):
//  1. Mark readiness probe as NOT READY → K8s removes pod from Service endpoints
//  2. Wait for in-flight requests to drain (configurable timeout)
//  3. Close database connections, Kafka producers, Redis clients
//  4. Emit shutdown metric to Prometheus
//  5. Exit 0
//
// Panic recovery middleware catches panics in HTTP handlers, logs the stack
// trace, increments the panic counter, and returns 500 instead of crashing.
package lifecycle

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Health State ─────────────────────────────────────────────────────────────

var (
	ready        atomic.Bool
	alive        atomic.Bool
	startTime    = time.Now()
	shutdownOnce sync.Once
	// Tracks in-flight request count for graceful drain
	inFlightRequests atomic.Int64
)

func init() {
	alive.Store(true)
	ready.Store(false) // not ready until explicitly set
}

// SetReady marks the service as ready to receive traffic.
func SetReady() { ready.Store(true) }

// SetNotReady marks the service as not ready (during shutdown or dependency failure).
func SetNotReady() { ready.Store(false) }

// IsReady returns current readiness state.
func IsReady() bool { return ready.Load() }

// ─── Prometheus Metrics ───────────────────────────────────────────────────────

type counterVec struct {
	mu     sync.Mutex
	values map[string]int64
}

func newCounterVec() *counterVec {
	return &counterVec{values: make(map[string]int64)}
}

func (c *counterVec) Inc(labels ...string) {
	key := strings.Join(labels, "|")
	c.mu.Lock()
	c.values[key]++
	c.mu.Unlock()
}

type histogramVec struct {
	mu           sync.Mutex
	observations map[string][]float64
}

func newHistogramVec() *histogramVec {
	return &histogramVec{observations: make(map[string][]float64)}
}

func (h *histogramVec) Observe(value float64, labels ...string) {
	key := strings.Join(labels, "|")
	h.mu.Lock()
	h.observations[key] = append(h.observations[key], value)
	h.mu.Unlock()
}

var (
	httpRequestsTotal    = newCounterVec()
	httpRequestDuration  = newHistogramVec()
	panicRecoveryTotal   = newCounterVec()
	shutdownsTotal       = newCounterVec()
	dbConnectionGauge    atomic.Int64
	kafkaProducerGauge   atomic.Int64
	activeRequestsGauge  atomic.Int64
	serviceName          string
)

func init() {
	serviceName = os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "settlement-service"
	}
}

// ─── Health Probe Handlers ────────────────────────────────────────────────────

// LivezHandler responds to liveness probes. Returns 200 as long as the process
// is not deadlocked. K8s restarts the pod if this fails.
func LivezHandler(c *gin.Context) {
	if !alive.Load() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "dead"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":         "alive",
		"uptime_seconds": int(time.Since(startTime).Seconds()),
		"goroutines":     runtime.NumGoroutine(),
	})
}

// ReadyzHandler responds to readiness probes. Returns 503 during startup or
// shutdown so K8s stops sending traffic to this pod.
func ReadyzHandler(c *gin.Context) {
	if !ready.Load() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":  "not_ready",
			"reason":  "service is starting up or shutting down",
			"in_flight": inFlightRequests.Load(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":    "ready",
		"in_flight": inFlightRequests.Load(),
	})
}

// MetricsHandler serves Prometheus-format metrics at /metrics.
func MetricsHandler(c *gin.Context) {
	var sb strings.Builder

	// System metrics
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	sb.WriteString("# HELP go_goroutines Number of goroutines\n")
	sb.WriteString("# TYPE go_goroutines gauge\n")
	sb.WriteString(fmt.Sprintf("go_goroutines %d\n", runtime.NumGoroutine()))

	sb.WriteString("# HELP go_heap_alloc_bytes Go heap allocation\n")
	sb.WriteString("# TYPE go_heap_alloc_bytes gauge\n")
	sb.WriteString(fmt.Sprintf("go_heap_alloc_bytes %d\n", memStats.HeapAlloc))

	sb.WriteString("# HELP go_gc_pause_seconds GC pause duration\n")
	sb.WriteString("# TYPE go_gc_pause_seconds gauge\n")
	sb.WriteString(fmt.Sprintf("go_gc_pause_seconds %f\n", float64(memStats.PauseNs[(memStats.NumGC+255)%256])/1e9))

	sb.WriteString("# HELP process_uptime_seconds Process uptime\n")
	sb.WriteString("# TYPE process_uptime_seconds gauge\n")
	sb.WriteString(fmt.Sprintf("process_uptime_seconds %f\n", time.Since(startTime).Seconds()))

	// Business metrics
	sb.WriteString("# HELP settlement_active_requests Currently in-flight requests\n")
	sb.WriteString("# TYPE settlement_active_requests gauge\n")
	sb.WriteString(fmt.Sprintf("settlement_active_requests %d\n", activeRequestsGauge.Load()))

	sb.WriteString("# HELP settlement_db_connections Active database connections\n")
	sb.WriteString("# TYPE settlement_db_connections gauge\n")
	sb.WriteString(fmt.Sprintf("settlement_db_connections %d\n", dbConnectionGauge.Load()))

	// HTTP request counters
	sb.WriteString("# HELP settlement_http_requests_total Total HTTP requests\n")
	sb.WriteString("# TYPE settlement_http_requests_total counter\n")
	httpRequestsTotal.mu.Lock()
	for key, val := range httpRequestsTotal.values {
		parts := strings.SplitN(key, "|", 3)
		if len(parts) == 3 {
			sb.WriteString(fmt.Sprintf("settlement_http_requests_total{method=\"%s\",path=\"%s\",status=\"%s\"} %d\n",
				parts[0], parts[1], parts[2], val))
		}
	}
	httpRequestsTotal.mu.Unlock()

	// Panic counter
	sb.WriteString("# HELP settlement_panics_recovered_total Panics caught by recovery middleware\n")
	sb.WriteString("# TYPE settlement_panics_recovered_total counter\n")
	panicRecoveryTotal.mu.Lock()
	var totalPanics int64
	for _, val := range panicRecoveryTotal.values {
		totalPanics += val
	}
	panicRecoveryTotal.mu.Unlock()
	sb.WriteString(fmt.Sprintf("settlement_panics_recovered_total %d\n", totalPanics))

	// Shutdown counter
	sb.WriteString("# HELP settlement_shutdowns_total Graceful shutdowns\n")
	sb.WriteString("# TYPE settlement_shutdowns_total counter\n")
	shutdownsTotal.mu.Lock()
	var totalShutdowns int64
	for _, val := range shutdownsTotal.values {
		totalShutdowns += val
	}
	shutdownsTotal.mu.Unlock()
	sb.WriteString(fmt.Sprintf("settlement_shutdowns_total %d\n", totalShutdowns))

	// Request duration histogram
	sb.WriteString("# HELP settlement_http_request_duration_seconds HTTP request duration\n")
	sb.WriteString("# TYPE settlement_http_request_duration_seconds histogram\n")
	buckets := []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}
	httpRequestDuration.mu.Lock()
	for key, obs := range httpRequestDuration.observations {
		parts := strings.SplitN(key, "|", 2)
		labelStr := ""
		if len(parts) == 2 {
			labelStr = fmt.Sprintf("method=\"%s\",path=\"%s\"", parts[0], parts[1])
		}
		sum := 0.0
		for _, v := range obs {
			sum += v
		}
		for _, b := range buckets {
			count := 0
			for _, v := range obs {
				if v <= b {
					count++
				}
			}
			sb.WriteString(fmt.Sprintf("settlement_http_request_duration_seconds_bucket{%s,le=\"%s\"} %d\n",
				labelStr, strconv.FormatFloat(b, 'f', -1, 64), count))
		}
		sb.WriteString(fmt.Sprintf("settlement_http_request_duration_seconds_bucket{%s,le=\"+Inf\"} %d\n", labelStr, len(obs)))
		sb.WriteString(fmt.Sprintf("settlement_http_request_duration_seconds_sum{%s} %f\n", labelStr, sum))
		sb.WriteString(fmt.Sprintf("settlement_http_request_duration_seconds_count{%s} %d\n", labelStr, len(obs)))
	}
	httpRequestDuration.mu.Unlock()

	c.Data(http.StatusOK, "text/plain; version=0.0.4; charset=utf-8", []byte(sb.String()))
}

// ─── Panic Recovery Middleware ─────────────────────────────────────────────────

// PanicRecoveryMiddleware catches panics in HTTP handlers, logs the stack trace,
// increments the panic counter, and returns 500 instead of crashing the process.
func PanicRecoveryMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// Capture stack trace
				buf := make([]byte, 4096)
				n := runtime.Stack(buf, false)
				stackTrace := string(buf[:n])

				log.Printf("[PANIC RECOVERED] %v\nStack:\n%s", err, stackTrace)

				panicRecoveryTotal.Inc(serviceName)

				// Structured JSON log for OpenSearch ingestion
				panicEvent := map[string]interface{}{
					"level":       "CRITICAL",
					"event":       "panic_recovered",
					"service":     serviceName,
					"error":       fmt.Sprintf("%v", err),
					"stack_trace": stackTrace,
					"path":        c.Request.URL.Path,
					"method":      c.Request.Method,
					"timestamp":   time.Now().UTC().Format(time.RFC3339Nano),
					"goroutines":  runtime.NumGoroutine(),
					"pod_name":    os.Getenv("POD_NAME"),
				}
				if jsonBytes, jsonErr := json.Marshal(panicEvent); jsonErr == nil {
					fmt.Fprintln(os.Stderr, string(jsonBytes))
				}

				c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
					"error":     "internal server error",
					"request_id": c.GetHeader("X-Request-ID"),
				})
			}
		}()
		c.Next()
	}
}

// ─── Request Tracking Middleware ───────────────────────────────────────────────

// RequestTrackingMiddleware counts in-flight requests and records metrics.
func RequestTrackingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		inFlightRequests.Add(1)
		activeRequestsGauge.Add(1)
		start := time.Now()

		c.Next()

		duration := time.Since(start).Seconds()
		inFlightRequests.Add(-1)
		activeRequestsGauge.Add(-1)

		status := strconv.Itoa(c.Writer.Status())
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}

		httpRequestsTotal.Inc(c.Request.Method, path, status)
		httpRequestDuration.Observe(duration, c.Request.Method, path)
	}
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

// ShutdownHook holds a named cleanup function.
type ShutdownHook struct {
	Name string
	Fn   func(ctx context.Context) error
}

// GracefulShutdown manages the lifecycle of an HTTP server with signal handling.
// It blocks until SIGTERM/SIGINT, then:
//  1. Marks readiness as false
//  2. Waits for preStop hook drain period
//  3. Shuts down the HTTP server (draining in-flight requests)
//  4. Runs cleanup hooks (DB close, Kafka producer close, etc.)
//  5. Emits shutdown metrics
func GracefulShutdown(server *http.Server, hooks []ShutdownHook) {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	sig := <-quit
	log.Printf("[LIFECYCLE] Received signal %s — initiating graceful shutdown", sig)

	shutdownOnce.Do(func() {
		shutdownsTotal.Inc(serviceName, sig.String())

		// Step 1: Mark as not ready — K8s stops sending new requests
		SetNotReady()

		// Emit structured shutdown event for observability
		shutdownEvent := map[string]interface{}{
			"level":      "WARN",
			"event":      "graceful_shutdown_started",
			"service":    serviceName,
			"signal":     sig.String(),
			"in_flight":  inFlightRequests.Load(),
			"goroutines": runtime.NumGoroutine(),
			"uptime_s":   int(time.Since(startTime).Seconds()),
			"timestamp":  time.Now().UTC().Format(time.RFC3339Nano),
			"pod_name":   os.Getenv("POD_NAME"),
		}
		if jsonBytes, err := json.Marshal(shutdownEvent); err == nil {
			fmt.Fprintln(os.Stderr, string(jsonBytes))
		}

		// Step 2: Wait for K8s to update endpoints (preStop hook already sleeps 5s)
		time.Sleep(2 * time.Second)

		// Step 3: Shut down HTTP server — drains in-flight requests
		timeoutStr := os.Getenv("SHUTDOWN_TIMEOUT_SECONDS")
		timeout := 30
		if t, err := strconv.Atoi(timeoutStr); err == nil && t > 0 {
			timeout = t
		}
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("[LIFECYCLE] HTTP server shutdown error: %v", err)
		} else {
			log.Printf("[LIFECYCLE] HTTP server shut down cleanly")
		}

		// Step 4: Run cleanup hooks
		for _, hook := range hooks {
			hookCtx, hookCancel := context.WithTimeout(context.Background(), 10*time.Second)
			if err := hook.Fn(hookCtx); err != nil {
				log.Printf("[LIFECYCLE] Cleanup hook '%s' failed: %v", hook.Name, err)
			} else {
				log.Printf("[LIFECYCLE] Cleanup hook '%s' completed", hook.Name)
			}
			hookCancel()
		}

		// Emit shutdown complete event
		completeEvent := map[string]interface{}{
			"level":     "INFO",
			"event":     "graceful_shutdown_completed",
			"service":   serviceName,
			"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
			"pod_name":  os.Getenv("POD_NAME"),
		}
		if jsonBytes, err := json.Marshal(completeEvent); err == nil {
			fmt.Fprintln(os.Stderr, string(jsonBytes))
		}

		log.Printf("[LIFECYCLE] Shutdown complete — exiting")
	})
}

// SetDBConnections updates the database connection gauge for Prometheus.
func SetDBConnections(n int64) { dbConnectionGauge.Store(n) }

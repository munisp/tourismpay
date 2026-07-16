package ollama

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// OllamaClient provides a robust client for Ollama API with retry logic and health checks
type OllamaClient struct {
	baseURL       string
	httpClient    *http.Client
	defaultModel  string
	maxRetries    int
	retryDelay    time.Duration
	healthStatus  *HealthStatus
	healthMutex   sync.RWMutex
	metrics       *ClientMetrics
	metricsMutex  sync.RWMutex
}

// HealthStatus tracks Ollama service health
type HealthStatus struct {
	IsHealthy       bool      `json:"is_healthy"`
	LastCheck       time.Time `json:"last_check"`
	LastError       string    `json:"last_error,omitempty"`
	ConsecutiveFails int      `json:"consecutive_fails"`
	AvailableModels []string  `json:"available_models"`
	Version         string    `json:"version"`
}

// ClientMetrics tracks client performance
type ClientMetrics struct {
	TotalRequests     int64         `json:"total_requests"`
	SuccessfulRequests int64        `json:"successful_requests"`
	FailedRequests    int64         `json:"failed_requests"`
	TotalTokensUsed   int64         `json:"total_tokens_used"`
	AverageLatencyMs  float64       `json:"average_latency_ms"`
	TotalLatencyMs    int64         `json:"total_latency_ms"`
}

// GenerateRequest represents a request to generate text
type GenerateRequest struct {
	Model       string                 `json:"model"`
	Prompt      string                 `json:"prompt"`
	System      string                 `json:"system,omitempty"`
	Template    string                 `json:"template,omitempty"`
	Context     []int                  `json:"context,omitempty"`
	Stream      bool                   `json:"stream"`
	Raw         bool                   `json:"raw,omitempty"`
	Format      string                 `json:"format,omitempty"`
	Options     map[string]interface{} `json:"options,omitempty"`
	KeepAlive   string                 `json:"keep_alive,omitempty"`
}

// GenerateResponse represents a response from text generation
type GenerateResponse struct {
	Model              string    `json:"model"`
	CreatedAt          time.Time `json:"created_at"`
	Response           string    `json:"response"`
	Done               bool      `json:"done"`
	Context            []int     `json:"context,omitempty"`
	TotalDuration      int64     `json:"total_duration"`
	LoadDuration       int64     `json:"load_duration"`
	PromptEvalCount    int       `json:"prompt_eval_count"`
	PromptEvalDuration int64     `json:"prompt_eval_duration"`
	EvalCount          int       `json:"eval_count"`
	EvalDuration       int64     `json:"eval_duration"`
}

// ChatMessage represents a message in a chat conversation
type ChatMessage struct {
	Role    string   `json:"role"`
	Content string   `json:"content"`
	Images  []string `json:"images,omitempty"`
}

// ChatRequest represents a chat completion request
type ChatRequest struct {
	Model     string                 `json:"model"`
	Messages  []ChatMessage          `json:"messages"`
	Stream    bool                   `json:"stream"`
	Format    string                 `json:"format,omitempty"`
	Options   map[string]interface{} `json:"options,omitempty"`
	KeepAlive string                 `json:"keep_alive,omitempty"`
}

// ChatResponse represents a chat completion response
type ChatResponse struct {
	Model              string      `json:"model"`
	CreatedAt          time.Time   `json:"created_at"`
	Message            ChatMessage `json:"message"`
	Done               bool        `json:"done"`
	TotalDuration      int64       `json:"total_duration"`
	LoadDuration       int64       `json:"load_duration"`
	PromptEvalCount    int         `json:"prompt_eval_count"`
	PromptEvalDuration int64       `json:"prompt_eval_duration"`
	EvalCount          int         `json:"eval_count"`
	EvalDuration       int64       `json:"eval_duration"`
}

// EmbeddingRequest represents a request for embeddings
type EmbeddingRequest struct {
	Model   string   `json:"model"`
	Input   []string `json:"input"`
	Options map[string]interface{} `json:"options,omitempty"`
}

// EmbeddingResponse represents an embedding response
type EmbeddingResponse struct {
	Model      string      `json:"model"`
	Embeddings [][]float64 `json:"embeddings"`
}

// ModelInfo represents information about a model
type ModelInfo struct {
	Name       string    `json:"name"`
	ModifiedAt time.Time `json:"modified_at"`
	Size       int64     `json:"size"`
	Digest     string    `json:"digest"`
	Details    struct {
		Format            string   `json:"format"`
		Family            string   `json:"family"`
		Families          []string `json:"families"`
		ParameterSize     string   `json:"parameter_size"`
		QuantizationLevel string   `json:"quantization_level"`
	} `json:"details"`
}

// NewOllamaClient creates a new Ollama client with default configuration
func NewOllamaClient(baseURL string, defaultModel string) *OllamaClient {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	if defaultModel == "" {
		defaultModel = "qwen2.5:latest"
	}

	client := &OllamaClient{
		baseURL:      baseURL,
		defaultModel: defaultModel,
		maxRetries:   3,
		retryDelay:   time.Second,
		httpClient: &http.Client{
			Timeout: 5 * time.Minute,
		},
		healthStatus: &HealthStatus{},
		metrics:      &ClientMetrics{},
	}

	// Start background health checker
	go client.startHealthChecker()

	return client
}

// startHealthChecker runs periodic health checks
func (c *OllamaClient) startHealthChecker() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Initial health check
	c.CheckHealth(context.Background())

	for range ticker.C {
		c.CheckHealth(context.Background())
	}
}

// CheckHealth performs a health check on the Ollama service
func (c *OllamaClient) CheckHealth(ctx context.Context) error {
	c.healthMutex.Lock()
	defer c.healthMutex.Unlock()

	c.healthStatus.LastCheck = time.Now()

	// Check if service is reachable
	resp, err := c.httpClient.Get(c.baseURL + "/api/tags")
	if err != nil {
		c.healthStatus.IsHealthy = false
		c.healthStatus.LastError = err.Error()
		c.healthStatus.ConsecutiveFails++
		return fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.healthStatus.IsHealthy = false
		c.healthStatus.LastError = fmt.Sprintf("unexpected status: %d", resp.StatusCode)
		c.healthStatus.ConsecutiveFails++
		return fmt.Errorf("health check failed: status %d", resp.StatusCode)
	}

	// Parse available models
	var result struct {
		Models []ModelInfo `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		c.healthStatus.IsHealthy = false
		c.healthStatus.LastError = err.Error()
		c.healthStatus.ConsecutiveFails++
		return fmt.Errorf("failed to parse models: %w", err)
	}

	c.healthStatus.IsHealthy = true
	c.healthStatus.LastError = ""
	c.healthStatus.ConsecutiveFails = 0
	c.healthStatus.AvailableModels = make([]string, len(result.Models))
	for i, m := range result.Models {
		c.healthStatus.AvailableModels[i] = m.Name
	}

	return nil
}

// GetHealthStatus returns the current health status
func (c *OllamaClient) GetHealthStatus() HealthStatus {
	c.healthMutex.RLock()
	defer c.healthMutex.RUnlock()
	return *c.healthStatus
}

// IsHealthy returns whether the service is healthy
func (c *OllamaClient) IsHealthy() bool {
	c.healthMutex.RLock()
	defer c.healthMutex.RUnlock()
	return c.healthStatus.IsHealthy
}

// Generate generates text using the specified model
func (c *OllamaClient) Generate(ctx context.Context, req *GenerateRequest) (*GenerateResponse, error) {
	if req.Model == "" {
		req.Model = c.defaultModel
	}

	startTime := time.Now()
	c.recordRequest()

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(c.retryDelay * time.Duration(attempt)):
			}
		}

		resp, err := c.doGenerate(ctx, req)
		if err == nil {
			c.recordSuccess(time.Since(startTime).Milliseconds(), resp.EvalCount)
			return resp, nil
		}

		lastErr = err
	}

	c.recordFailure()
	return nil, fmt.Errorf("generate failed after %d retries: %w", c.maxRetries, lastErr)
}

func (c *OllamaClient) doGenerate(ctx context.Context, req *GenerateRequest) (*GenerateResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var result GenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// Chat performs a chat completion
func (c *OllamaClient) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if req.Model == "" {
		req.Model = c.defaultModel
	}

	startTime := time.Now()
	c.recordRequest()

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(c.retryDelay * time.Duration(attempt)):
			}
		}

		resp, err := c.doChat(ctx, req)
		if err == nil {
			c.recordSuccess(time.Since(startTime).Milliseconds(), resp.EvalCount)
			return resp, nil
		}

		lastErr = err
	}

	c.recordFailure()
	return nil, fmt.Errorf("chat failed after %d retries: %w", c.maxRetries, lastErr)
}

func (c *OllamaClient) doChat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var result ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// Embed generates embeddings for the given input
func (c *OllamaClient) Embed(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error) {
	if req.Model == "" {
		req.Model = c.defaultModel
	}

	startTime := time.Now()
	c.recordRequest()

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(c.retryDelay * time.Duration(attempt)):
			}
		}

		resp, err := c.doEmbed(ctx, req)
		if err == nil {
			c.recordSuccess(time.Since(startTime).Milliseconds(), 0)
			return resp, nil
		}

		lastErr = err
	}

	c.recordFailure()
	return nil, fmt.Errorf("embed failed after %d retries: %w", c.maxRetries, lastErr)
}

func (c *OllamaClient) doEmbed(ctx context.Context, req *EmbeddingRequest) (*EmbeddingResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/embed", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var result EmbeddingResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

// GetMetrics returns current client metrics
func (c *OllamaClient) GetMetrics() ClientMetrics {
	c.metricsMutex.RLock()
	defer c.metricsMutex.RUnlock()
	return *c.metrics
}

func (c *OllamaClient) recordRequest() {
	c.metricsMutex.Lock()
	defer c.metricsMutex.Unlock()
	c.metrics.TotalRequests++
}

func (c *OllamaClient) recordSuccess(latencyMs int64, tokens int) {
	c.metricsMutex.Lock()
	defer c.metricsMutex.Unlock()
	c.metrics.SuccessfulRequests++
	c.metrics.TotalTokensUsed += int64(tokens)
	c.metrics.TotalLatencyMs += latencyMs
	if c.metrics.SuccessfulRequests > 0 {
		c.metrics.AverageLatencyMs = float64(c.metrics.TotalLatencyMs) / float64(c.metrics.SuccessfulRequests)
	}
}

func (c *OllamaClient) recordFailure() {
	c.metricsMutex.Lock()
	defer c.metricsMutex.Unlock()
	c.metrics.FailedRequests++
}

// ListModels returns available models
func (c *OllamaClient) ListModels(ctx context.Context) ([]ModelInfo, error) {
	httpReq, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/api/tags", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Models []ModelInfo `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Models, nil
}

// PullModel pulls a model from the Ollama library
func (c *OllamaClient) PullModel(ctx context.Context, modelName string) error {
	body, _ := json.Marshal(map[string]interface{}{
		"name":   modelName,
		"stream": false,
	})

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/pull", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

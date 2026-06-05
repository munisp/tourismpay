package temporal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type TemporalClient struct {
	baseURL   string
	namespace string
	client    *http.Client
}

func NewTemporalClient() *TemporalClient {
	addr := os.Getenv("TEMPORAL_URL")
	if addr == "" {
		addr = "http://localhost:7233"
	}
	return &TemporalClient{
		baseURL:   addr,
		namespace: envOr("TEMPORAL_NAMESPACE", "default"),
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

type WorkflowExecution struct {
	WorkflowID string `json:"workflow_id"`
	RunID      string `json:"run_id"`
}

type StartWorkflowRequest struct {
	WorkflowID   string        `json:"workflow_id"`
	WorkflowType string        `json:"workflow_type"`
	TaskQueue    string        `json:"task_queue"`
	Input        interface{}   `json:"input"`
	Timeout      time.Duration `json:"-"`
}

func (t *TemporalClient) StartWorkflow(ctx context.Context, req StartWorkflowRequest) (*WorkflowExecution, error) {
	payload := map[string]interface{}{
		"workflow_id":   req.WorkflowID,
		"workflow_type": map[string]string{"name": req.WorkflowType},
		"task_queue":    map[string]string{"name": req.TaskQueue},
		"input":         req.Input,
	}
	body, _ := json.Marshal(payload)
	url := fmt.Sprintf("%s/api/v1/namespaces/%s/workflows", t.baseURL, t.namespace)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("temporal start workflow: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var result WorkflowExecution
	json.Unmarshal(respBody, &result)
	result.WorkflowID = req.WorkflowID
	return &result, nil
}

func (t *TemporalClient) GetWorkflowStatus(ctx context.Context, workflowID, runID string) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/api/v1/namespaces/%s/workflows/%s/runs/%s", t.baseURL, t.namespace, workflowID, runID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := t.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(respBody, &result)
	return result, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// APISIXClient registers and manages routes in the APISIX gateway.
// Ensures the settlement service is discoverable and load-balanced.
type APISIXClient struct {
	adminURL string
	apiKey   string
	client   *http.Client
}

func NewAPISIXClient() *APISIXClient {
	return &APISIXClient{
		adminURL: os.Getenv("APISIX_ADMIN_URL"),
		apiKey:   os.Getenv("APISIX_ADMIN_KEY"),
		client:   &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *APISIXClient) IsConfigured() bool {
	return c.adminURL != ""
}

// RegisterSettlementRoutes registers the Go settlement service routes in APISIX.
func (c *APISIXClient) RegisterSettlementRoutes(serviceHost string, servicePort int) error {
	if !c.IsConfigured() {
		return nil // Silent skip when APISIX not configured
	}

	routes := []struct {
		ID      string
		URI     string
		Methods []string
	}{
		{"settlement-health", "/settlement/health", []string{"GET"}},
		{"settlement-accounts", "/settlement/api/v1/accounts*", []string{"GET", "POST"}},
		{"settlement-transfers", "/settlement/api/v1/transfers*", []string{"GET", "POST"}},
		{"settlement-mojaloop", "/settlement/api/v1/mojaloop/*", []string{"GET", "POST", "PUT"}},
		{"settlement-windows", "/settlement/api/v1/settlement-windows*", []string{"GET", "POST"}},
		{"settlement-inventory", "/settlement/api/v1/inventory*", []string{"GET", "POST", "PUT", "DELETE"}},
	}

	nodeAddr := fmt.Sprintf("%s:%d", serviceHost, servicePort)
	for _, route := range routes {
		body := map[string]interface{}{
			"uri":     route.URI,
			"methods": route.Methods,
			"upstream": map[string]interface{}{
				"type": "roundrobin",
				"nodes": map[string]int{
					nodeAddr: 1,
				},
				"checks": map[string]interface{}{
					"active": map[string]interface{}{
						"http_path":       "/health",
						"healthy_interval": 5,
					},
				},
			},
			"plugins": map[string]interface{}{
				"jwt-auth":    map[string]interface{}{},
				"limit-count": map[string]interface{}{"count": 500, "time_window": 60, "rejected_code": 429, "key": "remote_addr"},
			},
		}

		if err := c.putRoute(route.ID, body); err != nil {
			return fmt.Errorf("register route %s: %w", route.ID, err)
		}
	}
	return nil
}

func (c *APISIXClient) putRoute(routeID string, body map[string]interface{}) error {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/apisix/admin/routes/%s", c.adminURL, routeID)
	req, err := http.NewRequest("PUT", url, bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("apisix: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("apisix: route registration failed (%d): %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// DeregisterRoutes removes the settlement routes from APISIX (graceful shutdown).
func (c *APISIXClient) DeregisterRoutes() {
	if !c.IsConfigured() {
		return
	}
	routeIDs := []string{
		"settlement-health", "settlement-accounts", "settlement-transfers",
		"settlement-mojaloop", "settlement-windows", "settlement-inventory",
	}
	for _, id := range routeIDs {
		url := fmt.Sprintf("%s/apisix/admin/routes/%s", c.adminURL, id)
		req, _ := http.NewRequest("DELETE", url, nil)
		if req != nil {
			req.Header.Set("X-API-KEY", c.apiKey)
			c.client.Do(req)
		}
	}
}

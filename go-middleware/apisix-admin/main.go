package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Models ─────────────────────────────────────────────────────────────────

type Route struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	URI         string            `json:"uri"`
	Methods     []string          `json:"methods"`
	UpstreamID  string            `json:"upstream_id"`
	Plugins     map[string]Plugin `json:"plugins,omitempty"`
	Status      int               `json:"status"` // 1=enabled, 0=disabled
	Priority    int               `json:"priority"`
	Labels      map[string]string `json:"labels,omitempty"`
}

type Upstream struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Type        string         `json:"type"` // roundrobin, chash, least_conn
	Nodes       map[string]int `json:"nodes"`
	Retries     int            `json:"retries"`
	Timeout     TimeoutConfig  `json:"timeout"`
	HealthCheck HealthCheckCfg `json:"health_check,omitempty"`
}

type TimeoutConfig struct {
	Connect int `json:"connect"`
	Send    int `json:"send"`
	Read    int `json:"read"`
}

type HealthCheckCfg struct {
	Active  ActiveHealthCheck  `json:"active"`
	Passive PassiveHealthCheck `json:"passive"`
}

type ActiveHealthCheck struct {
	Type     string `json:"type"`
	HTTPPath string `json:"http_path"`
	Interval int    `json:"interval"`
}

type PassiveHealthCheck struct {
	Healthy   HealthThreshold `json:"healthy"`
	Unhealthy HealthThreshold `json:"unhealthy"`
}

type HealthThreshold struct {
	Successes  int   `json:"successes,omitempty"`
	HTTPStatuses []int `json:"http_statuses"`
}

type Plugin map[string]interface{}

type SSLCert struct {
	ID     string   `json:"id"`
	Status int      `json:"status"`
	Cert   string   `json:"cert"`
	Key    string   `json:"key"`
	SNIs   []string `json:"snis"`
}

type Consumer struct {
	Username string            `json:"username"`
	Plugins  map[string]Plugin `json:"plugins,omitempty"`
	Labels   map[string]string `json:"labels,omitempty"`
}

type GlobalRule struct {
	ID      string            `json:"id"`
	Plugins map[string]Plugin `json:"plugins"`
}

// ─── State ──────────────────────────────────────────────────────────────────

var (
	routes    = make(map[string]*Route)
	upstreams = make(map[string]*Upstream)
	consumers = make(map[string]*Consumer)
	globalRules = make(map[string]*GlobalRule)
	mu        sync.RWMutex
	routeSeq  int
)

func init() {
	// Seed default upstreams for TourismPay services
	upstreams["ups-pwa"] = &Upstream{ID: "ups-pwa", Name: "tourismpay-pwa", Type: "roundrobin", Nodes: map[string]int{"tourismpay-pwa:3000": 1}, Retries: 3, Timeout: TimeoutConfig{Connect: 5, Send: 10, Read: 10}}
	upstreams["ups-settlement"] = &Upstream{ID: "ups-settlement", Name: "go-settlement", Type: "roundrobin", Nodes: map[string]int{"go-settlement:8081": 1}, Retries: 2, Timeout: TimeoutConfig{Connect: 3, Send: 10, Read: 30}}
	upstreams["ups-ml"] = &Upstream{ID: "ups-ml", Name: "python-ml", Type: "roundrobin", Nodes: map[string]int{"python-ml:8001": 1}, Retries: 2, Timeout: TimeoutConfig{Connect: 3, Send: 10, Read: 30}}
	upstreams["ups-pbac"] = &Upstream{ID: "ups-pbac", Name: "pbac-engine", Type: "roundrobin", Nodes: map[string]int{"pbac-engine:8090": 1}, Retries: 1, Timeout: TimeoutConfig{Connect: 2, Send: 5, Read: 5}}

	// Seed routes
	routes["rt-api"] = &Route{ID: "rt-api", Name: "Main API", URI: "/api/*", Methods: []string{"GET", "POST", "PUT", "DELETE"}, UpstreamID: "ups-pwa", Status: 1, Priority: 0, Plugins: map[string]Plugin{
		"limit-req": {"rate": 120, "burst": 50, "rejected_code": 429, "key": "remote_addr"},
		"cors": {"allow_origins": "*", "allow_methods": "GET,POST,PUT,DELETE,OPTIONS"},
	}}
	routes["rt-settlement"] = &Route{ID: "rt-settlement", Name: "Settlement API", URI: "/api/v1/settlement/*", Methods: []string{"GET", "POST"}, UpstreamID: "ups-settlement", Status: 1, Priority: 10}
	routes["rt-ml"] = &Route{ID: "rt-ml", Name: "ML Services", URI: "/api/v1/ml/*", Methods: []string{"GET", "POST"}, UpstreamID: "ups-ml", Status: 1, Priority: 10}
	routes["rt-pbac"] = &Route{ID: "rt-pbac", Name: "PBAC Engine", URI: "/api/v1/access/*", Methods: []string{"POST"}, UpstreamID: "ups-pbac", Status: 1, Priority: 20}
	routeSeq = 4

	// Seed global rules
	globalRules["gr-security"] = &GlobalRule{ID: "gr-security", Plugins: map[string]Plugin{
		"ip-restriction": {"blacklist": []string{}},
		"ua-restriction": {"denylist": []string{"curl-exploit", "sqlmap"}},
	}}

	// Seed consumers
	consumers["admin-api"] = &Consumer{Username: "admin-api", Plugins: map[string]Plugin{"key-auth": {"key": "admin-api-key-placeholder"}}, Labels: map[string]string{"role": "admin"}}
	consumers["merchant-api"] = &Consumer{Username: "merchant-api", Plugins: map[string]Plugin{"key-auth": {"key": "merchant-api-key-placeholder"}}, Labels: map[string]string{"role": "merchant"}}
}

// ─── HTTP API ───────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8104"
	}

	router := gin.Default()
	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "TourismPay APISIX Admin (Go)",
			"version":   "1.0.0",
			"routes":    len(routes),
			"upstreams": len(upstreams),
			"consumers": len(consumers),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		// Route management
		api.GET("/routes", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			result := make([]*Route, 0, len(routes))
			for _, r := range routes {
				result = append(result, r)
			}
			c.JSON(http.StatusOK, gin.H{"routes": result, "total": len(result)})
		})

		api.POST("/routes", func(c *gin.Context) {
			var route Route
			if err := c.ShouldBindJSON(&route); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			mu.Lock()
			routeSeq++
			route.ID = fmt.Sprintf("rt-%d", routeSeq)
			routes[route.ID] = &route
			mu.Unlock()
			c.JSON(http.StatusCreated, route)
		})

		api.GET("/routes/:id", func(c *gin.Context) {
			id := c.Param("id")
			mu.RLock()
			r, ok := routes[id]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
				return
			}
			c.JSON(http.StatusOK, r)
		})

		api.PUT("/routes/:id", func(c *gin.Context) {
			id := c.Param("id")
			var update Route
			if err := c.ShouldBindJSON(&update); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			mu.Lock()
			_, ok := routes[id]
			if !ok {
				mu.Unlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
				return
			}
			update.ID = id
			routes[id] = &update
			mu.Unlock()
			c.JSON(http.StatusOK, update)
		})

		api.DELETE("/routes/:id", func(c *gin.Context) {
			id := c.Param("id")
			mu.Lock()
			_, ok := routes[id]
			if !ok {
				mu.Unlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
				return
			}
			delete(routes, id)
			mu.Unlock()
			c.JSON(http.StatusOK, gin.H{"status": "deleted"})
		})

		// Upstream management
		api.GET("/upstreams", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			result := make([]*Upstream, 0, len(upstreams))
			for _, u := range upstreams {
				result = append(result, u)
			}
			c.JSON(http.StatusOK, gin.H{"upstreams": result, "total": len(result)})
		})

		api.POST("/upstreams", func(c *gin.Context) {
			var ups Upstream
			if err := c.ShouldBindJSON(&ups); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			mu.Lock()
			upstreams[ups.ID] = &ups
			mu.Unlock()
			c.JSON(http.StatusCreated, ups)
		})

		// Consumer management
		api.GET("/consumers", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			result := make([]*Consumer, 0, len(consumers))
			for _, co := range consumers {
				result = append(result, co)
			}
			c.JSON(http.StatusOK, gin.H{"consumers": result, "total": len(result)})
		})

		api.POST("/consumers", func(c *gin.Context) {
			var consumer Consumer
			if err := c.ShouldBindJSON(&consumer); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			mu.Lock()
			consumers[consumer.Username] = &consumer
			mu.Unlock()
			c.JSON(http.StatusCreated, consumer)
		})

		// Global rules
		api.GET("/global-rules", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			result := make([]*GlobalRule, 0, len(globalRules))
			for _, gr := range globalRules {
				result = append(result, gr)
			}
			c.JSON(http.StatusOK, gin.H{"globalRules": result})
		})

		// Plugin management
		api.GET("/plugins", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"plugins": []string{
					"limit-req", "limit-count", "limit-conn",
					"key-auth", "jwt-auth", "basic-auth", "hmac-auth",
					"cors", "ip-restriction", "ua-restriction", "referer-restriction",
					"proxy-rewrite", "redirect", "response-rewrite",
					"prometheus", "zipkin", "skywalking",
					"grpc-transcode", "grpc-web",
					"serverless-pre-function", "serverless-post-function",
					"ext-plugin-pre-req", "ext-plugin-post-resp",
				},
			})
		})

		// Gateway status
		api.GET("/status", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			activeRoutes := 0
			for _, r := range routes {
				if r.Status == 1 {
					activeRoutes++
				}
			}
			c.JSON(http.StatusOK, gin.H{
				"totalRoutes":    len(routes),
				"activeRoutes":   activeRoutes,
				"totalUpstreams": len(upstreams),
				"totalConsumers": len(consumers),
				"globalRules":    len(globalRules),
				"gatewayVersion": "3.8.0",
			})
		})
	}

	log.Printf("[APISIX Admin] Starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id, X-API-KEY")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}
		c.Next()
	}
}

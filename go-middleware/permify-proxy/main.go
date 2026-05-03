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

type RelationTuple struct {
	Entity   string `json:"entity"`
	Relation string `json:"relation"`
	Subject  string `json:"subject"`
}

type PermissionCheck struct {
	Entity     string            `json:"entity" binding:"required"`
	Permission string            `json:"permission" binding:"required"`
	Subject    string            `json:"subject" binding:"required"`
	Context    map[string]string `json:"context,omitempty"`
}

type PermissionResult struct {
	Allowed           bool   `json:"allowed"`
	Reason            string `json:"reason"`
	EvaluatedPolicies int    `json:"evaluatedPolicies"`
	EvaluationTimeUs  int64  `json:"evaluationTimeUs"`
	CacheHit          bool   `json:"cacheHit"`
}

type Schema struct {
	Version    string           `json:"version"`
	Entities   []EntityDef      `json:"entities"`
	UpdatedAt  string           `json:"updatedAt"`
}

type EntityDef struct {
	Name       string       `json:"name"`
	Relations  []RelationDef `json:"relations"`
	Permissions []PermDef    `json:"permissions"`
}

type RelationDef struct {
	Name    string   `json:"name"`
	Types   []string `json:"types"`
}

type PermDef struct {
	Name      string `json:"name"`
	Rule      string `json:"rule"`
}

type LookupResult struct {
	EntityIDs []string `json:"entityIds"`
	Total     int      `json:"total"`
}

// ─── State ──────────────────────────────────────────────────────────────────

var (
	tuples     []RelationTuple
	checkCache = make(map[string]PermissionResult)
	mu         sync.RWMutex
	stats      = struct {
		TotalChecks    int64 `json:"totalChecks"`
		TotalAllowed   int64 `json:"totalAllowed"`
		TotalDenied    int64 `json:"totalDenied"`
		CacheHits      int64 `json:"cacheHits"`
		TotalTuples    int64 `json:"totalTuples"`
		AvgLatencyUs   int64 `json:"avgLatencyUs"`
	}{}

	schema = Schema{
		Version:   "1.0.0",
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		Entities: []EntityDef{
			{
				Name: "organization",
				Relations: []RelationDef{
					{Name: "admin", Types: []string{"user"}},
					{Name: "member", Types: []string{"user"}},
				},
				Permissions: []PermDef{
					{Name: "manage", Rule: "admin"},
					{Name: "view", Rule: "admin or member"},
				},
			},
			{
				Name: "wallet",
				Relations: []RelationDef{
					{Name: "owner", Types: []string{"user"}},
					{Name: "viewer", Types: []string{"user"}},
				},
				Permissions: []PermDef{
					{Name: "transfer", Rule: "owner"},
					{Name: "topup", Rule: "owner"},
					{Name: "view_balance", Rule: "owner or viewer"},
				},
			},
			{
				Name: "payment",
				Relations: []RelationDef{
					{Name: "payer", Types: []string{"user"}},
					{Name: "payee", Types: []string{"user", "merchant"}},
					{Name: "auditor", Types: []string{"user"}},
				},
				Permissions: []PermDef{
					{Name: "create", Rule: "payer"},
					{Name: "view", Rule: "payer or payee or auditor"},
					{Name: "refund", Rule: "payee"},
				},
			},
			{
				Name: "merchant",
				Relations: []RelationDef{
					{Name: "owner", Types: []string{"user"}},
					{Name: "staff", Types: []string{"user"}},
					{Name: "compliance_reviewer", Types: []string{"user"}},
				},
				Permissions: []PermDef{
					{Name: "manage", Rule: "owner"},
					{Name: "view_revenue", Rule: "owner or staff"},
					{Name: "process_kyb", Rule: "compliance_reviewer"},
					{Name: "view_products", Rule: "owner or staff"},
				},
			},
			{
				Name: "settlement",
				Relations: []RelationDef{
					{Name: "officer", Types: []string{"user"}},
					{Name: "auditor", Types: []string{"user"}},
				},
				Permissions: []PermDef{
					{Name: "execute", Rule: "officer"},
					{Name: "view", Rule: "officer or auditor"},
					{Name: "approve", Rule: "officer"},
				},
			},
			{
				Name: "kyb_application",
				Relations: []RelationDef{
					{Name: "applicant", Types: []string{"user"}},
					{Name: "reviewer", Types: []string{"user"}},
				},
				Permissions: []PermDef{
					{Name: "submit", Rule: "applicant"},
					{Name: "review", Rule: "reviewer"},
					{Name: "approve", Rule: "reviewer"},
					{Name: "view", Rule: "applicant or reviewer"},
				},
			},
		},
	}
)

func init() {
	seedTuples := []RelationTuple{
		{Entity: "organization:tourismpay", Relation: "admin", Subject: "user:admin-001"},
		{Entity: "organization:tourismpay", Relation: "member", Subject: "user:tourist-001"},
		{Entity: "organization:tourismpay", Relation: "member", Subject: "user:merchant-001"},
		{Entity: "wallet:wallet-001", Relation: "owner", Subject: "user:tourist-001"},
		{Entity: "wallet:wallet-002", Relation: "owner", Subject: "user:merchant-001"},
		{Entity: "merchant:merchant-001", Relation: "owner", Subject: "user:merchant-001"},
		{Entity: "merchant:merchant-001", Relation: "compliance_reviewer", Subject: "user:compliance-001"},
		{Entity: "settlement:cycle-001", Relation: "officer", Subject: "user:settlement-001"},
		{Entity: "kyb_application:kyb-001", Relation: "applicant", Subject: "user:merchant-001"},
		{Entity: "kyb_application:kyb-001", Relation: "reviewer", Subject: "user:compliance-001"},
	}
	tuples = seedTuples
	stats.TotalTuples = int64(len(seedTuples))
}

// ─── Permission Engine ──────────────────────────────────────────────────────

func checkPermission(check PermissionCheck) PermissionResult {
	start := time.Now()

	cacheKey := fmt.Sprintf("%s:%s:%s", check.Entity, check.Permission, check.Subject)
	mu.RLock()
	if cached, ok := checkCache[cacheKey]; ok {
		mu.RUnlock()
		mu.Lock()
		stats.CacheHits++
		mu.Unlock()
		cached.CacheHit = true
		return cached
	}
	mu.RUnlock()

	allowed := false
	evaluatedPolicies := 0

	// Check direct relation tuples
	mu.RLock()
	for _, tuple := range tuples {
		evaluatedPolicies++
		if tuple.Entity == check.Entity && tuple.Subject == check.Subject {
			// Check if the relation grants the permission
			entityType := ""
			for i, c := range check.Entity {
				if c == ':' {
					entityType = check.Entity[:i]
					break
				}
			}
			for _, entity := range schema.Entities {
				if entity.Name == entityType {
					for _, perm := range entity.Permissions {
						if perm.Name == check.Permission {
							// Simple rule evaluation
							if containsRelation(perm.Rule, tuple.Relation) {
								allowed = true
							}
						}
					}
				}
			}
		}
	}
	mu.RUnlock()

	// Admin override
	if check.Subject == "user:admin-001" || check.Context["role"] == "admin" {
		allowed = true
	}

	elapsed := time.Since(start).Microseconds()

	result := PermissionResult{
		Allowed:           allowed,
		Reason:            reasonText(allowed),
		EvaluatedPolicies: evaluatedPolicies,
		EvaluationTimeUs:  elapsed,
		CacheHit:          false,
	}

	mu.Lock()
	checkCache[cacheKey] = result
	stats.TotalChecks++
	if allowed {
		stats.TotalAllowed++
	} else {
		stats.TotalDenied++
	}
	if stats.TotalChecks > 0 {
		stats.AvgLatencyUs = (stats.AvgLatencyUs*(stats.TotalChecks-1) + elapsed) / stats.TotalChecks
	}
	mu.Unlock()

	return result
}

func containsRelation(rule, relation string) bool {
	// Simple rule parser: "admin", "admin or member", "owner or viewer"
	for i := 0; i <= len(rule)-len(relation); i++ {
		if rule[i:i+len(relation)] == relation {
			if (i == 0 || rule[i-1] == ' ') && (i+len(relation) == len(rule) || rule[i+len(relation)] == ' ') {
				return true
			}
		}
	}
	return false
}

func reasonText(allowed bool) string {
	if allowed {
		return "Permission granted by relation tuple"
	}
	return "No matching relation tuple found"
}

// ─── HTTP API ───────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8103"
	}

	router := gin.Default()
	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "TourismPay Permify Proxy (Go)",
			"version":   "1.0.0",
			"tuples":    len(tuples),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		// Permission check
		api.POST("/permissions/check", func(c *gin.Context) {
			var check PermissionCheck
			if err := c.ShouldBindJSON(&check); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			result := checkPermission(check)
			c.JSON(http.StatusOK, result)
		})

		// Batch permission check
		api.POST("/permissions/check/batch", func(c *gin.Context) {
			var checks []PermissionCheck
			if err := c.ShouldBindJSON(&checks); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			results := make([]PermissionResult, len(checks))
			for i, check := range checks {
				results[i] = checkPermission(check)
			}
			c.JSON(http.StatusOK, gin.H{"results": results})
		})

		// Lookup entities
		api.POST("/permissions/lookup", func(c *gin.Context) {
			var req struct {
				EntityType string `json:"entityType" binding:"required"`
				Permission string `json:"permission" binding:"required"`
				Subject    string `json:"subject" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			var entityIDs []string
			mu.RLock()
			for _, tuple := range tuples {
				if tuple.Subject == req.Subject {
					entityIDs = append(entityIDs, tuple.Entity)
				}
			}
			mu.RUnlock()

			c.JSON(http.StatusOK, LookupResult{
				EntityIDs: entityIDs,
				Total:     len(entityIDs),
			})
		})

		// Relation tuples CRUD
		api.GET("/tuples", func(c *gin.Context) {
			entity := c.Query("entity")
			subject := c.Query("subject")

			mu.RLock()
			defer mu.RUnlock()
			var result []RelationTuple
			for _, t := range tuples {
				if entity != "" && t.Entity != entity { continue }
				if subject != "" && t.Subject != subject { continue }
				result = append(result, t)
			}
			c.JSON(http.StatusOK, gin.H{"tuples": result, "total": len(result)})
		})

		api.POST("/tuples", func(c *gin.Context) {
			var tuple RelationTuple
			if err := c.ShouldBindJSON(&tuple); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.Lock()
			tuples = append(tuples, tuple)
			stats.TotalTuples++
			// Invalidate cache
			checkCache = make(map[string]PermissionResult)
			mu.Unlock()

			c.JSON(http.StatusCreated, gin.H{"status": "created"})
		})

		api.DELETE("/tuples", func(c *gin.Context) {
			var tuple RelationTuple
			if err := c.ShouldBindJSON(&tuple); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.Lock()
			for i, t := range tuples {
				if t.Entity == tuple.Entity && t.Relation == tuple.Relation && t.Subject == tuple.Subject {
					tuples = append(tuples[:i], tuples[i+1:]...)
					stats.TotalTuples--
					checkCache = make(map[string]PermissionResult)
					mu.Unlock()
					c.JSON(http.StatusOK, gin.H{"status": "deleted"})
					return
				}
			}
			mu.Unlock()
			c.JSON(http.StatusNotFound, gin.H{"error": "tuple not found"})
		})

		// Schema
		api.GET("/schema", func(c *gin.Context) {
			c.JSON(http.StatusOK, schema)
		})

		api.PUT("/schema", func(c *gin.Context) {
			var newSchema Schema
			if err := c.ShouldBindJSON(&newSchema); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			mu.Lock()
			schema = newSchema
			schema.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
			checkCache = make(map[string]PermissionResult)
			mu.Unlock()
			c.JSON(http.StatusOK, gin.H{"status": "schema updated"})
		})

		// Stats
		api.GET("/stats", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, stats)
		})

		// Subject permissions (what can this user do?)
		api.GET("/subjects/:subject/permissions", func(c *gin.Context) {
			subject := c.Param("subject")
			mu.RLock()
			defer mu.RUnlock()

			perms := make(map[string][]string)
			for _, t := range tuples {
				if t.Subject == subject {
					perms[t.Entity] = append(perms[t.Entity], t.Relation)
				}
			}
			c.JSON(http.StatusOK, gin.H{"subject": subject, "permissions": perms})
		})
	}

	log.Printf("[Permify Proxy] Starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}
		c.Next()
	}
}

package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Models ─────────────────────────────────────────────────────────────────

type ThreatEvent struct {
	ID          string `json:"id"`
	Timestamp   string `json:"timestamp"`
	SourceIP    string `json:"sourceIp"`
	Method      string `json:"method"`
	URI         string `json:"uri"`
	ThreatType  string `json:"threatType"`
	Severity    string `json:"severity"` // critical, high, medium, low
	Action      string `json:"action"`   // block, detect, allow
	Score       int    `json:"score"`
	UserAgent   string `json:"userAgent"`
	Country     string `json:"country"`
	Details     string `json:"details"`
}

type WAFPolicy struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Mode     string   `json:"mode"` // prevent, detect, inactive
	Rules    []WAFRule `json:"rules"`
	Priority int      `json:"priority"`
}

type WAFRule struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Category  string `json:"category"` // sqli, xss, rce, lfi, rfi, ssrf, file-upload
	Action    string `json:"action"`   // block, detect, allow
	Enabled   bool   `json:"enabled"`
	Threshold int    `json:"threshold"`
}

type ScanRequest struct {
	Method    string            `json:"method"`
	URI       string            `json:"uri"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body,omitempty"`
	SourceIP  string            `json:"sourceIp"`
}

type ScanResult struct {
	Safe       bool          `json:"safe"`
	Score      int           `json:"score"`
	Threats    []ThreatMatch `json:"threats"`
	Action     string        `json:"action"`
	Duration   string        `json:"duration"`
}

type ThreatMatch struct {
	Category string `json:"category"`
	Pattern  string `json:"pattern"`
	Location string `json:"location"`
	Score    int    `json:"score"`
}

// ─── State ──────────────────────────────────────────────────────────────────

var (
	events   []ThreatEvent
	policies = map[string]*WAFPolicy{
		"default": {
			ID:   "default",
			Name: "TourismPay Default Policy",
			Mode: "prevent",
			Priority: 0,
			Rules: []WAFRule{
				{ID: "sqli-001", Name: "SQL Injection", Category: "sqli", Action: "block", Enabled: true, Threshold: 5},
				{ID: "xss-001", Name: "Cross-Site Scripting", Category: "xss", Action: "block", Enabled: true, Threshold: 3},
				{ID: "rce-001", Name: "Remote Code Execution", Category: "rce", Action: "block", Enabled: true, Threshold: 1},
				{ID: "lfi-001", Name: "Local File Inclusion", Category: "lfi", Action: "block", Enabled: true, Threshold: 3},
				{ID: "rfi-001", Name: "Remote File Inclusion", Category: "rfi", Action: "block", Enabled: true, Threshold: 3},
				{ID: "ssrf-001", Name: "Server-Side Request Forgery", Category: "ssrf", Action: "block", Enabled: true, Threshold: 3},
				{ID: "upload-001", Name: "Malicious File Upload", Category: "file-upload", Action: "block", Enabled: true, Threshold: 1},
				{ID: "bot-001", Name: "Bot Detection", Category: "bot", Action: "detect", Enabled: true, Threshold: 5},
				{ID: "dos-001", Name: "Denial of Service", Category: "dos", Action: "block", Enabled: true, Threshold: 10},
			},
		},
	}
	ipBlacklist = make(map[string]time.Time)
	wafStats    = struct {
		TotalScanned  int64 `json:"totalScanned"`
		TotalBlocked  int64 `json:"totalBlocked"`
		TotalDetected int64 `json:"totalDetected"`
		TotalAllowed  int64 `json:"totalAllowed"`
		ThreatsByType map[string]int64 `json:"threatsByType"`
	}{ThreatsByType: make(map[string]int64)}
	mu     sync.RWMutex
	evtSeq int
)

// ─── Threat Detection Engine ────────────────────────────────────────────────

var threatPatterns = map[string][]string{
	"sqli": {"union select", "or 1=1", "drop table", "'; --", "1' or '1'='1", "exec xp_", "information_schema"},
	"xss":  {"<script", "javascript:", "onerror=", "onload=", "eval(", "document.cookie", "<iframe"},
	"rce":  {"exec(", "system(", "passthru(", "shell_exec(", "$(", "`", "import os"},
	"lfi":  {"../", "..\\", "/etc/passwd", "/proc/self", "php://filter"},
	"rfi":  {"http://", "https://", "ftp://", "data:text/html"},
	"ssrf": {"169.254.169.254", "localhost", "127.0.0.1", "0.0.0.0", "[::1]"},
}

func scanInput(input string) []ThreatMatch {
	var matches []ThreatMatch
	lower := strings.ToLower(input)

	for category, patterns := range threatPatterns {
		for _, pattern := range patterns {
			if strings.Contains(lower, strings.ToLower(pattern)) {
				matches = append(matches, ThreatMatch{
					Category: category,
					Pattern:  pattern,
					Location: "input",
					Score:    10,
				})
			}
		}
	}
	return matches
}

func scanRequest(req ScanRequest) ScanResult {
	start := time.Now()
	var allMatches []ThreatMatch

	// Scan URI
	uriMatches := scanInput(req.URI)
	for i := range uriMatches {
		uriMatches[i].Location = "uri"
	}
	allMatches = append(allMatches, uriMatches...)

	// Scan body
	if req.Body != "" {
		bodyMatches := scanInput(req.Body)
		for i := range bodyMatches {
			bodyMatches[i].Location = "body"
		}
		allMatches = append(allMatches, bodyMatches...)
	}

	// Scan headers
	for name, value := range req.Headers {
		headerMatches := scanInput(value)
		for i := range headerMatches {
			headerMatches[i].Location = fmt.Sprintf("header:%s", name)
		}
		allMatches = append(allMatches, headerMatches...)
	}

	totalScore := 0
	for _, m := range allMatches {
		totalScore += m.Score
	}

	action := "allow"
	if totalScore > 0 {
		action = "detect"
	}
	if totalScore >= 10 {
		action = "block"
	}

	return ScanResult{
		Safe:     len(allMatches) == 0,
		Score:    totalScore,
		Threats:  allMatches,
		Action:   action,
		Duration: time.Since(start).String(),
	}
}

// ─── HTTP API ───────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8105"
	}

	router := gin.Default()
	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "TourismPay OpenAppSec WAF (Go)",
			"version":   "1.0.0",
			"policies":  len(policies),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		// Scan request
		api.POST("/scan", func(c *gin.Context) {
			var req ScanRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			result := scanRequest(req)

			mu.Lock()
			wafStats.TotalScanned++
			switch result.Action {
			case "block":
				wafStats.TotalBlocked++
			case "detect":
				wafStats.TotalDetected++
			default:
				wafStats.TotalAllowed++
			}
			for _, t := range result.Threats {
				wafStats.ThreatsByType[t.Category]++
			}

			if result.Action == "block" {
				evtSeq++
				events = append(events, ThreatEvent{
					ID:         fmt.Sprintf("evt-%d", evtSeq),
					Timestamp:  time.Now().UTC().Format(time.RFC3339),
					SourceIP:   req.SourceIP,
					Method:     req.Method,
					URI:        req.URI,
					ThreatType: categorize(result.Threats),
					Severity:   severity(result.Score),
					Action:     result.Action,
					Score:      result.Score,
					UserAgent:  req.Headers["User-Agent"],
					Details:    fmt.Sprintf("%d threats detected", len(result.Threats)),
				})
				if len(events) > 1000 {
					events = events[len(events)-1000:]
				}
			}
			mu.Unlock()

			c.JSON(http.StatusOK, result)
		})

		// Threat events
		api.GET("/events", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, gin.H{"events": events, "total": len(events)})
		})

		// Policy management
		api.GET("/policies", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			result := make([]*WAFPolicy, 0, len(policies))
			for _, p := range policies {
				result = append(result, p)
			}
			c.JSON(http.StatusOK, gin.H{"policies": result})
		})

		api.PUT("/policies/:id", func(c *gin.Context) {
			id := c.Param("id")
			var policy WAFPolicy
			if err := c.ShouldBindJSON(&policy); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			mu.Lock()
			policy.ID = id
			policies[id] = &policy
			mu.Unlock()
			c.JSON(http.StatusOK, policy)
		})

		// IP management
		api.GET("/ip-blacklist", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			ips := make([]gin.H, 0)
			for ip, until := range ipBlacklist {
				ips = append(ips, gin.H{"ip": ip, "blockedUntil": until.Format(time.RFC3339)})
			}
			c.JSON(http.StatusOK, gin.H{"blacklist": ips})
		})

		api.POST("/ip-blacklist", func(c *gin.Context) {
			var req struct {
				IP       string `json:"ip" binding:"required"`
				Duration int    `json:"durationMinutes"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			dur := 60
			if req.Duration > 0 {
				dur = req.Duration
			}
			mu.Lock()
			ipBlacklist[req.IP] = time.Now().Add(time.Duration(dur) * time.Minute)
			mu.Unlock()
			c.JSON(http.StatusCreated, gin.H{"status": "blocked", "ip": req.IP, "durationMinutes": dur})
		})

		// Stats
		api.GET("/stats", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, wafStats)
		})
	}

	log.Printf("[OpenAppSec WAF] Starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}

func categorize(threats []ThreatMatch) string {
	if len(threats) == 0 {
		return "none"
	}
	return threats[0].Category
}

func severity(score int) string {
	if score >= 30 { return "critical" }
	if score >= 20 { return "high" }
	if score >= 10 { return "medium" }
	return "low"
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

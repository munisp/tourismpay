package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ─── Models ─────────────────────────────────────────────────────────────────

type Realm struct {
	ID                string   `json:"id"`
	Name              string   `json:"realm"`
	DisplayName       string   `json:"displayName"`
	Enabled           bool     `json:"enabled"`
	SslRequired       string   `json:"sslRequired"`
	RegistrationAllowed bool   `json:"registrationAllowed"`
	LoginWithEmail    bool     `json:"loginWithEmailAllowed"`
	DuplicateEmails   bool     `json:"duplicateEmailsAllowed"`
	ResetPassword     bool     `json:"resetPasswordAllowed"`
	Roles             []string `json:"roles"`
}

type KeycloakUser struct {
	ID            string            `json:"id"`
	Username      string            `json:"username"`
	Email         string            `json:"email"`
	FirstName     string            `json:"firstName"`
	LastName      string            `json:"lastName"`
	Enabled       bool              `json:"enabled"`
	EmailVerified bool              `json:"emailVerified"`
	Roles         []string          `json:"realmRoles"`
	Groups        []string          `json:"groups"`
	Attributes    map[string][]string `json:"attributes,omitempty"`
	CreatedAt     string            `json:"createdTimestamp"`
	FederationLink string           `json:"federationLink,omitempty"`
}

type Client struct {
	ID                    string   `json:"id"`
	ClientID              string   `json:"clientId"`
	Name                  string   `json:"name"`
	Description           string   `json:"description"`
	Enabled               bool     `json:"enabled"`
	Protocol              string   `json:"protocol"`
	PublicClient           bool     `json:"publicClient"`
	DirectAccessGrantsEnabled bool `json:"directAccessGrantsEnabled"`
	RedirectURIs          []string `json:"redirectUris"`
	WebOrigins            []string `json:"webOrigins"`
}

type IdentityProvider struct {
	Alias       string            `json:"alias"`
	DisplayName string            `json:"displayName"`
	ProviderID  string            `json:"providerId"`
	Enabled     bool              `json:"enabled"`
	Config      map[string]string `json:"config"`
}

type CreateUserRequest struct {
	Username  string            `json:"username" binding:"required"`
	Email     string            `json:"email" binding:"required"`
	FirstName string            `json:"firstName"`
	LastName  string            `json:"lastName"`
	Password  string            `json:"password"`
	Roles     []string          `json:"roles"`
	Attributes map[string][]string `json:"attributes,omitempty"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
}

type Session struct {
	ID        string `json:"id"`
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	IPAddress string `json:"ipAddress"`
	Start     string `json:"start"`
	LastAccess string `json:"lastAccess"`
	ClientIDs []string `json:"clients"`
}

// ─── State ──────────────────────────────────────────────────────────────────

var (
	realms = map[string]*Realm{
		"tourismpay": {
			ID:                  "realm-001",
			Name:                "tourismpay",
			DisplayName:         "TourismPay Platform",
			Enabled:             true,
			SslRequired:         "external",
			RegistrationAllowed: true,
			LoginWithEmail:      true,
			DuplicateEmails:     false,
			ResetPassword:       true,
			Roles: []string{"tourist", "merchant", "admin", "compliance_officer", "settlement_officer", "noc_operator", "bis_analyst"},
		},
	}
	users   = make(map[string]*KeycloakUser)
	clients = map[string]*Client{
		"tourismpay-pwa": {
			ID:                        "client-001",
			ClientID:                  "tourismpay-pwa",
			Name:                      "TourismPay PWA",
			Description:               "Progressive Web Application",
			Enabled:                   true,
			Protocol:                  "openid-connect",
			PublicClient:               true,
			DirectAccessGrantsEnabled: true,
			RedirectURIs:              []string{"http://localhost:3000/*", "https://tourismpay.com/*"},
			WebOrigins:                []string{"http://localhost:3000", "https://tourismpay.com"},
		},
		"tourismpay-mobile": {
			ID:                        "client-002",
			ClientID:                  "tourismpay-mobile",
			Name:                      "TourismPay Mobile",
			Description:               "React Native & Flutter Mobile Apps",
			Enabled:                   true,
			Protocol:                  "openid-connect",
			PublicClient:               true,
			DirectAccessGrantsEnabled: true,
			RedirectURIs:              []string{"tourismpay://callback", "com.tourismpay.app://callback"},
			WebOrigins:                []string{},
		},
		"tourismpay-api": {
			ID:                        "client-003",
			ClientID:                  "tourismpay-api",
			Name:                      "TourismPay API",
			Description:               "Backend API Service",
			Enabled:                   true,
			Protocol:                  "openid-connect",
			PublicClient:               false,
			DirectAccessGrantsEnabled: false,
			RedirectURIs:              []string{},
			WebOrigins:                []string{},
		},
	}
	idProviders = []IdentityProvider{
		{Alias: "google", DisplayName: "Google", ProviderID: "google", Enabled: true, Config: map[string]string{"clientId": "placeholder", "clientSecret": "placeholder"}},
		{Alias: "apple", DisplayName: "Apple", ProviderID: "apple", Enabled: true, Config: map[string]string{"clientId": "placeholder", "teamId": "placeholder"}},
		{Alias: "mpesa", DisplayName: "M-Pesa", ProviderID: "oidc", Enabled: true, Config: map[string]string{"authorizationUrl": "https://sandbox.safaricom.co.ke/oauth/v1/authorize"}},
	}
	sessions []Session
	mu       sync.RWMutex
	userSeq  int
)

func init() {
	seedUsers := []KeycloakUser{
		{ID: "kc-user-001", Username: "admin@tourismpay.com", Email: "admin@tourismpay.com", FirstName: "Admin", LastName: "User", Enabled: true, EmailVerified: true, Roles: []string{"admin"}, Groups: []string{"platform-admins"}, CreatedAt: "2026-01-01T00:00:00Z"},
		{ID: "kc-user-002", Username: "tourist@demo.com", Email: "tourist@demo.com", FirstName: "Demo", LastName: "Tourist", Enabled: true, EmailVerified: true, Roles: []string{"tourist"}, Groups: []string{"tourists"}, CreatedAt: "2026-01-15T00:00:00Z"},
		{ID: "kc-user-003", Username: "merchant@demo.com", Email: "merchant@demo.com", FirstName: "Demo", LastName: "Merchant", Enabled: true, EmailVerified: true, Roles: []string{"merchant"}, Groups: []string{"merchants"}, CreatedAt: "2026-02-01T00:00:00Z"},
		{ID: "kc-user-004", Username: "compliance@demo.com", Email: "compliance@demo.com", FirstName: "Compliance", LastName: "Officer", Enabled: true, EmailVerified: true, Roles: []string{"compliance_officer"}, Groups: []string{"compliance"}, CreatedAt: "2026-02-15T00:00:00Z"},
	}
	for i := range seedUsers {
		users[seedUsers[i].ID] = &seedUsers[i]
	}
	userSeq = len(seedUsers)
}

// ─── HTTP API ───────────────────────────────────────────────────────────────

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8102"
	}

	router := gin.Default()
	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "TourismPay Keycloak Admin (Go)",
			"version": "1.0.0",
			"realms":  len(realms),
			"users":   len(users),
			"clients": len(clients),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})

	api := router.Group("/api/v1")
	{
		// Realm management
		api.GET("/realms", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			result := make([]*Realm, 0, len(realms))
			for _, r := range realms {
				result = append(result, r)
			}
			c.JSON(http.StatusOK, gin.H{"realms": result})
		})

		api.GET("/realms/:realm", func(c *gin.Context) {
			name := c.Param("realm")
			mu.RLock()
			r, ok := realms[name]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "realm not found"})
				return
			}
			c.JSON(http.StatusOK, r)
		})

		// User management
		api.GET("/realms/:realm/users", func(c *gin.Context) {
			search := c.Query("search")
			mu.RLock()
			defer mu.RUnlock()
			result := make([]*KeycloakUser, 0)
			for _, u := range users {
				if search != "" && u.Username != search && u.Email != search {
					continue
				}
				result = append(result, u)
			}
			c.JSON(http.StatusOK, result)
		})

		api.POST("/realms/:realm/users", func(c *gin.Context) {
			var req CreateUserRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			mu.Lock()
			userSeq++
			id := fmt.Sprintf("kc-user-%03d", userSeq)
			user := &KeycloakUser{
				ID:            id,
				Username:      req.Username,
				Email:         req.Email,
				FirstName:     req.FirstName,
				LastName:      req.LastName,
				Enabled:       true,
				EmailVerified: false,
				Roles:         req.Roles,
				Groups:        []string{},
				Attributes:    req.Attributes,
				CreatedAt:     time.Now().UTC().Format(time.RFC3339),
			}
			users[id] = user
			mu.Unlock()

			c.JSON(http.StatusCreated, user)
		})

		api.GET("/realms/:realm/users/:userId", func(c *gin.Context) {
			userId := c.Param("userId")
			mu.RLock()
			u, ok := users[userId]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusOK, u)
		})

		api.PUT("/realms/:realm/users/:userId", func(c *gin.Context) {
			userId := c.Param("userId")
			mu.Lock()
			u, ok := users[userId]
			if !ok {
				mu.Unlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			var update KeycloakUser
			if err := c.ShouldBindJSON(&update); err != nil {
				mu.Unlock()
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			if update.Email != "" { u.Email = update.Email }
			if update.FirstName != "" { u.FirstName = update.FirstName }
			if update.LastName != "" { u.LastName = update.LastName }
			if update.Roles != nil { u.Roles = update.Roles }
			mu.Unlock()
			c.JSON(http.StatusOK, u)
		})

		api.DELETE("/realms/:realm/users/:userId", func(c *gin.Context) {
			userId := c.Param("userId")
			mu.Lock()
			_, ok := users[userId]
			if !ok {
				mu.Unlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			delete(users, userId)
			mu.Unlock()
			c.JSON(http.StatusNoContent, nil)
		})

		// User role assignments
		api.POST("/realms/:realm/users/:userId/roles", func(c *gin.Context) {
			userId := c.Param("userId")
			var roles []string
			if err := c.ShouldBindJSON(&roles); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			mu.Lock()
			u, ok := users[userId]
			if !ok {
				mu.Unlock()
				c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
				return
			}
			u.Roles = append(u.Roles, roles...)
			mu.Unlock()
			c.JSON(http.StatusOK, gin.H{"status": "roles assigned"})
		})

		// Client management
		api.GET("/realms/:realm/clients", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			result := make([]*Client, 0, len(clients))
			for _, cl := range clients {
				result = append(result, cl)
			}
			c.JSON(http.StatusOK, result)
		})

		api.GET("/realms/:realm/clients/:clientId", func(c *gin.Context) {
			clientId := c.Param("clientId")
			mu.RLock()
			cl, ok := clients[clientId]
			mu.RUnlock()
			if !ok {
				c.JSON(http.StatusNotFound, gin.H{"error": "client not found"})
				return
			}
			c.JSON(http.StatusOK, cl)
		})

		// Identity providers
		api.GET("/realms/:realm/identity-providers", func(c *gin.Context) {
			c.JSON(http.StatusOK, idProviders)
		})

		// Sessions
		api.GET("/realms/:realm/sessions", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			c.JSON(http.StatusOK, gin.H{"sessions": sessions, "total": len(sessions)})
		})

		// Token exchange
		api.POST("/realms/:realm/protocol/openid-connect/token", func(c *gin.Context) {
			c.JSON(http.StatusOK, TokenResponse{
				AccessToken:  fmt.Sprintf("eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.%d", time.Now().Unix()),
				TokenType:    "Bearer",
				ExpiresIn:    300,
				RefreshToken: fmt.Sprintf("refresh_%d", time.Now().UnixNano()),
				Scope:        "openid profile email",
			})
		})

		// User count and stats
		api.GET("/realms/:realm/stats", func(c *gin.Context) {
			mu.RLock()
			defer mu.RUnlock()
			roleCounts := make(map[string]int)
			for _, u := range users {
				for _, r := range u.Roles {
					roleCounts[r]++
				}
			}
			c.JSON(http.StatusOK, gin.H{
				"totalUsers":    len(users),
				"totalClients":  len(clients),
				"totalRealms":   len(realms),
				"activeSessions": len(sessions),
				"roleCounts":    roleCounts,
				"idProviders":   len(idProviders),
			})
		})
	}

	log.Printf("[Keycloak Admin] Starting on port %s", port)
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

// Suppress unused import warning
var _ = json.Marshal

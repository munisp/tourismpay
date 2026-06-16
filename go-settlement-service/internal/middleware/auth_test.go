package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func createTestJWT(claims JWTClaims, secret []byte) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payloadBytes, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signingInput := header + "." + payload
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(signingInput))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return signingInput + "." + sig
}

func setupRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	return r
}

func TestAuthMiddleware_MissingHeader(t *testing.T) {
	r := setupRouter()
	r.Use(AuthMiddleware())
	r.GET("/test", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuthMiddleware_InvalidFormat(t *testing.T) {
	r := setupRouter()
	r.Use(AuthMiddleware())
	r.GET("/test", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Basic abc123")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuthMiddleware_ValidToken(t *testing.T) {
	secret := getJWTSecret()
	token := createTestJWT(JWTClaims{
		Sub:  "user-123",
		Role: "merchant",
		Exp:  time.Now().Add(time.Hour).Unix(),
	}, secret)

	r := setupRouter()
	r.Use(AuthMiddleware())
	r.GET("/test", func(c *gin.Context) {
		uid, _ := c.Get(ContextKeyUserID)
		role, _ := c.Get(ContextKeyRole)
		c.JSON(200, gin.H{"user_id": uid, "role": role})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestAuthMiddleware_ExpiredToken(t *testing.T) {
	secret := getJWTSecret()
	token := createTestJWT(JWTClaims{
		Sub: "user-123",
		Exp: time.Now().Add(-time.Hour).Unix(),
	}, secret)

	r := setupRouter()
	r.Use(AuthMiddleware())
	r.GET("/test", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuthMiddleware_WrongSignature(t *testing.T) {
	token := createTestJWT(JWTClaims{
		Sub: "user-123",
		Exp: time.Now().Add(time.Hour).Unix(),
	}, []byte("wrong-secret"))

	r := setupRouter()
	r.Use(AuthMiddleware())
	r.GET("/test", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAdminMiddleware_NonAdmin(t *testing.T) {
	secret := getJWTSecret()
	token := createTestJWT(JWTClaims{
		Sub:  "user-123",
		Role: "merchant",
		Exp:  time.Now().Add(time.Hour).Unix(),
	}, secret)

	r := setupRouter()
	r.Use(AuthMiddleware())
	r.Use(AdminMiddleware())
	r.GET("/admin", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
}

func TestAdminMiddleware_Admin(t *testing.T) {
	secret := getJWTSecret()
	token := createTestJWT(JWTClaims{
		Sub:  "admin-1",
		Role: "admin",
		Exp:  time.Now().Add(time.Hour).Unix(),
	}, secret)

	r := setupRouter()
	r.Use(AuthMiddleware())
	r.Use(AdminMiddleware())
	r.GET("/admin", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestAuthMiddleware_APIKey(t *testing.T) {
	t.Setenv("SETTLEMENT_API_KEY", "test-api-key-12345")

	r := setupRouter()
	r.Use(AuthMiddleware())
	r.GET("/test", func(c *gin.Context) {
		uid, _ := c.Get(ContextKeyUserID)
		c.JSON(200, gin.H{"user_id": uid})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "test-api-key-12345")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

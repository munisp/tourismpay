package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type JWTClaims struct {
	Sub   string `json:"sub"`
	Email string `json:"email,omitempty"`
	Role  string `json:"role,omitempty"`
	Exp   int64  `json:"exp,omitempty"`
	Iat   int64  `json:"iat,omitempty"`
}

const ContextKeyUserID = "user_id"
const ContextKeyRole = "user_role"

func getJWTSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = os.Getenv("SESSION_SECRET")
	}
	if secret == "" {
		secret = "tourismpay-settlement-dev-secret"
	}
	return []byte(secret)
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")

		// Also accept service-to-service API key
		apiKey := c.GetHeader("X-API-Key")
		if apiKey != "" {
			expectedKey := os.Getenv("SETTLEMENT_API_KEY")
			if expectedKey != "" && hmacEqual(apiKey, expectedKey) {
				c.Set(ContextKeyUserID, "service")
				c.Set(ContextKeyRole, "service")
				c.Next()
				return
			}
		}

		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization header required",
				"code":  "MISSING_AUTH",
			})
			return
		}

		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid authorization format, expected 'Bearer <token>'",
				"code":  "INVALID_AUTH_FORMAT",
			})
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := validateJWT(token, getJWTSecret())
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": err.Error(),
				"code":  "INVALID_TOKEN",
			})
			return
		}

		c.Set(ContextKeyUserID, claims.Sub)
		c.Set(ContextKeyRole, claims.Role)
		c.Next()
	}
}

func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get(ContextKeyRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "No role found"})
			return
		}
		r, ok := role.(string)
		if !ok || (r != "admin" && r != "service") {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			return
		}
		c.Next()
	}
}

func validateJWT(tokenStr string, secret []byte) (*JWTClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, &AuthError{"invalid token format"}
	}

	// Verify signature (HS256)
	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(signingInput))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmacEqual(parts[2], expectedSig) {
		return nil, &AuthError{"invalid token signature"}
	}

	// Decode payload
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, &AuthError{"invalid token payload"}
	}

	var claims JWTClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, &AuthError{"invalid token claims"}
	}

	// Check expiration
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, &AuthError{"token expired"}
	}

	if claims.Sub == "" {
		return nil, &AuthError{"token missing subject"}
	}

	return &claims, nil
}

func hmacEqual(a, b string) bool {
	return hmac.Equal([]byte(a), []byte(b))
}

type AuthError struct {
	Message string
}

func (e *AuthError) Error() string {
	return e.Message
}

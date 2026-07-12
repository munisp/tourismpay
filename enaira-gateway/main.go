// eNaira Gateway — CBN CBDC-NG integration service for TourismPay.
// Handles wallet provisioning, payment initiation, and CBN webhook processing.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"

	"github.com/munisp/tourismpay/enaira-gateway/internal/handlers"
	"github.com/munisp/tourismpay/enaira-gateway/internal/services"
)

func main() {
	// ─── Logger ─────────────────────────────────────────────────────────────
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// ─── Config from environment ─────────────────────────────────────────────
	port := getEnv("PORT", "8095")
	dbURL := mustEnv("DATABASE_URL", logger)
	redisURL := getEnv("REDIS_URL", "redis://localhost:6379")
	kafkaBrokers := getEnv("KAFKA_BROKERS", "localhost:9092")
	cbnBaseURL := getEnv("CBN_ENAIRA_BASE_URL", "https://sandbox.enaira.gov.ng/api/v1")
	cbnAPIKey := getEnv("CBN_ENAIRA_API_KEY", "sandbox-key")
	cbnMerchantID := getEnv("CBN_ENAIRA_MERCHANT_ID", "tourismpay-ng-001")

	// ─── PostgreSQL ──────────────────────────────────────────────────────────
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		logger.Fatal("Failed to connect to PostgreSQL", zap.Error(err))
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		logger.Fatal("PostgreSQL ping failed", zap.Error(err))
	}

	// Run schema migrations
	if err := runMigrations(ctx, db, logger); err != nil {
		logger.Fatal("Migration failed", zap.Error(err))
	}

	// ─── Redis ───────────────────────────────────────────────────────────────
	redisOpts, err := redis.ParseURL(redisURL)
	if err != nil {
		logger.Fatal("Invalid Redis URL", zap.Error(err))
	}
	rdb := redis.NewClient(redisOpts)
	if _, err := rdb.Ping(ctx).Result(); err != nil {
		logger.Warn("Redis unavailable — caching disabled", zap.Error(err))
	}
	defer rdb.Close()

	// ─── Kafka ───────────────────────────────────────────────────────────────
	kafkaWriter := &kafka.Writer{
		Addr:         kafka.TCP(kafkaBrokers),
		Balancer:     &kafka.LeastBytes{},
		RequiredAcks: kafka.RequireOne,
		Async:        true,
	}
	defer kafkaWriter.Close()

	// ─── Services ────────────────────────────────────────────────────────────
	cbnClient := services.NewCBNClient(cbnBaseURL, cbnAPIKey, cbnMerchantID, logger)
	enairaService := services.NewENairaService(db, rdb, kafkaWriter, cbnClient, logger)

	// ─── HTTP Server ─────────────────────────────────────────────────────────
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(requestLogger(logger))

	h := handlers.New(enairaService, logger)
	h.RegisterRoutes(r)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// ─── Graceful Shutdown ───────────────────────────────────────────────────
	go func() {
		logger.Info("eNaira gateway starting", zap.String("port", port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server error", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down eNaira gateway...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("Graceful shutdown failed", zap.Error(err))
	}
	logger.Info("eNaira gateway stopped")
}

// runMigrations creates the required database tables if they don't exist.
func runMigrations(ctx context.Context, db *pgxpool.Pool, logger *zap.Logger) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS enaira_wallets (
			id                  TEXT PRIMARY KEY,
			user_id             TEXT NOT NULL,
			wallet_type         TEXT NOT NULL,
			cbn_wallet_id       TEXT NOT NULL UNIQUE,
			cbn_wallet_address  TEXT NOT NULL,
			balance_kobo        BIGINT NOT NULL DEFAULT 0,
			daily_limit_kobo    BIGINT NOT NULL DEFAULT 2000000,
			status              TEXT NOT NULL DEFAULT 'active',
			kyc_level           INTEGER NOT NULL DEFAULT 1,
			created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_enaira_wallets_user_id ON enaira_wallets(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_enaira_wallets_cbn_id ON enaira_wallets(cbn_wallet_id)`,
		`CREATE TABLE IF NOT EXISTS enaira_transactions (
			id                    TEXT PRIMARY KEY,
			cbn_transaction_ref   TEXT,
			sender_wallet_id      TEXT NOT NULL,
			receiver_wallet_id    TEXT NOT NULL,
			amount_kobo           BIGINT NOT NULL,
			fee_kobo              BIGINT NOT NULL DEFAULT 0,
			transaction_type      TEXT NOT NULL,
			status                TEXT NOT NULL DEFAULT 'pending',
			narration_text        TEXT,
			merchant_category_code TEXT,
			correlation_id        TEXT NOT NULL,
			cbn_response_code     TEXT,
			cbn_response_message  TEXT,
			initiated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			completed_at          TIMESTAMPTZ,
			reversed_at           TIMESTAMPTZ
		)`,
		`CREATE INDEX IF NOT EXISTS idx_enaira_tx_cbn_ref ON enaira_transactions(cbn_transaction_ref)`,
		`CREATE INDEX IF NOT EXISTS idx_enaira_tx_correlation ON enaira_transactions(correlation_id)`,
		`CREATE INDEX IF NOT EXISTS idx_enaira_tx_sender ON enaira_transactions(sender_wallet_id)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(ctx, m); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}
	logger.Info("eNaira gateway migrations applied")
	return nil
}

// requestLogger returns a Gin middleware for structured request logging.
func requestLogger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		logger.Info("request",
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", time.Since(start)),
		)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string, logger *zap.Logger) string {
	v := os.Getenv(key)
	if v == "" {
		logger.Fatal("Required environment variable not set", zap.String("key", key))
	}
	return v
}

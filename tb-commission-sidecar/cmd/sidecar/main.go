// TB Commission Sidecar — Go HTTP server providing double-entry ledger
// for commission credits, settlement transfers, and refund reversals.
package main

import (
	_ "github.com/jackc/pgx/v5/stdlib"
	"database/sql"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"github.com/tourismpay/tb-commission-sidecar/internal/api"
	"github.com/tourismpay/tb-commission-sidecar/internal/ledger"
)


var db *sql.DB

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/tourismpay?sslmode=disable"
	}
	var err error
	db, err = sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		log.Printf("Warning: database ping failed: %v (will retry on first query)", err)
	}
}

func main() {
	port := os.Getenv("TB_COMMISSION_PORT")
	if port == "" {
		port = "8040"
	}
	dbPath := os.Getenv("TB_COMMISSION_DB_PATH")
	if dbPath == "" {
		dbPath = "/var/lib/tourismpay/tb-commission.db"
	}

	os.MkdirAll("/var/lib/tourismpay", 0755)

	log.Printf("[TB-Commission-Sidecar] Starting on :%s (db=%s)", port, dbPath)

	l, err := ledger.New(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize ledger: %v", err)
	}
	defer l.Close()

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      api.New(l),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[TB-Commission-Sidecar] Listening on :%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[TB-Commission-Sidecar] Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	log.Println("[TB-Commission-Sidecar] Stopped")
}

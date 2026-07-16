package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"strings"

	"database/sql"
	_ "github.com/jackc/pgx/v5/stdlib")


func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/health" || path == "/healthz" || path == "/ready" {
			next.ServeHTTP(w, r)
			return
		}
		if os.Getenv("APP_ENV") == "development" || os.Getenv("NODE_ENV") == "development" {
			next.ServeHTTP(w, r)
			return
		}
		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, `{"error":"unauthorized","message":"Bearer token required"}`, http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		if len(token) < 20 || len(strings.Split(token, ".")) != 3 {
			http.Error(w, `{"error":"invalid_token","message":"Malformed JWT"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}


func requireAuthFunc(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("APP_ENV") == "development" || os.Getenv("NODE_ENV") == "development" {
			next(w, r)
			return
		}
		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			http.Error(w, `{"error":"unauthorized","message":"Bearer token required"}`, http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		if len(token) < 20 || len(strings.Split(token, ".")) != 3 {
			http.Error(w, `{"error":"invalid_token","message":"Malformed JWT"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		log.Printf("Warning: database ping failed: %v (will retry on first query)", err)
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8200"
	}

	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"healthy","service":"supply-chain","version":"1.0.0"}`)
	})

	// ─── Warehouse Management ────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/warehouses", requireAuthFunc(listWarehouses))
	mux.HandleFunc("POST /api/v1/warehouses", requireAuthFunc(createWarehouse))
	mux.HandleFunc("GET /api/v1/warehouses/{id}", requireAuthFunc(getWarehouse))
	mux.HandleFunc("PUT /api/v1/warehouses/{id}", requireAuthFunc(updateWarehouse))
	mux.HandleFunc("GET /api/v1/warehouses/{id}/zones", requireAuthFunc(listZones))
	mux.HandleFunc("POST /api/v1/warehouses/{id}/zones", requireAuthFunc(createZone))
	mux.HandleFunc("GET /api/v1/warehouses/{id}/locations", requireAuthFunc(listLocations))
	mux.HandleFunc("POST /api/v1/warehouses/{id}/locations", requireAuthFunc(createLocation))
	mux.HandleFunc("GET /api/v1/warehouses/{id}/occupancy", requireAuthFunc(getOccupancy))

	// ─── Stock Movements ─────────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/stock/receive", requireAuthFunc(receiveStock))
	mux.HandleFunc("POST /api/v1/stock/transfer", requireAuthFunc(transferStock))
	mux.HandleFunc("POST /api/v1/stock/adjust", requireAuthFunc(adjustStock))
	mux.HandleFunc("POST /api/v1/stock/reserve", requireAuthFunc(reserveStock))
	mux.HandleFunc("POST /api/v1/stock/pick", requireAuthFunc(pickStock))
	mux.HandleFunc("GET /api/v1/stock/movements", requireAuthFunc(listMovements))
	mux.HandleFunc("GET /api/v1/stock/levels", requireAuthFunc(getStockLevels))
	mux.HandleFunc("GET /api/v1/stock/alerts", requireAuthFunc(getStockAlerts))

	// ─── Inventory Valuation ─────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/valuation/{sku}", requireAuthFunc(getValuation))
	mux.HandleFunc("POST /api/v1/valuation/calculate", requireAuthFunc(calculateValuation))
	mux.HandleFunc("GET /api/v1/valuation/report", requireAuthFunc(valuationReport))

	// ─── Procurement ─────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/suppliers", requireAuthFunc(listSuppliers))
	mux.HandleFunc("POST /api/v1/suppliers", requireAuthFunc(createSupplier))
	mux.HandleFunc("GET /api/v1/suppliers/{id}", requireAuthFunc(getSupplier))
	mux.HandleFunc("PUT /api/v1/suppliers/{id}", requireAuthFunc(updateSupplier))
	mux.HandleFunc("GET /api/v1/suppliers/{id}/performance", requireAuthFunc(getSupplierPerformance))
	mux.HandleFunc("GET /api/v1/purchase-orders", requireAuthFunc(listPurchaseOrders))
	mux.HandleFunc("POST /api/v1/purchase-orders", requireAuthFunc(createPurchaseOrder))
	mux.HandleFunc("GET /api/v1/purchase-orders/{id}", requireAuthFunc(getPurchaseOrder))
	mux.HandleFunc("PUT /api/v1/purchase-orders/{id}/status", requireAuthFunc(updatePOStatus))
	mux.HandleFunc("POST /api/v1/purchase-orders/{id}/receive", requireAuthFunc(receivePO))

	// ─── Logistics ───────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/carriers", requireAuthFunc(listCarriers))
	mux.HandleFunc("POST /api/v1/shipments", requireAuthFunc(createShipment))
	mux.HandleFunc("GET /api/v1/shipments/{id}", requireAuthFunc(getShipment))
	mux.HandleFunc("PUT /api/v1/shipments/{id}/status", requireAuthFunc(updateShipmentStatus))
	mux.HandleFunc("POST /api/v1/shipments/{id}/label", requireAuthFunc(generateLabel))
	mux.HandleFunc("GET /api/v1/shipments/{id}/tracking", requireAuthFunc(trackShipment))
	mux.HandleFunc("POST /api/v1/shipments/{id}/pod", requireAuthFunc(submitProofOfDelivery))
	mux.HandleFunc("GET /api/v1/shipping/rates", requireAuthFunc(calculateShippingRates))
	mux.HandleFunc("POST /api/v1/shipping/optimize-route", requireAuthFunc(optimizeRoute))

	// ─── Cycle Counting ──────────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/cycle-count/start", requireAuthFunc(startCycleCount))
	mux.HandleFunc("POST /api/v1/cycle-count/record", requireAuthFunc(recordCycleCount))
	mux.HandleFunc("GET /api/v1/cycle-count/discrepancies", requireAuthFunc(getDiscrepancies))

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("Supply-chain service listening on :%s", port)
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	server.Shutdown(ctx)
	log.Println("Supply-chain service shut down")
}

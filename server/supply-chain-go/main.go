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

	authMw "shared/middleware"
)

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
	mux.HandleFunc("GET /api/v1/warehouses", authMw.RequireAuthFunc(listWarehouses))
	mux.HandleFunc("POST /api/v1/warehouses", authMw.RequireAuthFunc(createWarehouse))
	mux.HandleFunc("GET /api/v1/warehouses/{id}", authMw.RequireAuthFunc(getWarehouse))
	mux.HandleFunc("PUT /api/v1/warehouses/{id}", authMw.RequireAuthFunc(updateWarehouse))
	mux.HandleFunc("GET /api/v1/warehouses/{id}/zones", authMw.RequireAuthFunc(listZones))
	mux.HandleFunc("POST /api/v1/warehouses/{id}/zones", authMw.RequireAuthFunc(createZone))
	mux.HandleFunc("GET /api/v1/warehouses/{id}/locations", authMw.RequireAuthFunc(listLocations))
	mux.HandleFunc("POST /api/v1/warehouses/{id}/locations", authMw.RequireAuthFunc(createLocation))
	mux.HandleFunc("GET /api/v1/warehouses/{id}/occupancy", authMw.RequireAuthFunc(getOccupancy))

	// ─── Stock Movements ─────────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/stock/receive", authMw.RequireAuthFunc(receiveStock))
	mux.HandleFunc("POST /api/v1/stock/transfer", authMw.RequireAuthFunc(transferStock))
	mux.HandleFunc("POST /api/v1/stock/adjust", authMw.RequireAuthFunc(adjustStock))
	mux.HandleFunc("POST /api/v1/stock/reserve", authMw.RequireAuthFunc(reserveStock))
	mux.HandleFunc("POST /api/v1/stock/pick", authMw.RequireAuthFunc(pickStock))
	mux.HandleFunc("GET /api/v1/stock/movements", authMw.RequireAuthFunc(listMovements))
	mux.HandleFunc("GET /api/v1/stock/levels", authMw.RequireAuthFunc(getStockLevels))
	mux.HandleFunc("GET /api/v1/stock/alerts", authMw.RequireAuthFunc(getStockAlerts))

	// ─── Inventory Valuation ─────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/valuation/{sku}", authMw.RequireAuthFunc(getValuation))
	mux.HandleFunc("POST /api/v1/valuation/calculate", authMw.RequireAuthFunc(calculateValuation))
	mux.HandleFunc("GET /api/v1/valuation/report", authMw.RequireAuthFunc(valuationReport))

	// ─── Procurement ─────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/suppliers", authMw.RequireAuthFunc(listSuppliers))
	mux.HandleFunc("POST /api/v1/suppliers", authMw.RequireAuthFunc(createSupplier))
	mux.HandleFunc("GET /api/v1/suppliers/{id}", authMw.RequireAuthFunc(getSupplier))
	mux.HandleFunc("PUT /api/v1/suppliers/{id}", authMw.RequireAuthFunc(updateSupplier))
	mux.HandleFunc("GET /api/v1/suppliers/{id}/performance", authMw.RequireAuthFunc(getSupplierPerformance))
	mux.HandleFunc("GET /api/v1/purchase-orders", authMw.RequireAuthFunc(listPurchaseOrders))
	mux.HandleFunc("POST /api/v1/purchase-orders", authMw.RequireAuthFunc(createPurchaseOrder))
	mux.HandleFunc("GET /api/v1/purchase-orders/{id}", authMw.RequireAuthFunc(getPurchaseOrder))
	mux.HandleFunc("PUT /api/v1/purchase-orders/{id}/status", authMw.RequireAuthFunc(updatePOStatus))
	mux.HandleFunc("POST /api/v1/purchase-orders/{id}/receive", authMw.RequireAuthFunc(receivePO))

	// ─── Logistics ───────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/v1/carriers", authMw.RequireAuthFunc(listCarriers))
	mux.HandleFunc("POST /api/v1/shipments", authMw.RequireAuthFunc(createShipment))
	mux.HandleFunc("GET /api/v1/shipments/{id}", authMw.RequireAuthFunc(getShipment))
	mux.HandleFunc("PUT /api/v1/shipments/{id}/status", authMw.RequireAuthFunc(updateShipmentStatus))
	mux.HandleFunc("POST /api/v1/shipments/{id}/label", authMw.RequireAuthFunc(generateLabel))
	mux.HandleFunc("GET /api/v1/shipments/{id}/tracking", authMw.RequireAuthFunc(trackShipment))
	mux.HandleFunc("POST /api/v1/shipments/{id}/pod", authMw.RequireAuthFunc(submitProofOfDelivery))
	mux.HandleFunc("GET /api/v1/shipping/rates", authMw.RequireAuthFunc(calculateShippingRates))
	mux.HandleFunc("POST /api/v1/shipping/optimize-route", authMw.RequireAuthFunc(optimizeRoute))

	// ─── Cycle Counting ──────────────────────────────────────────────────
	mux.HandleFunc("POST /api/v1/cycle-count/start", authMw.RequireAuthFunc(startCycleCount))
	mux.HandleFunc("POST /api/v1/cycle-count/record", authMw.RequireAuthFunc(recordCycleCount))
	mux.HandleFunc("GET /api/v1/cycle-count/discrepancies", authMw.RequireAuthFunc(getDiscrepancies))

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

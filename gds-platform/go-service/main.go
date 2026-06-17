// GDS Platform — Go Microservice
// Standalone Go service for high-performance tax calculation, tipping processing,
// and loyalty computation. Runs as a sidecar to the main Node.js GDS server.
//
// This is the SAME engine from the TourismPay Go settlement service,
// extracted to run independently as part of the GDS platform.
//
// Port: 4002 (env: GDS_GO_PORT)
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	gds "github.com/munisp/tourismpay/gds-platform/go-service/internal"
)

func main() {
	port := os.Getenv("GDS_GO_PORT")
	if port == "" {
		port = "4002"
	}

	taxEngine := gds.NewGDSTaxEngine()
	tipEngine := gds.NewGDSTippingEngine()
	loyaltyEngine := gds.NewGDSLoyaltyEngine()

	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "gds-go-service",
			"version": "1.0.0",
		})
	})

	// Register tax, tipping, and loyalty routes
	gds.RegisterTaxTipRoutes(mux, taxEngine, tipEngine, loyaltyEngine)

	log.Printf("[GDS Go Service] Running on http://localhost:%s", port)
	log.Printf("[GDS Go Service] Tax Engine: %d jurisdictions loaded", len(taxEngine.ListJurisdictions()))
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%s", port), mux))
}
